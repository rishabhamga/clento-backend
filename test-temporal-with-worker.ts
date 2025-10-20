#!/usr/bin/env ts-node

/**
 * Temporal Test Script with Worker
 *
 * This script starts the Temporal worker and then runs tests.
 * Use this when you want to test workflows without starting the full server.
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import { TemporalService } from './src/services/TemporalService';
import { initializeTemporalWorker } from './src/temporal/worker';
import logger from './src/utils/logger';

interface TestResult {
    success: boolean;
    workflowId: string;
    runId: string;
    result: any;
}

async function runTemporalTestWithWorker(): Promise<void> {
    let worker: any = null;

    try {
        logger.info('🚀 Starting Temporal test with worker...');

        logger.info('🔍 Environment check:', {
            TEMPORAL_WORKER_ENABLED: process.env.TEMPORAL_WORKER_ENABLED,
            TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE,
            TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
            NODE_ENV: process.env.NODE_ENV
        });


        logger.info('📡 Initializing Temporal service...');
        const temporalService = TemporalService.getInstance();
        await temporalService.initialize();
        logger.info('✅ Temporal service initialized successfully');

        logger.info('👷 Starting Temporal worker...');
        worker = await initializeTemporalWorker();

        if (worker) {
            logger.info('✅ Temporal worker started successfully');
        } else {
            logger.warn('⚠️ Temporal worker not started (check TEMPORAL_WORKER_ENABLED)');
        }

        logger.info('⏳ Waiting for worker to be ready...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        logger.info('🔄 Running simple workflow test...');
        const result: TestResult = await temporalService.runTestWorkflow({
            message: 'Test with worker running',
            iterations: 1
        });

        logger.info('🎉 Test completed successfully!', {
            workflowId: result.workflowId,
            runId: result.runId,
            success: result.success
        });

        logger.info('✅ Temporal is working correctly with worker!');

    } catch (error) {
        logger.error('❌ Test failed:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined
        });

        // Provide helpful debugging information
        logger.info('🔍 Debugging tips:');
        logger.info('1. Check if TEMPORAL_WORKER_ENABLED=true in your environment');
        logger.info('2. Verify Temporal configuration (TEMPORAL_NAMESPACE, TEMPORAL_ADDRESS, TEMPORAL_API_KEY)');
        logger.info('3. Ensure the Temporal worker is running');
        logger.info('4. Check Temporal Cloud connection');

        process.exit(1);
    } finally {
        // Clean up worker
        if (worker) {
            logger.info('🛑 Shutting down worker...');
            try {
                await worker.shutdown();
                logger.info('✅ Worker shut down successfully');
            } catch (shutdownError) {
                logger.error('❌ Error shutting down worker:', shutdownError);
            }
        }
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    runTemporalTestWithWorker()
        .then(() => {
            logger.info('🏁 Test script completed');
            process.exit(0);
        })
        .catch((error) => {
            logger.error('💥 Test script failed:', error);
            process.exit(1);
        });
}

export { runTemporalTestWithWorker };
