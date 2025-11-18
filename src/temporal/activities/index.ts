import { CampaignResponseDto, CampaignStatus, CampaignStepResponseDto, CreateCampaignStepDto, UpdateCampaignDto } from "../../dto/campaigns.dto";
import { LeadInsertDto, LeadListResponseDto, LeadUpdateDto } from "../../dto/leads.dto";
import { CampaignService } from "../../services/CampaignService";
import { ConnectedAccountService } from "../../services/ConnectedAccountService";
import { CsvLead, CsvParseResult, CsvService } from "../../services/CsvService";
import { LeadListService } from "../../services/LeadListService";
import { LeadService } from "../../services/LeadService";
import { UnipileError, UnipileService } from "../../services/UnipileService";
import { EWorkflowNodeType, WorkflowJson, WorkflowNodeConfig } from "../../types/workflow.types";
import logger from "../../utils/logger";
import { ActivityResult } from "../workflows/leadWorkflow";
import { NotFoundError } from "../../errors/AppError";
import env from "../../config/env";

export async function testActivity(input: { message: string; delay?: number }): Promise<{ success: boolean; data: any; timestamp: string }> {
    logger.info('Test activity started', { input });

    // Simulate some work with optional delay
    if (input.delay && input.delay > 0) {
        logger.info(`Waiting for ${input.delay}ms`);
        await new Promise(resolve => setTimeout(resolve, input.delay));
    }

    const result = {
        success: true,
        data: {
            message: input.message,
            processedAt: new Date().toISOString(),
            workerId: process.env.TEMPORAL_WORKER_ID || 'unknown',
            environment: process.env.NODE_ENV || 'development'
        },
        timestamp: new Date().toISOString()
    };

    logger.info('Test activity completed', { result });
    return result;
}

export async function test(input: any): Promise<any> {
    return { success: true, data: { skipped: true, reason: 'Not implemented yet' } };
}

// Campaign Activities
export async function getCampaignById(campaignId: string) {
    logger.info('Getting campaign by ID', { campaignId });
    const campaignService = new CampaignService();
    const campaign = await campaignService.getCampaignById(campaignId);
    logger.info('Campaign retrieved', { campaignId, found: !!campaign });
    return campaign;
}

export async function getLeadListData(leadListId: string, organizationId: string): Promise<{ csvData: CsvParseResult, leadList: LeadListResponseDto }> {
    logger.info('Getting lead list data', { leadListId, organizationId });
    const leadListService = new LeadListService();
    const leadList = await leadListService.getLeadListDataById(leadListId, organizationId);
    logger.info('Lead list retrieved', { leadListId, leadsCount: leadList?.csvData?.data?.length || 0 });
    return leadList;
}

export async function entryLeadsIntoDb(leads: CsvLead[], organization_id: string, campaign_id: string) {
    const leadService = new LeadService();
    logger.info('Entering leads into database');
    await leads.chunked(5).forEachAsyncOneByOne(async chunk => {
        await chunk.forEachAsyncParallel(async lead => {
            const leadDto: LeadInsertDto = {
                first_name: lead.first_name,
                last_name: lead.last_name,
                full_name: lead.first_name + " " + lead.last_name,
                organization_id: organization_id,
                campaign_id: campaign_id,
                source: 'CSV',
                linkedin_url: lead.linkedin_url,
                company: lead.company,
                title: lead.title,
                phone: lead.phone
            }
            await leadService.createLead(leadDto);
        }
        )
    })
}

export async function getDBLeads(campaign_id: string) {
    const leadService = new LeadService();
    const leads = await leadService.getAllByCampaignId(campaign_id);
    return leads
}
export async function updateLead(leadId: string, data: LeadUpdateDto) {
    const leadService = new LeadService();
    const leads = await leadService.updateLead(leadId, data);
    return leads
}

export async function getWorkflowByCampaignId(campaign: CampaignResponseDto): Promise<WorkflowJson> {
    const campaignService = new CampaignService();
    const { workflowData } = await campaignService.getWorkflow(campaign);
    return workflowData
}

export async function verifyUnipileAccount(sender_account: string) {
    const unipileService = new UnipileService();
    const connectedAccountService = new ConnectedAccountService();
    const account = await connectedAccountService.getAccountById(sender_account);
    if (!account) {
        logger.error('Account not found', { sender_account });
        return null;
    }
    const unipileAccount = await unipileService.getOwnProfile(account.provider_account_id);
    if (!unipileAccount) {
        logger.error('Unipile Account not found', { sender_account });
        return null;
    }
    return account.provider_account_id;
}

// LINKEDIN ACTIONS
// These activities return ActivityResult to support conditional workflow paths

