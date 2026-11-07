import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product } from './entities/product.entity.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { QueryProductsDto } from './dto/query-products.dto.js';
import { WarehouseService } from '../warehouses/warehouse.service.js';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly dataSource: DataSource,
    private readonly warehouseService: WarehouseService,
  ) {}

  async create(
    dto: CreateProductDto,
    imageUrl: string | null,
  ): Promise<Product> {
    return this.dataSource.transaction(async (manager) => {
      const productRepository = manager.getRepository(Product);

      const product = productRepository.create({
        name: dto.name,
        description: dto.description,
        price: dto.price,
        category: dto.category,
        imageUrl,
      });

      const savedProduct = await productRepository.save(product);

      const savedWarehouse = await this.warehouseService.create(
        {
          quantity: dto.quantity,
        },
        savedProduct.id,
        manager,
      );

      savedProduct.warehouse = savedWarehouse;

      return savedProduct;
    });
  }

  async findAll(query: QueryProductsDto): Promise<PaginatedResult<Product>> {
    const { page, limit, category } = query;

    const [items, total] = await this.productsRepository.findAndCount({
      where: category ? { category } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productsRepository.findOne({ where: { id } });

    if (!product) throw new NotFoundException('Product not found');

    return product;
  }
}
