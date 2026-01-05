import { z } from 'zod';

export enum EAlertPriority {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
}

// Create Reporter Lead Alert DTO
export const CreateReporterLeadAlertDto = z.object({
    lead_id: z.string().uuid(),
    reporter_user_id: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().min(1),
    priority: z.nativeEnum(EAlertPriority),
    acknowledged: z.boolean().default(false).optional(),
    previous_value: z.record(z.string(), z.any()).optional(),
    updated_value: z.record(z.string(), z.any()).optional()
});

// Update Reporter Lead Alert DTO
export const UpdateReporterLeadAlertDto = z.object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    priority: z.nativeEnum(EAlertPriority).optional(),
    acknowledged: z.boolean().optional(),
    previous_value: z.record(z.string(), z.any()).optional(),
    updated_value: z.record(z.string(), z.any()).optional()
});

// Reporter Lead Alert Response DTO
export const ReporterLeadAlertResponseDto = z.object({
    id: z.string().uuid(),
    lead_id: z.string().uuid(),
    reporter_user_id: z.string().uuid(),
    title: z.string(),
    description: z.string(),
    priority: z.nativeEnum(EAlertPriority),
    acknowledged: z.boolean(),
    created_at: z.string().datetime(),
    previous_value: z.record(z.string(), z.any()).nullable(),
    updated_value: z.record(z.string(), z.any()).nullable(),
});

// Type exports
export type CreateReporterLeadAlertDto = z.infer<typeof CreateReporterLeadAlertDto>;
export type UpdateReporterLeadAlertDto = z.infer<typeof UpdateReporterLeadAlertDto>;
export type ReporterLeadAlertResponseDto = z.infer<typeof ReporterLeadAlertResponseDto>;