export async function profile_visit(accountId: string, identifier: string, campaignId: string): Promise<ActivityResult> {
    logger.info('profile_visit');
    console.log('identifier', identifier, 'accountId', accountId, 'campaignId', campaignId);
    const unipileService = new UnipileService();
    try {
        const result: any = await unipileService.visitLinkedInProfile({
            accountId: accountId,
            identifier: identifier,
            notify: false
        });
        const lead_data = {
            first_name: result?.first_name as string,
            last_name: result?.last_name as string,
            company: result?.work_experience?.[0]?.company ?? undefined
        };
        return { success: true, message: 'Profile visit completed', data: null, providerId: result?.provider_id, lead_data };
    } catch (error: any) {
        const errorBody = error as UnipileError;
        if(errorBody?.error?.body?.status === 422){
            logger.error('The Profile doesnt exist skipping', errorBody)
            return {
                success: false,
                message: 'Profile does not exist',
                data: {
                    error: {
                        type: 'profile_not_found',
                        message: 'The LinkedIn profile does not exist or is inaccessible',
                        statusCode: 422
                    }
                }
            };
        } else {
            logger.info('Unipile account not found', { accountId, identifier, campaignId })
            await pauseCampaign(campaignId)
            return {
                success: false,
                message: 'Unipile account not found',
                data: {
                    campaignPaused: true,
                    error: {
                        type: 'account_verification_failed',
                        message: error.message || 'Failed to verify Unipile account',
                        details: errorBody?.error?.body || {}
                    }
                }
            };
        }
    }

}

export async function like_post(accountId: string, identifier: string, config: WorkflowNodeConfig, campaignId: string): Promise<ActivityResult> {
    logger.info('like_post');
    const unipileService = new UnipileService();

    const leadAccount = await profile_visit(accountId, identifier, campaignId);

    console.log(leadAccount.providerId)
    if (!leadAccount.providerId) {
        return { success: false, message: 'Lead LinkedIn Urn not found' };
    }
    try {
        const result = await unipileService.likeLinkedInPost({
            accountId: accountId,
            linkedInUrn: leadAccount.providerId,
            lastDays: config?.recentPostDays || 7,
            reactionType: 'like'
        });
    } catch (error: any) {
        const errorBody = error as UnipileError;
        if(errorBody?.error?.body?.status === 422){
            logger.error('The Profile doesnt exist skipping | Posts are unreachable', errorBody)
            return {
                success: false,
                message: 'Posts are unreachable',
                data: {
                    error: {
                        type: 'posts_unreachable',
                        message: 'Unable to access or like posts on this profile',
                        statusCode: 422
                    }
                }
            };
        } else {
            logger.error('Error liking LinkedIn post', { error });
            await pauseCampaign(campaignId);
            return {
                success: false,
                message: 'Error liking LinkedIn post',
                data: {
                    campaignPaused: true,
                    error: {
                        type: 'like_post_failed',
                        message: error.message || 'Failed to like LinkedIn post',
                        details: errorBody?.error?.body || {}
                    }
                }
            };
        }
    }
    return { success: true, message: 'Post liked successfully' };
}

export async function comment_post(accountId: string, identifier: string, config: WorkflowNodeConfig, campaignId: string): Promise<ActivityResult> {
    logger.info('comment_post');
    const unipileService = new UnipileService();
    const leadAccount = await profile_visit(accountId, identifier, campaignId);
    if (!leadAccount.providerId) { return { success: false, message: 'Lead LinkedIn Urn not found' }; }
    try {
        const result = await unipileService.commentLinkedInPost({
            accountId: accountId,
            linkedInUrn: leadAccount.providerId,
            config: config
        });
        return { success: true, message: 'Comment posted successfully' };
    } catch (error: any) {
        const errorBody = error as UnipileError;
        if (errorBody?.error?.body?.status === 422) {
            logger.error('Profile doesnt exist or posts unreachable, skipping', errorBody);
            return {
                success: false,
                message: 'Profile doesnt exist or posts unreachable',
                data: {
                    error: {
                        type: 'comment_post_unreachable',
                        message: 'Unable to access or comment on posts for this profile',
                        statusCode: 422
                    }
                }
            };
        } else {
            logger.error('Error commenting on LinkedIn post', { error });
            await pauseCampaign(campaignId);
            return {
                success: false,
                message: 'Error commenting on LinkedIn post',
                data: {
                    campaignPaused: true,
                    error: {
                        type: 'comment_post_failed',
                        message: error.message || 'Failed to comment on LinkedIn post',
                        details: errorBody?.error?.body || {}
                    }
                }
            };
        }
    }
}

