import { log, proxyActivities, sleep, defineSignal, defineQuery, condition, setHandler, continueAsNew } from '@temporalio/workflow';
import { Duration } from '@temporalio/common';
import type * as reportingActivities from '../activities/reportingActivities';

const { fetchReporterCompanyProfile, updateReporterCompanyProfile, getAnyReporterConnectedAccount, getReporterCompanyById, updateCompanyPost } = proxyActivities<typeof reportingActivities>({
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

    const { profile: initialProfileResult, posts } = await fetchReporterCompanyProfile(company.linkedin_url);

    const initialUpdateResult = await updateReporterCompanyProfile(companyId, initialProfileResult, true, company.user_id);

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
        const totalMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        // const totalMs = 10 * 1000;
        const checkMs = 60 * 60 * 1000; // 1 hour
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

        // Fetch profile and posts
        log.info('Fetching profile for weekly check', { companyId, linkedinUrl: company.linkedin_url });
        // --- Company post monitoring logic ---
        // You need to implement fetchReporterCompanyProfile to also return posts (like fetchReporterLeadProfile)
        const { profile, posts } = await fetchReporterCompanyProfile(company.linkedin_url);

        if (isPaused) {
            log.info('Workflow paused after profile fetch, waiting for resume', { companyId });
            await condition(() => !isPaused);
            log.info('Workflow resumed, continuing with profile update', { companyId });
        }

        // Process company posts (mirroring lead logic)
        // You need to implement updateCompanyPost in reportingActivities
        await Promise.all(
            posts?.map(async postId => {
                await updateCompanyPost(companyId, false, company.user_id, postId);
            }) ?? [],
        );

        const updateResult = await updateReporterCompanyProfile(companyId, profile, false, company.user_id);
        const hasChanges = Object.values(updateResult.changes).some(v => v);
        if (hasChanges) {
            log.info('Profile changes detected', {
                companyId,
                changes: updateResult.changes,
            });
        } else {
            log.info('No profile changes detected', { companyId });
        }
        await continueAsNew(input);
    }
}
