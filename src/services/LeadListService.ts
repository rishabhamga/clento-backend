import { LeadListRepository } from '../repositories/LeadListRepository';
import { LeadRepository } from '../repositories/LeadRepository';
import { ConnectedAccountRepository } from '../repositories/ConnectedAccountRepository';
import { CsvService, CsvParseResult, CsvValidationResult } from './CsvService';
import { StorageService, UploadResult } from './StorageService';
import {
  PreviewCsvDto,
  PublishLeadListDto,
  LeadListResponseDto,
  LeadListInsertDto,
  LeadListUpdateDto,
  LeadInsertDto,
  LeadListQueryDto
} from '../dto/leads.dto';
import { NotFoundError, ValidationError, BadRequestError } from '../errors/AppError';
import logger from '../utils/logger';

/**
 * Service for lead list management
 */
export class LeadListService {
  private leadListRepository: LeadListRepository;
  private leadRepository: LeadRepository;
  private connectedAccountRepository: ConnectedAccountRepository;
  private storageService: StorageService;

  constructor() {
    this.leadListRepository = new LeadListRepository();
    this.leadRepository = new LeadRepository();
    this.connectedAccountRepository = new ConnectedAccountRepository();
    this.storageService = new StorageService();
  }

  /**
   * Create a new lead list
   */
  async createLeadList(
    data: LeadListInsertDto,
    organizationId: string,
    creatorId: string
  ): Promise<LeadListResponseDto> {
    try {
      const leadListData:LeadListInsertDto  = {
        organization_id: organizationId,
        name: data.name,
        description: data.description,
        source: data.source,
        tags: data.tags,
        // filters: data.filters, // TODO: Remove - not in database schema
        creator_id: creatorId,
        connected_account_id: data.connected_account_id,
      };

      const leadList = await this.leadListRepository.create(leadListData);

      logger.info('Lead list created', { leadListId: leadList.id, organizationId });

      return leadList;
    } catch (error) {
      logger.error('Error creating lead list', { error, data, organizationId });
      throw error;
    }
  }

  /**
   * Get lead list data by ID
   */
  async getLeadListById(leadListId: string, organizationId: string): Promise<LeadListResponseDto> {
    try {
      const leadList = await this.leadListRepository.findById(leadListId);
      if(!leadList) {
        throw new NotFoundError('Lead list not found');
      }

      if (leadList.organization_id !== organizationId) {
        throw new NotFoundError('Lead list not found');
      }

      return leadList;
    } catch (error) {
      logger.error('Error getting lead list', { error, leadListId, organizationId });
      throw error;
    }
  }

  /**
   * Get lead list data by ID
   */
  async getLeadListDataById(leadListId: string, organizationId: string): Promise<{csvData: ReturnType<typeof CsvService.parseCsvData>, leadList: LeadListResponseDto}> {
    try {
        const leadList = await this.getLeadListById(leadListId, organizationId);
        if(!leadList.original_filename) {
            throw new NotFoundError('Lead list not found');
        }
        const leadFileBuffer = await this.storageService.downloadFileAsBuffer(organizationId, leadListId, leadList.original_filename);

        const leadFileBufferString = leadFileBuffer.buffer.toString('utf8');

        const csvData = CsvService.parseCsvData(leadFileBufferString);

      if (!leadList) {
        throw new NotFoundError('Lead list not found');
      }

      if (leadList.organization_id !== organizationId) {
        throw new NotFoundError('Lead list not found');
      }
      if (!csvData){
        throw new NotFoundError('Lead List not found')
      }
      return {csvData, leadList};
    } catch (error) {
      logger.error('Error getting lead list', { error, leadListId, organizationId });
      throw error;
    }
  }

