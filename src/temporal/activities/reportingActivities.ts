// REPORTER LEAD MONITORING ACTIVITIES

import { ApplicationFailure } from '@temporalio/common';
import { ReporterLeadResponseDto, UpdateReporterLeadDto } from '../../dto/reporterDtos/leads.dto';
import { ReporterLeadRepository } from '../../repositories/reporterRepositories/LeadRepository';
import { CsvService } from '../../services/CsvService';
import { ReporterConnectedAccountService } from '../../services/ReporterConnectedAccountService';
import { ReporterLeadService } from '../../services/ReporterLeadService';
import { UnipileService } from '../../services/UnipileService';
import logger from '../../utils/logger';
import { isDeepStrictEqual } from 'node:util';

/**
 * Fetch LinkedIn profile for a reporter lead
 * Throws ApplicationFailure.retryable() on errors to allow Temporal retries
 * This activity is idempotent - same accountId + linkedinUrl always returns same profile
 */
export async function fetchReporterLeadProfile(linkedinUrl: string): Promise<any> {
    try {
        const unipileService = new UnipileService();

        const accountId = await getAnyReporterConnectedAccount();

        const identifier = CsvService.extractLinkedInPublicIdentifier(linkedinUrl);
        if (!identifier) {
            throw ApplicationFailure.retryable('Invalid LinkedIn URL format', 'InvalidLinkedInUrl');
        }

        const profile = await unipileService.getUserProfile(accountId, identifier);

        if (!profile) {
            throw ApplicationFailure.retryable('Failed to fetch profile from Unipile', 'UnipileProfileFetchFailed');
        }

        return profile;
    } catch (error: any) {
        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Convert to retryable Temporal error
        throw ApplicationFailure.retryable(`LinkedIn profile fetch failed: ${error.message || 'Unknown error'}`, 'LinkedInProfileFetchError');
    }
}

/**
 * Update reporter lead with profile data
 * Throws ApplicationFailure.retryable() on errors to allow Temporal retries
 * This activity is idempotent - multiple calls with same data produce same result
 */
