import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../users/auth/jwt-payload.interface.js';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Order created' })
  create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(currentUser.id, dto);
  }

  @Get()
  @ApiOkResponse({ description: 'Orders visible to the current user: own orders, or all of them for an admin' })
  findMine(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.ordersService.findForUser(currentUser);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'A single order, only if it belongs to the current user or the caller is an admin' })
  @ApiForbiddenResponse({ description: 'Trying to access another user\'s order' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.ordersService.findOne(id, currentUser);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOkResponse({ description: 'Order status updated (admin only)' })
  @ApiForbiddenResponse({ description: 'Caller is not an admin' })
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto.status);
  }
}
