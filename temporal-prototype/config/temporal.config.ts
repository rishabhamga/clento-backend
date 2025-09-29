/**
 * Temporal Configuration
 *
 * Configuration for connecting to Temporal Cloud and managing client settings.
 * This configuration supports both development and production environments.
 */

import { ConnectionOptions, TLSConfig } from '@temporalio/client';
import logger from '../../src/utils/logger';

export interface TemporalConfig {
    address: string;
    namespace: string;
    tls?: TLSConfig;
    identity?: string;
    taskQueue: string;
    workflowExecutionTimeout: string;
    workflowRunTimeout: string;
    workflowTaskTimeout: string;
    activityExecutionTimeout: string;
    activityTaskTimeout: string;
    activityHeartbeatTimeout: string;
}

/**
 * Get Temporal configuration based on environment
 */
export function getTemporalConfig(): TemporalConfig {
    const isProduction = process.env.NODE_ENV === 'production';

    // Temporal Cloud configuration
    if (isProduction || process.env.TEMPORAL_CLOUD_ENABLED === 'true') {
        const namespace = process.env.TEMPORAL_NAMESPACE;
        const address = process.env.TEMPORAL_ADDRESS;
        const clientCert = process.env.TEMPORAL_CLIENT_CERT;
        const clientKey = process.env.TEMPORAL_CLIENT_KEY;

        if (!namespace || !address || !clientCert || !clientKey) {
            throw new Error('Missing required Temporal Cloud configuration. Please check environment variables.');
        }

        return {
            address,
            namespace,
            tls: {
                clientCertPair: {
                    crt: Buffer.from(clientCert, 'base64'),
                    key: Buffer.from(clientKey, 'base64'),
                },
            },
            identity: `clento-backend-${process.env.NODE_ENV}`,
            taskQueue: 'clento-outreach-queue',
            workflowExecutionTimeout: '30d', // Maximum campaign duration
            workflowRunTimeout: '30d',
            workflowTaskTimeout: '10s',
            activityExecutionTimeout: '5m', // LinkedIn API calls can take time
            activityTaskTimeout: '30s',
            activityHeartbeatTimeout: '30s',
        };
    }

    // Local development configuration
    return {
        address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
        namespace: process.env.TEMPORAL_NAMESPACE || 'default',
        identity: 'clento-backend-dev',
        taskQueue: 'clento-outreach-queue-dev',
        workflowExecutionTimeout: '30d',
        workflowRunTimeout: '30d',
        workflowTaskTimeout: '10s',
        activityExecutionTimeout: '5m',
        activityTaskTimeout: '30s',
        activityHeartbeatTimeout: '30s',
    };
}

/**
 * Get Temporal client connection options
 */
export function getTemporalConnectionOptions(): ConnectionOptions {
    const config = getTemporalConfig();

    const connectionOptions: ConnectionOptions = {
        address: config.address,
        tls: config.tls,
    };

    logger.info('Temporal connection configuration', {
        address: config.address,
        namespace: config.namespace,
        identity: config.identity,
        hasTLS: !!config.tls,
    });

    return connectionOptions;
}

/**
 * Validate Temporal configuration
 */
export function validateTemporalConfig(): void {
    try {
        const config = getTemporalConfig();

        if (!config.address) {
            throw new Error('Temporal address is required');
        }

        if (!config.namespace) {
            throw new Error('Temporal namespace is required');
        }

        if (!config.taskQueue) {
            throw new Error('Temporal task queue is required');
        }

        logger.info('Temporal configuration validated successfully', {
            namespace: config.namespace,
            taskQueue: config.taskQueue,
        });
    } catch (error) {
        logger.error('Temporal configuration validation failed', { error });
        throw error;
    }
}
