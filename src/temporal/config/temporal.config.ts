import { ConnectionOptions, TLSConfig } from '@temporalio/client';
import logger from '../../utils/logger';
import { getCampaignTaskQueue } from '../../utils/queueUtil';

export interface TemporalConfig {
    address: string;
    apiKey: string;
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
    const namespace = process.env.TEMPORAL_NAMESPACE;
    const address = process.env.TEMPORAL_ADDRESS;
    const apiKey = process.env.TEMPORAL_API_KEY;
    const clientCert = process.env.TEMPORAL_CLIENT_CERT;
    const clientKey = process.env.TEMPORAL_CLIENT_KEY;

    if (!namespace || !address || !apiKey) {
        throw new Error('Missing required Temporal configuration. TEMPORAL_NAMESPACE, TEMPORAL_API and TEMPORAL_ADDRESS are required.');
    }

    const config: TemporalConfig = {
        apiKey,
        address,
        namespace,
        identity: `clento-backend-${process.env.NODE_ENV}`,
        taskQueue: getCampaignTaskQueue(), // ✅ Must match worker and client
        workflowExecutionTimeout: '30d', // Maximum campaign duration
        workflowRunTimeout: '30d',
        workflowTaskTimeout: '10s',
        activityExecutionTimeout: '5m', // LinkedIn API calls can take time
        activityTaskTimeout: '30s',
        activityHeartbeatTimeout: '30s',
    };

    // Only add TLS if client certificates are provided
    if (clientCert && clientKey) {
        config.tls = {
            clientCertPair: {
                crt: Buffer.from(clientCert, 'base64'),
                key: Buffer.from(clientKey, 'base64'),
            },
        };
    }

    return config;
}

/**
 * Get Temporal client connection options
 */
export function getTemporalConnectionOptions(): ConnectionOptions {
    const config = getTemporalConfig();

    const connectionOptions: ConnectionOptions = {
        address: config.address,
        tls: true,
        apiKey: config.apiKey,
    };

    // Only add TLS if it's configured
    if (config.tls) {
        connectionOptions.tls = config.tls;
    }

    logger.info('Temporal connection configuration', {
        address: config.address,
        namespace: config.namespace,
        identity: config.identity,
        hasTLS: true,
    });

    return connectionOptions;
}
