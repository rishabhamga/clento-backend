import { log, proxyActivities, sleep, startChild } from "@temporalio/workflow";
import type * as activities from "../activities";
import { leadWorkflow } from "./leadWorkflow";
// IMPORTANT DO NOT IMPORT ANYTHING ELSE HERE EVERY ACTIVITY IS TO BE DONE VIA ACTIVITIES

// Create activity proxies with timeout configuration
const { getCampaignById, getLeadListData, entryLeadsIntoDb, getDBLeads, getWorkflowByCampaignId } = proxyActivities<typeof activities>({
    startToCloseTimeout: '5 minutes',
    retry: {
        initialInterval: '1s',
        maximumInterval: '30s',
        maximumAttempts: 3,
    },
});

export interface CampaignInput {
    campaignId: string;
    organizationId: string;
}

/**
 * Parent Workflow - Orchestrates campaign execution
 * Runs daily batches of lead processing based on campaign configuration
 */
export async function parentWorkflow(input: CampaignInput): Promise<void> {
    const { campaignId, organizationId } = input;

    log.info('Starting campaign workflow', { campaignId, organizationId });

    // Get initial campaign data
    const campaign = await getCampaignById(campaignId);

    if (!campaign?.prospect_list) {
        log.warn('No prospect list found for campaign', { campaignId });
        return;
    }

    // Get lead list data
    const leadList = await getLeadListData(campaign.prospect_list, organizationId);
    const leads = leadList?.csvData?.data || [];

    if (leads.length === 0) {
        log.warn('No leads found in prospect list', { campaignId });
        return;
    }

    await entryLeadsIntoDb(leads, input.organizationId, input.campaignId);

    const dbLeads = await getDBLeads(input.campaignId);

    log.info('Campaign initialized', {
        campaignId,
        totalLeads: leads.length,
        leadsPerDay: campaign.leads_per_day
    });

    // Start all daily batches concurrently with delays
    const allChildWorkflowHandles: Promise<any>[] = [];
    let processedLeads = 0;

    while (processedLeads < leads.length) {
        // Get campaign Everyday To Catch Any Update
        const campaignFetch = await getCampaignById(campaignId);
        if (!campaignFetch) {
            log.error("No Campaign Found")
            return
        }
        if (!campaignFetch.sender_account) {
            log.error("No Sender Found")
            return
        }
        const workflowJson = await getWorkflowByCampaignId(campaignFetch);

        const leadsPerDay = campaignFetch.leads_per_day || 10;
        // Get today's batch of leads (don't exceed remaining leads)
        const remainingLeads = leads.length - processedLeads;
        const batchSize = Math.min(leadsPerDay, remainingLeads);
        const todaysLeads = dbLeads.slice(processedLeads, processedLeads + batchSize);

        log.info('Starting daily batch', {
            campaignId,
            batchSize: todaysLeads.length,
            processedSoFar: processedLeads,
            totalLeads: leads.length,
            dayNumber: Math.floor(processedLeads / leadsPerDay) + 1
        });

        // Start child workflows for this batch (don't await yet)
        const batchHandles = todaysLeads.map(lead =>
            startChild(leadWorkflow, {
                args: [{
                    leadId: lead.id,
                    workflow: workflowJson,
                    accountId: campaignFetch.sender_account!
                }],
                workflowId: `lead-${lead.id}-day-${Math.floor(processedLeads / leadsPerDay) + 1}`,
                taskQueue: 'campaign-task-queue',
            })
        );

        // Add all handles to the collection for later awaiting
        allChildWorkflowHandles.push(...batchHandles);

        processedLeads += todaysLeads.length;

        // If there are more leads, schedule the next batch for tomorrow (but don't wait)
        if (processedLeads < leads.length) {
            log.info('Scheduling next batch for tomorrow', {
                campaignId,
                nextBatchStartsAt: `Day ${Math.floor(processedLeads / leadsPerDay) + 1}`
            });
            // Sleep until next day before starting the next batch
            await sleep('24 hours');
        }
    }

    log.info('All batches started, waiting for completion', {
        campaignId,
        totalBatches: allChildWorkflowHandles.length,
        totalLeads: leads.length
    });

    // Wait for ALL child workflows to complete at the end
    await Promise.all(
        allChildWorkflowHandles.map(async handle => (await handle).result())
    );

    log.info('Campaign workflow completed', {
        campaignId,
        totalLeadsProcessed: processedLeads
    });
}