import { proxyActivities, log } from '@temporalio/workflow';
import type * as activities from '../activities';

const { testActivity } = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export interface TestWorkflowInput {
    message: string;
    delay?: number;
    iterations?: number;
}

export interface TestWorkflowResult {
    success: boolean;
    data: {
        message: string;
        iterations: number;
        results: any[];
        totalDuration: number;
        startedAt: string;
        completedAt: string;
    };
}

export async function testWorkflow(input: TestWorkflowInput): Promise<TestWorkflowResult> {
    const startTime = Date.now();
    const startedAt = new Date().toISOString();

    log.info('Test workflow started', { input });

    const iterations = input.iterations || 1;
    const results: any[] = [];

    // Run the test activity multiple times if requested
    for (let i = 0; i < iterations; i++) {
        log.info(`Running test activity iteration ${i + 1}/${iterations}`);

        const result = await testActivity({
            message: `${input.message} - Iteration ${i + 1}`,
            delay: input.delay
        });

        results.push(result);

        log.info(`Completed iteration ${i + 1}`, { result });
    }

    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    const completedAt = new Date().toISOString();

    const workflowResult: TestWorkflowResult = {
        success: true,
        data: {
            message: input.message,
            iterations,
            results,
            totalDuration,
            startedAt,
            completedAt
        }
    };

    log.info('Test workflow completed', {
        totalDuration,
        iterations,
        resultsCount: results.length
    });

    return workflowResult;
}
