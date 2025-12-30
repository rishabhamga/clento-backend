// REPORTER LEAD MONITORING ACTIVITIES

import { ApplicationFailure } from '@temporalio/common';
import { ReporterLeadResponseDto, UpdateReporterLeadDto } from '../../dto/reporterDtos/leads.dto';
import { ReporterCompanyLeadResponseDto, UpdateReporterCompanyLeadDto } from '../../dto/reporterDtos/companies.dto';
import { ReporterLeadRepository } from '../../repositories/reporterRepositories/LeadRepository';
import { ReporterCompanyLeadRepository } from '../../repositories/reporterRepositories/CompanyRepository';
import { CsvService } from '../../services/CsvService';
import { ReporterConnectedAccountService } from '../../services/ReporterConnectedAccountService';
import { ReporterLeadService } from '../../services/ReporterLeadService';
import { ReporterCompanyLeadService } from '../../services/ReporterCompanyLeadService';
import { UnipileService } from '../../services/UnipileService';
import logger from '../../utils/logger';
import { isDeepStrictEqual } from 'node:util';
import { ReporterLeadAlertRepository } from '../../repositories/reporterRepositories/LeadAlertRepository';
import { EAlertPriority, CreateReporterLeadAlertDto } from '../../dto/reporterDtos/leadAlerts.dto';
import { deepStrictEqual } from 'node:assert';
import { UnipileClient } from 'unipile-node-sdk';
import { post } from 'axios';
import { ConnectedAccountRepository } from '../../repositories/ConnectedAccountRepository';
import { OpenAiManager } from '../../services/OpenAiManager';

/**
 * Fetch LinkedIn profile for a reporter lead
 * Throws ApplicationFailure.retryable() on errors to allow Temporal retries
 * This activity is idempotent - same accountId + linkedinUrl always returns same profile
 */
