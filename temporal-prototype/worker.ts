/**
 * Temporal Worker
 * 
 * Creates and configures Temporal worker for processing workflows and activities.
 */

import { Worker, NativeConnection } from '@temporalio/worker';
import { getTemporalConnectionOptions, getTemporalConfig } from './config/temporal.config';
import { getWorkerOptions } from './config/worker.config';
import { logger } from '../utils/logger';
import * as activities from './activities';
import { CampaignOrchestratorWorkflow } from './workflows/campaign-orchestrator.workflow';
import { LeadOutreachWorkflow } from './workflows/lead-outreach.workflow';

/**
 * Create and configure Temporal worker
 */
export async function createTemporalWorker(): Promise<Worker> {
    try {
        logger.info('Creating Temporal worker');

        // Create native connection
        const connection = await NativeConnection.connect(getTemporalConnectionOptions());
        
        // Get configuration
        const config = getTemporalConfig();
        const workerOptions = getWorkerOptions();

        // Create worker
        const worker = await Worker.create({
            connection,
            namespace: config.namespace,
            workflowsPath: require.resolve('./workflows'),
            activities,
            ...workerOptions,
        });

        logger.info('Temporal worker created successfully', {
            namespace: config.namespace,
            taskQueue: config.taskQueue,
            identity: config.identity,
        });

        return worker;

    } catch (error) {
        logger.error('Failed to create Temporal worker', { error });
        throw error;
    }
}

/**
 * Start Temporal worker
 */
export async function startTemporalWorker(): Promise<Worker> {
    try {
        const worker = await createTemporalWorker();
        
        logger.info('Starting Temporal worker');
        
        // Set up graceful shutdown
        process.on('SIGINT', async () => {
            logger.info('Received SIGINT, shutting down Temporal worker gracefully');
            await worker.shutdown();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            logger.info('Received SIGTERM, shutting down Temporal worker gracefully');
            await worker.shutdown();
            process.exit(0);
        });

        // Start the worker
        await worker.run();

        return worker;

    } catch (error) {
        logger.error('Failed to start Temporal worker', { error });
        throw error;
    }
}

/**
 * Initialize Temporal worker in development mode
 */
export async function initializeTemporalWorker(): Promise<Worker | null> {
    try {
        // Only start worker if explicitly enabled
        if (process.env.TEMPORAL_WORKER_ENABLED !== 'true') {
            logger.info('Temporal worker disabled, skipping initialization');
            return null;
        }

        logger.info('Initializing Temporal worker for development');
        
        const worker = await createTemporalWorker();
        
        // Run worker in background for development
        worker.run().catch((error) => {
            logger.error('Temporal worker failed', { error });
        });

        logger.info('Temporal worker initialized and running in background');
        
        return worker;

    } catch (error) {
        logger.error('Failed to initialize Temporal worker', { error });
        return null;
    }
}
