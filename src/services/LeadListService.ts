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
import env from '../config/env';

/**
 * Service for lead list management
 */
export class LeadListService {
  private leadListRepository: LeadListRepository;
  private leadRepository: LeadRepository;
  private connectedAccountRepository: ConnectedAccountRepository;
  private storageService: StorageService;
  private bucketName: string;

  constructor() {
    this.leadListRepository = new LeadListRepository();
    this.leadRepository = new LeadRepository();
    this.connectedAccountRepository = new ConnectedAccountRepository();
    this.storageService = new StorageService();
    this.bucketName = env.GOOGLE_CLOUD_STORAGE_BUCKET;
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
  async getLeadListByIdIn(leadListIds: string[]): Promise<LeadListResponseDto[]> {
    try {
      const leadLists = await this.leadListRepository.findByIdIn(leadListIds);
      if(!leadLists) {
        throw new NotFoundError('Lead list not found');
      }
      return leadLists;
    } catch (error) {
      logger.error('Error getting lead list', { error, leadListIds });
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
        const filePath = `lead-lists/${organizationId}/${leadListId}/${leadList.original_filename}`;
        const leadFileBuffer = await this.storageService.downloadFileAsBuffer(organizationId, leadListId, leadList.original_filename, this.bucketName, filePath);

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
            `${leadList.name}.csv`,
            this.bucketName
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
      //   const preview = CsvService.getPreviewFromUnipile(parseResult, 5);
      const preview = CsvService.getPreview(parseResult, 5);
    //   const previewNew = CsvService.getPreviewFromUnipile(parseResult, 5);

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
          leadList.id,
          this.bucketName
        );
      } catch (error) {
        logger.warn('Error uploading CSV file', { error, leadListId: leadList.id });
      }

      // Update lead list with processing results
      const updateData: LeadListUpdateDto = {
        status: 'completed',
        total_leads: parseResult.totalRows,
        processed_leads: parseResult.validRows,
        failed_leads: parseResult.totalRows - parseResult.validRows,
        processing_completed_at: new Date().toISOString(),
        stats: {
          import_duration_ms: Date.now() - new Date(leadList.created_at || new Date()).getTime(),
          success_rate: parseResult.totalRows > 0 ? (parseResult.validRows / parseResult.totalRows) * 100 : 0,
          skipped_count: parseResult.totalRows - parseResult.validRows,
          error_count: parseResult.totalRows - parseResult.validRows,
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
        totalLeads: parseResult.validRows,
      });

      return {
        leadList: updatedLeadList || leadList,
        importResult: {
          totalRows: parseResult.totalRows,
          importedLeads: parseResult.validRows,
          skippedLeads: parseResult.totalRows - parseResult.validRows,
          failedLeads: parseResult.totalRows - parseResult.validRows,
          errors: parseResult.errors,
        },
        fileUrl: uploadResult?.url || '',
      };
    } catch (error) {
      logger.error('Error publishing lead list', { error, data, organizationId });
      throw error;
    }
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
