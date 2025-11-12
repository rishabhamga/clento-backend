import { CampaignResponseDto, CampaignStatus, CampaignStepResponseDto, CreateCampaignStepDto } from "../../dto/campaigns.dto";
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
            company: result?.work_experience[0]?.company as string,
        }
        // @ts-ignore
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
    if (!leadAccount.providerId) { return { success: false, message: 'Lead LinkedIn Urn not found' }; }

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
    })
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