import { z } from 'zod';

export enum SubscriptionType {
    ADDON = 'ADDON',
    PLAN = 'PLAN',
}

const SubscriptionCreateDto = z.object({
    organization_id: z.string().uuid(),
    plan_id: z.string().uuid(),
    type: z.nativeEnum(SubscriptionType),
    parent_id: z.string().uuid(),
    numberOfSeats: z.number(),
    period_start: z.string().datetime(),
    period_end: z.string().datetime(),
});

const SubscriptionUpdateDto = z.object({
    organization_id: z.string().uuid().optional(),
    plan_id: z.string().uuid().optional(),
    type: z.nativeEnum(SubscriptionType).optional(),
    parent_id: z.string().uuid().optional(),
    numberOfSeats: z.number().optional(),
    period_start: z.string().datetime().optional(),
    period_end: z.string().datetime().optional(),
});

const SubscriptionResponseDto = z.object({
    id: z.string().uuid(),
    organization_id: z.string().uuid(),
    plan_id: z.string().uuid(),
    type: z.nativeEnum(SubscriptionType),
    parent_id: z.string().uuid(),
    numberOfSeats: z.number(),
    period_start: z.string().datetime(),
    period_end: z.string().datetime(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
});

// Type exports
export type CreateSubscriptionDto = z.infer<typeof SubscriptionCreateDto>;
export type UpdateSubscriptionDto = z.infer<typeof SubscriptionUpdateDto>;
export type SubscriptionResponseDto = z.infer<typeof SubscriptionResponseDto>;
