# Database Migrations

This directory contains database migration files for the Clento application.

## Migration Files

### 20250114_add_lead_list_fields.sql
**Purpose**: Add comprehensive fields to the `lead_lists` table to support UI requirements and future logic.

**New Fields Added**:
- `status` - Current status of the lead list (draft, processing, completed, failed, archived)
- `processed_leads` - Number of leads successfully processed/imported
- `failed_leads` - Number of leads that failed to import
- `original_filename` - Original filename of the uploaded CSV file
- `csv_file_url` - URL to the uploaded CSV file in cloud storage
- `sample_csv_url` - URL to the sample CSV file for download
- `file_size` - Size of the uploaded CSV file in bytes
- `processing_started_at` - Timestamp when processing started
- `processing_completed_at` - Timestamp when processing completed
- `error_message` - Error message if processing failed
- `tags` - Array of tags for categorizing lead lists
- `filters` - JSON object containing filter criteria
- `metadata` - Additional metadata about the lead list
- `stats` - Statistics and analytics data

**Additional Features**:
- Database constraints and validation
- Performance indexes
- Automatic timestamp triggers
- Analytics view for reporting

## How to Apply Migrations

### Using Supabase CLI

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```

3. **Link your project**:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. **Apply the migration**:
   ```bash
   supabase db push
   ```

### Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `20250114_add_lead_list_fields.sql`
4. Execute the SQL

### Using psql (Direct Database Connection)

1. **Connect to your database**:
   ```bash
   psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
   ```

2. **Run the migration**:
   ```bash
   \i migrations/20250114_add_lead_list_fields.sql
   ```

## Rollback

If you need to rollback the changes, use the rollback migration:

```bash
# Using Supabase CLI
supabase db reset

# Or manually run the rollback file
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres" -f migrations/20250114_add_lead_list_fields_rollback.sql
```

## Verification

After applying the migration, verify that the changes were applied correctly:

```sql
-- Check if new columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'lead_lists'
ORDER BY ordinal_position;

-- Check if indexes were created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'lead_lists';

-- Check if constraints were added
SELECT conname, contype, consrc
FROM pg_constraint
WHERE conrelid = 'lead_lists'::regclass;
```

## Notes

- The migration does not include Row Level Security (RLS) policies
- The migration automatically updates existing records with default values
- All new fields have appropriate default values and constraints
- The migration is idempotent (can be run multiple times safely)

## Impact on Application

After applying this migration:

1. **Backend**: Update your DTOs and interfaces to match the new schema
2. **Frontend**: Update your TypeScript types and API calls
3. **UI**: You can now display processing status, file information, and analytics
4. **Analytics**: Use the `lead_list_analytics` view for reporting

## Troubleshooting

### Common Issues

1. **Permission Errors**: Make sure your database user has sufficient privileges
2. **Constraint Violations**: Check if existing data violates new constraints
3. **Index Creation Fails**: Ensure there's enough disk space and no conflicting indexes

### Getting Help

If you encounter issues:
1. Check the Supabase logs in your project dashboard
2. Verify your database connection and credentials
3. Ensure you have the latest version of the Supabase CLI
4. Check the migration file for any syntax errors
