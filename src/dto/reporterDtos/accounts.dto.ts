import { z } from 'zod';

// Reporter Connected Account DTOs
export const CreateReporterConnectedAccountDto = z.object({
    provider: z.enum(['linkedin', 'email', 'gmail', 'outlook']),
    reporter_user_id: z.string().uuid(),
    provider_account_id: z.string().min(1),
    display_name: z.string().min(1),
    profile_picture_url: z.string().nullable().optional(),
    status: z.enum(['pending', 'connected', 'disconnected', 'error', 'expired']).default('pending'),
    capabilities: z.array(z.string()).default([]),
    metadata: z.record(z.any()).default({}),
    last_synced_at: z.string().datetime().nullable().optional(),
    created_at: z.string().datetime().default(new Date().toISOString()).optional(),
    updated_at: z.string().datetime().default(new Date().toISOString()).optional(),
});

export const UpdateReporterConnectedAccountDto = z.object({
    provider: z.enum(['linkedin', 'email', 'gmail', 'outlook']).optional(),
    provider_account_id: z.string().optional(),
    display_name: z.string().optional(),
    profile_picture_url: z.string().nullable().optional(),
    status: z.enum(['pending', 'connected', 'disconnected', 'error', 'expired']).optional(),
    capabilities: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional(),
    last_synced_at: z.string().datetime().nullable().optional(),
    updated_at: z.string().datetime(),
});

export const ReporterConnectedAccountResponseDto = z.object({
    id: z.string().uuid(),
    reporter_user_id: z.string().uuid(),
    provider: z.string(),
    provider_account_id: z.string(),
    display_name: z.string(),
    profile_picture_url: z.string().nullable(),
    status: z.string().nullable(),
    capabilities: z.array(z.string()),
    metadata: z.record(z.any()),
    last_synced_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
});

// Type exports
export type CreateReporterConnectedAccountDto = z.infer<typeof CreateReporterConnectedAccountDto>;
export type UpdateReporterConnectedAccountDto = z.infer<typeof UpdateReporterConnectedAccountDto>;
export type ReporterConnectedAccountResponseDto = z.infer<typeof ReporterConnectedAccountResponseDto>;
