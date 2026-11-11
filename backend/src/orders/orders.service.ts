import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderStatus } from '../common/enums/order-status.enum.js';
import type { AuthenticatedUser } from '../users/auth/jwt-payload.interface.js';
import { Role } from '../common/enums/role.enum.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CheckoutService } from './checkout.service.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly notificationsService: NotificationsService,
    private readonly checkout: CheckoutService,
  ) {}

  create(userId: string, dto: CreateOrderDto, key?: string): Promise<Order> {
    return this.checkout.create(userId, dto, key);
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
