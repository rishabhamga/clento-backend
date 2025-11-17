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
    logger.info('send_connection_request - Starting');
    const unipileService = new UnipileService();

    // Get provider ID from profile visit
    const { providerId } = await profile_visit(accountId, identifier, campaignId);
    if (!providerId) {
        return { success: false, message: 'Provider ID not found' };
    }

    try {
        // Check if already connected
        const alreadyConnected = await unipileService.isConnected({ accountId, identifier });
        if (alreadyConnected) {
            logger.info('User already connected', { accountId, identifier });
            return {
                success: true,
                message: 'User is already connected',
                data: { connected: true, alreadyConnected: true, providerId }
            };
        }

        // Send connection request
        logger.info('Sending connection request', { accountId, identifier, providerId });
        const invitationResult = await unipileService.sendLinkedInInvitation({
            accountId: accountId,
            providerId: providerId,
            config: config
        });

        console.log(invitationResult);

        logger.info('Connection request sent successfully', {
            accountId,
            identifier,
            providerId
        });

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
                    weeklyCount: currentWeekCount
                });
            }
        } catch (error) {
            logger.error('Failed to increment campaign connection request counters', {
                error,
                campaignId
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
        if (errorBody?.error?.body?.status === 422) {
            logger.error('Cannot send connection request - profile issue or already pending, skipping', errorBody);
            return {
                success: false,
                message: 'Cannot send connection request - profile issue or already pending',
                data: {
                    error: {
                        type: 'connection_request_rejected',
                        message: errorBody?.error?.body?.detail || 'Cannot send connection request at this time',
                        statusCode: 422,
                        errorType: errorBody?.error?.body?.type || 'unknown'
                    }
                }
            };
        } else {
            logger.error('Error sending connection request', { error });
            await pauseCampaign(campaignId);
            return {
                success: false,
                message: 'Error sending connection request',
                data: {
                    campaignPaused: true,
                    error: {
                        type: 'send_connection_request_failed',
                        message: error.message || 'Failed to send connection request',
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
 * @param campaignId - The campaign ID to check limits for
 * @returns Object with canProceed boolean and details about limits, including wait time until next reset
 */
export async function checkConnectionRequestLimits(campaignId: string): Promise<{
    canProceed: boolean;
    reason?: string;
    dailyCount?: number;
    weeklyCount?: number;
    dailyLimit?: number;
    weeklyLimit?: number;
    waitUntilMs?: number;
    nextResetTime?: string;
}> {
    logger.info('Checking connection request limits', { campaignId });

    const campaignService = new CampaignService();
    const campaign = await campaignService.getCampaignById(campaignId);

    if (!campaign) {
        logger.error('Campaign not found for limit check', { campaignId });
        return {
            canProceed: false,
            reason: 'Campaign not found'
        };
    }

    const now = new Date();
    const dailyLimit = env.REQUESTS_PER_DAY;
    const weeklyLimit = env.REQUESTS_PER_WEEK;

    let requestsSentThisDay = campaign.requests_sent_this_day ?? 0;
    let requestsSentThisWeek = campaign.requests_sent_this_week ?? 0;
    let lastDailyReset = campaign.last_daily_requests_reset ? new Date(campaign.last_daily_requests_reset) : null;
    let lastWeeklyReset = campaign.last_weekly_requests_reset ? new Date(campaign.last_weekly_requests_reset) : null;

    let needsUpdate = false;
    const updateData: any = {};

    // Check if daily counter needs to be reset
    if (!lastDailyReset || isNewDay(lastDailyReset, now)) {
        logger.info('Resetting daily connection request counter', {
            campaignId,
            previousCount: requestsSentThisDay,
            lastReset: lastDailyReset?.toISOString()
        });
        requestsSentThisDay = 0;
        updateData.requests_sent_this_day = 0;
        updateData.last_daily_requests_reset = now.toISOString();
        needsUpdate = true;
    }

    // Check if weekly counter needs to be reset
    if (!lastWeeklyReset || isNewWeek(lastWeeklyReset, now)) {
        logger.info('Resetting weekly connection request counter', {
            campaignId,
            previousCount: requestsSentThisWeek,
            lastReset: lastWeeklyReset?.toISOString()
        });
        requestsSentThisWeek = 0;
        updateData.requests_sent_this_week = 0;
        updateData.last_weekly_requests_reset = now.toISOString();
        needsUpdate = true;
    }

    // Update campaign if counters were reset
    if (needsUpdate) {
        try {
            await campaignService.updateCampaign(campaignId, updateData as UpdateCampaignDto);
            logger.info('Campaign limits reset successfully', { campaignId, updateData });
        } catch (error) {
            logger.error('Failed to update campaign limits', { error, campaignId, updateData });
            // Continue with check even if update fails
        }
    }

    // Check if limits are exceeded
    const dailyExceeded = requestsSentThisDay >= dailyLimit;
    const weeklyExceeded = requestsSentThisWeek >= weeklyLimit;

    if (dailyExceeded || weeklyExceeded) {
        // Calculate wait time until next reset
        // If both are exceeded, wait for whichever is longer
        const nextDailyReset = getNextDayReset(now);
        const nextWeeklyReset = getNextWeekReset(now);
        const waitUntilDaily = nextDailyReset.getTime() - now.getTime();
        const waitUntilWeekly = nextWeeklyReset.getTime() - now.getTime();

        // Wait for the longer of the two if both are exceeded, otherwise wait for the one that's exceeded
        let waitUntilMs: number;
        let nextResetTime: Date;
        let reason: string;

        if (dailyExceeded && weeklyExceeded) {
            // Both exceeded - wait for whichever is longer
            if (waitUntilWeekly > waitUntilDaily) {
                waitUntilMs = waitUntilWeekly;
                nextResetTime = nextWeeklyReset;
                reason = `Both daily (${requestsSentThisDay}/${dailyLimit}) and weekly (${requestsSentThisWeek}/${weeklyLimit}) limits exceeded. Waiting for weekly reset.`;
            } else {
                waitUntilMs = waitUntilDaily;
                nextResetTime = nextDailyReset;
                reason = `Both daily (${requestsSentThisDay}/${dailyLimit}) and weekly (${requestsSentThisWeek}/${weeklyLimit}) limits exceeded. Waiting for daily reset.`;
            }
        } else if (dailyExceeded) {
            waitUntilMs = waitUntilDaily;
            nextResetTime = nextDailyReset;
            reason = `Daily limit exceeded: ${requestsSentThisDay}/${dailyLimit}`;
        } else {
            // weeklyExceeded
            waitUntilMs = waitUntilWeekly;
            nextResetTime = nextWeeklyReset;
            reason = `Weekly limit exceeded: ${requestsSentThisWeek}/${weeklyLimit}`;
        }

        logger.warn('Connection request limit exceeded, calculating wait time', {
            campaignId,
            dailyCount: requestsSentThisDay,
            weeklyCount: requestsSentThisWeek,
            dailyLimit,
            weeklyLimit,
            dailyExceeded,
            weeklyExceeded,
            waitUntilMs,
            waitUntilHours: waitUntilMs / (1000 * 60 * 60),
            nextResetTime: nextResetTime.toISOString()
        });

        return {
            canProceed: false,
            reason,
            dailyCount: requestsSentThisDay,
            weeklyCount: requestsSentThisWeek,
            dailyLimit,
            weeklyLimit,
            waitUntilMs,
            nextResetTime: nextResetTime.toISOString()
        };
    }

    logger.info('Connection request limits check passed', {
        campaignId,
        dailyCount: requestsSentThisDay,
        weeklyCount: requestsSentThisWeek,
        dailyLimit,
        weeklyLimit,
        dailyRemaining: dailyLimit - requestsSentThisDay,
        weeklyRemaining: weeklyLimit - requestsSentThisWeek
    });

    return {
        canProceed: true,
        dailyCount: requestsSentThisDay,
        weeklyCount: requestsSentThisWeek,
        dailyLimit,
        weeklyLimit
    };
}

/**
 * Check if a new day has started since the last reset
 */
function isNewDay(lastReset: Date, now: Date): boolean {
    const lastResetDate = new Date(lastReset.getFullYear(), lastReset.getMonth(), lastReset.getDate());
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return nowDate > lastResetDate;
}

/**
 * Check if a new week has started since the last reset
 * Week starts on Monday (ISO week)
 */
function isNewWeek(lastReset: Date, now: Date): boolean {
    const lastResetWeek = getWeekNumber(lastReset);
    const nowWeek = getWeekNumber(now);
    const lastResetYear = lastReset.getFullYear();
    const nowYear = now.getFullYear();

    return nowYear > lastResetYear || (nowYear === lastResetYear && nowWeek > lastResetWeek);
}

/**
 * Get ISO week number for a date
 */
function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get the next day reset time (start of next day)
 */
function getNextDayReset(now: Date): Date {
    const nextDay = new Date(now);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);
    return nextDay;
}

/**
 * Get the next week reset time (start of next Monday)
 */
function getNextWeekReset(now: Date): Date {
    const nextMonday = new Date(now);
    const dayOfWeek = now.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
}

export async function check_connection_status(accountId: string, identifier: string, providerId: string, campaignId: string): Promise<ActivityResult> {
    logger.info('check_connection_status', { accountId, identifier, providerId });
    try {
        const unipileService = new UnipileService();

        // Check if connected (accepted)
        const connected = await unipileService.isConnected({ accountId, identifier });
        if (connected) {
            logger.info('User is CONNECTED (request accepted)', { accountId, identifier });
            return {
                success: true,
                message: 'User is connected',
                data: { connected: true, status: 'accepted' }
            };
        }

        // Check if invitation still pending or was rejected
        const invitationStillExists = await unipileService.isInvitationPending({
            accountId,
            providerId
        });

        if (!invitationStillExists) {
            logger.warn('Invitation not found (request rejected)', { accountId, identifier, providerId });
            return {
                success: false,
                message: 'Connection request was rejected',
                data: { connected: false, status: 'rejected' }
            };
        }

        // Still pending
        logger.info('Connection request still pending', { accountId, identifier });
        return {
            success: false,
            message: 'Connection request still pending',
            data: { connected: false, status: 'pending' }
        };
    } catch (error: any) {
        const errorBody = error as UnipileError;
        if (errorBody?.error?.body?.status === 422) {
            logger.error('Profile not found while checking connection, skipping', errorBody);
            return {
                success: false,
                message: 'Profile not found',
                data: {
                    connected: false,
                    status: 'error',
                    error: {
                        type: 'profile_not_found',
                        message: 'Profile not found during connection status check',
                        statusCode: 422
                    }
                }
            };
        } else {
            logger.error('Error checking connection status', { error: error.message, accountId, identifier });
            await pauseCampaign(campaignId);
            return {
                success: false,
                message: `Error checking connection status: ${error.message}`,
                data: {
                    campaignPaused: true,
                    error: {
                        type: 'check_connection_status_failed',
                        message: error.message || 'Failed to check connection status',
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