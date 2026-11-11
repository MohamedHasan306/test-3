import {
    BadGatewayException,
    GatewayTimeoutException,
    Inject,
    Injectable,
    ServiceUnavailableException,
} from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import type { CallOptions } from '@grpc/grpc-js';
import {
    firstValueFrom,
    timeout,
    TimeoutError,
} from 'rxjs';
import type { Observable } from 'rxjs';

interface StockResponse {
    productId: string;
    available: number;
}

interface InventoryGrpcService {
    getQuantity(
        request: { productId: string },
        metadata: Metadata,
        options: CallOptions,
    ): Observable<StockResponse>;
}

@Injectable()
export class InventoryClientService implements OnModuleInit {
    private inventory!: InventoryGrpcService;
    private readonly timeoutMs = 3000;

    constructor(
        @Inject('INVENTORY_GRPC_CLIENT')
        private readonly client: ClientGrpc,
    ) { }

    onModuleInit() {
        this.inventory =
            this.client.getService<InventoryGrpcService>(
                'InventoryService',
            );
    }

    async getQuantity(productId: string): Promise<StockResponse> {
        let stock: StockResponse;

        try {
            stock = await firstValueFrom(
                this.inventory
                    .getQuantity(
                        { productId },
                        new Metadata(),
                        {
                            deadline: new Date(
                                Date.now() + this.timeoutMs,
                            ),
                        },
                    )
                    .pipe(
                        timeout({ first: this.timeoutMs }),
                    ),
            );
        } catch (error: unknown) {
            const code =
                typeof error === 'object' &&
                    error !== null &&
                    'code' in error
                    ? error.code
                    : undefined;

            if (
                error instanceof TimeoutError ||
                code === status.DEADLINE_EXCEEDED
            ) {
                throw new GatewayTimeoutException(
                    'Inventory service timed out',
                );
            }

            if (code === status.UNAVAILABLE) {
                throw new ServiceUnavailableException(
                    'Inventory service is unavailable',
                );
            }

            if (code === status.NOT_FOUND) {
                throw new ServiceUnavailableException(
                    'Stock data is missing for this product',
                );
            }

            throw new BadGatewayException(
                'Unable to read inventory',
            );
        }

        if (
            stock.productId.toLowerCase() !== productId.toLowerCase() ||
            !Number.isInteger(stock.available) ||
            stock.available < 0
        ) {
            throw new BadGatewayException(
                'Invalid inventory response',
            );
        }

        return stock;
    }
}