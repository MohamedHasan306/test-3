import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WarehouseModule } from '../warehouses/warehouse.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem]),
    NotificationsModule,
    WarehouseModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
