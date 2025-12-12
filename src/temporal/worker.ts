import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import * as reportingActivities from './activities/reportingActivities';
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
     * Get or create shared Temporal connection
     * Workers can share the same connection
     */
    private async getConnection(): Promise<NativeConnection> {
        // Reuse existing connection if available
        if (this.connections.length > 0) {
            logger.info('Reusing existing Temporal connection', {
                connectionCount: this.connections.length,
            });
            return this.connections[0];
        }

        // Create new connection
        const config = getTemporalConfig();
        const connection = await NativeConnection.connect({
            address: config.address,
            tls: config.tls ? config.tls : true,
            apiKey: config.apiKey,
        });

        this.connections.push(connection);
        logger.info('Created new Temporal connection', {
            address: config.address,
            namespace: config.namespace,
        });

        return connection;
    }

    /**
     * Start campaign worker instance
     * Private method to create a single campaign worker
     */
    private async createCampaignWorker(): Promise<Worker> {
        const config = getTemporalConfig();
        const workerOptions = getWorkerOptions();

        // Get shared connection
        const connection = await this.getConnection();

        // Create worker with configuration
        const workflowsPath = require.resolve('./workflows/index');
        logger.info('Resolved workflows path', { workflowsPath });

        const worker = await Worker.create({
            connection,
            namespace: config.namespace,
            workflowsPath,
            activities,
            ...workerOptions,
            taskQueue: 'campaign-task-queue', // Override taskQueue from workerOptions
        });

        logger.info('Campaign worker created successfully', {
            taskQueue: 'campaign-task-queue',
            namespace: config.namespace,
            maxConcurrentWorkflows: workerOptions.maxConcurrentWorkflowTaskExecutions,
            maxConcurrentActivities: workerOptions.maxConcurrentActivityTaskExecutions,
            identity: workerOptions.identity,
        });

        return worker;
    }

    /**
     * Start lead monitor worker instance
     * Private method to create the lead monitor worker
     */
    private async createLeadMonitorWorker(): Promise<Worker> {
        const config = getTemporalConfig();
        const workerOptions = getWorkerOptions();

        // Get shared connection
        const connection = await this.getConnection();

        // Create worker with lead monitor workflows and activities
        const workflowsPath = require.resolve('./workflows/leadMonitorWorkflows');
        logger.info('Resolved lead monitor workflows path', { workflowsPath });

        const worker = await Worker.create({
            connection,
            namespace: config.namespace,
            workflowsPath,
            activities: reportingActivities,
            ...workerOptions,
            taskQueue: 'lead-monitor-task-queue', // Override taskQueue from workerOptions
        });

        logger.info('Lead monitor worker created successfully', {
            taskQueue: 'lead-monitor-task-queue',
            namespace: config.namespace,
            maxConcurrentWorkflows: workerOptions.maxConcurrentWorkflowTaskExecutions,
            maxConcurrentActivities: workerOptions.maxConcurrentActivityTaskExecutions,
            identity: workerOptions.identity,
        });

        return worker;
    }

    /**
     * Start a single worker instance
     * This starts both the campaign worker and lead monitor worker
     */
    public async startWorker(): Promise<void> {
        if (this.isRunning) {
            logger.warn('Workers are already running, skipping start');
            return;
        }

        try {
            logger.info('Starting Temporal workers (campaign + lead monitor)...');

            // Start campaign worker
            const campaignWorker = await this.createCampaignWorker();
            this.workers.push(campaignWorker);
            this.runWorkerInBackground(campaignWorker, 'campaign-task-queue');
            logger.info('✅ Campaign worker started and running', {
                taskQueue: 'campaign-task-queue',
                workerCount: this.workers.length,
            });

            // Start lead monitor worker
            const leadMonitorWorker = await this.createLeadMonitorWorker();
            this.workers.push(leadMonitorWorker);
            this.runWorkerInBackground(leadMonitorWorker, 'lead-monitor-task-queue');
            logger.info('✅ Lead monitor worker started and running', {
                taskQueue: 'lead-monitor-task-queue',
                workerCount: this.workers.length,
            });

            this.isRunning = true;

            logger.info('✅ All Temporal workers started and running', {
                totalWorkers: this.workers.length,
                campaignWorkers: 1,
                leadMonitorWorkers: 1,
            });
        } catch (error) {
            logger.error('Failed to start workers', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            throw error;
        }
    }


    /**
     * Run worker in background without blocking
     */
    private runWorkerInBackground(worker: Worker, taskQueue: string): void {
        // Run worker without awaiting - it will run indefinitely
        worker
            .run()
            .then(() => {
                logger.info('Worker stopped gracefully', { taskQueue });
                // Only set isRunning to false if all workers have stopped
                // For now, just log - we might want to track individual worker states
            })
            .catch(error => {
                logger.error('Worker encountered an error', {
                    taskQueue,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                });
                // Don't set isRunning to false here - other workers might still be running
            });
    }

    /**
     * Start multiple worker instances for better concurrency
     * Use this in production to handle more campaigns
     * Note: Only starts multiple campaign workers, lead monitor worker is started once
     */
    public async startMultipleWorkers(count: number = 1): Promise<void> {
        if (this.isRunning) {
            logger.warn('Workers are already running, skipping start');
            return;
        }

        logger.info(`Starting ${count} campaign worker instance(s) + 1 lead monitor worker...`);

        try {
            // Start multiple campaign workers
            for (let i = 0; i < count; i++) {
                try {
                    const campaignWorker = await this.createCampaignWorker();
                    this.workers.push(campaignWorker);
                    this.runWorkerInBackground(campaignWorker, 'campaign-task-queue');
                    logger.info(`Campaign worker ${i + 1}/${count} started`, {
                        taskQueue: 'campaign-task-queue',
                    });
                } catch (error) {
                    logger.error(`Failed to start campaign worker ${i + 1}/${count}`, { error });
                    // Continue trying to start remaining workers
                }
            }

            // Start lead monitor worker (only one needed)
            try {
                const leadMonitorWorker = await this.createLeadMonitorWorker();
                this.workers.push(leadMonitorWorker);
                this.runWorkerInBackground(leadMonitorWorker, 'lead-monitor-task-queue');
                logger.info('Lead monitor worker started', {
                    taskQueue: 'lead-monitor-task-queue',
                });
            } catch (error) {
                logger.error('Failed to start lead monitor worker', { error });
                // Log but don't fail - campaign workers might still be running
            }

            this.isRunning = true;

            logger.info(`✅ Started ${this.workers.length} worker(s) successfully (${count} campaign + 1 lead monitor)`);
        } catch (error) {
            logger.error('Failed to start multiple workers', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
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
                }),
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
                }),
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
