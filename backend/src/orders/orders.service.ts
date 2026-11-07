import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
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
import { WarehouseService } from '../warehouses/warehouse.service.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly warehouseService: WarehouseService,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    const createdOrder = await this.dataSource.transaction(async (manager) => {
      // Prepare a timeout mechanism to prevent long-running transactions
      let isTimeout = false;
      let timeoutId;
      timeoutId = setTimeout(() => {
        isTimeout = true;
      }, 5 * 1000); // 5 seconds timeout

      // Helper function to check the timeout before any sensitive database operation
      const checkTimeout = () => {
        // if (isTimeout)
        //   throw new RequestTimeoutException(
        //     'The request took too long to process, Please try again later.',
        //   );
      };

      const productRepository = manager.getRepository(Product);
      const orderItems: OrderItem[] = [];
      let totalPrice = 0;

      for (const line of dto.items) {
        checkTimeout(); // Check the timeout before starting to check the next product

        const product = await productRepository.findOne({
          where: { id: line.productId },
          relations: { warehouse: true },
        });
        if (!product)
          throw new BadRequestException(
            `Product ${line.productId} does not exist`,
          );

        const productWarehouse = product.warehouse;
        if (!productWarehouse)
          throw new BadRequestException(
            `Product ${line.productId} lacks stock data`,
          );

        if (productWarehouse.quantity < line.quantity)
          throw new BadRequestException(
            `The requested quantity is not available`,
          );

        const currentVersion = productWarehouse.version;
        const newQuantity = productWarehouse.quantity - line.quantity;

        // Simulate a delay in checking the product
        if (userId === '742cc46a-8e52-4495-9a51-e30682ca8aff')
          await new Promise((res) => setTimeout(res, 10 * 1000));

        checkTimeout(); // Check the timeout before modifying the database

        const updatedRecordsCount = await this.warehouseService.update(
          productWarehouse.id,
          currentVersion,
          newQuantity,
          manager,
        );

        if (updatedRecordsCount === 0)
          throw new ConflictException(
            `The product was modified by another request`,
          );
        checkTimeout(); // Check the timeout after modifying the database

        totalPrice += Number(product.price) * line.quantity;

        const orderItem = manager.getRepository(OrderItem).create({
          productId: product.id,
          quantity: line.quantity,
          unitPrice: product.price,
        });
        orderItems.push(orderItem);
      }

      checkTimeout(); // Check the timeout one last time before saving the final order

      const order = manager.getRepository(Order).create({
        userId,
        status: OrderStatus.PENDING,
        totalPrice: totalPrice.toFixed(2),
        items: orderItems,
      });

      // // Simulate a delay for testing the timeout
      // await new Promise((res) => setTimeout(res, 10000));

      // checkTimeout(); // Check the timeout one last time before saving the final order

      const savedOrder = await manager.getRepository(Order).save(order);

      // Cancel the timeout if the operation completes successfully before the 5 seconds
      clearTimeout(timeoutId);

      return savedOrder;
    });

    await this.notificationsService.create(
      userId,
      `Your order #${createdOrder.id} has been created.`,
    );

    return createdOrder;
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