export async function send_followup(accountId: string, identifier: string, config: WorkflowNodeConfig, campaignId: string, leadData?: { first_name?: string | null; last_name?: string | null; company?: string | null }): Promise<ActivityResult> {
    logger.info('send_followup');
    const unipileService = new UnipileService();
    const leadAccount = await profile_visit(accountId, identifier, campaignId);
    if (!leadAccount.providerId) { return { success: false, message: 'Lead LinkedIn Urn not found', data: leadAccount }; }

    // Prepare template data from lead data - only first_name, last_name, and company
    const templateData = {
        first_name: leadData?.first_name || '',
        last_name: leadData?.last_name || '',
        company: leadData?.company || ''
    };

    try {
        const result = await unipileService.sendFollowUp({
            accountId: accountId,
            linkedInUrn: leadAccount.providerId,
            config: config,
            templateData: templateData
        });
        return { success: true, message: 'Follow-up message sent', data: result};
    } catch (error: any) {
        const errorBody = error as UnipileError;
        if (errorBody?.error?.body?.status === 422) {
            logger.error('Profile doesnt exist or posts unreachable, skipping', errorBody);
            return {
                success: false,
                message: 'Profile doesnt exist or posts unreachable',
                data: {
                    error: {
                        type: 'comment_post_unreachable',
                        message: 'Unable to access or comment on posts for this profile',
                        statusCode: 422
                    }
                }
            };
        }
    }
    // FOR NOW JUST LOG THE THINGS, WE NEED TO ADD UNIPILE FUNCTIONALITY
    return { success: true, message: 'Follow-up message sent' };
}

export async function send_inmail(): Promise<ActivityResult> {
    logger.info('send_inmail');
    // FOR NOW JUST LOG THE THINGS, WE NEED TO ADD UNIPILE FUNCTIONALITY
    return { success: true, message: 'InMail sent successfully' };
}

export async function withdraw_request(accountId: string, identifier: string, campaignId: string): Promise<ActivityResult> {
    logger.info('withdraw_request', { accountId, identifier });
    const unipileService = new UnipileService();
    try {
        const { providerId } = await profile_visit(accountId, identifier, campaignId);
        if (!providerId) {
            return { success: false, message: 'Provider ID not found' };
        }
        await unipileService.withdrawLinkedInInvitationRequest({ accountId, providerId });
        return { success: true, message: 'Request withdrawn' };
    } catch (error: any) {
        const errorBody = error as UnipileError;
        if (errorBody?.error?.body?.status === 422) {
            logger.error('Invitation not found or already withdrawn, skipping', errorBody);
            return {
                success: false,
                message: 'Invitation not found or already withdrawn',
                data: {
                    error: {
                        type: 'invitation_not_found',
                        message: 'The invitation request does not exist or was already withdrawn',
                        statusCode: 422
                    }
                }
            };
        } else {
            logger.error('Error withdrawing request', { error, accountId, identifier });
            await pauseCampaign(campaignId);
            return {
                success: false,
                message: 'Failed to withdraw request',
                data: {
                    campaignPaused: true,
                    error: {
                        type: 'withdraw_request_failed',
                        message: error.message || 'Failed to withdraw connection request',
                        details: errorBody?.error?.body || {}
                    }
                }
            };
        }
    }
}

export async function isConnected(accountId: string, identifier: string, campaignId: string): Promise<ActivityResult> {
    logger.info('isConnected', { accountId, identifier });
    const unipileService = new UnipileService();
    try {
        const result = await unipileService.isConnected({ accountId, identifier });
        return { success: true, message: 'Connection status checked', data: { connected: result } };
    } catch (error: any) {
        const errorBody = error as UnipileError;
        if (errorBody?.error?.body?.status === 422) {
            logger.error('Profile not found, skipping', errorBody);
            return {
                success: false,
                message: 'Profile not found',
                data: {
                    error: {
                        type: 'profile_not_found',
                        message: 'Profile not found while checking connection status',
                        statusCode: 422
                    }
                }
            };
        } else {
            logger.error('Error checking connection status', { error });
            await pauseCampaign(campaignId);
            return {
                success: false,
                message: 'Error checking connection status',
                data: {
                    campaignPaused: true,
                    error: {
                        type: 'connection_check_failed',
                        message: error.message || 'Failed to check connection status',
                        details: errorBody?.error?.body || {}
                    }
                }
            };
        }
    }
}

