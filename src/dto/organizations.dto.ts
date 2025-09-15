import { z } from 'zod';

// Organization DTOs
export const CreateOrganizationDto = z.object({
  name: z.string().min(1, 'Organization name is required').max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens').optional(),
  logo_url: z.string().url().optional(),
  website_url: z.string().url().optional(),
  industry: z.string().max(255).optional(),
  company_size: z.enum(['startup', 'small', 'medium', 'large', 'enterprise']).optional(),
  timezone: z.string().max(50).default('UTC'),
  billing_email: z.string().email().optional(),
});

export const UpdateOrganizationDto = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  logo_url: z.string().url().optional(),
  website_url: z.string().url().optional(),
  industry: z.string().max(255).optional(),
  company_size: z.enum(['startup', 'small', 'medium', 'large', 'enterprise']).optional(),
  timezone: z.string().max(50).optional(),
  billing_email: z.string().email().optional(),
  onboarding_completed: z.boolean().optional(),
  settings: z.record(z.any()).optional(),
});

export const OrganizationQueryDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  plan: z.enum(['free', 'starter', 'professional', 'enterprise']).optional(),
  company_size: z.enum(['startup', 'small', 'medium', 'large', 'enterprise']).optional(),
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
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format').optional(),
  year: z.coerce.number().min(2020).max(2030).optional(),
});

// Type exports
export type CreateOrganizationDto = z.infer<typeof CreateOrganizationDto>;
export type UpdateOrganizationDto = z.infer<typeof UpdateOrganizationDto>;
export type OrganizationQueryDto = z.infer<typeof OrganizationQueryDto>;
export type AddOrganizationMemberDto = z.infer<typeof AddOrganizationMemberDto>;
export type UpdateOrganizationMemberDto = z.infer<typeof UpdateOrganizationMemberDto>;
export type OrganizationMemberQueryDto = z.infer<typeof OrganizationMemberQueryDto>;
export type OrganizationUsageDto = z.infer<typeof OrganizationUsageDto>;
