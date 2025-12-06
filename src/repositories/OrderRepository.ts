import { BaseRepository } from './BaseRepository';
import { OrderResponseDto, CreateOrderDto, UpdateOrderDto } from '../dto/orders.dto';

/**
 * Repository for orders table operations
 */
export class OrderRepository extends BaseRepository<OrderResponseDto, CreateOrderDto, UpdateOrderDto> {
    constructor() {
        super('orders');
    }
}
