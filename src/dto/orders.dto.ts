import { z } from 'zod';

export enum OrderStatus {
    INITIATED = 'INITIATED',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
}

const OrderCreateDto = z.object({
    organization_id: z.string().uuid(),
    plan_id: z.string().uuid(),
    amount: z.number().int().positive(),
    status: z.nativeEnum(OrderStatus).default(OrderStatus.INITIATED),
    numberOfSeats: z.number().int().positive(),
    xpay_intent_id: z.string().nullable().optional(),
});

const OrderUpdateDto = z.object({
    organization_id: z.string().uuid().optional(),
    plan_id: z.string().uuid().optional(),
    amount: z.number().int().positive().optional(),
    status: z.nativeEnum(OrderStatus).optional(),
    numberOfSeats: z.number().int().positive().optional(),
    xpay_intent_id: z.string().nullable().optional(),
});

const OrderResponseDto = z.object({
    id: z.string().uuid(),
    organization_id: z.string().uuid(),
    plan_id: z.string().uuid(),
    amount: z.number().int(),
    status: z.nativeEnum(OrderStatus),
    numberOfSeats: z.number().int().positive(),
    xpay_intent_id: z.string().nullable(),
    created_at: z.string().datetime(),
});

// Type exports
export type CreateOrderDto = z.infer<typeof OrderCreateDto>;
export type UpdateOrderDto = z.infer<typeof OrderUpdateDto>;
export type OrderResponseDto = z.infer<typeof OrderResponseDto>;
