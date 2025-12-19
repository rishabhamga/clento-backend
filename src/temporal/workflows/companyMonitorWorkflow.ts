import { log, proxyActivities, sleep, defineSignal, defineQuery, condition, setHandler } from '@temporalio/workflow';
import { Duration } from '@temporalio/common';
import type * as reportingActivities from '../activities/reportingActivities';

const { fetchReporterCompanyProfile, updateReporterCompanyProfile, getAnyReporterConnectedAccount, getReporterCompanyById } = proxyActivities<typeof reportingActivities>({
    startToCloseTimeout: '1 minute',
    retry: {
        maximumAttempts: 10,
        initialInterval: '5 minutes',
        backoffCoefficient: 2,
    },
});

const pauseSignal = defineSignal('pause-company-monitoring');
const resumeSignal = defineSignal('resume-company-monitoring');

const monitoringStatusQuery = defineQuery<{ isPaused: boolean; companyId: string }>('get-company-monitoring-status');

export interface CompanyMonitorWorkflowInput {
    companyId: string;
}

export async function companyMonitorWorkflow(input: CompanyMonitorWorkflowInput): Promise<void> {
    const { companyId } = input;

    log.info('Starting company monitor workflow', { companyId });

    let isPaused = false;

    const pauseHandler = () => {
        isPaused = true;
        log.info('Company monitoring paused via signal', { companyId });
    };

    const resumeHandler = () => {
        isPaused = false;
        log.info('Company monitoring resumed via signal', { companyId });
    };

    const statusQueryHandler = () => {
        return {
            isPaused,
            companyId,
        };
    };

    setHandler(pauseSignal, pauseHandler);
    setHandler(resumeSignal, resumeHandler);
    setHandler(monitoringStatusQuery, statusQueryHandler);

    // Step 1: Get company details from database
    const company = await getReporterCompanyById(companyId);
    log.info('Company details retrieved', { companyId, userId: company.user_id, linkedinUrl: company.linkedin_url });

    // Step 2: Initial fetch to establish baseline
    log.info('Performing initial profile fetch', { companyId, linkedinUrl: company.linkedin_url });

    const initialProfile = await fetchReporterCompanyProfile(company.linkedin_url);

    const initialUpdateResult = await updateReporterCompanyProfile(companyId, initialProfile);

    log.info('Initial profile fetch completed', {
        companyId,
        hasChanges: Object.values(initialUpdateResult.changes).some(v => v),
    });

    log.info('Starting weekly monitoring loop', { companyId });

    while (true) {
        if (isPaused) {
            log.info('Workflow is paused, waiting for resume signal', { companyId });

            await condition(() => !isPaused);

            log.info('Workflow resumed, continuing immediately', { companyId });
        }

        log.info('Waiting 7 days before next profile fetch', { companyId });

        const totalMs = 7 * 24 * 60 * 60 * 1000; // Total wait before the repeat (7 days)
        const checkMs = 60 * 60 * 1000; // Wait before checking the pause status (1 hour)

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
                log.info('Pause signal received during sleep, pausing workflow', { companyId });
                break;
            }
        }

        if (isPaused) {
            log.info('Workflow is paused after sleep, waiting for resume signal', { companyId });
            await condition(() => !isPaused);
            log.info('Workflow resumed after pause, continuing immediately', { companyId });
        }

        // Fetch profile
        log.info('Fetching profile for weekly check', { companyId, linkedinUrl: company.linkedin_url });
        const profile = await fetchReporterCompanyProfile(company.linkedin_url);

        if (isPaused) {
            log.info('Workflow paused after profile fetch, waiting for resume', { companyId });
            await condition(() => !isPaused);
            log.info('Workflow resumed, continuing with profile update', { companyId });
        }

        const updateResult = await updateReporterCompanyProfile(companyId, profile);

        const hasChanges = Object.values(updateResult.changes).some(v => v);
        if (hasChanges) {
            log.info('Profile changes detected', {
                companyId,
                changes: updateResult.changes,
            });
        } else {
            log.info('No profile changes detected', { companyId });
        }
    }
}
