import { BaseRepository } from './BaseRepository';
import { DatabaseError, NotFoundError } from '../errors/AppError';
import logger from '../utils/logger';
import { LeadListResponseDto, LeadListInsertDto, LeadListUpdateDto } from '../dto/leads.dto';
/**
 * Repository for lead_lists table operations
 */
export class LeadListRepository extends BaseRepository<LeadListResponseDto, LeadListInsertDto, LeadListUpdateDto> {
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
        },
    ): Promise<{ data: LeadListResponseDto[]; total: number; page: number; limit: number }> {
        try {
            const page = options?.page || 1;
            const limit = options?.limit || 20;
            const offset = (page - 1) * limit;

            let query = this.client.from(this.tableName).select('*', { count: 'exact' }).eq('organization_id', organizationId).order('created_at', { ascending: false });

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
    async findByCreatorId(creatorId: string): Promise<LeadListResponseDto[]> {
        try {
            const data = await this.findByField('creator_id', creatorId);

            return data;
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
                stats: {
                    ...(await this.findById(leadListId)).stats,
                    total_leads: count,
                },
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
            const totalLeads = await this.countByField('lead_list_id', leadListId, 'exact', true);

            // Get leads by status
            const statusCounts = await this.findByField('description', leadListId);

            // Count leads by status
            const statusMap = (statusCounts || []).reduce(
                (acc, lead: any) => {
                    acc[lead.status] = (acc[lead.status] || 0) + 1;
                    return acc;
                },
                {} as Record<string, number>,
            );

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
                status: 'archived',
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
                status: 'completed',
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
        },
    ): Promise<{ data: (LeadListResponseDto & { statistics: any })[]; total: number; page: number; limit: number }> {
        try {
            const result = await this.findByOrganizationId(organizationId, options);

            // Get statistics for each lead list
            const dataWithStats = await Promise.all(
                result.data.map(async leadList => {
                    const statistics = await this.getStatistics(leadList.id);
                    return {
                        ...leadList,
                        statistics,
                    };
                }),
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
    async duplicate(leadListId: string, newName: string, organizationId: string, creatorId: string): Promise<LeadListResponseDto> {
        try {
            // Get original lead list
            const original = await this.findById(leadListId);
            if (!original) {
                throw new NotFoundError('Lead list not found');
            }

            // Create new lead list
            const newLeadList = await this.create({
                name: newName,
                description: `Copy of ${original.name}`,
                source: original.source,
                organization_id: organizationId,
                tags: original.tags,
                filters: original.filters,
                creator_id: creatorId,
                metadata: original.metadata,
                stats: original.stats,
            });

            logger.info('Lead list duplicated', { originalId: leadListId, newId: newLeadList.id });

            return newLeadList;
        } catch (error) {
            logger.error('Error in duplicate', { error, leadListId, newName });
            throw error instanceof DatabaseError ? error : new DatabaseError('Failed to duplicate lead list');
        }
    }
}