export async function updateReporterLeadProfile(
    leadId: string,
    profileData: any,
): Promise<{
    lead: any;
    changes: Partial<Record<keyof ReporterLeadResponseDto, boolean>>;
}> {
    try {
        logger.info('Updating reporter lead with profile data', { leadId });

        const leadService = new ReporterLeadService();
        const leadRepository = new ReporterLeadRepository();

        // Get current lead data
        const currentLead = await leadRepository.findById(leadId);
        if (!currentLead) {
            throw ApplicationFailure.retryable(`Lead not found: ${leadId}`, 'LeadNotFound');
        }

        // Extract profile information
        const fullName = profileData?.full_name || profileData?.name || profileData?.first_name + ' ' + profileData?.last_name || null;
        const profileImageUrl = profileData?.profile_picture_url || profileData?.profile_image_url || null;
        const headline = profileData?.headline || null;
        const location = profileData?.location || null;

        // Extract job information
        const workExperience = profileData?.work_experience || [];
        const lastExperience = workExperience && workExperience.length > 0 ? workExperience[0] : null;
        const lastJobTitle = lastExperience?.job_title || profileData?.work_experience?.[0]?.position || null;
        const lastCompanyName = lastExperience?.company || profileData?.work_experience?.[0]?.company || null;
        const lastCompanyId = lastExperience?.company_id || profileData?.work_experience?.[0]?.company_id || null;

        // Extract education
        const education = profileData?.education || [];
        const lastEducation = education && education.length > 0 ? education[0] : null;

        // Extract company information
        const lastCompanyDomain = lastExperience?.company_domain || null;
        const lastCompanySize = lastExperience?.company_size || null;
        const lastCompanyIndustry = lastExperience?.company_industry || null;

        // Calculate profile hash for change detection (idempotency)
        const profileHash = JSON.stringify({
            jobTitle: lastJobTitle,
            company: lastCompanyName,
            experience: lastExperience,
        });

        let changes: Partial<Record<keyof ReporterLeadResponseDto, boolean>> = {};

        if (currentLead.full_name !== fullName) {
            changes.full_name = true;
        }
        if (currentLead.profile_image_url !== profileImageUrl) {
            changes.profile_image_url = true;
        }
        if (currentLead.headline !== headline) {
            changes.headline = true;
        }
        if (currentLead.location !== location) {
            changes.location = true;
        }
        if (currentLead.last_job_title !== lastJobTitle) {
            changes.last_job_title = true;
        }
        if (currentLead.last_company_name !== lastCompanyName) {
            changes.last_company_name = true;
        }
        if (currentLead.last_company_id !== lastCompanyId) {
            changes.last_company_id = true;
        }
        if (!isDeepStrictEqual(currentLead.last_experience, lastExperience)) {
            changes.last_experience = true;
        }
        if (!isDeepStrictEqual(currentLead.last_education, lastEducation)) {
            changes.last_education = true;
        }
        if (currentLead.last_profile_hash !== profileHash) {
            changes.last_profile_hash = true;
        }
        if (currentLead.last_company_domain !== lastCompanyDomain) {
            changes.last_company_domain = true;
        }
        if (currentLead.last_company_size !== lastCompanySize) {
            changes.last_company_size = true;
        }
        if (currentLead.last_company_industry !== lastCompanyIndustry) {
            changes.last_company_industry = true;
        }

        // Prepare update data
        const updateData: UpdateReporterLeadDto = {
            full_name: fullName,
            profile_image_url: profileImageUrl,
            headline,
            location,
            last_job_title: lastJobTitle,
            last_company_name: lastCompanyName,
            last_company_id: lastCompanyId,
            last_experience: lastExperience,
            last_education: lastEducation,
            last_profile_hash: profileHash,
            last_company_domain: lastCompanyDomain,
            last_company_size: lastCompanySize,
            last_company_industry: lastCompanyIndustry,
            last_fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        // Update lead (idempotent operation)
        const updatedLead = await leadService.updateLead(leadId, updateData, currentLead.user_id);

        return {
            lead: updatedLead,
            changes,
        };
    } catch (error: any) {
        logger.error('Error updating reporter lead profile', {
            error: error.message,
            leadId,
        });

        if (error instanceof ApplicationFailure) {
            throw error;
        }

        throw ApplicationFailure.retryable(`Failed to update lead profile: ${error.message || 'Unknown error'}`, 'UpdateLeadProfileError');
    }
}

/**
 * Get reporter connected account for a user
 * Throws ApplicationFailure.retryable() on errors to allow Temporal retries
 * This activity is idempotent - same userId always returns same account
 */
export async function getReporterConnectedAccount(userId: string): Promise<string> {
    try {
        logger.info('Getting reporter connected account', { userId });

        const accountService = new ReporterConnectedAccountService();
        const accounts = await accountService.getUserAccounts(userId);

        // Find a LinkedIn account
        const linkedInAccount = accounts.find(acc => acc.provider === 'linkedin' && acc.status === 'connected');

        if (!linkedInAccount) {
            throw ApplicationFailure.retryable(`No connected LinkedIn account found for user: ${userId}`, 'NoConnectedAccount');
        }

        logger.info('Reporter connected account found', {
            userId,
            accountId: linkedInAccount.provider_account_id,
        });

        return linkedInAccount.provider_account_id;
    } catch (error: any) {
        logger.error('Error getting reporter connected account', {
            error: error.message,
            userId,
        });

        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Convert to retryable Temporal error
        throw ApplicationFailure.retryable(`Failed to get connected account: ${error.message || 'Unknown error'}`, 'GetConnectedAccountError');
    }
}

/**
 * Get any connected LinkedIn account (across all users)
 * Throws ApplicationFailure.retryable() on errors to allow Temporal retries
 * This allows workflows to use any available account, not just the lead's user account
 */
export async function getAnyReporterConnectedAccount(): Promise<string> {
    try {
        logger.info('Getting any reporter connected LinkedIn account');

        const accountService = new ReporterConnectedAccountService();
        const account = await accountService.getAnyConnectedLinkedInAccount();

        if (!account) {
            throw ApplicationFailure.retryable('No connected LinkedIn account found in the system', 'NoConnectedAccount');
        }

        logger.info('Reporter connected account found', {
            accountId: account.provider_account_id,
            reporterUserId: account.reporter_user_id,
        });

        return account.provider_account_id;
    } catch (error: any) {
        logger.error('Error getting any reporter connected account', {
            error: error.message,
        });

        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Convert to retryable Temporal error
        throw ApplicationFailure.retryable(`Failed to get any connected account: ${error.message || 'Unknown error'}`, 'GetAnyConnectedAccountError');
    }
}

/**
 * Find or create reporter lead
 * Throws ApplicationFailure.retryable() on errors to allow Temporal retries
 * This activity is idempotent - same userId + linkedinUrl always returns same lead
 */
export async function findOrCreateReporterLead(userId: string, linkedinUrl: string): Promise<string> {
    try {
        logger.info('Finding or creating reporter lead', { userId, linkedinUrl });

        const leadService = new ReporterLeadService();
        const lead = await leadService.findOrCreateLead(userId, linkedinUrl);

        logger.info('Reporter lead found or created', {
            userId,
            linkedinUrl,
            leadId: lead.id,
        });

        return lead.id;
    } catch (error: any) {
        logger.error('Error finding or creating reporter lead', {
            error: error.message,
            userId,
            linkedinUrl,
        });

        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Convert to retryable Temporal error
        throw ApplicationFailure.retryable(`Failed to find or create lead: ${error.message || 'Unknown error'}`, 'FindOrCreateLeadError');
    }
}

/**
 * Get reporter lead details by leadId
 * Throws ApplicationFailure.retryable() on errors to allow Temporal retries
 * This activity is idempotent - same leadId always returns same lead data
 */
export async function getReporterLeadById(leadId: string): Promise<{
    id: string;
    user_id: string;
    linkedin_url: string;
}> {
    try {
        logger.info('Getting reporter lead by ID', { leadId });

        const leadRepository = new ReporterLeadRepository();
        const lead = await leadRepository.findById(leadId);

        if (!lead) {
            throw ApplicationFailure.retryable(`Lead not found: ${leadId}`, 'LeadNotFound');
        }

        logger.info('Reporter lead retrieved', {
            leadId: lead.id,
            userId: lead.user_id,
            linkedinUrl: lead.linkedin_url,
        });

        return {
            id: lead.id,
            user_id: lead.user_id,
            linkedin_url: lead.linkedin_url,
        };
    } catch (error: any) {
        logger.error('Error getting reporter lead by ID', {
            error: error.message,
            leadId,
        });

        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Convert to retryable Temporal error
        throw ApplicationFailure.retryable(`Failed to get lead: ${error.message || 'Unknown error'}`, 'GetLeadError');
    }
}
