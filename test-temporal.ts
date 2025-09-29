#!/usr/bin/env ts-node

/**
 * Temporal Test Script
 *
 * This script demonstrates how to test the Temporal workflow system.
 * It can be run independently to verify Temporal connectivity and workflow execution.
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import { TemporalService } from './src/services/TemporalService';
import logger from './src/utils/logger';

interface TestResult {
    success: boolean;
    workflowId: string;
    runId: string;
    result: any;
}

async function runSingleTest(
    testName: string,
    testConfig: { message: string; delay?: number; iterations?: number },
    temporalService: TemporalService
): Promise<TestResult | null> {
    try {
        logger.info(`Running ${testName}`);
        const result = await temporalService.runTestWorkflow(testConfig);
        logger.info(`${testName} completed successfully:`, result);
        return result;
    } catch (error) {
        logger.error(`${testName} failed:`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            testConfig
        });
        return null;
    }
}

async function runTemporalTest(): Promise<void> {
    try {
        logger.info('Starting Temporal test...');

        // Initialize Temporal service
        const temporalService = TemporalService.getInstance();
        await temporalService.initialize();

        logger.info('Temporal service initialized successfully');

        const results: (TestResult | null)[] = [];

        // Test 1: Simple workflow with no delay
        const result1 = await runSingleTest(
            'Test 1: Simple workflow',
            { message: 'Hello from Temporal test!', iterations: 1 },
            temporalService
        );
        results.push(result1);

        // Test 2: Workflow with delay and multiple iterations
        const result2 = await runSingleTest(
            'Test 2: Workflow with delay and iterations',
            { message: 'Delayed workflow test', delay: 2000, iterations: 3 },
            temporalService
        );
        results.push(result2);

        // Test 3: Quick test with custom message
        const result3 = await runSingleTest(
            'Test 3: Custom message test',
            { message: 'Custom test message from TypeScript!', delay: 500, iterations: 2 },
            temporalService
        );
        results.push(result3);

        // Summary
        const successfulTests = results.filter(r => r !== null);
        const failedTests = results.filter(r => r === null);

        logger.info('Temporal test summary:', {
            totalTests: results.length,
            successful: successfulTests.length,
            failed: failedTests.length,
            workflowIds: successfulTests.map(r => r!.workflowId)
        });

        if (successfulTests.length > 0) {
            logger.info('✅ At least one test passed - Temporal is working!');
        } else {
            logger.error('❌ All tests failed - check Temporal configuration');
            process.exit(1);
        }

    } catch (error) {
        logger.error('Temporal test initialization failed:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined
        });
        process.exit(1);
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    runTemporalTest()
        .then(() => {
            logger.info('Test script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            logger.error('Test script failed:', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            process.exit(1);
        });
}

export { runTemporalTest };
