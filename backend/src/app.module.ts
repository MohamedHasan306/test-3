import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller.js';
import { UsersModule } from './users/users.module.js';
import { ProductsModule } from './products/products.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { User } from './users/entities/user.entity.js';
import { Product } from './products/entities/product.entity.js';
import { Order } from './orders/entities/order.entity.js';
import { OrderItem } from './orders/entities/order-item.entity.js';
import { Notification } from './notifications/entities/notification.entity.js';
import { WarehouseModule } from './warehouses/warehouse.module.js';
import { Warehouse } from './warehouses/entities/warehouse.entity.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('DATABASE_HOST'),
        port: configService.get<number>('DATABASE_PORT', 5432),
        username: configService.getOrThrow<string>('DATABASE_USER'),
        password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
        database: configService.getOrThrow<string>('DATABASE_NAME'),
        entities: [User, Product, Order, OrderItem, Notification, Warehouse],
        synchronize:
          configService.get<string>('NODE_ENV', 'development') !== 'production',
      }),
    }),

    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 60 }],
    }),

    ServeStaticModule.forRoot({
      rootPath: `${process.cwd()}/uploads`,
      serveRoot: '/uploads',
    }),

    UsersModule,
    ProductsModule,
    WarehouseModule,
    OrdersModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
