import { z } from 'zod';

// Workflow Step Schema
const WorkflowStepSchema = z.object({
  id: z.string(),
  type: z.enum(['profile_visit', 'connection_request', 'message_sent', 'email_sent', 'like_post', 'comment_post', 'wait']),
  name: z.string(),
  delay: z.number().min(0).optional(), // Delay in minutes
  config: z.record(z.any()).default({}),
  conditions: z.record(z.any()).default({}),
  error_handling: z.enum(['skip', 'retry', 'stop']).default('skip'),
});

// Campaign DTOs
export const CreateCampaignDto = z.object({
  organization_id: z.string().uuid().nullable().optional(),
  creator_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1, 'Campaign name is required'),
  description: z.string().nullable().optional(),
  status: z.string().max(50).default('draft'),
  lead_list_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  workflow_id: z.string().nullable().optional(),
  workflow_definition: z.record(z.any()),
  schedule: z.record(z.any()),
  stats: z.record(z.any()).default({}),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
});

export const UpdateCampaignDto = z.object({
  organization_id: z.string().uuid().nullable().optional(),
  creator_id: z.string().uuid().nullable().optional(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  status: z.string().max(50).optional(),
  lead_list_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  workflow_id: z.string().nullable().optional(),
  workflow_definition: z.record(z.any()).optional(),
  schedule: z.record(z.any()).optional(),
  stats: z.record(z.any()).optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
});

/**
 * DTO for campaign response (matches database Row type)
 */
export const CampaignResponseDto = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid().nullable(),
  creator_id: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.string().nullable(),
  lead_list_id: z.string().uuid().nullable(),
  account_id: z.string().uuid().nullable(),
  workflow_id: z.string().nullable(),
  workflow_definition: z.record(z.any()),
  schedule: z.record(z.any()),
  stats: z.record(z.any()),
  created_at: z.string().datetime().nullable(),
  updated_at: z.string().datetime().nullable(),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
});

export const CampaignQueryDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed', 'stopped']).optional(),
  type: z.enum(['linkedin', 'email', 'mixed']).optional(),
  account_id: z.string().uuid().optional(),
  lead_list_id: z.string().uuid().optional(),
  creator_id: z.string().uuid().optional(),
  tags: z.string().optional(), // Comma-separated tags
  created_from: z.string().date().optional(),
  created_to: z.string().date().optional(),
});

// Campaign Control DTOs
export const StartCampaignDto = z.object({
  start_immediately: z.boolean().default(false),
  scheduled_start: z.string().datetime().optional(),
});

export const PauseCampaignDto = z.object({
  reason: z.string().max(500).optional(),
});

export const ResumeCampaignDto = z.object({
  resume_immediately: z.boolean().default(true),
  scheduled_resume: z.string().datetime().optional(),
});

export const StopCampaignDto = z.object({
  reason: z.string().max(500).optional(),
  complete_current_executions: z.boolean().default(true),
});

// Campaign Analytics DTO
export const CampaignAnalyticsDto = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  period: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  metrics: z.array(z.enum(['sent', 'delivered', 'opened', 'clicked', 'replied', 'connected', 'bounced'])).optional(),
});

// Campaign Execution DTOs
export const CampaignExecutionQueryDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['pending', 'scheduled', 'in_progress', 'completed', 'failed', 'skipped']).optional(),
  lead_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
});

export const UpdateCampaignExecutionDto = z.object({
  status: z.enum(['pending', 'scheduled', 'in_progress', 'completed', 'failed', 'skipped']).optional(),
  current_step: z.number().min(0).optional(),
  error_message: z.string().max(1000).optional(),
  execution_data: z.record(z.any()).optional(),
  response_data: z.record(z.any()).optional(),
});

// Message Template DTOs
export const CreateMessageTemplateDto = z.object({
  name: z.string().min(1, 'Template name is required').max(255),
  type: z.enum(['connection_request', 'follow_up', 'email', 'inmail']),
  subject: z.string().max(255).optional(), // For email templates
  content: z.string().min(1, 'Template content is required').max(5000),
  variables: z.array(z.string()).default([]), // Available variables like firstName, company
  tags: z.array(z.string()).default([]),
});

export const UpdateMessageTemplateDto = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().max(255).optional(),
  content: z.string().min(1).max(5000).optional(),
  variables: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export const MessageTemplateQueryDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  type: z.enum(['connection_request', 'follow_up', 'email', 'inmail']).optional(),
  tags: z.string().optional(), // Comma-separated tags
});

// Workflow Template DTOs
export const CreateWorkflowTemplateDto = z.object({
  name: z.string().min(1, 'Workflow template name is required').max(255),
  description: z.string().max(1000).optional(),
  type: z.enum(['linkedin', 'email', 'mixed']),
  steps: z.array(WorkflowStepSchema).min(1, 'At least one step is required'),
  tags: z.array(z.string()).default([]),
  is_public: z.boolean().default(false),
});

export const UpdateWorkflowTemplateDto = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  steps: z.array(WorkflowStepSchema).min(1).optional(),
  tags: z.array(z.string()).optional(),
  is_public: z.boolean().optional(),
});

export const WorkflowTemplateQueryDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  type: z.enum(['linkedin', 'email', 'mixed']).optional(),
  is_public: z.coerce.boolean().optional(),
  tags: z.string().optional(), // Comma-separated tags
});

// Type exports
export type CreateCampaignDto = z.infer<typeof CreateCampaignDto>;
export type UpdateCampaignDto = z.infer<typeof UpdateCampaignDto>;
export type CampaignResponseDto = z.infer<typeof CampaignResponseDto>;
export type CampaignQueryDto = z.infer<typeof CampaignQueryDto>;
export type StartCampaignDto = z.infer<typeof StartCampaignDto>;
export type PauseCampaignDto = z.infer<typeof PauseCampaignDto>;
export type ResumeCampaignDto = z.infer<typeof ResumeCampaignDto>;
export type StopCampaignDto = z.infer<typeof StopCampaignDto>;
export type CampaignAnalyticsDto = z.infer<typeof CampaignAnalyticsDto>;
export type CampaignExecutionQueryDto = z.infer<typeof CampaignExecutionQueryDto>;
export type UpdateCampaignExecutionDto = z.infer<typeof UpdateCampaignExecutionDto>;
export type CreateMessageTemplateDto = z.infer<typeof CreateMessageTemplateDto>;
export type UpdateMessageTemplateDto = z.infer<typeof UpdateMessageTemplateDto>;
export type MessageTemplateQueryDto = z.infer<typeof MessageTemplateQueryDto>;
export type CreateWorkflowTemplateDto = z.infer<typeof CreateWorkflowTemplateDto>;
export type UpdateWorkflowTemplateDto = z.infer<typeof UpdateWorkflowTemplateDto>;
export type WorkflowTemplateQueryDto = z.infer<typeof WorkflowTemplateQueryDto>;
