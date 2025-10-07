import { NativeConnection, Worker } from '@temporalio/worker';
import logger from "../utils/logger";
import * as activities from './activities';
import { getTemporalConfig } from "./config/temporal.config";

export async function runParentWorker() {
    const config = getTemporalConfig();

    const connection = await NativeConnection.connect({
        address: config.address,
        tls: config.tls ? config.tls : true,
        apiKey: config.apiKey,
    });

    const worker = await Worker.create({
        connection,
        namespace: config.namespace,
        workflowsPath: require.resolve('./workflows'),
        activities,
        taskQueue: 'campaign-task-queue',
    });

    logger.info('Worker created, starting to poll for tasks', {
        taskQueue: 'campaign-task-queue',
        namespace: config.namespace,
    });

    await worker.run();
}