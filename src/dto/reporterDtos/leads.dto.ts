import { z } from 'zod';

// Reporter Lead Interface
// export interface ReporterLead {
//     id: string;
//     user_id: string;

//     linkedin_url: string;

//     full_name: string | null;
//     profile_image_url: string | null;
//     headline: string | null;
//     location: string | null;

//     last_job_title: string | null;
//     last_company_name: string | null;
//     last_company_id: string | null;

//     last_experience: any | null;     // JSONB
//     last_education: any | null;      // JSONB

//     last_profile_hash: string | null;

//     last_company_domain: string | null;
//     last_company_size: string | null;
//     last_company_industry: string | null;

//     last_fetched_at: string | null;  // ISO timestamp
//     created_at: string;
//     updated_at: string;
// }

// Create Reporter Lead DTO
export const CreateReporterLeadDto = z.object({
    user_id: z.string().uuid(),
    linkedin_url: z.string().url(),
    full_name: z.string().nullable().optional(),
    profile_image_url: z.string().url().nullable().optional(),
    headline: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    last_job_title: z.string().nullable().optional(),
    last_company_name: z.string().nullable().optional(),
    last_company_id: z.string().nullable().optional(),
    last_experience: z.any().nullable().optional(),
    last_education: z.any().nullable().optional(),
    last_profile_hash: z.string().nullable().optional(),
    last_company_domain: z.string().nullable().optional(),
    last_company_size: z.string().nullable().optional(),
    last_company_industry: z.string().nullable().optional(),
    last_fetched_at: z.string().datetime().nullable().optional(),
    last_7_posts_ids: z.array(z.string()).nullable().optional(),
    is_deleted: z.boolean().default(false).optional(),
});

// Update Reporter Lead DTO
export const UpdateReporterLeadDto = z.object({
    linkedin_url: z.string().url().optional(),
    full_name: z.string().nullable().optional(),
    profile_image_url: z.string().url().nullable().optional(),
    headline: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    last_job_title: z.string().nullable().optional(),
    last_company_name: z.string().nullable().optional(),
    last_company_id: z.string().nullable().optional(),
    last_experience: z.any().nullable().optional(),
    last_education: z.any().nullable().optional(),
    last_profile_hash: z.string().nullable().optional(),
    last_company_domain: z.string().nullable().optional(),
    last_company_size: z.string().nullable().optional(),
    last_company_industry: z.string().nullable().optional(),
    last_fetched_at: z.string().datetime().nullable().optional(),
    last_7_posts_ids: z.array(z.string()).nullable().optional(),
    updated_at: z.string().datetime(),
    is_deleted: z.boolean().optional(),
});

// Reporter Lead Response DTO
export const ReporterLeadResponseDto = z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    linkedin_url: z.string(),
    full_name: z.string().nullable(),
    profile_image_url: z.string().nullable(),
    headline: z.string().nullable(),
    location: z.string().nullable(),
    last_job_title: z.string().nullable(),
    last_company_name: z.string().nullable(),
    last_company_id: z.string().nullable(),
    last_experience: z.any().nullable(),
    last_education: z.any().nullable(),
    last_profile_hash: z.string().nullable(),
    last_company_domain: z.string().nullable(),
    last_company_size: z.string().nullable(),
    last_company_industry: z.string().nullable(),
    last_fetched_at: z.string().datetime().nullable(),
    last_7_posts_ids: z.array(z.string()).nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    is_deleted: z.boolean(),
});

// Type exports
export type CreateReporterLeadDto = z.infer<typeof CreateReporterLeadDto>;
export type UpdateReporterLeadDto = z.infer<typeof UpdateReporterLeadDto>;
export type ReporterLeadResponseDto = z.infer<typeof ReporterLeadResponseDto>
