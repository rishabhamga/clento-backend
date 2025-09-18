-- Ensure users table has external_id column and correct structure
-- This migration is idempotent and safe to run multiple times

-- Add external_id column to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND table_schema = 'public' 
        AND column_name = 'external_id'
    ) THEN
        ALTER TABLE public.users ADD COLUMN external_id text UNIQUE;
        COMMENT ON COLUMN public.users.external_id IS 'Clerk user ID for external integration';
    END IF;
END $$;

-- Create index for external_id lookup if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_users_external_id ON public.users(external_id);

-- Verify the column exists and is the correct type
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND table_schema = 'public' 
        AND column_name = 'external_id'
        AND data_type = 'text'
    ) THEN
        RAISE NOTICE 'Users table external_id column verified as text type';
    ELSE
        RAISE EXCEPTION 'Users table external_id column is missing or has wrong type';
    END IF;
END $$;

-- Add NOT NULL constraint if the column is empty (fresh install)
DO $$
BEGIN
    IF (SELECT COUNT(*) FROM public.users) = 0 THEN
        ALTER TABLE public.users ALTER COLUMN external_id SET NOT NULL;
        RAISE NOTICE 'Set external_id as NOT NULL since table is empty';
    ELSE
        RAISE NOTICE 'Table has data, skipping NOT NULL constraint on external_id';
    END IF;
END $$;
