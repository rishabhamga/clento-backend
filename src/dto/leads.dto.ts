import { z } from 'zod';

// ============================================================================
// LEAD LIST REQUEST/RESPONSE STRUCTURES
// ============================================================================

/**
 * Create Lead List Request DTO
 * Used for creating new lead lists via API
 */
// ============================================================================
// CSV UPLOAD & PROCESSING STRUCTURES
// ============================================================================

/**
 * CSV Upload Request DTO
 * Used for uploading CSV files via multipart form data
 */
export const UploadCsvDto = z.object({
    name: z.string()
        .min(1, 'Lead list name is required')
        .max(255, 'Lead list name must be less than 255 characters'),
    description: z.string()
        .max(1000, 'Description must be less than 1000 characters')
        .optional(),
    connected_account_id: z.string()
        .uuid('Connected account ID must be a valid UUID'),
    csv_file: z.any(), // File will be handled by multer middleware
});

/**
 * CSV Preview Request DTO
 * Used for previewing CSV data before import
 */
export const PreviewCsvDto = z.object({
    csv_data: z.string()
        .min(1, 'CSV data is required')
        .max(10 * 1024 * 1024, 'CSV data size cannot exceed 10MB'), // 10MB limit
    mapping: z.record(z.string())
        .optional()
        .describe('Field mapping configuration'),
});

/**
 * CSV Import Request DTO
 * Used for importing leads from CSV data
 */
export const ImportLeadsDto = z.object({
    lead_list_id: z.string()
        .uuid('Lead list ID must be a valid UUID'),
    csv_data: z.string()
        .min(1, 'CSV data is required')
        .max(10 * 1024 * 1024, 'CSV data size cannot exceed 10MB'),
    mapping: z.record(z.string())
        .optional()
        .describe('Field mapping configuration'),
    skip_duplicates: z.boolean()
        .default(true)
        .describe('Whether to skip duplicate leads'),
    update_existing: z.boolean()
        .default(false)
        .describe('Whether to update existing leads'),
});

/**
 * Publish Lead List Request DTO
 * Used for publishing a lead list from CSV data
 */
export const PublishLeadListDto = z.object({
    name: z.string()
        .min(1, 'Lead list name is required')
        .max(255, 'Lead list name must be less than 255 characters'),
    description: z.string()
        .max(1000, 'Description must be less than 1000 characters')
        .optional(),
    connected_account_id: z.string()
        .uuid('Connected account ID must be a valid UUID'),
    csv_data: z.string()
        .min(1, 'CSV data is required')
        .max(10 * 1024 * 1024, 'CSV data size cannot exceed 10MB'),
    mapping: z.record(z.string())
        .optional()
        .describe('Field mapping configuration'),
});

// Lead Search DTO
export const SearchLeadsDto = z.object({
    keywords: z.string().optional(),
    company: z.string().optional(),
    industry: z.array(z.string()).optional(),
    location: z.array(z.string()).optional(),
    seniority_level: z.array(z.string()).optional(),
    company_size: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    years_experience_min: z.number().min(0).optional(),
    years_experience_max: z.number().max(100).optional(),
    limit: z.number().min(1).max(1000).default(100),
});

// Lead Notes DTO
export const AddLeadNoteDto = z.object({
    content: z.string().min(1, 'Note content is required').max(2000),
});

// Lead Tags DTO
export const UpdateLeadTagsDto = z.object({
    tags: z.array(z.string()),
    action: z.enum(['replace', 'add', 'remove']).default('replace'),
});

// Bulk Operations DTO
export const BulkUpdateLeadsDto = z.object({
    lead_ids: z.array(z.string().uuid()).min(1, 'At least one lead ID is required'),
    updates: z.object({
        status: z.enum(['new', 'contacted', 'replied', 'connected', 'not_interested', 'bounced']).optional(),
        tags: z.array(z.string()).optional(),
        notes: z.string().max(2000).optional(),
    }),
    action: z.enum(['replace', 'add', 'remove']).default('replace'),
});

// ============================================================================
// RESPONSE STRUCTURES
// ============================================================================


