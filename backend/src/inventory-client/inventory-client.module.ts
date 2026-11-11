import { ReservationClientService } from './reservation-client.service.js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { fileURLToPath } from 'node:url';

import { InventoryClientService } from './inventory-client.service.js';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'INVENTORY_GRPC_CLIENT',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'inventory.v1',
            protoPath: fileURLToPath(
              new URL('../proto/inventory.proto', import.meta.url),
            ),
            url: config.getOrThrow<string>('INVENTORY_GRPC_URL'),
            loader: {
              keepCase: false,
              defaults: true,
            },
          },
        }),
      },
    ]),
  ],
  providers: [InventoryClientService, ReservationClientService],
  exports: [InventoryClientService, ReservationClientService],
})
export class InventoryClientModule {}