export async function send_connection_request(accountId: string, identifier: string, config: WorkflowNodeConfig, campaignId: string): Promise<ActivityResult> {
    logger.info('send_connection_request - Starting', { accountId, identifier, campaignId });
    const unipileService = new UnipileService();

    // Get provider ID from profile visit
    let providerId: string | undefined;
    try {
        const profileVisitResult = await profile_visit(accountId, identifier, campaignId);
        providerId = profileVisitResult.providerId;

        if (!providerId) {
            logger.error('Provider ID not found after profile visit', {
                accountId,
                identifier,
                campaignId,
                profileVisitResult
            });
            return {
                success: false,
                message: 'Provider ID not found',
                data: {
                    error: {
                        type: 'provider_id_not_found',
                        message: 'Failed to extract provider ID from LinkedIn profile',
                        accountId,
                        identifier
                    }
                }
            };
        }

        logger.info('Profile visit successful, provider ID extracted', {
            accountId,
            identifier,
            providerId
        });
    } catch (error: any) {
        const errorBody = error as UnipileError;
        logger.error('Failed to visit profile before sending connection request', {
            accountId,
            identifier,
            campaignId,
            error: error.message,
            errorStack: error.stack,
            errorBody: errorBody?.error?.body,
            errorStatus: errorBody?.error?.body?.status,
            errorType: errorBody?.error?.body?.type,
            errorDetail: errorBody?.error?.body?.detail
        });
        return {
            success: false,
            message: 'Failed to visit profile before sending connection request',
            data: {
                error: {
                    type: 'profile_visit_failed',
                    message: error.message || 'Failed to visit LinkedIn profile',
                    details: errorBody?.error?.body || {}
                }
            }
        };
    }

    try {
        // Check if already connected
        let alreadyConnected = false;
        try {
            alreadyConnected = await unipileService.isConnected({ accountId, identifier });
            logger.info('Connection status checked', {
                accountId,
                identifier,
                providerId,
                alreadyConnected
            });
        } catch (error: any) {
            const errorBody = error as UnipileError;
            logger.error('Failed to check if user is already connected', {
                accountId,
                identifier,
                providerId,
                campaignId,
                error: error.message,
                errorStack: error.stack,
                errorBody: errorBody?.error?.body,
                errorStatus: errorBody?.error?.body?.status
            });
            // Continue with sending request even if connection check fails
        }

        if (alreadyConnected) {
            logger.info('User already connected, skipping connection request', {
                accountId,
                identifier,
                providerId
            });
            return {
                success: true,
                message: 'User is already connected',
                data: { connected: true, alreadyConnected: true, providerId }
            };
        }

        // Send connection request
        logger.info('Sending connection request', {
            accountId,
            identifier,
            providerId,
            campaignId,
            config: {
                useAI: config?.useAI,
                customMessage: config?.customMessage ? '***custom message provided***' : undefined
            }
        });

        let invitationResult: any;
        try {
            invitationResult = await unipileService.sendLinkedInInvitation({
                accountId: accountId,
                providerId: providerId,
                config: config
            });

            logger.info('Connection request sent successfully', {
                accountId,
                identifier,
                providerId,
                campaignId,
                invitationResult: invitationResult ? 'received' : 'null'
            });
        } catch (invitationError: any) {
            const invitationErrorBody = invitationError as UnipileError;
            logger.error('Failed to send LinkedIn invitation', {
                accountId,
                identifier,
                providerId,
                campaignId,
                error: invitationError.message,
                errorStack: invitationError.stack,
                errorBody: invitationErrorBody?.error?.body,
                errorStatus: invitationErrorBody?.error?.body?.status,
                errorType: invitationErrorBody?.error?.body?.type,
                errorDetail: invitationErrorBody?.error?.body?.detail,
                fullError: invitationError
            });
            throw invitationError; // Re-throw to be caught by outer catch
        }

        // Increment connection request counters for the campaign
        try {
            const campaignService = new CampaignService();
            const campaign = await campaignService.getCampaignById(campaignId);
            if (campaign) {
                const currentDayCount = (campaign.requests_sent_this_day ?? 0) + 1;
                const currentWeekCount = (campaign.requests_sent_this_week ?? 0) + 1;

                await campaignService.updateCampaign(campaignId, {
                    requests_sent_this_day: currentDayCount,
                    requests_sent_this_week: currentWeekCount
                } as UpdateCampaignDto);

                logger.info('Campaign connection request counters incremented', {
                    campaignId,
                    dailyCount: currentDayCount,
                    weeklyCount: currentWeekCount,
                    previousDailyCount: campaign.requests_sent_this_day,
                    previousWeeklyCount: campaign.requests_sent_this_week
                });
            } else {
                logger.warn('Campaign not found when updating connection request counters', {
                    campaignId
                });
            }
        } catch (counterError: any) {
            logger.error('Failed to increment campaign connection request counters', {
                accountId,
                identifier,
                providerId,
                campaignId,
                error: counterError.message,
                errorStack: counterError.stack,
                errorType: counterError.constructor?.name
            });
            // Don't fail the request if counter update fails
        }

        return {
            success: true,
            message: 'Connection request sent',
            data: { providerId, invitationSent: true }
        };
    } catch (error: any) {
        const errorBody = error as UnipileError;
        // Handle different error structures - SDK might throw error.body directly or nested
        const errorStatus = errorBody?.error?.body?.status || error?.body?.status || error?.status;
        const errorType = errorBody?.error?.body?.type || error?.body?.type || error?.type;
        const errorDetail = errorBody?.error?.body?.detail || error?.body?.detail || error?.detail;

        if (errorStatus === 422) {
            // Check for specific "cannot_resend_yet" error that requires 24-hour wait
            // Handle both "errors/cannot_resend_yet" and "cannot_resend_yet" formats
            if (errorType === 'errors/cannot_resend_yet' || errorType === 'cannot_resend_yet') {
                logger.warn('LinkedIn provider limit reached - need to wait 24 hours before retry', {
                    accountId,
                    identifier,
                    providerId,
                    campaignId,
                    errorStatus,
                    errorType,
                    errorDetail,
                    errorMessage: error.message,
                    errorBody: errorBody?.error?.body
                });
                return {
                    success: false,
                    message: 'Temporary provider limit reached - will retry after 24 hours',
                    data: {
                        error: {
                            type: 'provider_limit_reached',
                            message: errorDetail || 'You have reached a temporary provider limit. Please try again later.',
                            statusCode: 422,
                            errorType: errorType,
                            retryAfterHours: 24,
                            shouldRetry: true
                        }
                    }
                };
            }

            logger.error('Cannot send connection request - validation error (422)', {
                accountId,
                identifier,
                providerId,
                campaignId,
                errorStatus,
                errorType,
                errorDetail,
                errorMessage: error.message,
                errorBody: errorBody?.error?.body,
                fullError: error
            });
            return {
                success: false,
                message: 'Cannot send connection request - profile issue or already pending',
                data: {
                    error: {
                        type: 'connection_request_rejected',
                        message: errorDetail || 'Cannot send connection request at this time',
                        statusCode: 422,
                        errorType: errorType || 'unknown'
                    }
                }
            };
        } else if (errorStatus === 429) {
            logger.error('Cannot send connection request - rate limit exceeded (429)', {
                accountId,
                identifier,
                providerId,
                campaignId,
                errorStatus,
                errorType,
                errorDetail,
                errorMessage: error.message,
                errorBody: errorBody?.error?.body
            });
            await pauseCampaign(campaignId);
            return {
                success: false,
                message: 'Rate limit exceeded for connection requests',
                data: {
                    campaignPaused: true,
                    error: {
                        type: 'rate_limit_exceeded',
                        message: errorDetail || 'Too many connection requests sent',
                        statusCode: 429
                    }
                }
            };
        } else if (errorStatus === 401 || errorStatus === 403) {
            logger.error('Cannot send connection request - authentication/authorization error', {
                accountId,
                identifier,
                providerId,
                campaignId,
                errorStatus,
                errorType,
                errorDetail,
                errorMessage: error.message,
                errorBody: errorBody?.error?.body
            });
            await pauseCampaign(campaignId);
            return {
                success: false,
                message: 'Authentication failed for connection request',
                data: {
                    campaignPaused: true,
                    error: {
                        type: 'authentication_failed',
                        message: errorDetail || 'Account authentication failed',
                        statusCode: errorStatus
                    }
                }
            };
        } else {
            logger.error('Error sending connection request - unexpected error', {
                accountId,
                identifier,
                providerId,
                campaignId,
                errorStatus,
                errorType,
                errorDetail,
                errorMessage: error.message,
                errorStack: error.stack,
                errorBody: errorBody?.error?.body,
                fullError: error
            });
            await pauseCampaign(campaignId);
            return {
                success: false,
                message: 'Error sending connection request',
                data: {
                    campaignPaused: true,
                    error: {
                        type: 'send_connection_request_failed',
                        message: error.message || 'Failed to send connection request',
                        statusCode: errorStatus,
                        errorType: errorType,
                        details: errorBody?.error?.body || {}
                    }
                }
            };
        }
    }
}

