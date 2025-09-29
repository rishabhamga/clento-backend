import logger from "../utils/logger";
import { Worker, NativeConnection } from '@temporalio/worker';
import { getTemporalConfig } from "./config/temporal.config";
import { getWorkerOptions } from "./config/worker.config";
import * as activities from './activities';

export async function createTemporalWorker() {
    try {
        logger.info('Creating Temporal worker');

        // Get configuration
        const config = getTemporalConfig();
        const workerOptions = getWorkerOptions();

        // Create native connection with proper options
        const connection = await NativeConnection.connect({
            address: config.address,
            tls: true,
            apiKey: config.apiKey
        });

        // Create worker
        const worker = await Worker.create({
            connection,
            namespace: config.namespace,
            workflowsPath: require.resolve('./workflows'),
            activities,
            taskQueue: config.taskQueue,
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
