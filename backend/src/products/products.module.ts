import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity.js';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { WarehouseService } from '../warehouses/warehouse.service.js';
import { Warehouse } from '../warehouses/entities/warehouse.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Warehouse])],
  controllers: [ProductsController],
  providers: [ProductsService, WarehouseService],
  exports: [ProductsService],
})
export class ProductsModule {}
