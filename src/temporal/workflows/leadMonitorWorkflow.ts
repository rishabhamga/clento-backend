import { log, proxyActivities, sleep } from '@temporalio/workflow';
import { Duration } from '@temporalio/common';
import type * as reportingActivities from '../activities/reportingActivities';

const {
    fetchReporterLeadProfile,
    updateReporterLeadProfile,
    getReporterConnectedAccount,
    findOrCreateReporterLead,
} = proxyActivities<typeof reportingActivities>({
    startToCloseTimeout: '1 minute',
    retry: {
        maximumAttempts: 10,
        initialInterval: '5 minutes',
        backoffCoefficient: 2,
    },
});

export interface LeadMonitorWorkflowInput {
    userId: string;
    linkedinUrl: string;
}

export async function leadMonitorWorkflow(input: LeadMonitorWorkflowInput): Promise<void> {
    const { userId, linkedinUrl } = input;

    log.info('Starting lead monitor workflow', { userId, linkedinUrl });

    // Step 1: Get connected account
    const accountId = await getReporterConnectedAccount(userId);
    log.info('Connected account retrieved', { userId, accountId });

    // Step 2: Find or create lead
    const leadId = await findOrCreateReporterLead(userId, linkedinUrl);
    log.info('Lead found or created', { userId, linkedinUrl, leadId });

    // Step 3: Initial fetch to establish baseline
    log.info('Performing initial profile fetch', { leadId, accountId, linkedinUrl });

    const initialProfile = await fetchReporterLeadProfile(accountId, linkedinUrl);

    // Update lead with initial profile data
    const initialUpdateResult = await updateReporterLeadProfile(leadId, initialProfile);

    log.info('Initial profile fetch completed', {
        leadId,
        hasChanges: Object.values(initialUpdateResult.changes).some(v => v),
    });

    // Step 4: Daily monitoring loop
    log.info('Starting daily monitoring loop', { leadId });

    // Continue monitoring indefinitely (workflow will run until cancelled)
    while (true) {
        // Wait 24 hours before next fetch
        log.info('Waiting 24 hours before next profile fetch', { leadId });
        // await sleep('24 hours' as Duration);
        await sleep('5 minutes' as Duration);

        // Fetch profile
        log.info('Fetching profile for daily check', { leadId, accountId, linkedinUrl });
        const profile = await fetchReporterLeadProfile(accountId, linkedinUrl);

        // Update lead with new profile data
        const updateResult = await updateReporterLeadProfile(leadId, profile);

        // Log changes if any
        const hasChanges = Object.values(updateResult.changes).some(v => v);
        if (hasChanges) {
            log.info('Profile changes detected', {
                leadId,
                changes: updateResult.changes,
            });
        } else {
            log.info('No profile changes detected', { leadId });
            }
    }
}
