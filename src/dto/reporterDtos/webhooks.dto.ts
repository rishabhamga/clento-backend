import { z } from 'zod';

// Reporter Webhook DTOs
export const CreateReporterWebhookDto = z.object({
    reporter_user_id: z.string().uuid(),
    name: z.string(),
    url: z.string().regex(/^https?:\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/),
    success_rate: z.number().default(100),
    is_deleted: z.boolean().default(false).optional(),
    created_at: z.string().datetime().default(new Date().toISOString()).optional(),
    updated_at: z.string().datetime().default(new Date().toISOString()).optional(),
});

export const UpdateReporterWebhookDto = z.object({
    reporter_user_id: z.string().uuid().optional(),
    name: z.string().optional(),
    url: z.string().regex(/^https?:\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/).optional(),
    success_rate: z.number().default(100).optional(),
    is_deleted: z.boolean().optional(),
    updated_at: z.string().datetime(),
});

export const ReporterWebhookResponseDto = z.object({
    id: z.string().uuid(),
    reporter_user_id: z.string().uuid(),
    name: z.string(),
    url: z.string().regex(/^https?:\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/),
    success_rate: z.number().default(100),
    is_deleted: z.boolean(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
});

// Type exports
export type CreateReporterWebhookDto = z.infer<typeof CreateReporterWebhookDto>;
export type UpdateReporterWebhookDto = z.infer<typeof UpdateReporterWebhookDto>;
export type ReporterWebhookResponseDto = z.infer<typeof ReporterWebhookResponseDto>;
