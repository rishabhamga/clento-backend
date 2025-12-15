import { CreateReporterLeadDto, UpdateReporterLeadDto, ReporterLeadResponseDto } from '../../dto/reporterDtos/leads.dto';
import { DatabaseError } from '../../errors/AppError';
import logger from '../../utils/logger';
import { BaseRepository } from '../BaseRepository';

/**
 * Repository for reporter lead database operations
 */
export class ReporterLeadRepository extends BaseRepository<ReporterLeadResponseDto, CreateReporterLeadDto, UpdateReporterLeadDto> {
    constructor() {
        super('reporter_leads');
    }

    /**
     * Find lead by LinkedIn URL
     */
    public async findByLinkedInUrl(linkedinUrl: string): Promise<ReporterLeadResponseDto | null> {
        try {
            const data = await this.findOneByField('linkedin_url', linkedinUrl);
            return data;
        } catch (error) {
            logger.error('Error finding reporter lead by LinkedIn URL', {
                error,
                linkedinUrl,
            });
            throw new DatabaseError('Failed to find lead by LinkedIn URL');
        }
    }

    /**
     * Find lead by user ID and LinkedIn URL
     */
    public async findByUserAndLinkedInUrl(userId: string, linkedinUrl: string): Promise<ReporterLeadResponseDto | null> {
        try {
            const data = await this.findOneByMultipleFields({
                user_id: userId,
                linkedin_url: linkedinUrl,
            });
            return data;
        } catch (error) {
            logger.error('Error finding reporter lead by user and LinkedIn URL', {
                error,
                userId,
                linkedinUrl,
            });
            throw new DatabaseError('Failed to find lead by user and LinkedIn URL');
        }
    }

    /**
     * Get all leads for a user
     */
    public async getUserLeads(userId: string): Promise<ReporterLeadResponseDto[]> {
        try {
            const data = await this.findByField('user_id' as keyof ReporterLeadResponseDto, userId);
            return data || [];
        } catch (error) {
            logger.error('Error getting reporter user leads', { error, userId });
            throw new DatabaseError('Failed to get user leads');
        }
    }

    /**
     * Update lead's last fetched timestamp
     */
    public async updateLastFetched(leadId: string): Promise<ReporterLeadResponseDto> {
        try {
            const updateData: UpdateReporterLeadDto = {
                last_fetched_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            return await this.update(leadId, updateData);
        } catch (error) {
            logger.error('Error updating reporter lead last fetched timestamp', { error, leadId });
            throw new DatabaseError('Failed to update last fetched timestamp');
        }
    }

    public async bulkCreate(leads: CreateReporterLeadDto[]): Promise<ReporterLeadResponseDto[]> {
        try {
            const {data, error} = await this.client.from(this.tableName).insert(leads).select();
            if (error) {
                logger.error('Error bulk creating reporter leads', { error, leads });
                throw error;
            }
            return data || [];
        } catch (error) {
            logger.error('Error bulk creating reporter leads', { error, leads });
            throw new DatabaseError('Failed to create reporter leads');
        }
    }
}
