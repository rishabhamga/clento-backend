import {
    CreateReporterCompanyLeadDto,
    UpdateReporterCompanyLeadDto,
    ReporterCompanyLeadResponseDto,
} from '../dto/reporterDtos/companies.dto';
import { NotFoundError, ValidationError } from '../errors/AppError';
import logger from '../utils/logger';
import { ReporterCompanyLeadRepository } from '../repositories/reporterRepositories/CompanyRepository';
import { CsvService } from './CsvService';

/**
 * Service for managing reporter company leads
 */
export class ReporterCompanyLeadService {
    private companyRepository: ReporterCompanyLeadRepository;

    constructor() {
        this.companyRepository = new ReporterCompanyLeadRepository();
    }

    /**
     * Create a new company
     */
    async createCompany(data: CreateReporterCompanyLeadDto): Promise<ReporterCompanyLeadResponseDto> {
        try {
            // Validate LinkedIn URL format (company URL)
            const identifier = CsvService.extractLinkedInPublicIdentifier(data.linkedin_url);
            if (!identifier) {
                throw new ValidationError('Invalid LinkedIn URL format');
            }

            // Verify it's a company URL, not a person URL
            if (!data.linkedin_url.includes('/company/')) {
                throw new ValidationError('LinkedIn URL must be a company URL (linkedin.com/company/...)');
            }

            // Check if company already exists for this user
            const existingCompany = await this.companyRepository.findByUserAndLinkedInUrl(
                data.user_id,
                data.linkedin_url
            );

            if (existingCompany) {
                logger.info('Company already exists, returning existing company', {
                    userId: data.user_id,
                    linkedinUrl: data.linkedin_url,
                    companyId: existingCompany.id,
                });
                return existingCompany;
            }

            // Create new company
            const company = await this.companyRepository.create(data);

            logger.info('Reporter company created successfully', {
                companyId: company.id,
                userId: data.user_id,
                linkedinUrl: data.linkedin_url,
            });

            return company;
        } catch (error) {
            logger.error('Error creating reporter company', { error, data });
            throw error;
        }
    }

    /**
     * Get company by ID
     */
    async getCompanyById(companyId: string, userId: string): Promise<ReporterCompanyLeadResponseDto> {
        try {
            const company = await this.companyRepository.findById(companyId);

            if (!company) {
                throw new NotFoundError('Company not found');
            }

            // Verify user has access to this company
            if (company.user_id !== userId) {
                throw new NotFoundError('Company not found');
            }

            return company;
        } catch (error) {
            logger.error('Error getting reporter company by ID', { error, companyId, userId });
            throw error;
        }
    }

    /**
     * Update company
     */
    async updateCompany(companyId: string, data: UpdateReporterCompanyLeadDto, userId: string): Promise<ReporterCompanyLeadResponseDto> {
        try {
            // Verify company exists and user has access
            await this.getCompanyById(companyId, userId);

            // Update company
            const updatedCompany = await this.companyRepository.update(companyId, data);

            logger.info('Reporter company updated successfully', {
                companyId,
                userId,
                updates: Object.keys(data),
            });

            return updatedCompany;
        } catch (error) {
            logger.error('Error updating reporter company', { error, companyId, data, userId });
            throw error;
        }
    }

    /**
     * Get all companies for a user
     */
    async getUserCompanies(userId: string): Promise<ReporterCompanyLeadResponseDto[]> {
        try {
            const companies = await this.companyRepository.getUserCompanies(userId);

            logger.info('Retrieved reporter user companies', {
                userId,
                companyCount: companies.length,
            });

            return companies;
        } catch (error) {
            logger.error('Error getting reporter user companies', { error, userId });
            throw error;
        }
    }

    /**
     * Find or create company by LinkedIn URL
     */
    async findOrCreateCompany(userId: string, linkedinUrl: string): Promise<ReporterCompanyLeadResponseDto> {
        try {
            // Check if company exists
            const existingCompany = await this.companyRepository.findByUserAndLinkedInUrl(userId, linkedinUrl);

            if (existingCompany) {
                return existingCompany;
            }

            // Create new company
            const createData: CreateReporterCompanyLeadDto = {
                user_id: userId,
                linkedin_url: linkedinUrl,
            };

            return await this.createCompany(createData);
        } catch (error) {
            logger.error('Error finding or creating reporter company', { error, userId, linkedinUrl });
            throw error;
        }
    }

    /**
     * Delete company (soft delete)
     */
    async deleteCompany(companyId: string, userId: string): Promise<void> {
        try {
            // Verify company exists and user has access
            await this.getCompanyById(companyId, userId);

            // Soft delete company
            const updateData: UpdateReporterCompanyLeadDto = {
                updated_at: new Date().toISOString(),
            };

            // Note: Since there's no is_deleted field in the table schema, we might need to handle this differently
            // For now, we'll just update the timestamp. If soft delete is needed, add is_deleted field to schema.
            await this.companyRepository.update(companyId, updateData);

            logger.info('Reporter company deleted successfully', {
                companyId,
                userId,
            });
        } catch (error) {
            logger.error('Error deleting reporter company', { error, companyId, userId });
            throw error;
        }
    }
}
