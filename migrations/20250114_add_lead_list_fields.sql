-- Migration: Add comprehensive fields to lead_lists table
-- Date: 2025-01-14
-- Description: Add fields needed for UI display, processing status, file management, and analytics

-- Add new columns to lead_lists table
ALTER TABLE public.lead_lists 
ADD COLUMN IF NOT EXISTS status character varying DEFAULT 'draft'::character varying,
ADD COLUMN IF NOT EXISTS processed_leads integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS failed_leads integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS original_filename text,
ADD COLUMN IF NOT EXISTS csv_file_url text,
ADD COLUMN IF NOT EXISTS sample_csv_url text,
ADD COLUMN IF NOT EXISTS file_size bigint,
ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS processing_completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS filters jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS stats jsonb DEFAULT '{}';

-- Add constraints for status field
ALTER TABLE public.lead_lists 
ADD CONSTRAINT lead_lists_status_check 
CHECK (status IN ('draft', 'processing', 'completed', 'failed', 'archived'));

-- Add constraints for numeric fields
ALTER TABLE public.lead_lists 
ADD CONSTRAINT lead_lists_processed_leads_check 
CHECK (processed_leads >= 0);

ALTER TABLE public.lead_lists 
ADD CONSTRAINT lead_lists_failed_leads_check 
CHECK (failed_leads >= 0);

ALTER TABLE public.lead_lists 
ADD CONSTRAINT lead_lists_total_leads_check 
CHECK (total_leads >= 0);

ALTER TABLE public.lead_lists 
ADD CONSTRAINT lead_lists_file_size_check 
CHECK (file_size >= 0);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_lead_lists_status ON public.lead_lists(status);
CREATE INDEX IF NOT EXISTS idx_lead_lists_organization_id_status ON public.lead_lists(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_lists_creator_id ON public.lead_lists(creator_id);
CREATE INDEX IF NOT EXISTS idx_lead_lists_source ON public.lead_lists(source);
CREATE INDEX IF NOT EXISTS idx_lead_lists_created_at ON public.lead_lists(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_lists_processing_started_at ON public.lead_lists(processing_started_at);

-- Add GIN index for JSONB fields for better query performance
CREATE INDEX IF NOT EXISTS idx_lead_lists_tags_gin ON public.lead_lists USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_lead_lists_filters_gin ON public.lead_lists USING GIN(filters);
CREATE INDEX IF NOT EXISTS idx_lead_lists_metadata_gin ON public.lead_lists USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_lead_lists_stats_gin ON public.lead_lists USING GIN(stats);

-- Add comments for documentation
COMMENT ON COLUMN public.lead_lists.status IS 'Current status of the lead list: draft, processing, completed, failed, archived';
COMMENT ON COLUMN public.lead_lists.processed_leads IS 'Number of leads successfully processed/imported';
COMMENT ON COLUMN public.lead_lists.failed_leads IS 'Number of leads that failed to import';
COMMENT ON COLUMN public.lead_lists.original_filename IS 'Original filename of the uploaded CSV file';
COMMENT ON COLUMN public.lead_lists.csv_file_url IS 'URL to the uploaded CSV file in cloud storage';
COMMENT ON COLUMN public.lead_lists.sample_csv_url IS 'URL to the sample CSV file for download';
COMMENT ON COLUMN public.lead_lists.file_size IS 'Size of the uploaded CSV file in bytes';
COMMENT ON COLUMN public.lead_lists.processing_started_at IS 'Timestamp when processing of the lead list started';
COMMENT ON COLUMN public.lead_lists.processing_completed_at IS 'Timestamp when processing of the lead list completed';
COMMENT ON COLUMN public.lead_lists.error_message IS 'Error message if processing failed';
COMMENT ON COLUMN public.lead_lists.tags IS 'Array of tags for categorizing lead lists';
COMMENT ON COLUMN public.lead_lists.filters IS 'JSON object containing filter criteria used to create the list';
COMMENT ON COLUMN public.lead_lists.metadata IS 'Additional metadata about the lead list';
COMMENT ON COLUMN public.lead_lists.stats IS 'Statistics and analytics data for the lead list';

-- Update existing records to have proper default values
UPDATE public.lead_lists 
SET 
  status = 'completed',
  processed_leads = total_leads,
  failed_leads = 0,
  processing_completed_at = created_at
WHERE status IS NULL;

-- Create a function to automatically update processing timestamps
CREATE OR REPLACE FUNCTION update_lead_list_processing_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- Set processing_started_at when status changes to 'processing'
  IF NEW.status = 'processing' AND (OLD.status IS NULL OR OLD.status != 'processing') THEN
    NEW.processing_started_at = NOW();
  END IF;
  
  -- Set processing_completed_at when status changes to 'completed' or 'failed'
  IF NEW.status IN ('completed', 'failed') AND (OLD.status IS NULL OR OLD.status NOT IN ('completed', 'failed')) THEN
    NEW.processing_completed_at = NOW();
  END IF;
  
  -- Update total_leads to be the sum of processed and failed leads
  IF NEW.processed_leads IS NOT NULL AND NEW.failed_leads IS NOT NULL THEN
    NEW.total_leads = NEW.processed_leads + NEW.failed_leads;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update timestamps
DROP TRIGGER IF EXISTS trigger_update_lead_list_processing_timestamps ON public.lead_lists;
CREATE TRIGGER trigger_update_lead_list_processing_timestamps
  BEFORE UPDATE ON public.lead_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_list_processing_timestamps();

-- Create a view for lead list analytics
CREATE OR REPLACE VIEW public.lead_list_analytics AS
SELECT 
  ll.id,
  ll.organization_id,
  ll.creator_id,
  ll.name,
  ll.description,
  ll.source,
  ll.status,
  ll.total_leads,
  ll.processed_leads,
  ll.failed_leads,
  ll.tags,
  ll.created_at,
  ll.updated_at,
  ll.processing_started_at,
  ll.processing_completed_at,
  -- Calculate processing duration
  CASE 
    WHEN ll.processing_started_at IS NOT NULL AND ll.processing_completed_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (ll.processing_completed_at - ll.processing_started_at))
    ELSE NULL
  END as processing_duration_seconds,
  -- Calculate success rate
  CASE 
    WHEN ll.total_leads > 0 
    THEN ROUND((ll.processed_leads::decimal / ll.total_leads::decimal) * 100, 2)
    ELSE 0
  END as success_rate_percentage,
  -- File size in MB
  CASE 
    WHEN ll.file_size IS NOT NULL 
    THEN ROUND(ll.file_size::decimal / 1024 / 1024, 2)
    ELSE NULL
  END as file_size_mb
FROM public.lead_lists ll;

-- Grant necessary permissions (without RLS policies)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_lists TO authenticated;
GRANT SELECT ON public.lead_list_analytics TO authenticated;
