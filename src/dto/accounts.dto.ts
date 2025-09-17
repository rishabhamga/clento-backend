import { z } from 'zod';

// Connected Account DTOs
export const CreateConnectedAccountDto = z.object({
  provider: z.string().max(50),
  user_id: z.string().uuid().nullable().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  provider_account_id: z.string().min(1),
  display_name: z.string().min(1),
  email: z.string().nullable().optional(),
  profile_picture_url: z.string().nullable().optional(),
  status: z.string().max(50).default('connected'),
  capabilities: z.record(z.any()).default({}),
  metadata: z.record(z.any()).default({}),
  last_synced_at: z.string().datetime().nullable().optional(),
});

export const UpdateConnectedAccountDto = z.object({
  user_id: z.string().uuid().nullable().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  provider: z.string().max(50).optional(),
  provider_account_id: z.string().optional(),
  display_name: z.string().optional(),
  email: z.string().nullable().optional(),
  profile_picture_url: z.string().nullable().optional(),
  status: z.string().max(50).optional(),
  capabilities: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  last_synced_at: z.string().datetime().nullable().optional(),
});

// Account Usage DTO
export const AccountUsageDto = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  period: z.enum(['day', 'week', 'month']).default('day'),
});

// Connected Account Query DTO
export const ConnectedAccountQueryDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  provider: z.string().optional(),
  status: z.string().optional(),
  user_id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
});

// Connect LinkedIn DTO
export const ConnectLinkedInDto = z.object({
  authorization_code: z.string().min(1, 'Authorization code is required'),
  state: z.string().optional(),
});

// Connect Email DTO
export const ConnectEmailDto = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  provider: z.string().default('gmail'),
});

// Sync Account DTO
export const SyncAccountDto = z.object({
  account_id: z.string().uuid(),
  force_sync: z.boolean().default(false),
});
/**
 * DTO for connected account response (matches database Row type)
 */
export const ConnectedAccountResponseDto = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  organization_id: z.string().uuid().nullable(),
  provider: z.string(),
  provider_account_id: z.string(),
  display_name: z.string(),
  email: z.string().nullable(),
  profile_picture_url: z.string().nullable(),
  status: z.string().nullable(),
  capabilities: z.record(z.any()),
  metadata: z.record(z.any()),
  last_synced_at: z.string().datetime().nullable(),
  created_at: z.string().datetime().nullable(),
  updated_at: z.string().datetime().nullable(),
});

// Type exports
export type CreateConnectedAccountDto = z.infer<typeof CreateConnectedAccountDto>;
export type UpdateConnectedAccountDto = z.infer<typeof UpdateConnectedAccountDto>;
export type AccountUsageDto = z.infer<typeof AccountUsageDto>;
export type ConnectedAccountQueryDto = z.infer<typeof ConnectedAccountQueryDto>;
export type ConnectLinkedInDto = z.infer<typeof ConnectLinkedInDto>;
export type ConnectEmailDto = z.infer<typeof ConnectEmailDto>;
export type SyncAccountDto = z.infer<typeof SyncAccountDto>;
export type ConnectedAccountResponseDto = z.infer<typeof ConnectedAccountResponseDto>;