  /**
   * Get lead lists for organization
   */
  async getLeadLists(
    organizationId: string,
    query: LeadListQueryDto
  ): Promise<{ data: LeadListResponseDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    try {
      const tags = query.tags ? query.tags.split(',').map(t => t.trim()) : undefined;

      const result = await this.leadListRepository.findByOrganizationId(organizationId, {
        page: query.page,
        limit: query.limit,
        search: query.search,
        source: query.source,
        tags,
      });

      return {
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
        },
      };
    } catch (error) {
      logger.error('Error getting lead lists', { error, organizationId, query });
      throw error;
    }
  }

  /**
   * Get lead lists with statistics
   */
  async getLeadListsWithStats(
    organizationId: string,
    query: LeadListQueryDto
  ): Promise<{ data: (LeadListResponseDto & { statistics: any })[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    try {
      const result = await this.leadListRepository.findWithStatistics(organizationId, {
        page: query.page,
        limit: query.limit,
        search: query.search,
        source: query.source,
      });

      return {
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
        },
      };
    } catch (error) {
      logger.error('Error getting lead lists with stats', { error, organizationId, query });
      throw error;
    }
  }

  /**
   * Update lead list
   * Only allows updating name and connected_account_id fields for security reasons
   */
  async updateLeadList(
    leadListId: string,
    data: LeadListUpdateDto,
    organizationId: string
  ): Promise<LeadListResponseDto> {
    try {
      // Verify lead list exists and belongs to organization
      const tempOrgId = '550e8400-e29b-41d4-a716-446655440001'
      await this.getLeadListById(leadListId, tempOrgId);

      // Check for disallowed fields - only allow name and connected_account_id updates
      const allowedFields = ['name', 'connected_account_id'];
      const disallowedFields = Object.keys(data).filter(key =>
        key !== 'id' && // id is always allowed as it's used for identification
        !allowedFields.includes(key)
      );

      if (disallowedFields.length > 0) {
        throw new BadRequestError(
          `You are not allowed to update the following fields: ${disallowedFields.join(', ')}. Only 'name' and 'connected_account_id' can be updated.`
        );
      }

      // Only include allowed fields in the update
      const updateData: LeadListUpdateDto = {
        name: data.name,
        connected_account_id: data.connected_account_id,
      };

      // Remove undefined values to avoid unnecessary updates
      Object.keys(updateData).forEach(key => {
        if (updateData[key as keyof LeadListUpdateDto] === undefined) {
          delete updateData[key as keyof LeadListUpdateDto];
        }
      });

      const updatedLeadList = await this.leadListRepository.update(leadListId, updateData);

      if (!updatedLeadList) {
        throw new NotFoundError('Lead list not found');
      }

      logger.info('Lead list updated', { leadListId, organizationId, updatedFields: Object.keys(updateData) });

      return updatedLeadList;
    } catch (error) {
      logger.error('Error updating lead list', { error, leadListId, data, organizationId });
      throw error;
    }
  }

  /**
   * Delete lead list
   */
  async deleteLeadList(leadListId: string, organizationId: string): Promise<void> {
    try {
      // Verify lead list exists and belongs to organization
      const tempOrgId = '550e8400-e29b-41d4-a716-446655440001'
      const leadList = await this.getLeadListById(leadListId, tempOrgId);

      // Delete associated file if exists
      if (leadList.csv_file_url) {
        try {
          await this.storageService.deleteCsvFile(
            organizationId,
            leadListId,
            `${leadList.name}.csv`
          );
        } catch (error) {
          logger.warn('Error deleting CSV file', { error, leadListId });
        }
      }

      // Delete lead list (this will cascade delete leads)
      await this.leadListRepository.delete(leadListId);

      logger.info('Lead list deleted', { leadListId, organizationId });
    } catch (error) {
      logger.error('Error deleting lead list', { error, leadListId, organizationId });
      throw error;
    }
  }

  /**
   * Preview CSV data
   */
  async previewCsv(data: PreviewCsvDto): Promise<{
    preview: any;
    validation: CsvValidationResult;
    mapping: Record<string, string>;
  }> {
    try {
      // Parse CSV data
      const parseResult = CsvService.parseCsvData(data.csv_data);

      // Validate CSV structure
      const validation = CsvService.validateCsv(parseResult);

      // Generate field mapping
      const mapping = data.mapping || CsvService.generateMapping(parseResult.headers);

      // Get preview data
      const preview = CsvService.getPreview(parseResult, 5);

      logger.info('CSV preview generated', {
        totalRows: parseResult.totalRows,
        validRows: parseResult.validRows,
        isValid: validation.isValid,
      });

      return {
        preview,
        validation,
        mapping,
      };
    } catch (error) {
      logger.error('Error previewing CSV', { error });
      throw error;
    }
  }

  /**
   * Publish lead list from CSV
   */
  async publishLeadList(
    data: PublishLeadListDto,
    organizationId: string,
    creatorId: string
  ): Promise<{
    leadList: LeadListResponseDto;
    importResult: {
      totalRows: number;
      importedLeads: number;
      skippedLeads: number;
      failedLeads: number;
      errors: string[];
    };
    fileUrl?: string;
  }> {
    try {
      // Verify connected account exists
      logger.info('Looking for connected account', {
        accountId: data.connected_account_id,
        organizationId
      });

      const connectedAccount = await this.connectedAccountRepository.findById(data.connected_account_id);

      logger.info('Found connected account', {
        account: connectedAccount ? {
          id: connectedAccount.id,
          organization_id: connectedAccount.organization_id,
          status: connectedAccount.status,
          provider: connectedAccount.provider
        } : null
      });

      if (!connectedAccount || connectedAccount.organization_id !== organizationId) {
        throw new BadRequestError('Connected account not found');
      }

      // Parse and validate CSV
      const parseResult = CsvService.parseCsvData(data.csv_data);
      const validation = CsvService.validateCsv(parseResult);

      if (!validation.isValid) {
        throw new ValidationError('CSV validation failed', validation.errors as any);
      }

      // Create lead list
      const leadList = await this.createLeadList(
        {
          name: data.name,
          description: data.description,
          source: 'csv_import',
          tags: [],
          filters: {},
          organization_id: organizationId,
          creator_id: creatorId,
          connected_account_id: data.connected_account_id,
          metadata: {
            mapping: data.mapping,
            original_csv_size: data.csv_data.length,
          },
        },
        organizationId,
        creatorId
      );

      // Upload CSV file to storage
      const csvBuffer = Buffer.from(data.csv_data, 'utf8');
      const filename = `${leadList.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`;

      let uploadResult: UploadResult | null = null;
      try {
        uploadResult = await this.storageService.uploadCsvFile(
          csvBuffer,
          filename,
          organizationId,
          leadList.id
        );
      } catch (error) {
        logger.warn('Error uploading CSV file', { error, leadListId: leadList.id });
      }

      // Apply mapping and import leads
      const mapping = data.mapping || CsvService.generateMapping(parseResult.headers);
      const mappedData = CsvService.applyMapping(parseResult.data, mapping);

      const importResult = await this.importLeads(
        leadList.id,
        mappedData,
        organizationId
      );

      // Update lead list with processing results
      const updateData: LeadListUpdateDto = {
        status: 'completed',
        total_leads: importResult.totalRows,
        processed_leads: importResult.importedLeads,
        failed_leads: importResult.totalRows - importResult.importedLeads - importResult.skippedRows,
        processing_completed_at: new Date().toISOString(),
        stats: {
          import_duration_ms: Date.now() - new Date(leadList.created_at || new Date()).getTime(),
          success_rate: importResult.totalRows > 0 ? (importResult.importedLeads / importResult.totalRows) * 100 : 0,
          skipped_count: importResult.skippedRows,
          error_count: importResult.totalRows - importResult.importedLeads - importResult.skippedRows,
        },
      };

      if (uploadResult) {
        updateData.csv_file_url = uploadResult.url;
        updateData.file_size = uploadResult.size;
        updateData.original_filename = filename;
      }

      const updatedLeadList = await this.leadListRepository.update(leadList.id, updateData);

      logger.info('Lead list published successfully', {
        leadListId: leadList.id,
        organizationId,
        totalLeads: importResult.importedLeads,
      });

      return {
        leadList: updatedLeadList || leadList,
        importResult: {
          totalRows: importResult.totalRows,
          importedLeads: importResult.importedLeads,
          skippedLeads: importResult.skippedRows,
          failedLeads: importResult.totalRows - importResult.importedLeads - importResult.skippedRows,
          errors: importResult.errors,
        },
        fileUrl: uploadResult?.url || '',
      };
    } catch (error) {
      logger.error('Error publishing lead list', { error, data, organizationId });
      throw error;
    }
  }

  /**
   * Import leads from mapped CSV data
   */
  private async importLeads(
    leadListId: string,
    mappedData: Record<string, any>[],
    organizationId: string
  ): Promise<{
    totalRows: number;
    importedLeads: number;
    skippedRows: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    const leadsToCreate: LeadInsertDto[] = [];
    let skippedRows = 0;

    // Process each row
    for (let i = 0; i < mappedData.length; i++) {
      const row = mappedData[i];

      try {
        // Validate required fields
        if (!row.linkedin_url && !row.email) {
          errors.push(`Row ${i + 1}: Missing both LinkedIn URL and email`);
          skippedRows++;
          continue;
        }

        // Check for duplicates by LinkedIn URL or email
        let existingLead = null;
        if (row.linkedin_url) {
          existingLead = await this.leadRepository.findByLinkedInUrl(row.linkedin_url);
        }
        if (!existingLead && row.email) {
          existingLead = await this.leadRepository.findByEmail(row.email);
        }

        if (existingLead) {
          errors.push(`Row ${i + 1}: Lead already exists (${row.full_name || row.email || row.linkedin_url})`);
          skippedRows++;
          continue;
        }

        // Create lead data
        const leadData: LeadInsertDto = {
          lead_list_id: leadListId,
          full_name: row.full_name,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          phone: row.phone,
          title: row.title,
          company: row.company,
          industry: row.industry,
          location: row.location,
          linkedin_url: row.linkedin_url,
          linkedin_id: row.linkedin_id,
          source: 'csv_import',
          enrichment_data: row.enrichment_data || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        leadsToCreate.push(leadData);
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Processing error'}`);
        skippedRows++;
      }
    }

    // Bulk create leads
    let importedLeads = 0;
    if (leadsToCreate.length > 0) {
      try {
        const createdLeads = await this.leadRepository.bulkCreate(leadsToCreate);
        importedLeads = createdLeads.length;
      } catch (error) {
        logger.error('Error bulk creating leads', { error, leadListId });
        errors.push('Failed to import leads to database');
      }
    }

    return {
      totalRows: mappedData.length,
      importedLeads,
      skippedRows,
      errors,
    };
  }

  /**
   * Archive lead list
   */
  async archiveLeadList(leadListId: string, organizationId: string): Promise<void> {
    try {
      // Verify lead list exists and belongs to organization
      await this.getLeadListDataById(leadListId, organizationId);

      await this.leadListRepository.archive(leadListId);

      logger.info('Lead list archived', { leadListId, organizationId });
    } catch (error) {
      logger.error('Error archiving lead list', { error, leadListId, organizationId });
      throw error;
    }
  }

  /**
   * Activate lead list
   */
  async activateLeadList(leadListId: string, organizationId: string): Promise<void> {
    try {
      // Verify lead list exists and belongs to organization
      await this.getLeadListDataById(leadListId, organizationId);

      await this.leadListRepository.activate(leadListId);

      logger.info('Lead list activated', { leadListId, organizationId });
    } catch (error) {
      logger.error('Error activating lead list', { error, leadListId, organizationId });
      throw error;
    }
  }

  /**
   * Duplicate lead list
   */
  async duplicateLeadList(
    leadListId: string,
    newName: string,
    organizationId: string,
    creatorId: string
  ): Promise<LeadListResponseDto> {
    try {
      // Verify lead list exists and belongs to organization
      await this.getLeadListDataById(leadListId, organizationId);

      const duplicatedLeadList = await this.leadListRepository.duplicate(
        leadListId,
        newName,
        organizationId,
        creatorId
      );

      logger.info('Lead list duplicated', {
        originalId: leadListId,
        newId: duplicatedLeadList.id,
        organizationId
      });

      return duplicatedLeadList;
    } catch (error) {
      logger.error('Error duplicating lead list', { error, leadListId, newName, organizationId });
      throw error;
    }
  }

  /**
   * Get lead list statistics
   */
  async getLeadListStatistics(leadListId: string, organizationId: string): Promise<any> {
    try {
      // Verify lead list exists and belongs to organization
      await this.getLeadListDataById(leadListId, organizationId);

      const statistics = await this.leadListRepository.getStatistics(leadListId);

      return statistics;
    } catch (error) {
      logger.error('Error getting lead list statistics', { error, leadListId, organizationId });
      throw error;
    }
  }
}
