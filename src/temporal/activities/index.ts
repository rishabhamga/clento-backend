import { startChild } from "@temporalio/workflow";
import { LeadInsertDto, LeadListResponseDto, LeadResponseDto, LeadUpdateDto } from "../../dto/leads.dto";
import { CampaignService } from "../../services/CampaignService";
import { CsvLead, CsvParseResult } from "../../services/CsvService";
import { LeadListService } from "../../services/LeadListService";
import { LeadService } from "../../services/LeadService";
import { WorkflowJson } from "../../types/workflow.types";
import logger from "../../utils/logger";
import { leadWorkflow, LeadWorkflowInput } from "../workflows/leadWorkflow";
import { CampaignResponseDto } from "../../dto/campaigns.dto";

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

// LINKEDIN ACTIONS
export async function profile_visit() {
    // FOR NOT JUST LOG THE THINGS WE NEED TO ADD UNIPILE FUNCTIONALITY
    logger.info('profile_visit')
    return
}
export async function like_post() {
    // FOR NOT JUST LOG THE THINGS WE NEED TO ADD UNIPILE FUNCTIONALITY
    logger.info('like_post')
    return
}
export async function follow_profile() {
    // FOR NOT JUST LOG THE THINGS WE NEED TO ADD UNIPILE FUNCTIONALITY
    logger.info('follow_profile')
    return
}
export async function comment_post() {
    // FOR NOT JUST LOG THE THINGS WE NEED TO ADD UNIPILE FUNCTIONALITY
    logger.info('comment_post')
    return
}
export async function send_invite() {
    // FOR NOT JUST LOG THE THINGS WE NEED TO ADD UNIPILE FUNCTIONALITY
    logger.info('send_invite')
    return
}
export async function send_followup() {
    // FOR NOT JUST LOG THE THINGS WE NEED TO ADD UNIPILE FUNCTIONALITY
    logger.info('send_followup')
    return
}
export async function withdraw_request() {
    // FOR NOT JUST LOG THE THINGS WE NEED TO ADD UNIPILE FUNCTIONALITY
    logger.info('withdraw_request')
    return
}
export async function send_inmail() {
    // FOR NOT JUST LOG THE THINGS WE NEED TO ADD UNIPILE FUNCTIONALITY
    logger.info('send_inmail')
    return
}
export async function follow_company() {
    // FOR NOT JUST LOG THE THINGS WE NEED TO ADD UNIPILE FUNCTIONALITY
    logger.info('follow_company')
    return
}
export async function send_connection_request() {
    // FOR NOT JUST LOG THE THINGS WE NEED TO ADD UNIPILE FUNCTIONALITY
    logger.info('send_connection_request')
    return
}

export function CheckNever(value: never): never {
    throw new Error(`Unhandled case: ${value}`)
}

export const isNullOrUndefined = (it: any) => it === null || it === undefined;