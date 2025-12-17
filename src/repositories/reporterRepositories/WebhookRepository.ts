import { BaseRepository } from '../BaseRepository';
import { CreateReporterWebhookDto, UpdateReporterWebhookDto, ReporterWebhookResponseDto } from '../../dto/reporterDtos/webhooks.dto';
import { DatabaseError } from '../../errors/AppError';
import logger from '../../utils/logger';

/**
 * Repository for reporter webhook database operations
 */
export class ReporterWebhookRepository extends BaseRepository<ReporterWebhookResponseDto, CreateReporterWebhookDto, UpdateReporterWebhookDto> {
    constructor() {
        super('reporter_webhooks');
    }

    /**
     * Soft delete a webhook by setting is_deleted to true
     */
    async softDelete(id: string): Promise<void> {
        try {
            const { error } = await this.client.from(this.tableName).update({ is_deleted: true, updated_at: new Date().toISOString() }).eq('id', id);

            if (error) {
                logger.error('Error soft deleting reporter webhook', { error, id });
                throw new DatabaseError('Failed to delete webhook');
            }
        } catch (error) {
            logger.error('Error in softDelete', { error, id });
            throw error;
        }
    }

    /**
     * Get all webhooks for a reporter user (excluding deleted)
     */
    async getUserWebhooks(reporterUserId: string): Promise<ReporterWebhookResponseDto[]> {
        try {
            const { data, error } = await this.client
                .from(this.tableName)
                .select('*')
                .eq('reporter_user_id', reporterUserId)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false });

            if (error) {
                logger.error('Error getting reporter user webhooks', { error, reporterUserId });
                throw new DatabaseError('Failed to get user webhooks');
            }

            return (data || []) as ReporterWebhookResponseDto[];
        } catch (error) {
            logger.error('Error in getUserWebhooks', { error, reporterUserId });
            throw error;
        }
    }
}