export async function pauseCampaign(campaignId: string): Promise<void> {
    logger.info('pausing campaign', { campaignId });
    const campaignService = new CampaignService();
    const campaign = await campaignService.getCampaignById(campaignId);
    if (!campaign) {
        logger.error('Campaign not found for pausing', { campaignId });
        return;
    }
    await campaignService.updateCampaign(campaignId, {
        status: CampaignStatus.PAUSED
    } as UpdateCampaignDto)
    logger.info('Campaign paused successfully', { campaignId });
}

export async function isCampaignActive(campaignId: string): Promise<boolean> {
    const campaignService = new CampaignService();
    const campaign = await campaignService.getCampaignById(campaignId);
    if (!campaign) {
        return false;
    }
    return campaign.status !== 'PAUSED' && campaign.status !== 'COMPLETED' && campaign.status !== 'FAILED';
}

/**
 * Check if connection request limits have been exceeded for a campaign
 * Also handles resetting daily/weekly counters if needed
 */
export async function checkConnectionRequestLimits(campaignId: string): Promise<{
    canProceed: boolean;
    waitUntilMs?: number;
}> {
    const campaignService = new CampaignService();
    const campaign = await campaignService.getCampaignById(campaignId);
    if (!campaign) {
        return { canProceed: false };
    }

    const now = new Date();
    const dailyLimit = env.REQUESTS_PER_DAY;
    const weeklyLimit = env.REQUESTS_PER_WEEK;

    let requestsSentThisDay = campaign.requests_sent_this_day ?? 0;
    let requestsSentThisWeek = campaign.requests_sent_this_week ?? 0;
    const lastDailyReset = campaign.last_daily_requests_reset ? new Date(campaign.last_daily_requests_reset) : null;
    const lastWeeklyReset = campaign.last_weekly_requests_reset ? new Date(campaign.last_weekly_requests_reset) : null;

    const updateData: any = {};

    // Reset daily counter if needed
    if (!lastDailyReset || isNewDay(lastDailyReset, now)) {
        requestsSentThisDay = 0;
        updateData.requests_sent_this_day = 0;
        updateData.last_daily_requests_reset = now.toISOString();
    }

    // Reset weekly counter if needed
    if (!lastWeeklyReset || isNewWeek(lastWeeklyReset, now)) {
        requestsSentThisWeek = 0;
        updateData.requests_sent_this_week = 0;
        updateData.last_weekly_requests_reset = now.toISOString();
    }

    // Update campaign if counters were reset
    if (Object.keys(updateData).length > 0) {
        await campaignService.updateCampaign(campaignId, updateData as UpdateCampaignDto).catch(() => {});
    }

    // Check if limits are exceeded
    const dailyExceeded = requestsSentThisDay >= dailyLimit;
    const weeklyExceeded = requestsSentThisWeek >= weeklyLimit;

    if (dailyExceeded || weeklyExceeded) {
        const nextDailyReset = getNextDayReset(now);
        const nextWeeklyReset = getNextWeekReset(now);
        const waitUntilDaily = nextDailyReset.getTime() - now.getTime();
        const waitUntilWeekly = nextWeeklyReset.getTime() - now.getTime();

        // Wait for the longer duration if both exceeded, otherwise wait for the one that's exceeded
        const waitUntilMs = (dailyExceeded && weeklyExceeded)
            ? Math.max(waitUntilDaily, waitUntilWeekly)
            : (dailyExceeded ? waitUntilDaily : waitUntilWeekly);

        return { canProceed: false, waitUntilMs };
    }

    return { canProceed: true };
}

