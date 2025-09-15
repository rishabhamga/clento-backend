import { z } from 'zod';

// Dashboard Analytics DTOs
export const DashboardStatsDto = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  organization_id: z.string().uuid().optional(),
});

export const RecentActivityDto = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  activity_types: z.array(z.enum(['profile_visit', 'connection_request', 'message_sent', 'email_sent', 'like_post', 'comment_post'])).optional(),
  date_from: z.string().date().optional(),
});

// Campaign Analytics DTOs
export const CampaignPerformanceDto = z.object({
  campaign_ids: z.array(z.string().uuid()).optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  period: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  metrics: z.array(z.enum([
    'sent', 'delivered', 'opened', 'clicked', 'replied', 
    'connected', 'bounced', 'success_rate', 'response_rate'
  ])).optional(),
});

export const CampaignComparisonDto = z.object({
  campaign_ids: z.array(z.string().uuid()).min(2, 'At least 2 campaigns required for comparison'),
  metrics: z.array(z.enum([
    'sent', 'delivered', 'opened', 'clicked', 'replied', 
    'connected', 'bounced', 'success_rate', 'response_rate'
  ])).optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
});

// Lead Analytics DTOs
export const LeadConversionDto = z.object({
  lead_list_ids: z.array(z.string().uuid()).optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  period: z.enum(['day', 'week', 'month']).default('day'),
  conversion_stages: z.array(z.enum(['contacted', 'replied', 'connected', 'not_interested'])).optional(),
});

export const LeadSourceAnalyticsDto = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  sources: z.array(z.enum(['csv_import', 'filter_search', 'api', 'manual'])).optional(),
});

// Account Analytics DTOs
export const AccountUsageAnalyticsDto = z.object({
  account_ids: z.array(z.string().uuid()).optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  period: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  metrics: z.array(z.enum(['actions_sent', 'daily_limit_reached', 'errors', 'success_rate'])).optional(),
});

export const AccountPerformanceDto = z.object({
  account_ids: z.array(z.string().uuid()).optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  compare_accounts: z.boolean().default(false),
});

// Activity Analytics DTOs
export const ActivityAnalyticsDto = z.object({
  activity_types: z.array(z.enum(['profile_visit', 'connection_request', 'message_sent', 'email_sent', 'like_post', 'comment_post'])).optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  period: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  campaign_ids: z.array(z.string().uuid()).optional(),
  account_ids: z.array(z.string().uuid()).optional(),
});

export const ActivityHeatmapDto = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  timezone: z.string().default('UTC'),
  activity_types: z.array(z.enum(['profile_visit', 'connection_request', 'message_sent', 'email_sent', 'like_post', 'comment_post'])).optional(),
});

// ROI Analytics DTOs
export const ROIAnalyticsDto = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  campaign_ids: z.array(z.string().uuid()).optional(),
  include_costs: z.boolean().default(false),
  currency: z.string().length(3).default('USD'), // ISO currency code
});

// Funnel Analytics DTOs
export const ConversionFunnelDto = z.object({
  campaign_ids: z.array(z.string().uuid()).optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  stages: z.array(z.enum(['sent', 'delivered', 'opened', 'clicked', 'replied', 'connected'])).default([
    'sent', 'delivered', 'replied', 'connected'
  ]),
});

// Export Analytics DTOs
export const ExportAnalyticsDto = z.object({
  type: z.enum(['campaigns', 'leads', 'activities', 'accounts']),
  format: z.enum(['csv', 'xlsx', 'json']).default('csv'),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  filters: z.record(z.any()).optional(),
  include_raw_data: z.boolean().default(false),
});

// Custom Report DTOs
export const CustomReportDto = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  type: z.enum(['campaign', 'lead', 'account', 'activity', 'custom']),
  config: z.object({
    metrics: z.array(z.string()).min(1),
    dimensions: z.array(z.string()).optional(),
    filters: z.record(z.any()).optional(),
    date_range: z.object({
      type: z.enum(['fixed', 'relative']),
      from: z.string().date().optional(),
      to: z.string().date().optional(),
      relative_period: z.enum(['last_7_days', 'last_30_days', 'last_90_days', 'this_month', 'last_month']).optional(),
    }),
    visualization: z.object({
      type: z.enum(['table', 'line_chart', 'bar_chart', 'pie_chart', 'funnel']),
      settings: z.record(z.any()).optional(),
    }),
  }),
  schedule: z.object({
    enabled: z.boolean().default(false),
    frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
    recipients: z.array(z.string().email()).optional(),
  }).optional(),
});

// Type exports
export type DashboardStatsDto = z.infer<typeof DashboardStatsDto>;
export type RecentActivityDto = z.infer<typeof RecentActivityDto>;
export type CampaignPerformanceDto = z.infer<typeof CampaignPerformanceDto>;
export type CampaignComparisonDto = z.infer<typeof CampaignComparisonDto>;
export type LeadConversionDto = z.infer<typeof LeadConversionDto>;
export type LeadSourceAnalyticsDto = z.infer<typeof LeadSourceAnalyticsDto>;
export type AccountUsageAnalyticsDto = z.infer<typeof AccountUsageAnalyticsDto>;
export type AccountPerformanceDto = z.infer<typeof AccountPerformanceDto>;
export type ActivityAnalyticsDto = z.infer<typeof ActivityAnalyticsDto>;
export type ActivityHeatmapDto = z.infer<typeof ActivityHeatmapDto>;
export type ROIAnalyticsDto = z.infer<typeof ROIAnalyticsDto>;
export type ConversionFunnelDto = z.infer<typeof ConversionFunnelDto>;
export type ExportAnalyticsDto = z.infer<typeof ExportAnalyticsDto>;
export type CustomReportDto = z.infer<typeof CustomReportDto>;