export const LeadListQueryDto = z.object({
    page: z.coerce.number()
        .min(1, 'Page must be at least 1')
        .default(1),
    limit: z.coerce.number()
        .min(1, 'Limit must be at least 1')
        .max(100, 'Limit cannot exceed 100')
        .default(20),
    search: z.string()
        .max(255, 'Search term must be less than 255 characters')
        .optional(),
    source: z.string()
        .max(50, 'Source must be less than 50 characters')
        .optional(),
    status: z.enum(['draft', 'processing', 'completed', 'failed', 'archived'])
        .optional(),
    tags: z.string()
        .max(500, 'Tags string must be less than 500 characters')
        .optional(), // Comma-separated tags
    creator_id: z.string()
        .uuid('Creator ID must be a valid UUID')
        .optional(),
    organization_id: z.string()
        .uuid('Organization ID must be a valid UUID')
        .optional(),
});

/**
 * Lead List Response DTO
 * Used for returning lead list data in API responses
 * Matches the comprehensive database schema with all necessary fields
 */


export const LeadListResponseDto = z.object({
    id: z.string().uuid(),
    organization_id: z.string().uuid().nullable(),
    creator_id: z.string().uuid().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    source: z.string().max(50),
    status: z.enum(['draft', 'processing', 'completed', 'failed', 'archived']),
    total_leads: z.number().int().min(0).nullable(),
    processed_leads: z.number().int().min(0).nullable(),
    failed_leads: z.number().int().min(0).nullable(),
    original_filename: z.string().nullable(),
    csv_file_url: z.string().nullable(),
    sample_csv_url: z.string().nullable(),
    file_size: z.bigint().nullable(),
    processing_started_at: z.string().datetime().nullable(),
    processing_completed_at: z.string().datetime().nullable(),
    error_message: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
    filters: z.record(z.any()).nullable(),
    metadata: z.record(z.any()).nullable(),
    stats: z.record(z.any()).nullable(),
    created_at: z.string().datetime().nullable(),
    updated_at: z.string().datetime().nullable(),
});

/**
 * CSV Preview Response DTO
 * Used for returning CSV preview data
 */
export const CsvPreviewResponseDto = z.object({
    preview: z.object({
        headers: z.array(z.string()),
        data: z.array(z.record(z.any())),
        totalRows: z.number().int().min(0),
        showingRows: z.number().int().min(0),
    }),
    validation: z.object({
        isValid: z.boolean(),
        hasLinkedInColumn: z.boolean(),
        linkedInColumnName: z.string().optional(),
        emailColumns: z.array(z.string()),
        phoneColumns: z.array(z.string()),
        errors: z.array(z.string()),
        warnings: z.array(z.string()),
    }),
    mapping: z.record(z.string()),
});

/**
 * Publish Lead List Response DTO
 * Used for returning publish operation results
 */
export const PublishLeadListResponseDto = z.object({
    leadList: LeadListResponseDto,
    importResult: z.object({
        totalRows: z.number().int().min(0),
        importedLeads: z.number().int().min(0),
        skippedLeads: z.number().int().min(0),
        failedLeads: z.number().int().min(0),
        errors: z.array(z.string()),
    }),
    fileUrl: z.string().optional(), // Make optional since we might not have GCS configured yet
});

/**
 * DTO for lead response (matches database Row type)
 */
export const LeadResponseDto = z.object({
  id: z.string().uuid(),
  lead_list_id: z.string().uuid().nullable(),
  full_name: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  linkedin_id: z.string().nullable(),
  status: z.string().nullable(),
  source: z.string(),
  enrichment_data: z.record(z.any()),
  created_at: z.string().datetime().nullable(),
  updated_at: z.string().datetime().nullable(),
});

/**
 * DTO for lead insert (matches database Insert type)
 */
