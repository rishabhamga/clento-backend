import { z } from 'zod';

// Activity DTOs
export const CreateActivityDto = z.object({
  campaign_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  account_id: z.string().uuid().optional(),
  activity_type: z.enum(['profile_visit', 'connection_request', 'message_sent', 'email_sent', 'like_post', 'comment_post', 'manual']),
  step_number: z.number().min(0).optional(),
  message_content: z.string().max(5000).optional(),
  response_received: z.boolean().default(false),
  response_content: z.string().max(5000).optional(),
  success: z.boolean().default(true),
  status: z.enum(['pending', 'completed', 'failed', 'skipped']).default('completed'),
  error_message: z.string().max(1000).optional(),
  retry_count: z.number().min(0).default(0),
  metadata: z.record(z.any()).default({}),
});

export const UpdateActivityDto = z.object({
  response_received: z.boolean().optional(),
  response_content: z.string().max(5000).optional(),
  success: z.boolean().optional(),
  status: z.enum(['pending', 'completed', 'failed', 'skipped']).optional(),
  error_message: z.string().max(1000).optional(),
  retry_count: z.number().min(0).optional(),
  metadata: z.record(z.any()).optional(),
});

export const ActivityQueryDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  activity_type: z.enum(['profile_visit', 'connection_request', 'message_sent', 'email_sent', 'like_post', 'comment_post', 'manual']).optional(),
  status: z.enum(['pending', 'completed', 'failed', 'skipped']).optional(),
  success: z.coerce.boolean().optional(),
  campaign_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  account_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  has_response: z.coerce.boolean().optional(),
  search: z.string().optional(), // Search in message_content or response_content
});

// Bulk Activity Operations
export const BulkCreateActivitiesDto = z.object({
  activities: z.array(CreateActivityDto).min(1, 'At least one activity is required').max(100, 'Maximum 100 activities per batch'),
});

export const BulkUpdateActivitiesDto = z.object({
  activity_ids: z.array(z.string().uuid()).min(1, 'At least one activity ID is required'),
  updates: UpdateActivityDto,
});

// Activity Response DTO
export const AddActivityResponseDto = z.object({
  response_content: z.string().min(1, 'Response content is required').max(5000),
  response_type: z.enum(['positive', 'negative', 'neutral', 'interested', 'not_interested']).optional(),
  sentiment_score: z.number().min(-1).max(1).optional(), // -1 (negative) to 1 (positive)
  metadata: z.record(z.any()).default({}),
});

// Activity Statistics DTO
export const ActivityStatsDto = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  campaign_ids: z.array(z.string().uuid()).optional(),
  account_ids: z.array(z.string().uuid()).optional(),
  activity_types: z.array(z.enum(['profile_visit', 'connection_request', 'message_sent', 'email_sent', 'like_post', 'comment_post'])).optional(),
  group_by: z.enum(['day', 'week', 'month', 'campaign', 'account', 'activity_type']).default('day'),
});

// Activity Export DTO
export const ExportActivitiesDto = z.object({
  format: z.enum(['csv', 'xlsx', 'json']).default('csv'),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  filters: ActivityQueryDto.omit({ page: true, limit: true }).optional(),
  include_responses: z.boolean().default(true),
  include_metadata: z.boolean().default(false),
});

// Activity Timeline DTO
export const ActivityTimelineDto = z.object({
  lead_id: z.string().uuid().optional(),
  campaign_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

// Activity Performance DTO
export const ActivityPerformanceDto = z.object({
  activity_types: z.array(z.enum(['profile_visit', 'connection_request', 'message_sent', 'email_sent', 'like_post', 'comment_post'])).optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  campaign_ids: z.array(z.string().uuid()).optional(),
  account_ids: z.array(z.string().uuid()).optional(),
  metrics: z.array(z.enum(['success_rate', 'response_rate', 'average_response_time', 'total_count'])).optional(),
});

// Type exports
export type CreateActivityDto = z.infer<typeof CreateActivityDto>;
export type UpdateActivityDto = z.infer<typeof UpdateActivityDto>;
export type ActivityQueryDto = z.infer<typeof ActivityQueryDto>;
export type BulkCreateActivitiesDto = z.infer<typeof BulkCreateActivitiesDto>;
export type BulkUpdateActivitiesDto = z.infer<typeof BulkUpdateActivitiesDto>;
export type AddActivityResponseDto = z.infer<typeof AddActivityResponseDto>;
export type ActivityStatsDto = z.infer<typeof ActivityStatsDto>;
export type ExportActivitiesDto = z.infer<typeof ExportActivitiesDto>;
export type ActivityTimelineDto = z.infer<typeof ActivityTimelineDto>;
export type ActivityPerformanceDto = z.infer<typeof ActivityPerformanceDto>;
