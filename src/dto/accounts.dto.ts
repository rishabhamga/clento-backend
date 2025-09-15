import { z } from 'zod';

// Connected Account DTOs
export const CreateConnectedAccountDto = z.object({
  provider: z.enum(['linkedin', 'email', 'gmail', 'outlook']),
  provider_account_id: z.string().min(1),
  display_name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  profile_picture_url: z.string().url().optional(),
  account_type: z.enum(['personal', 'business', 'sales_navigator']).optional(),
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  token_expires_at: z.string().datetime().optional(),
  daily_limit: z.number().min(1).max(1000).default(100),
  capabilities: z.array(z.string()).default([]),
  metadata: z.record(z.any()).default({}),
});

export const UpdateConnectedAccountDto = z.object({
  display_name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  profile_picture_url: z.string().url().optional(),
  account_type: z.enum(['personal', 'business', 'sales_navigator']).optional(),
  status: z.enum(['connected', 'disconnected', 'error', 'expired']).optional(),
  connection_quality: z.enum(['good', 'warning', 'error']).optional(),
  daily_limit: z.number().min(1).max(1000).optional(),
  capabilities: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export const ConnectedAccountQueryDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  provider: z.enum(['linkedin', 'email', 'gmail', 'outlook']).optional(),
  status: z.enum(['connected', 'disconnected', 'error', 'expired']).optional(),
  account_type: z.enum(['personal', 'business', 'sales_navigator']).optional(),
});

// LinkedIn Connection DTO
export const ConnectLinkedInDto = z.object({
  authorization_code: z.string().min(1),
  redirect_uri: z.string().url(),
  account_type: z.enum(['personal', 'business', 'sales_navigator']).default('personal'),
});

// Email Connection DTO
export const ConnectEmailDto = z.object({
  provider: z.enum(['gmail', 'outlook']),
  authorization_code: z.string().min(1),
  redirect_uri: z.string().url(),
});

// Account Sync DTO
export const SyncAccountDto = z.object({
  force: z.boolean().default(false),
});

// Account Usage DTO
export const AccountUsageDto = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  period: z.enum(['day', 'week', 'month']).default('day'),
});

// Type exports
export type CreateConnectedAccountDto = z.infer<typeof CreateConnectedAccountDto>;
export type UpdateConnectedAccountDto = z.infer<typeof UpdateConnectedAccountDto>;
export type ConnectedAccountQueryDto = z.infer<typeof ConnectedAccountQueryDto>;
export type ConnectLinkedInDto = z.infer<typeof ConnectLinkedInDto>;
export type ConnectEmailDto = z.infer<typeof ConnectEmailDto>;
export type SyncAccountDto = z.infer<typeof SyncAccountDto>;
export type AccountUsageDto = z.infer<typeof AccountUsageDto>;
