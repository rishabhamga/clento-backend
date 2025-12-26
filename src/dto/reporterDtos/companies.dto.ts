import { z } from 'zod';

// Create Reporter Company Lead DTO
export const CreateReporterCompanyLeadDto = z.object({
    user_id: z.string().uuid(),
    linkedin_url: z.string().url(),
    name: z.string().nullable().optional(),
    tagline: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    industry: z.array(z.string()).nullable().optional(),
    hq_city: z.string().nullable().optional(),
    hq_country: z.string().nullable().optional(),
    hq_region: z.string().nullable().optional(),
    logo_url: z.string().nullable().optional(),
    logo_large_url: z.string().nullable().optional(),
    employee_count_current: z.number().int().nullable().optional(),
    employee_count_previous: z.number().int().nullable().optional(),
    employee_count_last_checked_at: z.string().datetime().nullable().optional(),
    employee_range_from: z.number().int().nullable().optional(),
    employee_range_to: z.number().int().nullable().optional(),
    followers_count_current: z.number().int().nullable().optional(),
    followers_count_previous: z.number().int().nullable().optional(),
    followers_count_last_checked_at: z.string().datetime().nullable().optional(),
    last_profile_hash: z.string().nullable().optional(),
    last_7_posts_ids: z.array(z.string()).nullable().optional(),
    is_deleted: z.boolean().default(false).optional(),
    last_fetched_at: z.string().datetime().nullable().optional(),
});

// Update Reporter Company Lead DTO
export const UpdateReporterCompanyLeadDto = z.object({
    linkedin_url: z.string().url().optional(),
    name: z.string().nullable().optional(),
    tagline: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    industry: z.array(z.string()).nullable().optional(),
    hq_city: z.string().nullable().optional(),
    hq_country: z.string().nullable().optional(),
    hq_region: z.string().nullable().optional(),
    logo_url: z.string().nullable().optional(),
    logo_large_url: z.string().nullable().optional(),
    employee_count_current: z.number().int().nullable().optional(),
    employee_count_previous: z.number().int().nullable().optional(),
    employee_count_last_checked_at: z.string().datetime().nullable().optional(),
    employee_range_from: z.number().int().nullable().optional(),
    employee_range_to: z.number().int().nullable().optional(),
    followers_count_current: z.number().int().nullable().optional(),
    followers_count_previous: z.number().int().nullable().optional(),
    followers_count_last_checked_at: z.string().datetime().nullable().optional(),
    last_profile_hash: z.string().nullable().optional(),
    last_fetched_at: z.string().datetime().nullable().optional(),
    last_7_posts_ids: z.array(z.string()).nullable().optional(),
    is_deleted: z.boolean().optional(),
    updated_at: z.string().datetime(),
});

// Reporter Company Lead Response DTO
export const ReporterCompanyLeadResponseDto = z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    linkedin_url: z.string(),
    name: z.string().nullable(),
    tagline: z.string().nullable(),
    description: z.string().nullable(),
    website: z.string().nullable(),
    industry: z.array(z.string()).nullable(),
    hq_city: z.string().nullable(),
    hq_country: z.string().nullable(),
    hq_region: z.string().nullable(),
    logo_url: z.string().nullable(),
    logo_large_url: z.string().nullable(),
    employee_count_current: z.number().int().nullable(),
    employee_count_previous: z.number().int().nullable(),
    employee_count_last_checked_at: z.string().datetime().nullable(),
    employee_range_from: z.number().int().nullable(),
    employee_range_to: z.number().int().nullable(),
    followers_count_current: z.number().int().nullable(),
    followers_count_previous: z.number().int().nullable(),
    followers_count_last_checked_at: z.string().datetime().nullable(),
    last_profile_hash: z.string().nullable(),
    last_fetched_at: z.string().datetime().nullable(),
    last_7_posts_ids: z.array(z.string()).nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    is_deleted: z.boolean()
});

// Type exports
export type CreateReporterCompanyLeadDto = z.infer<typeof CreateReporterCompanyLeadDto>;
export type UpdateReporterCompanyLeadDto = z.infer<typeof UpdateReporterCompanyLeadDto>;
export type ReporterCompanyLeadResponseDto = z.infer<typeof ReporterCompanyLeadResponseDto>;