function isNewDay(lastReset: Date, now: Date): boolean {
    return now.toDateString() > lastReset.toDateString();
}

function isNewWeek(lastReset: Date, now: Date): boolean {
    const lastWeek = getWeekNumber(lastReset);
    const nowWeek = getWeekNumber(now);
    return now.getFullYear() > lastReset.getFullYear() || (now.getFullYear() === lastReset.getFullYear() && nowWeek > lastWeek);
}

function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getNextDayReset(now: Date): Date {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next;
}

function getNextWeekReset(now: Date): Date {
    const next = new Date(now);
    const daysUntilMonday = now.getDay() === 0 ? 1 : 8 - now.getDay();
    next.setDate(now.getDate() + daysUntilMonday);
    next.setHours(0, 0, 0, 0);
    return next;
}

export async function check_connection_status(accountId: string, identifier: string, providerId: string, campaignId: string): Promise<ActivityResult> {
    logger.info('check_connection_status - Starting', {
        accountId,
        identifier,
        providerId,
        campaignId
    });

    try {
        const unipileService = new UnipileService();

        // Check if connected (accepted)
        let connected = false;
        try {
            connected = await unipileService.isConnected({ accountId, identifier });
            logger.info('Connection status checked (isConnected)', {
                accountId,
                identifier,
                providerId,
                connected
            });
        } catch (error: any) {
            const errorBody = error as UnipileError;
            logger.error('Failed to check if user is connected', {
                accountId,
                identifier,
                providerId,
                campaignId,
                error: error.message,
                errorStack: error.stack,
                errorBody: errorBody?.error?.body,
                errorStatus: errorBody?.error?.body?.status,
                errorType: errorBody?.error?.body?.type
            });
            // Continue to check invitation status even if connection check fails
        }

        if (connected) {
            logger.info('User is CONNECTED (request accepted)', {
                accountId,
                identifier,
                providerId,
                campaignId
            });
            return {
                success: true,
                message: 'User is connected',
                data: { connected: true, status: 'accepted' }
            };
        }

        // Check if invitation still pending or was rejected
        let invitationStillExists = false;
        try {
            invitationStillExists = await unipileService.isInvitationPending({
                accountId,
                providerId
            });
            logger.info('Invitation status checked (isInvitationPending)', {
                accountId,
                identifier,
                providerId,
                invitationStillExists
            });
        } catch (error: any) {
            const errorBody = error as UnipileError;
            logger.error('Failed to check if invitation is pending', {
                accountId,
                identifier,
                providerId,
                campaignId,
                error: error.message,
                errorStack: error.stack,
                errorBody: errorBody?.error?.body,
                errorStatus: errorBody?.error?.body?.status,
                errorType: errorBody?.error?.body?.type
            });
            // If we can't check invitation status, assume it's still pending
            // This allows polling to continue
            invitationStillExists = true;
        }

        if (!invitationStillExists) {
            logger.warn('Invitation not found (request rejected)', {
                accountId,
                identifier,
                providerId,
                campaignId
            });
            return {
                success: false,
                message: 'Connection request was rejected',
                data: { connected: false, status: 'rejected' }
            };
        }

        // Still pending
        logger.info('Connection request still pending', {
            accountId,
            identifier,
            providerId,
            campaignId
        });
        return {
            success: false,
            message: 'Connection request still pending',
            data: { connected: false, status: 'pending' }
        };
    } catch (error: any) {
        const errorBody = error as UnipileError;
        const errorStatus = errorBody?.error?.body?.status;
        const errorType = errorBody?.error?.body?.type;
        const errorDetail = errorBody?.error?.body?.detail;

        if (errorStatus === 422) {
            logger.error('Profile not found while checking connection status (422)', {
                accountId,
                identifier,
                providerId,
                campaignId,
                errorStatus,
                errorType,
                errorDetail,
                errorMessage: error.message,
                errorBody: errorBody?.error?.body,
                fullError: error
            });
            return {
                success: false,
                message: 'Profile not found',
                data: {
                    connected: false,
                    status: 'error',
                    error: {
                        type: 'profile_not_found',
                        message: 'Profile not found during connection status check',
                        statusCode: 422,
                        errorType: errorType,
                        errorDetail: errorDetail
                    }
                }
            };
        } else if (errorStatus === 429) {
            logger.error('Rate limit exceeded while checking connection status (429)', {
                accountId,
                identifier,
                providerId,
                campaignId,
                errorStatus,
                errorType,
                errorDetail,
                errorMessage: error.message,
                errorBody: errorBody?.error?.body
            });
            // Don't pause campaign for rate limits during status checks - just return error
            return {
                success: false,
                message: 'Rate limit exceeded while checking connection status',
                data: {
                    connected: false,
                    status: 'error',
                    error: {
                        type: 'rate_limit_exceeded',
                        message: 'Too many status check requests',
                        statusCode: 429
                    }
                }
            };
        } else {
            logger.error('Error checking connection status - unexpected error', {
                accountId,
                identifier,
                providerId,
                campaignId,
                errorStatus,
                errorType,
                errorDetail,
                errorMessage: error.message,
                errorStack: error.stack,
                errorBody: errorBody?.error?.body,
                fullError: error
            });
            await pauseCampaign(campaignId);
            return {
                success: false,
                message: `Error checking connection status: ${error.message}`,
                data: {
                    campaignPaused: true,
                    error: {
                        type: 'check_connection_status_failed',
                        message: error.message || 'Failed to check connection status',
                        statusCode: errorStatus,
                        errorType: errorType,
                        details: errorBody?.error?.body || {}
                    }
                }
            };
        }
    }
}

