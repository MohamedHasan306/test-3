import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
  ) {}

  async create(
    dto: CreateWarehouseDto,
    productId: string,
    manager?: EntityManager,
  ): Promise<Warehouse> {
    const repository = manager
      ? manager.getRepository(Warehouse)
      : this.warehouseRepository;

    const createdWarehouse = repository.create({
      product: { id: productId },
      quantity: dto.quantity,
      version: 1,
    });

    return repository.save(createdWarehouse);
  }

  async update(
    warehouseId: string,
    currentVersion: number,
    newQuantity: number,
    manager?: EntityManager,
  ): Promise<number> {
    const _warehouseRepository = manager
      ? manager.getRepository(Warehouse)
      : this.warehouseRepository;

    const updatedRecordsCount = await _warehouseRepository.update(
      {
        id: warehouseId,
        version: currentVersion,
      },
      {
        quantity: newQuantity,
        version: currentVersion + 1,
      },
    );

    return updatedRecordsCount?.affected ?? 0;
  }

  async findOrFail(productId: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOne({
      where: { product: { id: productId } },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    return warehouse;
  }
}
