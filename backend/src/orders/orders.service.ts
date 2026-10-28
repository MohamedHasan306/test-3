import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Product } from '../products/entities/product.entity.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderStatus } from '../common/enums/order-status.enum.js';
import type { AuthenticatedUser } from '../users/auth/jwt-payload.interface.js';
import { Role } from '../common/enums/role.enum.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const productRepository = manager.getRepository(Product);
      const orderItems: OrderItem[] = [];
      let totalPrice = 0;

      for (const line of dto.items) {
        const product = await productRepository.findOne({ where: { id: line.productId } });
        if (!product) {
          throw new BadRequestException(`Product ${line.productId} does not exist`);
        }

        const unitPrice = Number(product.price);
        totalPrice += unitPrice * line.quantity;

        const orderItem = manager.getRepository(OrderItem).create({
          productId: product.id,
          quantity: line.quantity,
          unitPrice: product.price,
        });
        orderItems.push(orderItem);
      }

      const order = manager.getRepository(Order).create({
        userId,
        status: OrderStatus.PENDING,
        totalPrice: totalPrice.toFixed(2),
        items: orderItems,
      });

      const saved = await manager.getRepository(Order).save(order);
      await this.notificationsService.create(userId, `Your order #${saved.id} has been created.`);
      return saved;
    });
  }

  async findForUser(currentUser: AuthenticatedUser): Promise<Order[]> {
    if (currentUser.role === Role.ADMIN) {
      return this.ordersRepository.find({ order: { createdAt: 'DESC' } });
    }
    return this.ordersRepository.find({
      where: { userId: currentUser.id },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, currentUser: AuthenticatedUser): Promise<Order> {
    const order = await this.ordersRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.assertCanAccess(order, currentUser);
    return order;
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    const order = await this.ordersRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    order.status = status;
    const saved = await this.ordersRepository.save(order);
    await this.notificationsService.create(
      order.userId,
      `Your order #${order.id} status changed to ${status}.`,
    );
    return saved;
  }

  private assertCanAccess(order: Order, currentUser: AuthenticatedUser): void {
    const isOwner = order.userId === currentUser.id;
    const isAdmin = currentUser.role === Role.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have access to this order');
    }
  }
}
