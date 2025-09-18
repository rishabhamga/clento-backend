-- Add missing Clerk integration columns to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS external_id text UNIQUE;

-- Create index for external_id lookup
CREATE INDEX IF NOT EXISTS idx_organizations_external_id ON public.organizations(external_id);

-- Update existing organizations to have external_id (if any exist)
-- This is safe because we're starting fresh
UPDATE public.organizations SET external_id = id::text WHERE external_id IS NULL;

COMMENT ON COLUMN public.organizations.external_id IS 'Clerk organization ID for external integration';
