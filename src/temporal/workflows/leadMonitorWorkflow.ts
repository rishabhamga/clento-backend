import { log, proxyActivities, sleep, defineSignal, defineQuery, condition, setHandler } from '@temporalio/workflow';
import { Duration } from '@temporalio/common';
import type * as reportingActivities from '../activities/reportingActivities';

const { fetchReporterLeadProfile, updateReporterLeadProfile, getReporterLeadById, updateLeadPost } = proxyActivities<typeof reportingActivities>({
    startToCloseTimeout: '1 minute',
    retry: {
        maximumAttempts: 10,
        initialInterval: '5 minutes',
        backoffCoefficient: 2,
    },
});

// Signal definitions for pause/resume functionality
// Signals allow external systems to communicate with the workflow without polling
const pauseSignal = defineSignal('pause-lead-monitoring');
const resumeSignal = defineSignal('resume-lead-monitoring');

// Query definition to check monitoring status
// Queries allow external systems to read workflow state without affecting execution
const monitoringStatusQuery = defineQuery<{ isPaused: boolean; leadId: string }>('get-monitoring-status');

export interface LeadMonitorWorkflowInput {
    leadId: string;
}

export async function leadMonitorWorkflow(input: LeadMonitorWorkflowInput): Promise<void> {
    const { leadId } = input;

    log.info('Starting lead monitor workflow', { leadId });

    let isPaused = false;

    const pauseHandler = () => {
        isPaused = true;
        log.info('Lead monitoring paused via signal', { leadId });
    };

    const resumeHandler = () => {
        isPaused = false;
        log.info('Lead monitoring resumed via signal', { leadId });
    };

    const statusQueryHandler = () => {
        return {
            isPaused,
            leadId,
        };
    };

    setHandler(pauseSignal, pauseHandler);
    setHandler(resumeSignal, resumeHandler);
    setHandler(monitoringStatusQuery, statusQueryHandler);

    // Step 1: Get lead details from database
    const lead = await getReporterLeadById(leadId);
    log.info('Lead details retrieved', { leadId, userId: lead.user_id, linkedinUrl: lead.linkedin_url });

    // Step 2: Initial fetch to establish baseline
    log.info('Performing initial profile fetch', { leadId, linkedinUrl: lead.linkedin_url });

    const { profile: initialProfileResult, posts } = await fetchReporterLeadProfile(lead.linkedin_url);

    const initialUpdateResult = await updateReporterLeadProfile(leadId, initialProfileResult, true, lead.user_id);

    log.info('Initial profile fetch completed', {
        leadId,
        hasChanges: Object.values(initialUpdateResult.changes).some(v => v),
    });

    log.info('Starting daily monitoring loop', { leadId });

    while (true) {
        if (isPaused) {
            log.info('Workflow is paused, waiting for resume signal', { leadId });

            await condition(() => !isPaused);

            log.info('Workflow resumed, continuing immediately', { leadId });
        }

        log.info('Waiting 24 hours before next profile fetch', { leadId });

        // const totalMs = 24 * 60 * 60 * 1000; // Total wait before the repeat
        // TEST TOTAL MS
        const totalMs = 10 * 1000; // 10 seconds

        const checkMs = 60 * 60 * 1000; // Wait before checking the pause status

        let remainingMs = totalMs;

        while (remainingMs > 0 && !isPaused) {
            const sleepMs = Math.min(checkMs, remainingMs);

            let sleepChunk: Duration;
            if (sleepMs >= 3600000) {
                const hours = Math.floor(sleepMs / 3600000);
                sleepChunk = `${hours}h` as Duration;
            } else if (sleepMs >= 60000) {
                const minutes = Math.floor(sleepMs / 60000);
                sleepChunk = `${minutes}m` as Duration;
            } else {
                const seconds = Math.floor(sleepMs / 1000);
                sleepChunk = `${seconds}s` as Duration;
            }

            await sleep(sleepChunk);
            remainingMs -= sleepMs;

            if (isPaused) {
                log.info('Pause signal received during sleep, pausing workflow', { leadId });
                break;
            }
        }

        if (isPaused) {
            log.info('Workflow is paused after sleep, waiting for resume signal', { leadId });
            await condition(() => !isPaused);
            log.info('Workflow resumed after pause, continuing immediately', { leadId });
        }

        // Fetch profile
        log.info('Fetching profile for daily check', { leadId, linkedinUrl: lead.linkedin_url });
        const { profile, posts } = await fetchReporterLeadProfile(lead.linkedin_url);

        if (isPaused) {
            log.info('Workflow paused after profile fetch, waiting for resume', { leadId });
            await condition(() => !isPaused);
            log.info('Workflow resumed, continuing with profile update', { leadId });
        }

        await Promise.all(
            posts?.map(async postId => {
                await updateLeadPost(leadId, false, lead.user_id, postId);
            }) ?? [],
        );

        const updateResult = await updateReporterLeadProfile(leadId, profile, false, lead.user_id);

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