export async function updateCampaignStep(
    campaignId: string,
    stepType: EWorkflowNodeType,
    config: WorkflowNodeConfig,
    success: boolean,
    results: Record<string, any>,
    stepIndex: number,
    organizationId: string,
    leadId: string
): Promise<ActivityResult> {
    logger.info('updateCampaignStep', { campaignId, stepType, success, stepIndex });

    try {
        const campaignService = new CampaignService();
        const campaign = await campaignService.getCampaignById(campaignId);
        const steps = await campaignService.getCampaignSteps(campaignId);

        if (!campaign) {
            logger.error('Campaign not found', { campaignId });
            return { success: false, message: 'Campaign not found' };
        }

        const step = steps.find((s: CampaignStepResponseDto) => s.step_index === stepIndex && s.lead_id === leadId);
        if (step) {
            logger.info('Step already exists for this lead', { stepId: step.id, stepIndex, leadId });
            return { success: true, message: 'Step already exists for this lead' };
        }

        // Create new step record - only store what exists
        const newStep: CreateCampaignStepDto = {
            lead_id: leadId,
            type: stepType,
            config: config || {},
            result: results || null,
            success: success,
            step_index: stepIndex,
            organization_id: organizationId,
            campaign_id: campaignId
        };

        await campaignService.createCampaignStep(newStep);
        logger.info('Campaign step updated successfully', {
            campaignId,
            stepType,
            success,
            stepIndex
        });

        return {
            success: true,
            message: 'Campaign step updated successfully',
            data: { stepIndex }
        };
    } catch (error: any) {
        logger.error('Error updating campaign step', {
            error: error.message,
            campaignId,
            stepIndex,
            stepType
        });
        return {
            success: false,
            message: `Failed to update campaign step: ${error.message}`
        };
    }
}

export function CheckNever(value: never): never {
    throw new Error(`Unhandled case: ${value}`)
}

export const isNullOrUndefined = (it: any) => it === null || it === undefined;

export async function extractLinkedInPublicIdentifier(url: string): Promise<string | null> {
    return CsvService.extractLinkedInPublicIdentifier(url);
}

/**
 * Check if current time is within the allowed time window
 * Returns the number of milliseconds to wait until the window opens, or 0 if already in window
 * Wait time is calculated in UTC milliseconds for use with Temporal sleep
 */
