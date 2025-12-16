import { ApplicationFailure } from '@temporalio/common';
import env from '../../config/env';
import { CampaignResponseDto, CampaignStatus, CampaignStepResponseDto, CreateCampaignStepDto, UpdateCampaignDto } from '../../dto/campaigns.dto';
import { LeadInsertDto, LeadListResponseDto, LeadUpdateDto } from '../../dto/leads.dto';
import { LeadRepository } from '../../repositories/LeadRepository';
import { WebhookRepository } from '../../repositories/WebhookRepository';
import { CampaignService } from '../../services/CampaignService';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';
import { CsvLead, CsvParseResult, CsvService } from '../../services/CsvService';
import { LeadListService } from '../../services/LeadListService';
import { LeadService } from '../../services/LeadService';
import { UnipileError, UnipileService } from '../../services/UnipileService';
import { ProfileVisitResult, ConnectionRequestResult, ConnectionStatusResult, LikePostResult, CommentPostResult, FollowUpResult, WithdrawRequestResult, WebhookResult } from '../../types/activity.types';
import { EWorkflowNodeType, WorkflowJson, WorkflowNodeConfig } from '../../types/workflow.types';
import logger from '../../utils/logger';
import { ActivityResult } from '../workflows/leadWorkflow';

export enum EProviderError {
    InvalidAccount = 'errors/invalid_account',
    InvalidRecipient = 'errors/invalid_recipient',
    NoConnectionWithRecipient = 'errors/no_connection_with_recipient',
    BlockedRecipient = 'errors/blocked_recipient',
    UserUnreachable = 'errors/user_unreachable',
    UnprocessableEntity = 'errors/unprocessable_entity',
    PaymentError = 'errors/payment_error',
    ActionAlreadyPerformed = 'errors/action_already_performed',
    InvalidMessage = 'errors/invalid_message',
    InvalidPost = 'errors/invalid_post',
    NotAllowedInmail = 'errors/not_allowed_inmail',
    InsufficientCredits = 'errors/insufficient_credits',
    CannotResendYet = 'errors/cannot_resend_yet',
    CannotResendWithin24hrs = 'errors/cannot_resend_within_24hrs',
    LimitExceeded = 'errors/limit_exceeded',
    AlreadyInvitedRecently = 'errors/already_invited_recently',
    AlreadyConnected = 'errors/already_connected',
    CannotInviteAttendee = 'errors/cannot_invite_attendee',
    ParentMailNotFound = 'errors/parent_mail_not_found',
    InvalidReplySubject = 'errors/invalid_reply_subject',
    InvalidHeaders = 'errors/invalid_headers',
    SendAsDenied = 'errors/send_as_denied',
    InvalidFolder = 'errors/invalid_folder',
    InvalidThread = 'errors/invalid_thread',
    LimitTooHigh = 'errors/limit_too_high',
    Unauthorized = 'errors/unauthorized',
    SenderRejected = 'errors/sender_rejected',
    RecipientRejected = 'errors/recipient_rejected',
    IpRejectedByServer = 'errors/ip_rejected_by_server',
    ProviderUnreachable = 'errors/provider_unreachable',
    AccountConfigurationError = 'errors/account_configuration_error',
    CantSendMessage = 'errors/cant_send_message',
    RealtimeClientNotInitialized = 'errors/realtime_client_not_initialized',
    CommentsDisabled = 'errors/comments_disabled',
    InsufficientJobSlot = 'errors/insufficient_job_slot',
}

/**
 * Extract error information from Unipile SDK error following UnipileError interface structure
 * Interface structure: error.error.body.{status, type, detail}
 */
function extractUnipileError(error: unknown): {
    errorStatus?: number;
    errorType?: EProviderError;
    errorDetail?: string;
} {
    // Follow UnipileError interface structure: error.error.body.{status, type, detail}
    const unipileError = error as UnipileError;
    // Handle both error structures: error.error.body or error.body
    const errorStatus = (unipileError as { error?: { body?: { status?: number } }; body?: { status?: number } })?.error?.body?.status ||
                        (unipileError as { error?: { body?: { status?: number } }; body?: { status?: number } })?.body?.status;
    const errorType = ((unipileError as { error?: { body?: { type?: string } }; body?: { type?: string } })?.error?.body?.type ||
                       (unipileError as { error?: { body?: { type?: string } }; body?: { type?: string } })?.body?.type) as EProviderError;
    const errorDetail = (unipileError as { error?: { body?: { detail?: string } }; body?: { detail?: string } })?.error?.body?.detail ||
                        (unipileError as { error?: { body?: { detail?: string } }; body?: { detail?: string } })?.body?.detail;

    return { errorStatus, errorType, errorDetail };
}

