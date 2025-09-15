-- Rollback Migration: Remove comprehensive fields from lead_lists table
-- Date: 2025-01-14
-- Description: Rollback the changes made in 20250114_add_lead_list_fields.sql

-- Drop the analytics view
DROP VIEW IF EXISTS public.lead_list_analytics;

-- Drop the trigger and function
DROP TRIGGER IF EXISTS trigger_update_lead_list_processing_timestamps ON public.lead_lists;
DROP FUNCTION IF EXISTS update_lead_list_processing_timestamps();

-- Note: RLS policies were not added in the main migration, so no cleanup needed

-- Drop indexes
DROP INDEX IF EXISTS idx_lead_lists_status;
DROP INDEX IF EXISTS idx_lead_lists_organization_id_status;
DROP INDEX IF EXISTS idx_lead_lists_creator_id;
DROP INDEX IF EXISTS idx_lead_lists_source;
DROP INDEX IF EXISTS idx_lead_lists_created_at;
DROP INDEX IF EXISTS idx_lead_lists_processing_started_at;
DROP INDEX IF EXISTS idx_lead_lists_tags_gin;
DROP INDEX IF EXISTS idx_lead_lists_filters_gin;
DROP INDEX IF EXISTS idx_lead_lists_metadata_gin;
DROP INDEX IF EXISTS idx_lead_lists_stats_gin;

-- Drop constraints
ALTER TABLE public.lead_lists DROP CONSTRAINT IF EXISTS lead_lists_status_check;
ALTER TABLE public.lead_lists DROP CONSTRAINT IF EXISTS lead_lists_processed_leads_check;
ALTER TABLE public.lead_lists DROP CONSTRAINT IF EXISTS lead_lists_failed_leads_check;
ALTER TABLE public.lead_lists DROP CONSTRAINT IF EXISTS lead_lists_total_leads_check;
ALTER TABLE public.lead_lists DROP CONSTRAINT IF EXISTS lead_lists_file_size_check;

-- Remove columns
ALTER TABLE public.lead_lists 
DROP COLUMN IF EXISTS status,
DROP COLUMN IF EXISTS processed_leads,
DROP COLUMN IF EXISTS failed_leads,
DROP COLUMN IF EXISTS original_filename,
DROP COLUMN IF EXISTS csv_file_url,
DROP COLUMN IF EXISTS sample_csv_url,
DROP COLUMN IF EXISTS file_size,
DROP COLUMN IF EXISTS processing_started_at,
DROP COLUMN IF EXISTS processing_completed_at,
DROP COLUMN IF EXISTS error_message,
DROP COLUMN IF EXISTS tags,
DROP COLUMN IF EXISTS filters,
DROP COLUMN IF EXISTS metadata,
DROP COLUMN IF EXISTS stats;
