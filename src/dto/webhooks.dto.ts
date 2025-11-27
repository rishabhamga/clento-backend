import { z } from 'zod';

// Workflow Step Schema
const WebhookCreateDto = z.object({
    organization_id: z.string().uuid(),
    name: z.string(),
    url: z.string().regex(/^https?:\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/),
    success_rate: z.number().default(100),
});
const WebhookUpdateDto = z.object({
    organization_id: z.string().uuid().optional(),
    name: z.string().optional(),
    url: z.string().regex(/^https?:\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/).optional(),
    success_rate: z.number().default(100).optional(),
});
const WebhookResponseDto = z.object({
    id: z.string().uuid(),
    organization_id: z.string().uuid(),
    name: z.string(),
    url: z.string().regex(/^https?:\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s]*)?$/),
    success_rate: z.number().default(100),
    created_at: z.string().datetime()
});

// Type exports
export type CreateWebhookDto = z.infer<typeof WebhookCreateDto>;
export type UpdateWebhookDto = z.infer<typeof WebhookUpdateDto>;
export type WebhookResponseDto = z.infer<typeof WebhookResponseDto>;