export const LeadInsertDto = z.object({
  id: z.string().uuid().optional(),
  lead_list_id: z.string().uuid().nullable().optional(),
  full_name: z.string(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  linkedin_id: z.string().nullable().optional(),
  status: z.string().max(50).default('new').optional(),
  source: z.string().max(50),
  enrichment_data: z.record(z.any()).default({}).optional(),
  created_at: z.string().datetime().nullable().optional(),
  updated_at: z.string().datetime().nullable().optional(),
});

/**
 * DTO for lead update (matches database Update type)
 */
export const LeadUpdateDto = z.object({
  id: z.string().uuid().optional(),
  lead_list_id: z.string().uuid().nullable().optional(),
  full_name: z.string().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  linkedin_id: z.string().nullable().optional(),
  status: z.string().max(50).optional(),
  source: z.string().max(50).optional(),
  enrichment_data: z.record(z.any()).optional(),
  created_at: z.string().datetime().nullable().optional(),
  updated_at: z.string().datetime().nullable().optional(),
});

/**
 * DTO for lead list insert (matches database Insert type)
 */
export const LeadListInsertDto = z.object({
    id: z.string().uuid().optional(),
    organization_id: z.string().uuid().nullable().optional(),
    creator_id: z.string().uuid().nullable().optional(),
    name: z.string(),
    description: z.string().nullable().optional(),
    source: z.string().max(50),
    status: z.enum(['draft', 'processing', 'completed', 'failed', 'archived']).optional(),
    total_leads: z.number().int().min(0).nullable().optional(),
    processed_leads: z.number().int().min(0).nullable().optional(),
    failed_leads: z.number().int().min(0).nullable().optional(),
    original_filename: z.string().nullable().optional(),
    csv_file_url: z.string().nullable().optional(),
    sample_csv_url: z.string().nullable().optional(),
    file_size: z.bigint().nullable().optional(),
    processing_started_at: z.string().datetime().nullable().optional(),
    processing_completed_at: z.string().datetime().nullable().optional(),
    error_message: z.string().nullable().optional(),
    tags: z.array(z.string()).nullable().optional(),
    filters: z.record(z.any()).nullable().optional(),
    metadata: z.record(z.any()).nullable().optional(),
    stats: z.record(z.any()).nullable().optional(),
    created_at: z.string().datetime().nullable().optional(),
    updated_at: z.string().datetime().nullable().optional(),
});

/**
 * DTO for lead list update (matches database Update type)
 */
export const LeadListUpdateDto = z.object({
    id: z.string().uuid().optional(),
    organization_id: z.string().uuid().nullable().optional(),
    creator_id: z.string().uuid().nullable().optional(),
    name: z.string().optional(),
    description: z.string().nullable().optional(),
    source: z.string().max(50).optional(),
    status: z.enum(['draft', 'processing', 'completed', 'failed', 'archived']).optional(),
    total_leads: z.number().int().min(0).nullable().optional(),
    processed_leads: z.number().int().min(0).nullable().optional(),
    failed_leads: z.number().int().min(0).nullable().optional(),
    original_filename: z.string().nullable().optional(),
    csv_file_url: z.string().nullable().optional(),
    sample_csv_url: z.string().nullable().optional(),
    file_size: z.number().nullable().optional(),
    processing_started_at: z.string().datetime().nullable().optional(),
    processing_completed_at: z.string().datetime().nullable().optional(),
    error_message: z.string().nullable().optional(),
    tags: z.array(z.string()).nullable().optional(),
    filters: z.record(z.any()).nullable().optional(),
    metadata: z.record(z.any()).nullable().optional(),
    stats: z.record(z.any()).nullable().optional(),
    created_at: z.string().datetime().nullable().optional(),
    updated_at: z.string().datetime().nullable().optional(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Request DTOs
export type UploadCsvDto = z.infer<typeof UploadCsvDto>;
export type PreviewCsvDto = z.infer<typeof PreviewCsvDto>;
export type ImportLeadsDto = z.infer<typeof ImportLeadsDto>;
export type PublishLeadListDto = z.infer<typeof PublishLeadListDto>;
export type SearchLeadsDto = z.infer<typeof SearchLeadsDto>;
export type AddLeadNoteDto = z.infer<typeof AddLeadNoteDto>;
export type UpdateLeadTagsDto = z.infer<typeof UpdateLeadTagsDto>;
export type BulkUpdateLeadsDto = z.infer<typeof BulkUpdateLeadsDto>;
export type LeadListQueryDto = z.infer<typeof LeadListQueryDto>;

// Response DTOs
export type LeadListResponseDto = z.infer<typeof LeadListResponseDto>;
export type CsvPreviewResponseDto = z.infer<typeof CsvPreviewResponseDto>;
export type PublishLeadListResponseDto = z.infer<typeof PublishLeadListResponseDto>;
export type LeadResponseDto = z.infer<typeof LeadResponseDto>;
export type LeadInsertDto = z.infer<typeof LeadInsertDto>;
export type LeadUpdateDto = z.infer<typeof LeadUpdateDto>;
export type LeadListInsertDto = z.infer<typeof LeadListInsertDto>;
export type LeadListUpdateDto = z.infer<typeof LeadListUpdateDto>;
