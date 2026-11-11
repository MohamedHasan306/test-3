import {
  BadRequestException, ConflictException, Injectable, Logger,
  type OnApplicationBootstrap, type OnModuleDestroy,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { DataSource, In, LessThanOrEqual, type EntityManager } from 'typeorm';
import { ReservationClientService, type StockLine } from '../inventory-client/reservation-client.service.js';
import { Product } from '../products/entities/product.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { OrderStatus } from '../common/enums/order-status.enum.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { CheckoutAttempt } from './entities/checkout-attempt.entity.js';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';

@Injectable()
export class CheckoutService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutService.name);
  private timer?: NodeJS.Timeout;
  private recovering = false;

  constructor(
    private readonly db: DataSource,
    private readonly inventory: ReservationClientService,
  ) {}

  async create(userId: string, dto: CreateOrderDto, key?: string): Promise<Order> {
    const requestKey = key ?? randomUUID();
    if (!isUUID(requestKey)) {
      throw new BadRequestException('Idempotency-Key must be a UUID');
    }
    const items = this.normalize(dto.items);
    const itemsHash = createHash('sha256').update(JSON.stringify(items)).digest('hex');
    const attempts = this.db.getRepository(CheckoutAttempt);

    // Commit the intent before contacting inventory so a restart can recover it.
    await attempts.createQueryBuilder().insert()
      .values({ userId, requestKey, itemsHash }).orIgnore().execute();
    const attempt = await attempts.findOneByOrFail({ userId, requestKey });
    if (attempt.itemsHash !== itemsHash) {
      throw new ConflictException('Idempotency-Key has different items');
    }

    try {
      return await this.db.transaction(async (manager) => {
        const current = await this.lockAttempt(manager, attempt.id);
        if (current.state === 'completed') {
          return manager.findOneByOrFail(Order, { id: current.id, userId });
        }
        if (current.state === 'closed') {
          throw new ConflictException('Checkout was closed. Use a new key for a new purchase');
        }

        const products = await manager.findBy(Product, {
          id: In(items.map((item) => item.productId)),
        });
        const catalog = new Map(products.map((product) => [product.id, product]));
        let totalCents = 0n;
        const orderItems = dto.items.map((item) => {
          const product = catalog.get(item.productId.toLowerCase());
          if (!product) {
            throw new BadRequestException('Product does not exist: ' + item.productId);
          }
          // PostgreSQL numeric(10,2) returns a string with two decimal places.
          totalCents += BigInt(product.price.replace('.', '')) * BigInt(item.quantity);
          return manager.create(OrderItem, {
            productId: product.id, quantity: item.quantity, unitPrice: product.price,
          });
        });
        if (totalCents > 9999999999n) {
          throw new BadRequestException('Order total exceeds the supported amount');
        }

        await this.inventory.reserve(current.id, items);
        const order = manager.create(Order, {
          id: current.id, userId, status: OrderStatus.PENDING,
          totalPrice: (Number(totalCents) / 100).toFixed(2), items: orderItems,
        });
        const saved = await manager.save(order);
        await manager.insert(Notification, {
          userId, message: 'Your order #' + saved.id + ' has been created.',
        });
        await manager.update(CheckoutAttempt, current.id, { state: 'completed' });
        return saved;
      });
    } catch (error) {
      // COMMIT might have succeeded even if its reply was lost.
      let saved: Order | undefined;
      try {
        saved = await this.reconcile(attempt.id);
      } catch (recoveryError) {
        this.logger.warn('Checkout ' + attempt.id + ' awaits recovery: ' + String(recoveryError));
      }
      if (saved) return saved;
      throw error;
    }
  }

  private normalize(lines: StockLine[]): StockLine[] {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new BadRequestException('Order must contain items');
    }
    const totals = new Map<string, number>();
    for (const line of lines) {
      if (!line || !isUUID(line.productId) || !Number.isInteger(line.quantity) || line.quantity < 1) {
        throw new BadRequestException('Invalid order item');
      }
      const id = line.productId.toLowerCase();
      const total = (totals.get(id) ?? 0) + line.quantity;
      if (total > 2147483647) throw new BadRequestException('Quantity exceeds int32');
      totals.set(id, total);
    }
    return [...totals.keys()].sort().map((productId) => ({
      productId, quantity: totals.get(productId)!,
    }));
  }

  private lockAttempt(manager: EntityManager, id: string) {
    return manager.findOneOrFail(CheckoutAttempt, {
      where: { id }, lock: { mode: 'pessimistic_write' },
    });
  }

  private reconcile(id: string): Promise<Order | undefined> {
    return this.db.transaction(async (manager) => {
      const attempt = await this.lockAttempt(manager, id);
      if (attempt.state === 'completed') {
        return manager.findOneByOrFail(Order, { id });
      }
      if (attempt.state === 'pending') {
        // Release is idempotent, including when it races with a delayed Reserve.
        await this.inventory.release(id);
        await manager.update(CheckoutAttempt, id, { state: 'closed' });
      }
      return undefined;
    });
  }

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.retryPending().catch((error) => this.logger.warn(String(error)));
    }, 10000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async retryPending() {
    if (this.recovering) return;
    this.recovering = true;
    try {
      const attempts = this.db.getRepository(CheckoutAttempt);
      const pending = await attempts.find({
        select: { id: true },
        where: { state: 'pending', retryAfter: LessThanOrEqual(new Date()) },
        take: 10, order: { retryAfter: 'ASC' },
      });
      for (const attempt of pending) {
        try {
          await this.reconcile(attempt.id);
        } catch (error) {
          this.logger.warn('Release retry for ' + attempt.id + ': ' + String(error));
          await attempts.update({ id: attempt.id, state: 'pending' }, {
            retryAfter: new Date(Date.now() + 30000),
          });
        }
      }
    } finally {
      this.recovering = false;
    }
  }
}
