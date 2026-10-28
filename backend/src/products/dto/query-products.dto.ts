import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class QueryProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'electronics' })
  @IsOptional()
  @IsString()
  category?: string;
}
