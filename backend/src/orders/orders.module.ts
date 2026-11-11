import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { InventoryClientModule } from '../inventory-client/inventory-client.module.js';
import { CheckoutService } from './checkout.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem]),
    NotificationsModule,
    InventoryClientModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, CheckoutService],
})
export class OrdersModule {}
