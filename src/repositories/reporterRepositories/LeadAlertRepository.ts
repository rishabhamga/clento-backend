import { CreateReporterLeadAlertDto, UpdateReporterLeadAlertDto, ReporterLeadAlertResponseDto, EAlertPriority } from '../../dto/reporterDtos/leadAlerts.dto';
import { DatabaseError, NotFoundError } from '../../errors/AppError';
import logger from '../../utils/logger';
import { BaseRepository } from '../BaseRepository';

/**
 * Repository for reporter lead alerts database operations
 */
export class ReporterLeadAlertRepository extends BaseRepository<ReporterLeadAlertResponseDto, CreateReporterLeadAlertDto, UpdateReporterLeadAlertDto> {
    constructor() {
        super('reporter_leads_alerts');
    }

    /**
     * Get paginated alerts for a reporter user
     */
    public async getUserAlertsPaginated(
        userId: string,
        page: number,
        limit: number,
        acknowledged?: boolean | null,
        priority?: EAlertPriority | null,
        leadId?: string | null
    ): Promise<{
        alerts: ReporterLeadAlertResponseDto[];
        count: number;
        page: number;
        limit: number;
        total_pages: number;
        has_more: boolean;
    }> {
        try {
            let query = this.client
                .from(this.tableName)
                .select('*', { count: 'exact' })
                .eq('reporter_user_id', userId)
                .order('created_at', { ascending: false });

            if (acknowledged !== undefined && acknowledged !== null) {
                query = query.eq('acknowledged', acknowledged);
            }

            if (priority) {
                query = query.eq('priority', priority);
            }

            if (leadId) {
                query = query.eq('lead_id', leadId);
            }

            // Apply pagination
            const offset = (page - 1) * limit;
            query = query.range(offset, offset + limit - 1);

            const { data, error, count } = await query;

            if (error) {
                logger.error('Error getting paginated user alerts', { error, userId, page, limit });
                throw error;
            }

            const totalCount = count || 0;
            const totalPages = Math.ceil(totalCount / limit);
            const hasMore = page < totalPages;

            return {
                alerts: data || [],
                count: totalCount,
                page,
                limit,
                total_pages: totalPages,
                has_more: hasMore,
            };
        } catch (error) {
            logger.error('Error getting paginated user alerts', { error, userId });
            throw new DatabaseError('Failed to get paginated alerts');
        }
    }

    /**
     * Get all alerts for a specific lead
     */
    public async getLeadAlerts(leadId: string): Promise<ReporterLeadAlertResponseDto[]> {
        try {
            const { data, error } = await this.client
                .from(this.tableName)
                .select('*')
                .eq('lead_id', leadId)
                .order('created_at', { ascending: false });

            if (error) {
                logger.error('Error getting lead alerts', { error, leadId });
                throw error;
            }

            return data || [];
        } catch (error) {
            logger.error('Error getting lead alerts', { error, leadId });
            throw new DatabaseError('Failed to get lead alerts');
        }
    }

    /**
     * Acknowledge an alert
     */
    public async acknowledgeAlert(alertId: string): Promise<ReporterLeadAlertResponseDto> {
        try {
            const updateData: UpdateReporterLeadAlertDto = {
                acknowledged: true,
            };
            return await this.update(alertId, updateData);
        } catch (error) {
            logger.error('Error acknowledging alert', { error, alertId });
            throw new DatabaseError('Failed to acknowledge alert');
        }
    }

    /**
     * Acknowledge multiple alerts
     */
    public async acknowledgeAlerts(alertIds: string[]): Promise<ReporterLeadAlertResponseDto[]> {
        try {
            const { data, error } = await this.client
                .from(this.tableName)
                .update({ acknowledged: true })
                .in('id', alertIds)
                .select();

            if (error) {
                logger.error('Error acknowledging alerts', { error, alertIds });
                throw error;
            }

            return data || [];
        } catch (error) {
            logger.error('Error acknowledging alerts', { error, alertIds });
            throw new DatabaseError('Failed to acknowledge alerts');
        }
    }
}
