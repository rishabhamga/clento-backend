import { sleep } from "@temporalio/workflow";
import { CampaignService } from "../../services/CampaignService";
import { LeadListService } from "../../services/LeadListService";
import logger from "../../utils/logger";

interface campaignInput {
    campaignId: string;
    organizationId: string;
}

export const parentWorkflow = async (input: campaignInput) => {
    const { campaignId, organizationId } = input;
    const campaignService = new CampaignService();
    const leadListService = new LeadListService();

    let processedLeads = 0;

    const campaign = await campaignService.getCampaignById(campaignId);

    if (!campaign?.prospect_list) {
        logger.info('No Prospect List Found');
        return
    }

    const leadList = await leadListService.getLeadListDataById(campaign?.prospect_list, organizationId);
    const leads = leadList.csvData.data;

    while (processedLeads < leads.length) {
        const campaignFetch = await campaignService.getCampaignById(campaignId);
        if (!campaignFetch) {
            logger.info('Campaign not found');
            return
        }
        if (!campaignFetch.leads_per_day) {
            logger.info('No Leads Per Day Found');
            return
        }
        const todaysLeads = leads.slice(processedLeads, processedLeads + campaignFetch.leads_per_day);
        await Promise.all(
            todaysLeads.map(lead =>
                console.log("Processing Lead", lead)
            )
        );
        processedLeads += todaysLeads.length;

        console.log(
            `Day batch completed for campaign ${campaignId}: ${processedLeads}/${leads.length} leads processed`
        );

        if (processedLeads < leads.length) {
            // Sleep 24h before starting the next batch
            await sleep('24h');
        }
        console.log(`Campaign ${campaignId} completed`);
    }

    if (!campaign) {
        throw new Error('Campaign not found');
    }
}