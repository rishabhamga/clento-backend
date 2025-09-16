import { BaseRepository } from './BaseRepository';
import { DatabaseError, NotFoundError } from '../errors/AppError';
import logger from '../utils/logger';

export interface LeadList {
  id: string;
  organization_id: string;
  creator_id: string;
  name: string;
  description?: string;
  source: 'csv_import' | 'filter_search' | 'api' | 'manual';
  status: 'draft' | 'processing' | 'completed' | 'failed' | 'archived' | 'active';
  total_leads: number;
  processed_leads: number;
  failed_leads: number;
  original_filename?: string;
  csv_file_url?: string;
  sample_csv_url?: string;
  file_size?: number;
  processing_started_at?: string;
  processing_completed_at?: string;
  error_message?: string;
  tags: string[];
  filters: Record<string, any>;
  metadata: Record<string, any>;
  stats: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreateLeadList {
  organization_id: string;
  creator_id: string;
  name: string;
  description?: string;
  source: 'csv_import' | 'filter_search' | 'api' | 'manual';
  status?: 'draft' | 'processing' | 'completed' | 'failed' | 'archived';
  total_leads?: number;
  processed_leads?: number;
  failed_leads?: number;
  original_filename?: string;
  csv_file_url?: string;
  sample_csv_url?: string;
  file_size?: number;
  processing_started_at?: string;
  processing_completed_at?: string;
  error_message?: string;
  tags?: string[];
  filters?: Record<string, any>;
  metadata?: Record<string, any>;
  stats?: Record<string, any>;
}

export interface UpdateLeadList {
  name?: string;
  description?: string;
  status?: 'draft' | 'processing' | 'completed' | 'failed' | 'archived' | 'active';
  total_leads?: number;
  processed_leads?: number;
  failed_leads?: number;
  original_filename?: string;
  csv_file_url?: string;
  sample_csv_url?: string;
  file_size?: number;
  processing_started_at?: string;
  processing_completed_at?: string;
  error_message?: string;
  tags?: string[];
  filters?: Record<string, any>;
  metadata?: Record<string, any>;
  stats?: Record<string, any>;
}

/**
 * Repository for lead_lists table operations
 */
export class LeadListRepository extends BaseRepository<LeadList, CreateLeadList, UpdateLeadList> {
  constructor() {
    super('lead_lists');
  }

  /**
   * Find lead lists by organization ID
   */
  async findByOrganizationId(
    organizationId: string,
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      source?: string;
      status?: string;
      tags?: string[];
    }
  ): Promise<{ data: LeadList[]; total: number; page: number; limit: number }> {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 20;
      const offset = (page - 1) * limit;

      let query = this.client
        .from(this.tableName)
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (options?.search) {
        query = query.or(`name.ilike.%${options.search}%,description.ilike.%${options.search}%`);
      }

      if (options?.source) {
        query = query.eq('source', options.source);
      }

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.tags && options.tags.length > 0) {
        query = query.overlaps('tags', options.tags);
      }

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error('Error finding lead lists by organization', { error, organizationId });
        throw new DatabaseError('Failed to retrieve lead lists');
      }

      return {
        data: data || [],
        total: count || 0,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Error in findByOrganizationId', { error, organizationId });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to retrieve lead lists');
    }
  }

  /**
   * Find lead lists by creator ID
   */
  async findByCreatorId(creatorId: string): Promise<LeadList[]> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error finding lead lists by creator', { error, creatorId });
        throw new DatabaseError('Failed to retrieve lead lists');
      }

      return data || [];
    } catch (error) {
      logger.error('Error in findByCreatorId', { error, creatorId });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to retrieve lead lists');
    }
  }

  /**
   * Update lead count for a lead list
   */
  async updateLeadCount(leadListId: string, count: number): Promise<void> {
    try {
      await this.update(leadListId, {
        total_leads: count
      });

      logger.info('Lead count updated', { leadListId, count });
    } catch (error) {
      logger.error('Error in updateLeadCount', { error, leadListId, count });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to update lead count');
    }
  }

  /**
   * Get lead list statistics
   */
  async getStatistics(leadListId: string): Promise<{
    total_leads: number;
    new_leads: number;
    contacted_leads: number;
    replied_leads: number;
    connected_leads: number;
  }> {
    try {
      // Get total leads count
      const { count: totalLeads, error: totalError } = await this.client
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('lead_list_id', leadListId);

      if (totalError) {
        logger.error('Error getting total leads count', { error: totalError, leadListId });
        throw new DatabaseError('Failed to get lead statistics');
      }

      // Get leads by status
      const { data: statusCounts, error: statusError } = await this.client
        .from('leads')
        .select('status')
        .eq('lead_list_id', leadListId);

      if (statusError) {
        logger.error('Error getting leads by status', { error: statusError, leadListId });
        throw new DatabaseError('Failed to get lead statistics');
      }

      // Count leads by status
      const statusMap = (statusCounts || []).reduce((acc, lead: any) => {
        acc[lead.status] = (acc[lead.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        total_leads: totalLeads || 0,
        new_leads: statusMap['new'] || 0,
        contacted_leads: statusMap['contacted'] || 0,
        replied_leads: statusMap['replied'] || 0,
        connected_leads: statusMap['connected'] || 0,
      };
    } catch (error) {
      logger.error('Error in getStatistics', { error, leadListId });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to get lead statistics');
    }
  }

  /**
   * Archive lead list
   */
  async archive(leadListId: string): Promise<void> {
    try {
      await this.update(leadListId, {
        status: 'archived'
      });

      logger.info('Lead list archived', { leadListId });
    } catch (error) {
      logger.error('Error in archive', { error, leadListId });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to archive lead list');
    }
  }

  /**
   * Activate lead list
   */
  async activate(leadListId: string): Promise<void> {
    try {
      await this.update(leadListId, {
        status: 'completed'
      });

      logger.info('Lead list activated', { leadListId });
    } catch (error) {
      logger.error('Error in activate', { error, leadListId });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to activate lead list');
    }
  }

  /**
   * Find lead lists with statistics
   */
  async findWithStatistics(
    organizationId: string,
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      source?: string;
      status?: string;
    }
  ): Promise<{ data: (LeadList & { statistics: any })[]; total: number; page: number; limit: number }> {
    try {
      const result = await this.findByOrganizationId(organizationId, options);

      // Get statistics for each lead list
      const dataWithStats = await Promise.all(
        result.data.map(async (leadList) => {
          const statistics = await this.getStatistics(leadList.id);
          return {
            ...leadList,
            statistics,
          };
        })
      );

      return {
        ...result,
        data: dataWithStats,
      };
    } catch (error) {
      logger.error('Error in findWithStatistics', { error, organizationId });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to retrieve lead lists with statistics');
    }
  }

  /**
   * Duplicate lead list
   */
  async duplicate(
    leadListId: string,
    newName: string,
    organizationId: string,
    creatorId: string
  ): Promise<LeadList> {
    try {
      // Get original lead list
      const original = await this.findById(leadListId);
      if (!original) {
        throw new NotFoundError('Lead list not found');
      }

      // Create new lead list
      const newLeadList = await this.create({
        organization_id: organizationId,
        name: newName,
        description: `Copy of ${original.name}`,
        source: original.source,
        tags: original.tags,
        filters: original.filters,
        creator_id: creatorId,
      });

      logger.info('Lead list duplicated', { originalId: leadListId, newId: newLeadList.id });

      return newLeadList;
    } catch (error) {
      logger.error('Error in duplicate', { error, leadListId, newName });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to duplicate lead list');
    }
  }
}
