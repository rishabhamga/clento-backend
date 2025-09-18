-- Migration: Set up RLS policies only (columns already exist)
-- Date: 2025-01-25
-- Description: Set up RLS policies for existing Clerk-integrated schema

-- Ensure auth schema functions are accessible
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT ALL ON auth.users TO authenticated;

-- Create indexes for performance (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_external_id ON public.users(external_id);
CREATE INDEX IF NOT EXISTS idx_organizations_created_by_auth_id ON public.organizations(created_by_auth_id);
CREATE INDEX IF NOT EXISTS idx_organizations_external_id ON public.organizations(external_id);

-- Enable RLS on all tables (organization-based access)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;

-- Users table policies (self-access)
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING (
    auth_user_id = auth.uid() OR 
    external_id = auth.jwt()->>'sub'
  );

CREATE POLICY "Users can update their own profile" ON public.users  
  FOR UPDATE USING (
    auth_user_id = auth.uid() OR 
    external_id = auth.jwt()->>'sub'
  );

CREATE POLICY "Users can insert their own profile" ON public.users
  FOR INSERT WITH CHECK (
    auth_user_id = auth.uid() OR 
    external_id = auth.jwt()->>'sub'
  );

-- Organizations policies (organization members can view)
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
CREATE POLICY "Users can view their organizations" ON public.organizations
  FOR SELECT USING (
    id IN (
      SELECT om.organization_id 
      FROM public.organization_members om
      JOIN public.users u ON om.user_id = u.id
      WHERE u.auth_user_id = auth.uid() OR u.external_id = auth.jwt()->>'sub'
    )
  );

DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
CREATE POLICY "Users can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (created_by_auth_id = auth.uid());

-- Organization members policies
DROP POLICY IF EXISTS "Users can view org memberships" ON public.organization_members;
CREATE POLICY "Users can view org memberships" ON public.organization_members
  FOR SELECT USING (
    -- Can view their own membership
    user_id IN (
      SELECT id FROM public.users
      WHERE auth_user_id = auth.uid() OR external_id = auth.jwt()->>'sub'
    ) OR
    -- Can view other memberships in their organizations
    organization_id IN (
      SELECT om.organization_id 
      FROM public.organization_members om
      JOIN public.users u ON om.user_id = u.id
      WHERE u.auth_user_id = auth.uid() OR u.external_id = auth.jwt()->>'sub'
    )
  );

-- Lead Lists policies (organization-based access)
DROP POLICY IF EXISTS "Users can view org lead lists" ON public.lead_lists;
CREATE POLICY "Users can view org lead lists" ON public.lead_lists
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id 
      FROM public.organization_members om
      JOIN public.users u ON om.user_id = u.id
      WHERE u.auth_user_id = auth.uid() OR u.external_id = auth.jwt()->>'sub'
    )
  );

-- Leads policies (organization-based via lead_lists)
DROP POLICY IF EXISTS "Users can view org leads" ON public.leads;
CREATE POLICY "Users can view org leads" ON public.leads
  FOR SELECT USING (
    lead_list_id IN (
      SELECT ll.id 
      FROM public.lead_lists ll
      JOIN public.organization_members om ON ll.organization_id = om.organization_id
      JOIN public.users u ON om.user_id = u.id
      WHERE u.auth_user_id = auth.uid() OR u.external_id = auth.jwt()->>'sub'
    )
  );

-- Campaigns policies (organization-based)
DROP POLICY IF EXISTS "Users can view org campaigns" ON public.campaigns;
CREATE POLICY "Users can view org campaigns" ON public.campaigns
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id 
      FROM public.organization_members om
      JOIN public.users u ON om.user_id = u.id
      WHERE u.auth_user_id = auth.uid() OR u.external_id = auth.jwt()->>'sub'
    )
  );

-- Connected Accounts policies (organization-based)
DROP POLICY IF EXISTS "Users can view org connected accounts" ON public.connected_accounts;
CREATE POLICY "Users can view org connected accounts" ON public.connected_accounts
  FOR SELECT USING (
    -- Own accounts
    user_id IN (
      SELECT id FROM public.users
      WHERE auth_user_id = auth.uid() OR external_id = auth.jwt()->>'sub'
    ) OR
    -- Organization accounts
    organization_id IN (
      SELECT om.organization_id 
      FROM public.organization_members om
      JOIN public.users u ON om.user_id = u.id
      WHERE u.auth_user_id = auth.uid() OR u.external_id = auth.jwt()->>'sub'
    )
  );

-- Create function to sync user data from Clerk to auth.users
CREATE OR REPLACE FUNCTION public.handle_clerk_user_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update auth.users when public.users is modified
  INSERT INTO auth.users (
    id,
    email,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data,
    raw_app_meta_data
  )
  VALUES (
    COALESCE(NEW.auth_user_id, NEW.external_id::uuid),
    NEW.email,
    NOW(),
    NOW(),
    NOW(),
    jsonb_build_object(
      'full_name', NEW.full_name,
      'avatar_url', NEW.avatar_url,
      'external_id', NEW.external_id
    ),
    jsonb_build_object('provider', 'clerk')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = NEW.email,
    updated_at = NOW(),
    raw_user_meta_data = jsonb_build_object(
      'full_name', NEW.full_name,
      'avatar_url', NEW.avatar_url,
      'external_id', NEW.external_id
    );

  -- Update auth_user_id if it wasn't set
  IF NEW.auth_user_id IS NULL THEN
    UPDATE public.users 
    SET auth_user_id = NEW.external_id::uuid 
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auth.users sync
DROP TRIGGER IF EXISTS trigger_clerk_user_sync ON public.users;
CREATE TRIGGER trigger_clerk_user_sync
  AFTER INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_clerk_user_sync();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON auth.users TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO service_role;

-- Create helpful view for debugging RLS
CREATE OR REPLACE VIEW public.user_organization_access AS
SELECT 
  u.id as user_id,
  u.external_id,
  u.auth_user_id,
  u.email,
  om.organization_id,
  o.name as organization_name,
  om.role
FROM public.users u
JOIN public.organization_members om ON u.id = om.user_id
JOIN public.organizations o ON om.organization_id = o.id
WHERE u.auth_user_id IS NOT NULL;

COMMENT ON VIEW public.user_organization_access IS 'Debug view to see user-organization relationships for RLS policies';
