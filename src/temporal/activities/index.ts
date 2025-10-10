import { CampaignResponseDto } from "../../dto/campaigns.dto";
import { LeadInsertDto, LeadListResponseDto, LeadUpdateDto } from "../../dto/leads.dto";
import { CampaignService } from "../../services/CampaignService";
import { ConnectedAccountService } from "../../services/ConnectedAccountService";
import { CsvLead, CsvParseResult } from "../../services/CsvService";
import { LeadListService } from "../../services/LeadListService";
import { LeadService } from "../../services/LeadService";
import { UnipileService } from "../../services/UnipileService";
import { WorkflowJson } from "../../types/workflow.types";
import logger from "../../utils/logger";
import { ActivityResult } from "../workflows/leadWorkflow";

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

export async function profile_visit(accountId: string, identifier: string): Promise<ActivityResult> {
    logger.info('profile_visit');
    if (!accountId) {
        return { success: false, message: 'Account not found' };
    }
    const unipileService = new UnipileService();
    const result: any = await unipileService.visitLinkedInProfile({
        accountId: accountId,
        identifier: identifier,
        notify: false
    });

    return { success: true, message: 'Profile visit completed', data: null, providerId: result?.provider_id };
}

export async function like_post(accountId: string, identifier: string, lastDays: number): Promise<ActivityResult> {
    logger.info('like_post');
    const unipileService = new UnipileService();

    const leadAccount = await profile_visit(accountId, identifier);

    console.log(leadAccount.providerId)
    if (!leadAccount.providerId) {
        return { success: false, message: 'Lead LinkedIn Urn not found' };
    }
    const result = await unipileService.likeLinkedInPost({
        accountId: accountId,
        linkedInUrn: leadAccount.providerId,
        lastDays: lastDays,
        reactionType: 'like'
    });
    return { success: true, message: 'Post liked successfully' };
}

export async function comment_post(): Promise<ActivityResult> {
    logger.info('comment_post');
    // FOR NOW JUST LOG THE THINGS, WE NEED TO ADD UNIPILE FUNCTIONALITY
    return { success: true, message: 'Comment posted successfully' };
}

export async function send_followup(): Promise<ActivityResult> {
    logger.info('send_followup');
    // FOR NOW JUST LOG THE THINGS, WE NEED TO ADD UNIPILE FUNCTIONALITY
    return { success: true, message: 'Follow-up message sent' };
}

export async function send_inmail(): Promise<ActivityResult> {
    logger.info('send_inmail');
    // FOR NOW JUST LOG THE THINGS, WE NEED TO ADD UNIPILE FUNCTIONALITY
    return { success: true, message: 'InMail sent successfully' };
}

export async function withdraw_request(accountId: string, identifier: string): Promise<ActivityResult> {
    logger.info('withdraw_request', { accountId, identifier });
    const unipileService = new UnipileService();
    try {
        const { providerId } = await profile_visit(accountId, identifier);
        if (!providerId) {
            return { success: false, message: 'Provider ID not found' };
        }
        await unipileService.withdrawLinkedInInvitationRequest({ accountId, providerId });
        return { success: true, message: 'Request withdrawn' };
    } catch (error) {
        logger.error('Error withdrawing request', { error, accountId, identifier });
        return { success: false, message: 'Failed to withdraw request' };
    }
}

export async function isConnected(accountId: string, identifier: string): Promise<ActivityResult> {
    logger.info('isConnected', { accountId, identifier });
    const unipileService = new UnipileService();
    const result = await unipileService.isConnected({ accountId, identifier });
    return { success: true, message: 'Connection status checked' };
}

export async function send_connection_request(accountId: string, identifier: string, message: string): Promise<ActivityResult> {
    logger.info('send_connection_request - Starting');
    const unipileService = new UnipileService();

    // Get provider ID from profile visit
    const { providerId } = await profile_visit(accountId, identifier);
    if (!providerId) {
        return { success: false, message: 'Provider ID not found' };
    }

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
        message: message
    });

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
}

export async function check_connection_status(accountId: string, identifier: string, providerId: string): Promise<ActivityResult> {
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
        logger.error('Error checking connection status', { error: error.message, accountId, identifier });
        return {
            success: false,
            message: `Error checking connection status: ${error.message}`,
            data: { error: error.message }
        };
    }
}

export function CheckNever(value: never): never {
    throw new Error(`Unhandled case: ${value}`)
}

export const isNullOrUndefined = (it: any) => it === null || it === undefined;