/**
 * Classify Unipile errors and throw appropriate ApplicationFailure
 * 422 errors = permanent failures (non-retryable)
 * All other errors = transient failures (retryable)
 * 401/403 errors = authentication failures (non-retryable, but workflow handles pausing)
 */
function handleUnipileError(error: unknown, accountId: string, identifier: string, campaignId: string): never {
    const { errorStatus, errorType, errorDetail } = extractUnipileError(error);

    // 422 errors are permanent failures - don't retry
    if (errorStatus === 422) {
        logger.warn('Unipile 422 error - permanent failure', {
            accountId,
            identifier,
            campaignId,
            errorStatus,
            errorType,
            errorDetail,
        });

        throw ApplicationFailure.nonRetryable(
            `Permanent failure: ${errorType || 'Unknown 422 error'}`,
            'Unipile422Error',
            { errorStatus, errorType, errorDetail, accountId, identifier, campaignId }
        );
    }

    // 401/403 - authentication failures - pause campaign (workflow will handle)
    if (errorStatus === 401 || errorStatus === 403) {
        logger.error('Unipile authentication error - pausing campaign', {
            accountId,
            identifier,
            campaignId,
            errorStatus,
            errorType,
            errorDetail,
        });

        throw ApplicationFailure.nonRetryable(
            `Authentication failed: ${errorType || 'Unknown auth error'}`,
            'UnipileAuthError',
            { errorStatus, errorType, errorDetail, accountId, identifier, campaignId }
        );
    }

    // Everything else is retryable - let Temporal handle retries
    logger.info('Unipile transient error - will retry', {
        accountId,
        identifier,
        campaignId,
        errorStatus,
        errorType,
        errorDetail,
    });

    throw ApplicationFailure.retryable(
        `Transient error: ${errorType || 'Unknown error'}`,
        'UnipileTransientError',
        { errorStatus, errorType, errorDetail, accountId, identifier, campaignId }
    );
}

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
            environment: process.env.NODE_ENV || 'development',
        },
        timestamp: new Date().toISOString(),
    };

    logger.info('Test activity completed', { result });
    return result;
}

export async function test(input: Record<string, unknown>): Promise<{ success: boolean; data: { skipped: boolean; reason: string } }> {
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

export async function getLeadListData(leadListId: string, organizationId: string): Promise<{ csvData: CsvParseResult; leadList: LeadListResponseDto }> {
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
                full_name: lead.first_name + ' ' + lead.last_name,
                organization_id: organization_id,
                campaign_id: campaign_id,
                source: 'CSV',
                linkedin_url: lead.linkedin_url,
                company: lead.company,
                title: lead.title,
                phone: lead.phone,
            };
            await leadService.createLead(leadDto);
        });
    });
}

export async function getDBLeads(campaign_id: string) {
    const leadService = new LeadService();
    const leads = await leadService.getAllByCampaignId(campaign_id);
    return leads;
}
export async function updateLead(leadId: string, data: LeadUpdateDto) {
    const leadService = new LeadService();
    const leads = await leadService.updateLead(leadId, data);
    return leads;
}