export async function checkTimeWindow(
    startTime: string | null | undefined,
    endTime: string | null | undefined,
    timezone: string | null | undefined
): Promise<{ inWindow: boolean; waitMs: number; currentTime: string }> {
    // If no time restrictions, always allow
    if (!startTime || !endTime) {
        return { inWindow: true, waitMs: 0, currentTime: new Date().toISOString() };
    }

    const now = new Date();
    const tz = timezone || 'UTC';

    // Parse start and end times (format: "HH:mm" or "HH:MM:SS")
    const parseTime = (timeStr: string): { hours: number; minutes: number; seconds: number } => {
        const parts = timeStr.split(':');
        return {
            hours: parseInt(parts[0], 10),
            minutes: parseInt(parts[1] || '0', 10),
            seconds: parseInt(parts[2] || '0', 10)
        };
    };

    const start = parseTime(startTime);
    const end = parseTime(endTime);

    // Get current date and time components in the specified timezone
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
    });

    const parts = dateFormatter.formatToParts(now);
    const currentYear = parseInt(parts.find(p => p.type === 'year')?.value || '0', 10);
    const currentMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0', 10) - 1; // Month is 0-indexed
    const currentDay = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);
    const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

    // Convert current time to minutes since midnight in timezone
    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = start.hours * 60 + start.minutes;
    const endMinutes = end.hours * 60 + end.minutes;

    // Helper function to get UTC time for a specific local time in the target timezone
    // Uses a trial-and-error approach with Intl.DateTimeFormat to find the correct UTC time
    const getUTCTimeForLocalTime = (year: number, month: number, day: number, hour: number, minute: number, second: number): number => {
        // Strategy: We'll create a candidate UTC time and check if it matches the desired local time
        // Start with a guess based on current timezone offset
        const currentTzTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
        const currentUTCTime = now.getTime();
        const currentOffset = currentUTCTime - currentTzTime.getTime();

        // Create a date representing the target local time
        // We'll treat it as UTC first, then adjust
        const targetLocalTime = new Date(Date.UTC(year, month, day, hour, minute, second));

        // Adjust by the current offset to get approximate UTC time
        let candidateUTC = targetLocalTime.getTime() - currentOffset;

        // Refine by checking what local time this UTC time represents
        // We'll do a few iterations to get closer
        for (let i = 0; i < 3; i++) {
            const candidateDate = new Date(candidateUTC);
            const candidateTzParts = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).formatToParts(candidateDate);

            const candidateYear = parseInt(candidateTzParts.find(p => p.type === 'year')?.value || '0', 10);
            const candidateMonth = parseInt(candidateTzParts.find(p => p.type === 'month')?.value || '0', 10) - 1;
            const candidateDay = parseInt(candidateTzParts.find(p => p.type === 'day')?.value || '0', 10);
            const candidateHour = parseInt(candidateTzParts.find(p => p.type === 'hour')?.value || '0', 10);
            const candidateMinute = parseInt(candidateTzParts.find(p => p.type === 'minute')?.value || '0', 10);

            // If we match, we're done
            if (candidateYear === year && candidateMonth === month && candidateDay === day &&
                candidateHour === hour && candidateMinute === minute) {
                break;
            }

            // Calculate difference and adjust
            const hourDiff = hour - candidateHour;
            const minuteDiff = minute - candidateMinute;
            const totalDiffMinutes = hourDiff * 60 + minuteDiff;
            candidateUTC += totalDiffMinutes * 60 * 1000;
        }

        return candidateUTC;
    };

    // Get today's start and end times in UTC (as milliseconds)
    const todayStartUTCMs = getUTCTimeForLocalTime(currentYear, currentMonth, currentDay, start.hours, start.minutes, start.seconds);
    const todayEndUTCMs = getUTCTimeForLocalTime(currentYear, currentMonth, currentDay, end.hours, end.minutes, end.seconds);

    // Get tomorrow's start time in UTC
    const tomorrowStartUTCMs = getUTCTimeForLocalTime(currentYear, currentMonth, currentDay + 1, start.hours, start.minutes, start.seconds);

    // Handle case where end time is before start time (spans midnight)
    if (endMinutes < startMinutes) {
        // Window spans midnight, so check if we're after start OR before end
        if (currentMinutes >= startMinutes || currentMinutes <= endMinutes) {
            return { inWindow: true, waitMs: 0, currentTime: now.toISOString() };
        } else {
            // We're between end and start, wait until start time
            // If we're past end time today, wait until start time tomorrow
            if (currentMinutes > endMinutes) {
                // Past end time, wait until start time tomorrow
                const waitMs = tomorrowStartUTCMs - now.getTime();
                return { inWindow: false, waitMs: Math.max(0, waitMs), currentTime: now.toISOString() };
            } else {
                // Before start time today
                const waitMs = todayStartUTCMs - now.getTime();
                return { inWindow: false, waitMs: Math.max(0, waitMs), currentTime: now.toISOString() };
            }
        }
    } else {
        // Normal case: start < end (same day)
        if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
            return { inWindow: true, waitMs: 0, currentTime: now.toISOString() };
        } else if (currentMinutes < startMinutes) {
            // Before start time today
            const waitMs = todayStartUTCMs - now.getTime();
            return { inWindow: false, waitMs: Math.max(0, waitMs), currentTime: now.toISOString() };
        } else {
            // After end time, wait until start time tomorrow
            const waitMs = tomorrowStartUTCMs - now.getTime();
            return { inWindow: false, waitMs: Math.max(0, waitMs), currentTime: now.toISOString() };
        }
    }
}