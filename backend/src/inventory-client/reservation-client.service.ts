import {
  BadGatewayException, BadRequestException, ConflictException,
  GatewayTimeoutException, Inject, Injectable, ServiceUnavailableException,
  type OnModuleInit,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Metadata, status, type CallOptions } from '@grpc/grpc-js';
import { firstValueFrom, type Observable } from 'rxjs';

export interface StockLine {
  productId: string;
  quantity: number;
}

interface ReservationKey {
  reservationId: string;
}

interface ReservationReply extends ReservationKey {
  status: string;
}

interface InventoryReservations {
  reserve(request: ReservationKey & { items: StockLine[] }, metadata: Metadata,
    options: CallOptions): Observable<ReservationReply>;
  release(request: ReservationKey, metadata: Metadata,
    options: CallOptions): Observable<ReservationReply>;
}

@Injectable()
export class ReservationClientService implements OnModuleInit {
  private inventory!: InventoryReservations;

  constructor(@Inject('INVENTORY_GRPC_CLIENT') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.inventory = this.client.getService<InventoryReservations>('InventoryService');
  }

  reserve(reservationId: string, items: StockLine[]) {
    const call = this.inventory.reserve({ reservationId, items }, new Metadata(),
      { deadline: Date.now() + 3000 });
    return this.verify(call, reservationId, 'RESERVED');
  }

  release(reservationId: string) {
    const call = this.inventory.release({ reservationId }, new Metadata(),
      { deadline: Date.now() + 3000 });
    return this.verify(call, reservationId, 'RELEASED');
  }

  private async verify(call: Observable<ReservationReply>, id: string, expected: string) {
    let reply: ReservationReply;
    try {
      reply = await firstValueFrom(call);
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? error.code : undefined;
      switch (code) {
        case status.FAILED_PRECONDITION:
        case status.NOT_FOUND:
          throw new ConflictException('Inventory could not fulfill this reservation');
        case status.ALREADY_EXISTS:
          throw new ConflictException('Reservation ID has already been used');
        case status.INVALID_ARGUMENT:
          throw new BadRequestException('Invalid inventory request');
        case status.DEADLINE_EXCEEDED:
          throw new GatewayTimeoutException('Inventory service timed out');
        case status.UNAVAILABLE:
          throw new ServiceUnavailableException('Inventory service is unavailable');
        default:
          throw new BadGatewayException('Inventory request failed');
      }
    }
    if (reply.reservationId !== id || reply.status !== expected) {
      throw new BadGatewayException('Unexpected inventory response');
    }
  }
}