export async function fetchReporterLeadProfile(linkedinUrl: string): Promise<{ profile: any; posts: string[] | undefined }> {
    try {
        const unipileService = new UnipileService();

        const accountId = await getAnyReporterConnectedAccount();

        const identifier = CsvService.extractLinkedInPublicIdentifier(linkedinUrl);
        if (!identifier) {
            throw ApplicationFailure.retryable('Invalid LinkedIn URL format', 'InvalidLinkedInUrl');
        }

        const profile = await unipileService.getUserProfile(accountId, identifier);

        if (profile?.provider !== 'LINKEDIN') {
            throw ApplicationFailure.nonRetryable('Invalid Provider used');
        }
        const posts = await unipileService.getRecentPosts({ accountId, linkedInUrn: profile.provider_id, lastDays: 7, limit: 7, isCompany: false });
        const postIDs = posts?.sort((a, b) => new Date(b.parsed_datetime).getTime() - new Date(a.parsed_datetime).getTime()).map(it => it.id);

        if (!profile) {
            throw ApplicationFailure.retryable('Failed to fetch profile from Unipile', 'UnipileProfileFetchFailed');
        }

        return { profile, posts: postIDs };
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

const AddAlert = async (leadId: string, title: string, description: string, userId: string, priority: EAlertPriority) => {
    const alertRepository = new ReporterLeadAlertRepository();
    const alert = await alertRepository.create({ lead_id: leadId, title, description, reporter_user_id: userId, priority });
    return alert;
};

export async function updateLeadPost(leadId: string, isInitialFetch: boolean = false, userId: string, postId: string) {
    const leadRepository = new ReporterLeadRepository();
    const leadService = new ReporterLeadService();
    const openAiManager = new OpenAiManager();
    const currentLead = await leadRepository.findById(leadId);
    if (!currentLead) {
        logger.error('Lead not found when updating post', { leadId });
        return;
    }

    const lastPosts = currentLead.last_7_posts_ids || [];

    if (isInitialFetch) {
        // Always add postId to last_7_posts_ids (if not already present), no fetch needed
        if (!lastPosts.includes(postId)) {
            const updatedPosts = [postId, ...lastPosts].slice(0, 7);
            await leadService.updateLead(leadId, { last_7_posts_ids: updatedPosts, updated_at: new Date().toISOString() }, currentLead.user_id);
            logger.info('Initial fetch: post added to lead', { leadId, postId });
        } else {
            logger.info('Initial fetch: post already present, skipping', { leadId, postId });
        }
        return;
    }

    // Not initial fetch: check and fetch post if needed
    if (lastPosts.includes(postId)) {
        logger.info('Post already present in last_7_posts_ids, skipping', { leadId, postId });
        return;
    }
    const unipileService = new UnipileService();
    const accountId = await getAnyReporterConnectedAccount();
    const post = await unipileService.getPost({ accountId, postId });
    logger.info('New post detected, adding to last_7_posts_ids', { leadId, postId });
    //need to add Ai evaluation
    if (post) {
        const { summary, isCritical } = await openAiManager.summarize(post.text);

        if (isCritical) {
            await AddAlert(leadId, 'New Post By Lead', summary ?? 'AI failed to summarize the post', userId, EAlertPriority.HIGH);
        } else {
            await AddAlert(leadId, 'New Post By Lead', summary ?? 'AI failed to summarize the post', userId, EAlertPriority.LOW);
        }
    }
    const updatedPosts = [postId, ...lastPosts].slice(0, 7);
    await leadService.updateLead(leadId, { last_7_posts_ids: updatedPosts, updated_at: new Date().toISOString() }, currentLead.user_id);
    logger.info('Post added to lead', { leadId, postId, post });
}
export async function updateCompanyPost(leadId: string, isInitialFetch: boolean = false, userId: string, postId: string) {
    const companyLeadRepository = new ReporterCompanyLeadRepository();
    const companyLeadService = new ReporterCompanyLeadService();
    const openAiManager = new OpenAiManager();
    const currentLead = await companyLeadRepository.findById(leadId);
    if (!currentLead) {
        logger.error('Lead not found when updating post', { leadId });
        return;
    }

    const lastPosts = currentLead.last_7_posts_ids || [];

    if (isInitialFetch) {
        // Always add postId to last_7_posts_ids (if not already present), no fetch needed
        if (!lastPosts.includes(postId)) {
            const updatedPosts = [postId, ...lastPosts].slice(0, 7);
            await companyLeadService.updateCompany(leadId, { last_7_posts_ids: updatedPosts, updated_at: new Date().toISOString() }, currentLead.user_id);
            logger.info('Initial fetch: post added to Company', { leadId, postId });
        } else {
            logger.info('Initial fetch: post already present, skipping', { leadId, postId });
        }
        return;
    }

    // Not initial fetch: check and fetch post if needed
    if (lastPosts.includes(postId)) {
        logger.info('Post already present in last_7_posts_ids, skipping', { leadId, postId });
        return;
    }
    const unipileService = new UnipileService();
    const accountId = await getAnyReporterConnectedAccount();
    const post = await unipileService.getPost({ accountId, postId });
    logger.info('New post detected, adding to last_7_posts_ids', { leadId, postId });
    //need to add Ai evaluation
    if (post) {
        const { summary, isCritical } = await openAiManager.summarize(post.text);

        if (isCritical) {
            await AddAlert(leadId, 'New Post By Company', summary ?? 'AI failed to summarize the post', userId, EAlertPriority.HIGH);
        } else {
            await AddAlert(leadId, 'New Post By Company', summary ?? 'AI failed to summarize the post', userId, EAlertPriority.LOW);
        }
    }
    const updatedPosts = [postId, ...lastPosts].slice(0, 7);
    await companyLeadService.updateCompany(leadId, { last_7_posts_ids: updatedPosts, updated_at: new Date().toISOString() }, currentLead.user_id);
    logger.info('Post added to company', { leadId, postId, post });
}
export async function updateReporterLeadProfile(
    leadId: string,
    profileData: any,
    isInitialFetch: boolean = false,
    userId: string,
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

        function hasRealChange(prev: any, next: any) {
            if (prev === next) return false;
            if (prev == null && next == null) return false;
            return true;
        }

        if (hasRealChange(currentLead.full_name, fullName)) {
            changes.full_name = true;
        }
        if (hasRealChange(currentLead.profile_image_url, profileImageUrl)) {
            changes.profile_image_url = true;
        }
        if (hasRealChange(currentLead.headline, headline)) {
            changes.headline = true;
        }
        if (hasRealChange(currentLead.location, location)) {
            changes.location = true;
        }
        if (hasRealChange(currentLead.last_job_title, lastJobTitle)) {
            changes.last_job_title = true;
        }
        if (hasRealChange(currentLead.last_company_name, lastCompanyName)) {
            changes.last_company_name = true;
        }
        if (hasRealChange(currentLead.last_company_id, lastCompanyId)) {
            changes.last_company_id = true;
        }
        if (!isDeepStrictEqual(currentLead.last_experience, lastExperience) && !(currentLead.last_experience == null && lastExperience == null)) {
            changes.last_experience = true;
        }
        if (!isDeepStrictEqual(currentLead.last_education, lastEducation) && !(currentLead.last_education == null && lastEducation == null)) {
            changes.last_education = true;
        }
        if (hasRealChange(currentLead.last_profile_hash, profileHash)) {
            changes.last_profile_hash = true;
        }
        if (hasRealChange(currentLead.last_company_domain, lastCompanyDomain)) {
            changes.last_company_domain = true;
        }
        if (hasRealChange(currentLead.last_company_size, lastCompanySize)) {
            changes.last_company_size = true;
        }
        if (hasRealChange(currentLead.last_company_industry, lastCompanyIndustry)) {
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
        if (!isInitialFetch) {
            switch (true) {
                case changes.full_name === true:
                    await AddAlert(leadId, 'Full Name Changed', `Lead Full Name has changed from ${currentLead.full_name} to ${fullName}`, userId, EAlertPriority.MEDIUM);
                    break;
                case changes.profile_image_url === true:
                    await AddAlert(leadId, 'Profile Photo Changed', `Lead Profile Photo has changed from ${currentLead.profile_image_url} to ${profileImageUrl}`, userId, EAlertPriority.LOW);
                    break;
                case changes.headline === true:
                    await AddAlert(leadId, 'HeadLine Changed', `Lead HeadLine has changed from ${currentLead.headline} to ${headline}`, userId, EAlertPriority.MEDIUM);
                    break;
                case changes.location === true:
                    await AddAlert(leadId, 'Location Changed', `Lead Location has changed from ${currentLead.location} to ${location}`, userId, EAlertPriority.HIGH);
                    break;
                case changes.last_job_title === true:
                    await AddAlert(leadId, 'Job Title Changed', `Lead Job Title has changed from ${currentLead.last_job_title} to ${lastJobTitle}`, userId, EAlertPriority.HIGH);
                    break;
                case changes.last_company_name === true:
                    await AddAlert(leadId, 'Company Name Changed', `Lead Company Name has changed from ${currentLead.last_company_name} to ${lastCompanyName}`, userId, EAlertPriority.HIGH);
                    break;
                case changes.last_company_id === true:
                    await AddAlert(leadId, 'Company Id Changed', `Lead Company Id has changed from ${currentLead.last_company_id} to ${lastCompanyId} Check for company changes`, userId, EAlertPriority.HIGH);
                    break;
                case changes.last_experience === true:
                    await AddAlert(leadId, 'Experience Changed', `Lead Experience has changed`, userId, EAlertPriority.HIGH);
                    break;
                case changes.last_education === true:
                    await AddAlert(leadId, 'Education Changed', `Lead Education has changed from ${currentLead.last_education} to ${lastEducation}`, userId, EAlertPriority.LOW);
                    break;
                case changes.last_company_domain === true:
                    await AddAlert(leadId, 'Company Domain Changed', `Lead Company Domain has changed from ${currentLead.last_company_domain} to ${lastCompanyDomain}`, userId, EAlertPriority.MEDIUM);
                    break;
                case changes.last_company_size === true:
                    await AddAlert(leadId, 'Company Size Changed', `Lead Company Size has changed from ${currentLead.last_company_size} to ${lastCompanySize}`, userId, EAlertPriority.LOW);
                    break;
                case changes.last_company_industry === true:
                    await AddAlert(leadId, 'Company Industry Changed', `Lead Company Industry has changed from ${currentLead.last_company_industry} to ${lastCompanyIndustry}`, userId, EAlertPriority.LOW);
                    break;
            }
        }
        // ABHI KE LIYE NOT UPDATING KYUNKI NEED TO KEEP TRACK OF CHANGES AND THEN UPDATE
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

// REPORTER COMPANY MONITORING ACTIVITIES

/**
 * Fetch LinkedIn company profile for a reporter company
 * Throws ApplicationFailure.retryable() on errors to allow Temporal retries
 * This activity is idempotent - same accountId + linkedinUrl always returns same profile
 */
export async function fetchReporterCompanyProfile(linkedinUrl: string) {
    try {
        const unipileService = new UnipileService();

        const accountId = await getAnyReporterConnectedAccount();

        const identifier = CsvService.extractLinkedInCompanyIdentifier(linkedinUrl);
        if (!identifier) {
            throw ApplicationFailure.retryable('Invalid LinkedIn company URL format', 'InvalidLinkedInCompanyUrl');
        }

        const profile = await unipileService.getCompanyProfile(accountId, identifier);

        if (!profile) {
            throw ApplicationFailure.retryable('Failed to fetch company profile from Unipile', 'UnipileProfileFetchFailed');
        }

        const posts = await unipileService.getRecentPosts({ accountId, linkedInUrn: profile?.id, lastDays: 7, limit: 7, isCompany: true });
        const postIDs = posts?.sort((a, b) => new Date(b.parsed_datetime).getTime() - new Date(a.parsed_datetime).getTime()).map(it => it.id);

        if (!profile) {
            throw ApplicationFailure.retryable('Failed to fetch profile from Unipile', 'UnipileProfileFetchFailed');
        }

        return { profile, posts: postIDs };
    } catch (error: any) {
        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Convert to retryable Temporal error
        throw ApplicationFailure.retryable(`LinkedIn company profile fetch failed: ${error.message || 'Unknown error'}`, 'LinkedInCompanyProfileFetchError');
    }
}

/**
 * Update reporter company with profile data
 * Throws ApplicationFailure.retryable() on errors to allow Temporal retries
 * This activity is idempotent - multiple calls with same data produce same result
 */
export async function updateReporterCompanyProfile(
    companyId: string,
    profileData: any,
    isInitialFetch: boolean = false,
    userId: string,
): Promise<{
    company: any;
    changes: Partial<Record<keyof ReporterCompanyLeadResponseDto, boolean>>;
}> {
    try {
        logger.info('Updating reporter company with profile data', { companyId });

        const companyService = new ReporterCompanyLeadService();
        const companyRepository = new ReporterCompanyLeadRepository();

        // Get current company data
        const currentCompany = await companyRepository.findById(companyId);
        if (!currentCompany) {
            throw ApplicationFailure.retryable(`Company not found: ${companyId}`, 'CompanyNotFound');
        }

        // Extract company information using exact field names from Unipile API
        const name = profileData?.name || null;
        const tagline = profileData?.tagline || null;
        const description = profileData?.description || null;
        const website = profileData?.website || null;
        const industry = profileData?.industry || null;

        // Extract location from locations array (first location if available)
        const locations = profileData?.locations || [];
        const firstLocation = locations.length > 0 ? locations[0] : null;
        const hqCity = firstLocation?.city || null;
        const hqCountry = firstLocation?.country || null;
        const hqRegion = firstLocation?.region || null;

        // Extract logo URLs
        const logoUrl = profileData?.logo || null;
        const logoLargeUrl = profileData?.logo_large || null;

        // Extract employee count and range
        const employeeCountCurrent = profileData?.employee_count || null;
        const employeeRangeFrom = profileData?.employee_count_range?.from || null;
        const employeeRangeTo = profileData?.employee_count_range?.to || null;

        // Extract follower count
        const followersCountCurrent = profileData?.followers_count || null;

        // Calculate profile hash for change detection (idempotency)
        const profileHash = JSON.stringify({
            name,
            tagline,
            employeeCount: employeeCountCurrent,
            followersCount: followersCountCurrent,
            industry,
        });

        // Track changes

        let changes: Partial<Record<keyof ReporterCompanyLeadResponseDto, boolean>> = {};

        function hasRealChange(prev: any, next: any) {
            // Only true if values are different and not both null/undefined
            if (prev === next) return false;
            if (prev == null && next == null) return false;
            return true;
        }

        if (hasRealChange(currentCompany.name, name)) {
            changes.name = true;
        }
        if (hasRealChange(currentCompany.tagline, tagline)) {
            changes.tagline = true;
        }
        if (hasRealChange(currentCompany.description, description)) {
            changes.description = true;
        }
        if (hasRealChange(currentCompany.website, website)) {
            changes.website = true;
        }
        if (!isDeepStrictEqual(currentCompany.industry, industry) && !(currentCompany.industry == null && industry == null)) {
            changes.industry = true;
        }
        if (hasRealChange(currentCompany.hq_city, hqCity)) {
            changes.hq_city = true;
        }
        if (hasRealChange(currentCompany.hq_country, hqCountry)) {
            changes.hq_country = true;
        }
        if (hasRealChange(currentCompany.hq_region, hqRegion)) {
            changes.hq_region = true;
        }
        if (hasRealChange(currentCompany.logo_url, logoUrl)) {
            changes.logo_url = true;
        }
        if (hasRealChange(currentCompany.logo_large_url, logoLargeUrl)) {
            changes.logo_large_url = true;
        }

        // Employee count tracking
        const employeeCountChanged = hasRealChange(Number(currentCompany.employee_count_current), Number(employeeCountCurrent));
        if (employeeCountChanged) {
            changes.employee_count_current = true;
            changes.employee_count_previous = true;
        }
        if (hasRealChange(Number(currentCompany.employee_range_from), Number(employeeRangeFrom))) {
            changes.employee_range_from = true;
        }
        if (hasRealChange(Number(currentCompany.employee_range_to), Number(employeeRangeTo))) {
            changes.employee_range_to = true;
        }

        // Follower count tracking
        const followersCountChanged = hasRealChange(Number(currentCompany.followers_count_current), Number(followersCountCurrent));
        if (followersCountChanged) {
            changes.followers_count_current = true;
            changes.followers_count_previous = true;
        }

        if (hasRealChange(currentCompany.last_profile_hash, profileHash)) {
            changes.last_profile_hash = true;
        }

        // Prepare update data
        const updateData: UpdateReporterCompanyLeadDto = {
            name,
            tagline,
            description,
            website,
            industry: Array.isArray(industry) ? industry : industry ? [industry] : null,
            hq_city: hqCity,
            hq_country: hqCountry,
            hq_region: hqRegion,
            logo_url: logoUrl,
            logo_large_url: logoLargeUrl,
            employee_count_current: employeeCountCurrent,
            employee_count_previous: employeeCountChanged ? currentCompany.employee_count_current : currentCompany.employee_count_previous,
            employee_count_last_checked_at: employeeCountChanged ? new Date().toISOString() : currentCompany.employee_count_last_checked_at,
            employee_range_from: employeeRangeFrom,
            employee_range_to: employeeRangeTo,
            followers_count_current: followersCountCurrent,
            followers_count_previous: followersCountChanged ? currentCompany.followers_count_current : currentCompany.followers_count_previous,
            followers_count_last_checked_at: followersCountChanged ? new Date().toISOString() : currentCompany.followers_count_last_checked_at,
            last_profile_hash: profileHash,
            last_fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        if (!isInitialFetch) {
            switch (true) {
                case changes.name === true:
                    await AddAlert(currentCompany.id, 'Company Name Changed', `Company Name has changed from ${currentCompany.name} to ${name}`, userId, EAlertPriority.HIGH);
                case changes.tagline === true:
                    await AddAlert(currentCompany.id, 'Company Tagline Changed', `Company Tagline has changed from ${currentCompany.tagline} to ${tagline}`, userId, EAlertPriority.MEDIUM);
                case changes.description === true:
                    await AddAlert(currentCompany.id, 'Company Description Changed', `Company Description has changed from ${currentCompany.description} to ${description}`, userId, EAlertPriority.MEDIUM);
                case changes.website === true:
                    await AddAlert(currentCompany.id, 'Company Website Changed', `Company Website has changed from ${currentCompany.website} to ${website}`, userId, EAlertPriority.MEDIUM);
                case changes.industry === true:
                    await AddAlert(currentCompany.id, 'Company Industry Changed', `Company Industry has changed from ${currentCompany.industry} to ${industry}`, userId, EAlertPriority.HIGH);
                case changes.hq_city === true:
                    await AddAlert(currentCompany.id, 'Company HQ City Changed', `Company HQ City has changed from ${currentCompany.hq_city} to ${hqCity}`, userId, EAlertPriority.HIGH);
                case changes.hq_country === true:
                    await AddAlert(currentCompany.id, 'Company HQ Country Changed', `Company HQ Country has changed from ${currentCompany.hq_country} to ${hqCountry}`, userId, EAlertPriority.HIGH);
                case changes.hq_region === true:
                    await AddAlert(currentCompany.id, 'Company HQ Region Changed', `Company HQ Region has changed from ${currentCompany.hq_region} to ${hqRegion}`, userId, EAlertPriority.HIGH);
                case changes.logo_url === true:
                    await AddAlert(currentCompany.id, 'Company Logo Changed', `Company Logo has changed`, userId, EAlertPriority.LOW);
                case changes.logo_large_url === true:
                    await AddAlert(currentCompany.id, 'Company Logo Large Changed', `Company Logo Large has changed`, userId, EAlertPriority.LOW);
                case changes.employee_count_current === true:
                    await AddAlert(currentCompany.id, 'Company Employee Count Changed', `Company Employee Count has changed from ${currentCompany.employee_count_current} to ${employeeCountCurrent}`, userId, EAlertPriority.MEDIUM);
                case changes.employee_count_previous === true:
                    await AddAlert(currentCompany.id, 'Company Employee Count Previous Changed', `Company Employee Count Previous has changed from ${currentCompany.employee_count_previous} to ${employeeCountChanged ? currentCompany.employee_count_current : currentCompany.employee_count_previous}`, userId, EAlertPriority.MEDIUM);
                case changes.employee_range_from === true:
                    await AddAlert(currentCompany.id, 'Company Employee Range From Changed', `Company Employee Range From has changed from ${currentCompany.employee_range_from} to ${employeeRangeFrom}`, userId, EAlertPriority.MEDIUM);
                case changes.employee_range_to === true:
                    await AddAlert(currentCompany.id, 'Company Employee Range To Changed', `Company Employee Range To has changed from ${currentCompany.employee_range_to} to ${employeeRangeTo}`, userId, EAlertPriority.MEDIUM);
                case changes.followers_count_current === true:
                    await AddAlert(currentCompany.id, 'Company Followers Count Changed', `Company Followers Count has changed from ${currentCompany.followers_count_current} to ${followersCountCurrent}`, userId, EAlertPriority.LOW);
                case changes.followers_count_previous === true:
                    await AddAlert(currentCompany.id, 'Company Followers Count Previous Changed', `Company Followers Count Previous has changed from ${currentCompany.followers_count_previous} to ${followersCountChanged ? currentCompany.followers_count_current : currentCompany.followers_count_previous}`, userId, EAlertPriority.LOW);
            }
        }

        // Update company (idempotent operation)
        const updatedCompany = await companyService.updateCompany(companyId, updateData, currentCompany.user_id);

        return {
            company: updatedCompany,
            changes,
        };
    } catch (error: any) {
        logger.error('Error updating reporter company profile', {
            error: error.message,
            companyId,
        });

        if (error instanceof ApplicationFailure) {
            throw error;
        }

        throw ApplicationFailure.retryable(`Failed to update company profile: ${error.message || 'Unknown error'}`, 'UpdateCompanyProfileError');
    }
}

/**
 * Get reporter company details by companyId
 * Throws ApplicationFailure.retryable() on errors to allow Temporal retries
 * This activity is idempotent - same companyId always returns same company data
 */
export async function getReporterCompanyById(companyId: string): Promise<{
    id: string;
    user_id: string;
    linkedin_url: string;
}> {
    try {
        logger.info('Getting reporter company by ID', { companyId });

        const companyRepository = new ReporterCompanyLeadRepository();
        const company = await companyRepository.findById(companyId);

        if (!company) {
            throw ApplicationFailure.retryable(`Company not found: ${companyId}`, 'CompanyNotFound');
        }

        logger.info('Reporter company retrieved', {
            companyId: company.id,
            userId: company.user_id,
            linkedinUrl: company.linkedin_url,
        });

        return {
            id: company.id,
            user_id: company.user_id,
            linkedin_url: company.linkedin_url,
        };
    } catch (error: any) {
        logger.error('Error getting reporter company by ID', {
            error: error.message,
            companyId,
        });

        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        throw ApplicationFailure.retryable(`Failed to get company: ${error.message || 'Unknown error'}`, 'GetCompanyError');
    }
}
