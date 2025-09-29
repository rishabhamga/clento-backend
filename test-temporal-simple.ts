#!/usr/bin/env ts-node

/**
 * Simple Temporal Test Script
 *
 * This script runs a single, simple test to debug Temporal connectivity issues.
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import { TemporalService } from './src/services/TemporalService';
import logger from './src/utils/logger';

async function runSimpleTest(): Promise<void> {
    try {
        logger.info('🚀 Starting simple Temporal test...');

        // Debug environment variables
        logger.info('🔍 Environment check:', {
            TEMPORAL_WORKER_ENABLED: process.env.TEMPORAL_WORKER_ENABLED,
            TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE,
            TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
            NODE_ENV: process.env.NODE_ENV
        });

        // Initialize Temporal service
        logger.info('📡 Initializing Temporal service...');
        const temporalService = TemporalService.getInstance();
        await temporalService.initialize();
        logger.info('✅ Temporal service initialized successfully');

        // Run a simple test
        logger.info('🔄 Running simple workflow test...');
        const result = await temporalService.runTestWorkflow({
            message: 'Simple test message',
            iterations: 1
        });

        logger.info('🎉 Test completed successfully!', {
            workflowId: result.workflowId,
            runId: result.runId,
            success: result.success
        });

        logger.info('✅ Temporal is working correctly!');

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
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    runSimpleTest()
        .then(() => {
            logger.info('🏁 Simple test script completed');
            process.exit(0);
        })
        .catch((error) => {
            logger.error('💥 Simple test script failed:', error);
            process.exit(1);
        });
}

export { runSimpleTest };
