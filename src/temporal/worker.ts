import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { getWorkerOptions } from './config/worker.config';
import { getTemporalConfig } from './config/temporal.config';
import logger from '../utils/logger';

/**
 * WorkerManager - Manages Temporal worker lifecycle
 *
 * This service handles:
 * - Starting workers on application startup
 * - Graceful shutdown of workers
 * - Worker health monitoring
 * - Multiple worker instances (if needed)
 */
export class WorkerManager {
    private static instance: WorkerManager;
    private workers: Worker[] = [];
    private connections: NativeConnection[] = [];
    private isRunning: boolean = false;

    private constructor() {}

    public static getInstance(): WorkerManager {
        if (!WorkerManager.instance) {
            WorkerManager.instance = new WorkerManager();
        }
        return WorkerManager.instance;
    }

    /**
     * Start a single worker instance
     * This worker will handle multiple campaigns concurrently
     */
    public async startWorker(): Promise<void> {
        if (this.isRunning) {
            logger.warn('Worker is already running, skipping start');
            return;
        }

        try {
            logger.info('Starting Temporal worker...');

            const config = getTemporalConfig();
            const workerOptions = getWorkerOptions();

            // Create connection to Temporal
            const connection = await NativeConnection.connect({
                address: config.address,
                tls: config.tls ? config.tls : true,
                apiKey: config.apiKey,
            });

            this.connections.push(connection);

            // Create worker with configuration
            const worker = await Worker.create({
                connection,
                namespace: config.namespace,
                workflowsPath: require.resolve('./workflows'),
                activities,
                taskQueue: 'campaign-task-queue',
                ...workerOptions,
            });

            this.workers.push(worker);

            logger.info('Worker created successfully', {
                taskQueue: 'campaign-task-queue',
                namespace: config.namespace,
                maxConcurrentWorkflows: workerOptions.maxConcurrentWorkflowTaskExecutions,
                maxConcurrentActivities: workerOptions.maxConcurrentActivityTaskExecutions,
                identity: workerOptions.identity,
            });

            // Run worker in background (non-blocking)
            this.runWorkerInBackground(worker);

            this.isRunning = true;

            logger.info('✅ Temporal worker started and running');

        } catch (error) {
            logger.error('Failed to start worker', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            throw error;
        }
    }

    /**
     * Run worker in background without blocking
     */
    private runWorkerInBackground(worker: Worker): void {
        // Run worker without awaiting - it will run indefinitely
        worker.run().then(() => {
            logger.info('Worker stopped gracefully');
            this.isRunning = false;
        }).catch((error) => {
            logger.error('Worker encountered an error', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            this.isRunning = false;
        });
    }

    /**
     * Start multiple worker instances for better concurrency
     * Use this in production to handle more campaigns
     */
    public async startMultipleWorkers(count: number = 1): Promise<void> {
        logger.info(`Starting ${count} worker instance(s)...`);

        for (let i = 0; i < count; i++) {
            try {
                await this.startWorker();
                logger.info(`Worker ${i + 1}/${count} started`);
            } catch (error) {
                logger.error(`Failed to start worker ${i + 1}/${count}`, { error });
                // Continue trying to start remaining workers
            }
        }

        logger.info(`✅ Started ${this.workers.length} worker(s) successfully`);
    }

    /**
     * Gracefully shutdown all workers
     * Called on application shutdown
     */
    public async shutdown(): Promise<void> {
        if (!this.isRunning || this.workers.length === 0) {
            logger.info('No workers to shutdown');
            return;
        }

        logger.info('Shutting down workers gracefully...');

        try {
            // Shutdown all workers in parallel
            await Promise.all(
                this.workers.map(async (worker, index) => {
                    try {
                        logger.info(`Shutting down worker ${index + 1}/${this.workers.length}`);
                        await worker.shutdown();
                        logger.info(`Worker ${index + 1} shut down successfully`);
                    } catch (error) {
                        logger.error(`Error shutting down worker ${index + 1}`, { error });
                    }
                })
            );

            // Close all connections
            await Promise.all(
                this.connections.map(async (connection, index) => {
                    try {
                        await connection.close();
                        logger.info(`Connection ${index + 1} closed`);
                    } catch (error) {
                        logger.error(`Error closing connection ${index + 1}`, { error });
                    }
                })
            );

            this.workers = [];
            this.connections = [];
            this.isRunning = false;

            logger.info('✅ All workers shut down successfully');
        } catch (error) {
            logger.error('Error during worker shutdown', { error });
            throw error;
        }
    }

    /**
     * Get worker status
     */
    public getStatus(): {
        isRunning: boolean;
        workerCount: number;
        connectionCount: number;
    } {
        return {
            isRunning: this.isRunning,
            workerCount: this.workers.length,
            connectionCount: this.connections.length,
        };
    }

    /**
     * Check if workers are running
     */
    public isWorkerRunning(): boolean {
        return this.isRunning;
    }
}