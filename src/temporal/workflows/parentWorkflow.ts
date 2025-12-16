import { log, proxyActivities, sleep, startChild, condition, defineSignal, setHandler } from '@temporalio/workflow';
import type * as activities from '../activities';
import { leadWorkflow } from './leadWorkflow';
import { CampaignStatus } from '../../dto/campaigns.dto';
// IMPORTANT DO NOT IMPORT ANYTHING ELSE HERE EVERY ACTIVITY IS TO BE DONE VIA ACTIVITIES

// Create activity proxies with timeout configuration
const { getCampaignById, getLeadListData, entryLeadsIntoDb, getDBLeads, getWorkflowByCampaignId, verifyUnipileAccount, pauseCampaign } = proxyActivities<typeof activities>({
    startToCloseTimeout: '5 minutes',
    retry: {
        initialInterval: '1s',
        maximumInterval: '30s',
        maximumAttempts: 10, // Increased for transient errors
    },
});

export interface CampaignInput {
    campaignId: string;
    organizationId: string;
}

// Signal definitions for pause/resume functionality
const pauseSignal = defineSignal('pause-campaign');
const resumeSignal = defineSignal('resume-campaign');

/**
 * Check if campaign should continue processing
 * Returns true if campaign is active and not paused/deleted/completed/failed
 */
async function shouldContinueCampaign(campaignId: string): Promise<boolean> {
    const campaign = await getCampaignById(campaignId);
    if (!campaign) {
        return false;
    }
    return !campaign.is_deleted &&
           campaign.status !== CampaignStatus.PAUSED &&
           campaign.status !== CampaignStatus.COMPLETED &&
           campaign.status !== CampaignStatus.FAILED;
}

/**
 * Parent Workflow - Orchestrates campaign execution
 * Runs daily batches of lead processing based on campaign configuration
 */
export async function parentWorkflow(input: CampaignInput): Promise<void> {
    const { campaignId, organizationId } = input;

    log.info('Starting campaign workflow', { campaignId, organizationId });

    let isPaused = false;

    // Set up signal handlers for pause/resume
    setHandler(pauseSignal, () => {
        isPaused = true;
        log.info('Campaign paused via signal', { campaignId });
    });

    setHandler(resumeSignal, () => {
        isPaused = false;
        log.info('Campaign resumed via signal', { campaignId });
    });

    // Get initial campaign data
    const campaign = await getCampaignById(campaignId);

    if (campaign?.is_deleted) {
        log.warn('Campaign is deleted', { campaignId });
        await pauseCampaign(campaignId);
        return;
    }

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
    const totalLeadsToProcess = dbLeads.length;

    log.info('Campaign initialized', {
        campaignId,
        totalLeads: leads.length,
        dbLeadsCount: totalLeadsToProcess,
        leadsPerDay: campaign.leads_per_day,
    });

    if (totalLeadsToProcess === 0) {
        log.warn('No leads found in database - ending workflow', { campaignId });
        return;
    }

    const allChildWorkflowHandles: Promise<{ result: () => Promise<void> }>[] = [];
    let processedLeads = 0;
    const processedLeadIds = new Set<string>();

    while (processedLeads < totalLeadsToProcess) {
        // Wait if paused
        if (isPaused) {
            log.info('Campaign is paused, waiting for resume signal', { campaignId });
            await condition(() => !isPaused);
            log.info('Campaign resumed, continuing', { campaignId });
        }

        // Check if campaign should continue
        if (!(await shouldContinueCampaign(campaignId))) {
            log.warn('Campaign should not continue - stopping', { campaignId });
            break;
        }

        const campaignFetch = await getCampaignById(campaignId);
        if (!campaignFetch?.sender_account) {
            log.error('Campaign or sender account not found', { campaignId });
            return;
        }

        const unipileAccount = await verifyUnipileAccount(campaignFetch.sender_account);
        if (!unipileAccount) {
            log.error('Unipile account not found - pausing campaign', { campaignId });
            await pauseCampaign(campaignId);
            return;
        }

        const workflowJson = await getWorkflowByCampaignId(campaignFetch);
        const leadsPerDay = campaignFetch.leads_per_day || 10;
        const remainingLeads = totalLeadsToProcess - processedLeads;

        if (remainingLeads <= 0) {
            break;
        }

        // Get unprocessed leads
        const unprocessedLeads = dbLeads.filter(lead => !processedLeadIds.has(lead.id));
        if (unprocessedLeads.length === 0) {
            break;
        }

        // Shuffle leads for randomization
        const shuffledLeads = [...unprocessedLeads];
        for (let i = shuffledLeads.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledLeads[i], shuffledLeads[j]] = [shuffledLeads[j], shuffledLeads[i]];
        }

        const batchSize = Math.min(leadsPerDay, shuffledLeads.length);
        const todaysLeads = shuffledLeads.slice(0, batchSize);

        log.info('Starting daily batch', {
            campaignId,
            batchSize: todaysLeads.length,
            processedSoFar: processedLeads,
            totalLeadsToProcess,
        });

        todaysLeads.forEach(lead => processedLeadIds.add(lead.id));

        // Start child workflows with delays
        for (let i = 0; i < todaysLeads.length; i++) {
            const lead = todaysLeads[i];

            if (i > 0) {
                const randomMinutes = 10 + Math.floor(Math.random() * 21); // 10-30 minutes
                await sleep(`${randomMinutes} minutes`);
            }

            const childHandle = startChild(leadWorkflow, {
                args: [{
                    leadId: lead.id,
                    workflow: workflowJson,
                    accountId: campaignFetch.sender_account!,
                    campaignId: campaignFetch.id,
                    organizationId: organizationId,
                    startTime: campaignFetch.start_time,
                    endTime: campaignFetch.end_time,
                    timezone: campaignFetch.timezone,
                }],
                workflowId: `lead-${lead.id}-day-${Math.floor(processedLeads / leadsPerDay) + 1}`,
                taskQueue: 'campaign-task-queue',
            });

            allChildWorkflowHandles.push(childHandle);
        }

        processedLeads += todaysLeads.length;

        // Wait for next day if more leads remain
        if (processedLeads < totalLeadsToProcess) {
            log.info('Scheduling next batch for tomorrow', { campaignId });

            // Sleep in chunks and check pause status
            const totalSleepHours = 24;
            for (let hour = 0; hour < totalSleepHours; hour++) {
                await sleep('1 hour');

                // Check if paused or should stop
                if (isPaused) {
                    await condition(() => !isPaused);
                }

                if (!(await shouldContinueCampaign(campaignId))) {
                    return;
                }
            }
        }
    }

    log.info('All batches started, waiting for completion', {
        campaignId,
        totalBatches: allChildWorkflowHandles.length,
    });

    // Wait for all child workflows to complete
    await Promise.all(allChildWorkflowHandles.map(async handle => (await handle).result()));

    log.info('Campaign workflow completed', {
        campaignId,
        totalLeadsProcessed: processedLeads,
    });
}
