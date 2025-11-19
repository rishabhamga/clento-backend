import { z } from 'zod';

// Organization DTOs
export const CreateOrganizationDto = z.object({
    name: z.string().min(1, 'Organization name is required').max(255),
    slug: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
        .optional(),
    logo_url: z.string().url().optional(),
    website_url: z.string().url().optional(),
    plan: z.string().max(50).default('free'),
    billing_email: z.string().email().optional(),
});

export const UpdateOrganizationDto = z.object({
    name: z.string().min(1).max(255).optional(),
    slug: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9-]+$/)
        .optional(),
    logo_url: z.string().url().optional(),
    website_url: z.string().url().optional(),
    plan: z.string().max(50).optional(),
    billing_email: z.string().email().optional(),
    subscription_status: z.string().max(50).optional(),
    monthly_campaign_limit: z.number().int().min(0).optional(),
    monthly_lead_limit: z.number().int().min(0).optional(),
    user_limit: z.number().int().min(0).optional(),
    settings: z.record(z.any()).optional(),
});

export const OrganizationQueryDto = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    search: z.string().optional(),
    plan: z.string().max(50).optional(),
    subscription_status: z.string().max(50).optional(),
});

// Organization Member DTOs
export const AddOrganizationMemberDto = z.object({
    user_id: z.string().uuid(),
    role: z.enum(['owner', 'admin', 'member', 'viewer']).default('member'),
    permissions: z.record(z.any()).optional(),
});

export const UpdateOrganizationMemberDto = z.object({
    role: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
    permissions: z.record(z.any()).optional(),
    status: z.enum(['active', 'inactive', 'pending']).optional(),
});

export const OrganizationMemberQueryDto = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    role: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
    status: z.enum(['active', 'inactive', 'pending']).optional(),
});

// Usage Stats DTO
export const OrganizationUsageDto = z.object({
    month: z
        .string()
        .regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format')
        .optional(),
    year: z.coerce.number().min(2020).max(2030).optional(),
});

/**
 * DTO for organization response (matches database Row type)
 */
export const OrganizationResponseDto = z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string().nullable(),
    logo_url: z.string().nullable(),
    website_url: z.string().nullable(),
    plan: z.string(),
    billing_email: z.string().nullable(),
    subscription_status: z.string(),
    monthly_campaign_limit: z.number().int().min(0),
    monthly_lead_limit: z.number().int().min(0),
    user_limit: z.number().int().min(0),
    settings: z.record(z.any()),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
});

/**
 * DTO for organization insert (matches database Insert type)
 */
export const OrganizationInsertDto = z.object({
    id: z.string().uuid().optional(),
    name: z.string(),
    slug: z.string().nullable().optional(),
    logo_url: z.string().nullable().optional(),
    website_url: z.string().nullable().optional(),
    plan: z.string().max(50).default('free').optional(),
    billing_email: z.string().nullable().optional(),
    subscription_status: z.string().max(50).default('active').optional(),
    monthly_campaign_limit: z.number().int().min(0).default(5).optional(),
    monthly_lead_limit: z.number().int().min(0).default(1000).optional(),
    user_limit: z.number().int().min(0).default(5).optional(),
    settings: z.record(z.any()).default({}).optional(),
    created_at: z.string().datetime().optional(),
    updated_at: z.string().datetime().optional(),
});

/**
 * DTO for organization update (matches database Update type)
 */
export const OrganizationUpdateDto = z.object({
    id: z.string().uuid().optional(),
    name: z.string().optional(),
    slug: z.string().nullable().optional(),
    logo_url: z.string().nullable().optional(),
    website_url: z.string().nullable().optional(),
    plan: z.string().max(50).optional(),
    billing_email: z.string().nullable().optional(),
    subscription_status: z.string().max(50).optional(),
    monthly_campaign_limit: z.number().int().min(0).optional(),
    monthly_lead_limit: z.number().int().min(0).optional(),
    user_limit: z.number().int().min(0).optional(),
    settings: z.record(z.any()).optional(),
    created_at: z.string().datetime().optional(),
    updated_at: z.string().datetime().optional(),
});

/**
 * DTO for organization member response (matches database Row type)
 */
export const OrganizationMemberResponseDto = z.object({
    id: z.string().uuid(),
    organization_id: z.string().uuid().nullable(),
    user_id: z.string().uuid().nullable(),
    role: z.string().nullable(),
    permissions: z.record(z.any()).nullable(),
    status: z.string().nullable(),
    created_at: z.string().datetime().nullable(),
    updated_at: z.string().datetime().nullable(),
});

/**
 * DTO for organization member insert (matches database Insert type)
 */
export const OrganizationMemberInsertDto = z.object({
    id: z.string().uuid().optional(),
    organization_id: z.string().uuid().nullable().optional(),
    user_id: z.string().uuid().nullable().optional(),
    role: z.string().max(50).default('member').optional(),
    permissions: z.record(z.any()).default({}).optional(),
    status: z.string().max(50).default('active').optional(),
    created_at: z.string().datetime().optional(),
    updated_at: z.string().datetime().optional(),
});

/**
 * DTO for organization member update (matches database Update type)
 */
export const OrganizationMemberUpdateDto = z.object({
    id: z.string().uuid().optional(),
    organization_id: z.string().uuid().nullable().optional(),
    user_id: z.string().uuid().nullable().optional(),
    role: z.string().max(50).optional(),
    permissions: z.record(z.any()).optional(),
    status: z.string().max(50).optional(),
    created_at: z.string().datetime().optional(),
    updated_at: z.string().datetime().optional(),
});

// Type exports
export type CreateOrganizationDto = z.infer<typeof CreateOrganizationDto>;
export type UpdateOrganizationDto = z.infer<typeof UpdateOrganizationDto>;
export type OrganizationQueryDto = z.infer<typeof OrganizationQueryDto>;
export type AddOrganizationMemberDto = z.infer<typeof AddOrganizationMemberDto>;
export type UpdateOrganizationMemberDto = z.infer<typeof UpdateOrganizationMemberDto>;
export type OrganizationMemberQueryDto = z.infer<typeof OrganizationMemberQueryDto>;
export type OrganizationUsageDto = z.infer<typeof OrganizationUsageDto>;
export type OrganizationResponseDto = z.infer<typeof OrganizationResponseDto>;
export type OrganizationInsertDto = z.infer<typeof OrganizationInsertDto>;
export type OrganizationUpdateDto = z.infer<typeof OrganizationUpdateDto>;
export type OrganizationMemberResponseDto = z.infer<typeof OrganizationMemberResponseDto>;
export type OrganizationMemberInsertDto = z.infer<typeof OrganizationMemberInsertDto>;
export type OrganizationMemberUpdateDto = z.infer<typeof OrganizationMemberUpdateDto>;
