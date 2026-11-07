import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Warehouse } from './entities/warehouse.entity.js';
import { WarehouseService } from './warehouse.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Warehouse])],
  controllers: [],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class WarehouseModule {}
