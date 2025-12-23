import env from '../config/env';

/**
 * Get queue name with environment suffix
 * If USE_DEVELOPMENT_QUEUE is true, appends '-dev', otherwise appends '-prod'
 *
 * This utility is safe to use in Temporal workflow bundles as it only imports env config
 */
export function getQueueName(baseQueueName: string): string {
    const suffix = env.USE_DEVELOPMENT_QUEUE ? '-dev' : '';
    return `${baseQueueName}${suffix}`;
}

/**
 * Campaign task queue name
 */
export function getCampaignTaskQueue(): string {
    return getQueueName('campaign-task-queue');
}

/**
 * Lead monitor task queue name
 */
export function getLeadMonitorTaskQueue(): string {
    return getQueueName('lead-monitor-task-queue');
}
