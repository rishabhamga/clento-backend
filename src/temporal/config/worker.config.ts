/**
 * Temporal Worker Configuration
 * 
 * Configuration for Temporal workers including resource limits,
 * concurrency settings, and worker-specific options.
 */

import { WorkerOptions } from '@temporalio/worker';
import { getTemporalConfig } from './temporal.config';
import { logger } from '../../utils/logger';

export interface WorkerConfig {
    taskQueue: string;
    maxConcurrentActivityTaskExecutions: number;
    maxConcurrentWorkflowTaskExecutions: number;
    maxConcurrentActivityTaskPolls: number;
    maxConcurrentWorkflowTaskPolls: number;
    maxActivitiesPerSecond: number;
    maxTaskQueueActivitiesPerSecond: number;
    stickyQueueScheduleToStartTimeout: string;
    enableLogging: boolean;
    shutdownGraceTime: string;
}

/**
 * Get worker configuration based on environment
 */
export function getWorkerConfig(): WorkerConfig {
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
        return {
            taskQueue: getTemporalConfig().taskQueue,
            maxConcurrentActivityTaskExecutions: 100, // Handle many LinkedIn API calls
            maxConcurrentWorkflowTaskExecutions: 50,  // Manage workflow decisions
            maxConcurrentActivityTaskPolls: 10,
            maxConcurrentWorkflowTaskPolls: 5,
            maxActivitiesPerSecond: 200, // Rate limit activities
            maxTaskQueueActivitiesPerSecond: 100,
            stickyQueueScheduleToStartTimeout: '10s',
            enableLogging: true,
            shutdownGraceTime: '30s',
        };
    }

    // Development configuration - more conservative limits
    return {
        taskQueue: getTemporalConfig().taskQueue,
        maxConcurrentActivityTaskExecutions: 20,
        maxConcurrentWorkflowTaskExecutions: 10,
        maxConcurrentActivityTaskPolls: 5,
        maxConcurrentWorkflowTaskPolls: 2,
        maxActivitiesPerSecond: 50,
        maxTaskQueueActivitiesPerSecond: 25,
        stickyQueueScheduleToStartTimeout: '10s',
        enableLogging: true,
        shutdownGraceTime: '10s',
    };
}

/**
 * Get Temporal worker options
 */
export function getWorkerOptions(): Partial<WorkerOptions> {
    const config = getWorkerConfig();
    const temporalConfig = getTemporalConfig();
    
    const workerOptions: Partial<WorkerOptions> = {
        taskQueue: config.taskQueue,
        maxConcurrentActivityTaskExecutions: config.maxConcurrentActivityTaskExecutions,
        maxConcurrentWorkflowTaskExecutions: config.maxConcurrentWorkflowTaskExecutions,
        maxConcurrentActivityTaskPolls: config.maxConcurrentActivityTaskPolls,
        maxConcurrentWorkflowTaskPolls: config.maxConcurrentWorkflowTaskPolls,
        maxActivitiesPerSecond: config.maxActivitiesPerSecond,
        maxTaskQueueActivitiesPerSecond: config.maxTaskQueueActivitiesPerSecond,
        stickyQueueScheduleToStartTimeout: config.stickyQueueScheduleToStartTimeout,
        
        // Identity for worker registration
        identity: temporalConfig.identity,
        
        // Enable worker versioning for safe deployments
        buildId: process.env.BUILD_ID || 'dev-build',
        useVersioning: process.env.NODE_ENV === 'production',
        
        // Shutdown configuration
        shutdownGraceTime: config.shutdownGraceTime,
        
        // Logging configuration
        enableLogging: config.enableLogging,
    };

    logger.info('Worker configuration initialized', {
        taskQueue: config.taskQueue,
        maxConcurrentActivities: config.maxConcurrentActivityTaskExecutions,
        maxConcurrentWorkflows: config.maxConcurrentWorkflowTaskExecutions,
        maxActivitiesPerSecond: config.maxActivitiesPerSecond,
        identity: temporalConfig.identity,
    });

    return workerOptions;
}

/**
 * Validate worker configuration
 */
export function validateWorkerConfig(): void {
    try {
        const config = getWorkerConfig();
        
        if (config.maxConcurrentActivityTaskExecutions <= 0) {
            throw new Error('maxConcurrentActivityTaskExecutions must be greater than 0');
        }
        
        if (config.maxConcurrentWorkflowTaskExecutions <= 0) {
            throw new Error('maxConcurrentWorkflowTaskExecutions must be greater than 0');
        }
        
        if (config.maxActivitiesPerSecond <= 0) {
            throw new Error('maxActivitiesPerSecond must be greater than 0');
        }

        logger.info('Worker configuration validated successfully');
    } catch (error) {
        logger.error('Worker configuration validation failed', { error });
        throw error;
    }
}
