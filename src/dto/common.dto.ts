import { z } from 'zod';

// Common pagination DTO
export const PaginationDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

// Common search DTO
export const SearchDto = z.object({
  search: z.string().min(1).optional(),
  filters: z.record(z.any()).optional(),
});

// Common date range DTO
export const DateRangeDto = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
});

// File upload DTO
export const FileUploadDto = z.object({
  file_name: z.string().min(1),
  file_size: z.number().min(1),
  file_type: z.string().min(1),
  content_type: z.string().min(1),
});

// Bulk operation DTO
export const BulkOperationDto = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one ID is required'),
  action: z.enum(['delete', 'update', 'export']),
  data: z.record(z.any()).optional(),
});

// API Response wrapper
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.any().optional(),
  errors: z.array(z.string()).optional(),
  meta: z.object({
    page: z.number().optional(),
    limit: z.number().optional(),
    total: z.number().optional(),
    total_pages: z.number().optional(),
  }).optional(),
});

// Error response DTO
export const ErrorResponseDto = z.object({
  success: z.literal(false),
  message: z.string(),
  errors: z.array(z.string()).optional(),
  code: z.string().optional(),
  details: z.record(z.any()).optional(),
});

// Success response DTO
export const SuccessResponseDto = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.any().optional(),
});

// Validation error DTO
export const ValidationErrorDto = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string().optional(),
});

// Health check DTO
export const HealthCheckDto = z.object({
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  timestamp: z.string().datetime(),
  version: z.string(),
  services: z.record(z.object({
    status: z.enum(['up', 'down', 'degraded']),
    response_time: z.number().optional(),
    last_check: z.string().datetime().optional(),
  })).optional(),
});

// Webhook DTO
export const WebhookDto = z.object({
  event: z.string().min(1),
  data: z.record(z.any()),
  timestamp: z.string().datetime(),
  signature: z.string().optional(),
});

// Notification DTO
export const CreateNotificationDto = z.object({
  user_id: z.string().uuid(),
  type: z.enum(['campaign_completed', 'lead_replied', 'account_error', 'limit_reached', 'system_alert']),
  title: z.string().min(1).max(255),
  message: z.string().min(1).max(1000),
  data: z.record(z.any()).default({}),
});

export const NotificationQueryDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  type: z.enum(['campaign_completed', 'lead_replied', 'account_error', 'limit_reached', 'system_alert']).optional(),
  read: z.coerce.boolean().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
});

export const MarkNotificationReadDto = z.object({
  notification_ids: z.array(z.string().uuid()).min(1),
  read: z.boolean().default(true),
});

// Integration DTO
export const CreateIntegrationDto = z.object({
  name: z.enum(['unipile', 'smartlead', 'apollo', 'clay', 'zapier']),
  config: z.record(z.any()).default({}),
  credentials: z.record(z.any()).default({}),
});

export const UpdateIntegrationDto = z.object({
  config: z.record(z.any()).optional(),
  credentials: z.record(z.any()).optional(),
  status: z.enum(['connected', 'disconnected', 'error']).optional(),
});

export const IntegrationQueryDto = z.object({
  status: z.enum(['connected', 'disconnected', 'error']).optional(),
  name: z.enum(['unipile', 'smartlead', 'apollo', 'clay', 'zapier']).optional(),
});

// Audit log DTO
export const AuditLogQueryDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  action: z.string().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
});

// Type exports
export type PaginationDto = z.infer<typeof PaginationDto>;
export type SearchDto = z.infer<typeof SearchDto>;
export type DateRangeDto = z.infer<typeof DateRangeDto>;
export type FileUploadDto = z.infer<typeof FileUploadDto>;
export type BulkOperationDto = z.infer<typeof BulkOperationDto>;
export type ApiResponse<T = any> = {
  success: boolean;
  message?: string;
  data?: T;
  errors?: string[];
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    total_pages?: number;
  };
};
export type ErrorResponseDto = z.infer<typeof ErrorResponseDto>;
export type SuccessResponseDto = z.infer<typeof SuccessResponseDto>;
export type ValidationErrorDto = z.infer<typeof ValidationErrorDto>;
export type HealthCheckDto = z.infer<typeof HealthCheckDto>;
export type WebhookDto = z.infer<typeof WebhookDto>;
export type CreateNotificationDto = z.infer<typeof CreateNotificationDto>;
export type NotificationQueryDto = z.infer<typeof NotificationQueryDto>;
export type MarkNotificationReadDto = z.infer<typeof MarkNotificationReadDto>;
export type CreateIntegrationDto = z.infer<typeof CreateIntegrationDto>;
export type UpdateIntegrationDto = z.infer<typeof UpdateIntegrationDto>;
export type IntegrationQueryDto = z.infer<typeof IntegrationQueryDto>;
export type AuditLogQueryDto = z.infer<typeof AuditLogQueryDto>;