export async function getWorkflowByCampaignId(campaign: CampaignResponseDto): Promise<WorkflowJson> {
    const campaignService = new CampaignService();
    const { workflowData } = await campaignService.getWorkflow(campaign);
    return workflowData;
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

export async function profile_visit(accountId: string, identifier: string, campaignId: string): Promise<ProfileVisitResult> {
    logger.info('profile_visit', { identifier, accountId, campaignId });
    const unipileService = new UnipileService();
    try {
        const result = await unipileService.visitLinkedInProfile({
            accountId: accountId,
            identifier: identifier,
            notify: false,
        });

        // Type guard to check if result has LinkedIn profile structure
        const linkedInResult = result as { provider_id?: string; first_name?: string; last_name?: string; work_experience?: Array<{ company?: string }> };

        if (!linkedInResult?.provider_id) {
            throw ApplicationFailure.nonRetryable(
                'Profile visit succeeded but no provider_id returned',
                'MissingProviderId',
                { accountId, identifier, campaignId }
            );
        }

        const lead_data = {
            first_name: linkedInResult.first_name || '',
            last_name: linkedInResult.last_name || '',
            company: linkedInResult.work_experience?.[0]?.company ?? undefined,
        };

        return {
            providerId: linkedInResult.provider_id,
            lead_data,
        };
    } catch (error: unknown) {
        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Handle Unipile errors
        handleUnipileError(error, accountId, identifier, campaignId);
    }
}

export async function like_post(accountId: string, identifier: string, config: WorkflowNodeConfig, campaignId: string): Promise<LikePostResult> {
    logger.info('like_post', { accountId, identifier, campaignId });
    const unipileService = new UnipileService();

    const leadAccount = await profile_visit(accountId, identifier, campaignId);

    try {
        await unipileService.likeLinkedInPost({
            accountId: accountId,
            linkedInUrn: leadAccount.providerId,
            lastDays: config?.recentPostDays || 7,
            reactionType: 'like',
        });

        return { success: true, message: 'Post liked successfully' };
    } catch (error: unknown) {
        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Handle Unipile errors
        handleUnipileError(error, accountId, identifier, campaignId);
    }
}

export async function comment_post(accountId: string, identifier: string, config: WorkflowNodeConfig, campaignId: string): Promise<CommentPostResult> {
    logger.info('comment_post', { accountId, identifier, campaignId });
    const unipileService = new UnipileService();
    const leadAccount = await profile_visit(accountId, identifier, campaignId);

    try {
        await unipileService.commentLinkedInPost({
            accountId: accountId,
            linkedInUrn: leadAccount.providerId,
            config: config,
        });
        return { success: true, message: 'Comment posted successfully' };
    } catch (error: unknown) {
        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Handle Unipile errors
        handleUnipileError(error, accountId, identifier, campaignId);
    }
}

export async function send_followup(accountId: string, identifier: string, config: WorkflowNodeConfig, campaignId: string, leadData?: { first_name?: string | null; last_name?: string | null; company?: string | null }): Promise<FollowUpResult> {
    logger.info('send_followup', { accountId, identifier, campaignId });
    const unipileService = new UnipileService();
    const leadAccount = await profile_visit(accountId, identifier, campaignId);

    // Prepare template data from lead data - only first_name, last_name, and company
    const templateData = {
        first_name: leadData?.first_name || '',
        last_name: leadData?.last_name || '',
        company: leadData?.company || '',
    };

    try {
        const result = await unipileService.sendFollowUp({
            accountId: accountId,
            linkedInUrn: leadAccount.providerId,
            config: config,
            templateData: templateData,
        });
        return { success: true, message: 'Follow-up message sent', data: result };
    } catch (error: unknown) {
        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Handle Unipile errors
        handleUnipileError(error, accountId, identifier, campaignId);
    }
}

export async function send_inmail(): Promise<{ success: true; message: string }> {
    logger.info('send_inmail');
    // FOR NOW JUST LOG THE THINGS, WE NEED TO ADD UNIPILE FUNCTIONALITY
    return { success: true, message: 'InMail sent successfully' };
}

export async function withdraw_request(accountId: string, identifier: string, campaignId: string): Promise<WithdrawRequestResult> {
    logger.info('withdraw_request', { accountId, identifier, campaignId });
    const unipileService = new UnipileService();
    try {
        const { providerId } = await profile_visit(accountId, identifier, campaignId);
        await unipileService.withdrawLinkedInInvitationRequest({ accountId, providerId });
        return { success: true, message: 'Request withdrawn' };
    } catch (error: unknown) {
        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Handle Unipile errors
        handleUnipileError(error, accountId, identifier, campaignId);
    }
}

export async function isConnected(accountId: string, identifier: string, campaignId: string): Promise<{ connected: boolean }> {
    logger.info('isConnected', { accountId, identifier, campaignId });
    const unipileService = new UnipileService();
    try {
        const result = await unipileService.isConnected({ accountId, identifier });
        return { connected: result };
    } catch (error: unknown) {
        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Handle Unipile errors
        handleUnipileError(error, accountId, identifier, campaignId);
    }
}

export async function send_connection_request(accountId: string, identifier: string, config: WorkflowNodeConfig, campaignId: string): Promise<ConnectionRequestResult> {
    logger.info('send_connection_request - Starting', { accountId, identifier, campaignId });
    const unipileService = new UnipileService();

    // Get provider ID from profile visit
    const profileVisitResult = await profile_visit(accountId, identifier, campaignId);
    const providerId = profileVisitResult.providerId;

    try {
        // Check if already connected
        let alreadyConnected = false;
        try {
            const connectionStatus = await isConnected(accountId, identifier, campaignId);
            alreadyConnected = connectionStatus.connected;
            logger.info('Connection status checked', {
                accountId,
                identifier,
                providerId,
                alreadyConnected,
            });
        } catch (error: unknown) {
            // If connection check fails, log but continue - might be transient error
            logger.warn('Connection check failed, continuing with invitation', {
                accountId,
                identifier,
                providerId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }

        if (alreadyConnected) {
            logger.info('User already connected, skipping connection request', {
                accountId,
                identifier,
                providerId,
            });
            return {
                providerId,
                alreadyConnected: true,
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
                customMessage: config?.customMessage ? '***custom message provided***' : undefined,
            },
        });

        try {
            await unipileService.sendLinkedInInvitation({
                accountId: accountId,
                providerId: providerId,
                config: config,
            });

            logger.info('Connection request sent successfully', {
                accountId,
                identifier,
                providerId,
                campaignId,
            });
        } catch (invitationError: unknown) {
            // Check for already_invited_recently error - this is a special case
            const { errorStatus, errorType } = extractUnipileError(invitationError);
            if (errorType === EProviderError.AlreadyInvitedRecently) {
                logger.info('Connection request already sent recently', {
                    accountId,
                    identifier,
                    providerId,
                    campaignId,
                });
                // Return success with alreadyInvited flag - workflow will handle polling
                return {
                    providerId,
                    alreadyInvited: true,
                };
            }

            // For all other errors, let handleUnipileError throw appropriate ApplicationFailure
            handleUnipileError(invitationError, accountId, identifier, campaignId);
        }

        // Increment connection request counters for the campaign (non-blocking)
        try {
            const campaignService = new CampaignService();
            const campaign = await campaignService.getCampaignById(campaignId);
            if (campaign) {
                const currentDayCount = (campaign.requests_sent_this_day ?? 0) + 1;
                const currentWeekCount = (campaign.requests_sent_this_week ?? 0) + 1;

                await campaignService.updateCampaign(campaignId, {
                    requests_sent_this_day: currentDayCount,
                    requests_sent_this_week: currentWeekCount,
                } as UpdateCampaignDto);

                logger.info('Campaign connection request counters incremented', {
                    campaignId,
                    dailyCount: currentDayCount,
                    weeklyCount: currentWeekCount,
                });
            }
        } catch (counterError: unknown) {
            logger.error('Failed to increment campaign connection request counters', {
                accountId,
                identifier,
                providerId,
                campaignId,
                error: counterError instanceof Error ? counterError.message : 'Unknown error',
            });
            // Don't fail the request if counter update fails
        }

        return {
            providerId,
        };
    } catch (error: unknown) {
        // If it's already an ApplicationFailure, rethrow it
        if (error instanceof ApplicationFailure) {
            throw error;
        }

        // Handle Unipile errors
        handleUnipileError(error, accountId, identifier, campaignId);
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
        status: CampaignStatus.PAUSED,
    } as UpdateCampaignDto);
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

    const updateData: {
        requests_sent_this_day?: number;
        last_daily_requests_reset?: string;
        requests_sent_this_week?: number;
        last_weekly_requests_reset?: string;
    } = {};

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
        const waitUntilMs = dailyExceeded && weeklyExceeded ? Math.max(waitUntilDaily, waitUntilWeekly) : dailyExceeded ? waitUntilDaily : waitUntilWeekly;

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
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
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

export async function check_connection_status(accountId: string, identifier: string, providerId: string, campaignId: string): Promise<ConnectionStatusResult> {
    logger.info('check_connection_status - Starting', {
        accountId,
        identifier,
        providerId,
        campaignId,
    });

    const unipileService = new UnipileService();

    // Check if connected (accepted)
    let connected = false;
    try {
        connected = await unipileService.isConnected({ accountId, identifier });
        logger.info('Connection status checked (isConnected)', {
            accountId,
            identifier,
            providerId,
            connected,
        });
    } catch (error: unknown) {
        // If connection check fails, log but continue - might be transient
        // We'll check invitation status below
        logger.warn('Failed to check if user is connected, continuing with invitation check', {
            accountId,
            identifier,
            providerId,
            campaignId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }

    if (connected) {
        logger.info('User is CONNECTED (request accepted)', {
            accountId,
            identifier,
            providerId,
            campaignId,
        });
        return {
            status: 'accepted',
            providerId,
        };
    }

    // Check if invitation still pending or was rejected
    let invitationStillExists = false;
    try {
        invitationStillExists = await unipileService.isInvitationPending({
            accountId,
            providerId,
        });
        logger.info('Invitation status checked (isInvitationPending)', {
            accountId,
            identifier,
            providerId,
            invitationStillExists,
        });
    } catch (error: unknown) {
        // If we can't check invitation status, throw error - let Temporal retry
        // This is a transient error that should be retried
        if (error instanceof ApplicationFailure) {
            throw error;
        }
        handleUnipileError(error, accountId, identifier, campaignId);
    }

    if (!invitationStillExists) {
        logger.warn('Invitation not found (request rejected)', {
            accountId,
            identifier,
            providerId,
            campaignId,
        });
        return {
            status: 'rejected',
            providerId,
        };
    }

    // Still pending - return pending status so workflow can continue polling
    logger.info('Connection request still pending', {
        accountId,
        identifier,
        providerId,
        campaignId,
    });
    return {
        status: 'pending',
        providerId,
    };
}

export async function updateCampaignStep(campaignId: string, stepType: EWorkflowNodeType, config: WorkflowNodeConfig, success: boolean, results: Record<string, any>, stepIndex: number, organizationId: string, leadId: string): Promise<ActivityResult> {
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
            campaign_id: campaignId,
        };

        await campaignService.createCampaignStep(newStep);
        logger.info('Campaign step updated successfully', {
            campaignId,
            stepType,
            success,
            stepIndex,
        });

        return {
            success: true,
            message: 'Campaign step updated successfully',
            data: { stepIndex },
        };
    } catch (error: unknown) {
        logger.error('Error updating campaign step', {
            error: error instanceof Error ? error.message : 'Unknown error',
            campaignId,
            stepIndex,
            stepType,
        });
        return {
            success: false,
            message: `Failed to update campaign step: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}

export function CheckNever(value: never): never {
    throw new Error(`Unhandled case: ${value}`);
}

export const isNullOrUndefined = (it: unknown): it is null | undefined => it === null || it === undefined;

export async function extractLinkedInPublicIdentifier(url: string): Promise<string | null> {
    return CsvService.extractLinkedInPublicIdentifier(url);
}

/**
 * Check if current time is within the allowed time window
 * Returns the number of milliseconds to wait until the window opens, or 0 if already in window
 * Wait time is calculated in UTC milliseconds for use with Temporal sleep
 */
export async function checkTimeWindow(startTime: string | null | undefined, endTime: string | null | undefined, timezone: string | null | undefined): Promise<{ inWindow: boolean; waitMs: number; currentTime: string }> {
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
            seconds: parseInt(parts[2] || '0', 10),
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
        hour12: false,
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
                hour12: false,
            }).formatToParts(candidateDate);

            const candidateYear = parseInt(candidateTzParts.find(p => p.type === 'year')?.value || '0', 10);
            const candidateMonth = parseInt(candidateTzParts.find(p => p.type === 'month')?.value || '0', 10) - 1;
            const candidateDay = parseInt(candidateTzParts.find(p => p.type === 'day')?.value || '0', 10);
            const candidateHour = parseInt(candidateTzParts.find(p => p.type === 'hour')?.value || '0', 10);
            const candidateMinute = parseInt(candidateTzParts.find(p => p.type === 'minute')?.value || '0', 10);

            // If we match, we're done
            if (candidateYear === year && candidateMonth === month && candidateDay === day && candidateHour === hour && candidateMinute === minute) {
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

// REMOVED: handleProviderErrors - replaced with handleUnipileError which throws ApplicationFailure
// This function is no longer used. All activities now use handleUnipileError() which throws
// ApplicationFailure.retryable() or ApplicationFailure.nonRetryable() instead of returning ActivityResult.

export const callWebhook = async (webhookId: string, leadId: string): Promise<WebhookResult> => {
    const webhookRepository = new WebhookRepository();
    const leadRepository = new LeadRepository();
    const campaignService = new CampaignService();
    try {
        const webhook = await webhookRepository.findById(webhookId);
        const lead = await leadRepository.findById(leadId);
        const leadSteps = await campaignService.getStepsByLeadId(leadId);
        const data = {
            lead: lead,
            leadSteps: leadSteps,
        };
        if (!webhook) {
            return {
                success: false,
                message: 'Webhook not found',
                webhookId: undefined,
            };
        }
        const response = await fetch(webhook.url, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            return {
                success: false,
                message: 'Failed to call webhook',
                webhookId: undefined,
            };
        }
        return {
            success: true,
            message: 'Webhook called successfully',
            webhookId,
        };
    } catch (err) {
        logger.error('Failed to call webhook', { error: err, webhookId, leadId });
        return {
            success: false,
            message: 'Failed to call webhook',
            webhookId: undefined,
        };
    }
};
