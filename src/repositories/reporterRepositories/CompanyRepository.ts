import { CreateReporterCompanyLeadDto, UpdateReporterCompanyLeadDto, ReporterCompanyLeadResponseDto } from '../../dto/reporterDtos/companies.dto';
import { DatabaseError } from '../../errors/AppError';
import logger from '../../utils/logger';
import { BaseRepository } from '../BaseRepository';

/**
 * Repository for reporter company lead database operations
 */
export class ReporterCompanyLeadRepository extends BaseRepository<ReporterCompanyLeadResponseDto, CreateReporterCompanyLeadDto, UpdateReporterCompanyLeadDto> {
    constructor() {
        super('reporter_company_leads');
    }

    /**
     * Find company by LinkedIn URL
     */
    public async findByLinkedInUrl(linkedinUrl: string): Promise<ReporterCompanyLeadResponseDto | null> {
        try {
            const data = await this.findOneByField('linkedin_url', linkedinUrl);
            return data;
        } catch (error) {
            logger.error('Error finding reporter company by LinkedIn URL', {
                error,
                linkedinUrl,
            });
            throw new DatabaseError('Failed to find company by LinkedIn URL');
        }
    }

    /**
     * Find company by user ID and LinkedIn URL
     */
    public async findByUserAndLinkedInUrl(userId: string, linkedinUrl: string): Promise<ReporterCompanyLeadResponseDto | null> {
        try {
            const data = await this.findOneByMultipleFields({
                user_id: userId,
                linkedin_url: linkedinUrl,
            });
            return data;
        } catch (error) {
            logger.error('Error finding reporter company by user and LinkedIn URL', {
                error,
                userId,
                linkedinUrl,
            });
            throw new DatabaseError('Failed to find company by user and LinkedIn URL');
        }
    }

    /**
     * Get all companies for a user
     */
    public async getUserCompanies(userId: string): Promise<ReporterCompanyLeadResponseDto[]> {
        try {
            const {data, error} = await this.client.from(this.tableName).select('*').eq('user_id', userId);
            if (error) {
                logger.error('Error getting reporter user companies', { error, userId });
                throw error;
            }
            return data || [];
        } catch (error) {
            throw error;
        }
    }

    /**
     * Update company's last fetched timestamp
     */
    public async updateLastFetched(companyId: string): Promise<ReporterCompanyLeadResponseDto> {
        try {
            const updateData: UpdateReporterCompanyLeadDto = {
                last_fetched_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            return await this.update(companyId, updateData);
        } catch (error) {
            logger.error('Error updating reporter company last fetched timestamp', { error, companyId });
            throw new DatabaseError('Failed to update last fetched timestamp');
        }
    }

    /**
     * Bulk create companies
     */
    public async bulkCreate(companies: CreateReporterCompanyLeadDto[]): Promise<ReporterCompanyLeadResponseDto[]> {
        try {
            const {data, error} = await this.client.from(this.tableName).insert(companies).select();
            if (error) {
                logger.error('Error bulk creating reporter companies', { error, companies });
                throw error;
            }
            return data || [];
        } catch (error) {
            logger.error('Error bulk creating reporter companies', { error, companies });
            throw new DatabaseError('Failed to create reporter companies');
        }
    }
}
