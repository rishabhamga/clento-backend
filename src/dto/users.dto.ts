import { z } from 'zod';

/**
 * DTO for creating a user
 */
export const CreateUserDto = z.object({
  externalId: z.string().nonempty('External ID is required'),
  email: z.string().email('Invalid email format'),
  fullName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

export type CreateUserDtoType = z.infer<typeof CreateUserDto>;

/**
 * DTO for updating a user
 */
export const UpdateUserDto = z.object({
  fullName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

export type UpdateUserDtoType = z.infer<typeof UpdateUserDto>;

/**
 * DTO for user response (matches database Row type)
 */
export const UserResponseDto = z.object({
  id: z.string().uuid(),
  external_id: z.string(),
  email: z.string().email(),
  full_name: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

/**
 * DTO for user profile response (matches database Row type)
 */
export const UserProfileResponseDto = z.object({
  user_id: z.string().uuid(),
  company_name: z.string().nullable(),
  website_url: z.string().url().nullable(),
  site_summary: z.string().nullable(),
  icp: z.record(z.any()),
  linkedin_connected: z.boolean(),
  completed: z.boolean(),
  updated_at: z.string().datetime(),
  onboarding_completed: z.boolean(),
  onboarding_step_completed: z.record(z.any()),
  linkedin_accounts_connected: z.number().int().min(0),
  organization_id: z.string().uuid().nullable(),
});

/**
 * DTO for user insert (matches database Insert type)
 */
export const UserInsertDto = z.object({
  id: z.string().uuid(),
  external_id: z.string(),
  email: z.string().email(),
  full_name: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

/**
 * DTO for user update (matches database Update type)
 */
export const UserUpdateDto = z.object({
  id: z.string().uuid().optional(),
  external_id: z.string().optional(),
  email: z.string().email().optional(),
  full_name: z.string().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

/**
 * DTO for user profile insert (matches database Insert type)
 */
export const UserProfileInsertDto = z.object({
  user_id: z.string().uuid(),
  company_name: z.string().nullable().optional(),
  website_url: z.string().url().nullable().optional(),
  site_summary: z.string().nullable().optional(),
  icp: z.record(z.any()).optional(),
  linkedin_connected: z.boolean().optional(),
  completed: z.boolean().optional(),
  updated_at: z.string().datetime().optional(),
  onboarding_completed: z.boolean().optional(),
  onboarding_step_completed: z.record(z.any()).optional(),
  linkedin_accounts_connected: z.number().int().min(0).optional(),
  organization_id: z.string().uuid().nullable().optional(),
});

/**
 * DTO for user profile update (matches database Update type)
 */
export const UserProfileUpdateDto = z.object({
  user_id: z.string().uuid().optional(),
  company_name: z.string().nullable().optional(),
  website_url: z.string().url().nullable().optional(),
  site_summary: z.string().nullable().optional(),
  icp: z.record(z.any()).optional(),
  linkedin_connected: z.boolean().optional(),
  completed: z.boolean().optional(),
  updated_at: z.string().datetime().optional(),
  onboarding_completed: z.boolean().optional(),
  onboarding_step_completed: z.record(z.any()).optional(),
  linkedin_accounts_connected: z.number().int().min(0).optional(),
  organization_id: z.string().uuid().nullable().optional(),
});

// Type exports
export type UserResponseDto = z.infer<typeof UserResponseDto>;
export type UserProfileResponseDto = z.infer<typeof UserProfileResponseDto>;
export type UserInsertDto = z.infer<typeof UserInsertDto>;
export type UserUpdateDto = z.infer<typeof UserUpdateDto>;
export type UserProfileInsertDto = z.infer<typeof UserProfileInsertDto>;
export type UserProfileUpdateDto = z.infer<typeof UserProfileUpdateDto>;
