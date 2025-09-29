/**
 * Campaign Orchestrator Workflow
 * 
 * Parent workflow that manages entire campaign execution and coordinates
 * lead processing with rate limiting and error handling.
 */

import {
    defineSignal,
    defineQuery,
    setHandler,
    condition,
    sleep,
    startChild,
    ParentClosePolicy,
    ChildWorkflowOptions,
    log,
} from '@temporalio/workflow';
import {
    CampaignOrchestratorInput,
    LeadOutreachInput,
    Lead,
    CampaignStatus,
    WorkflowMetrics,
    PauseCampaignSignal,
    ResumeCampaignSignal,
    StopCampaignSignal,
    WORKFLOW_TYPES,
    SIGNAL_TYPES,
    QUERY_TYPES,
} from './workflow.types';

// Workflow state
interface CampaignState {
    status: 'running' | 'paused' | 'stopping' | 'stopped' | 'completed' | 'failed';
    totalLeads: number;
    processedLeads: number;
    successfulLeads: number;
    failedLeads: number;
    startTime: Date;
    endTime?: Date;
    pauseReason?: string;
    stopReason?: string;
    leadWorkflows: Map<string, string>; // leadId -> workflowId
    completedLeads: Set<string>;
    failedLeads: Set<string>;
}

// Signals
export const pauseCampaignSignal = defineSignal<[PauseCampaignSignal]>(SIGNAL_TYPES.PAUSE_CAMPAIGN);
export const resumeCampaignSignal = defineSignal<[ResumeCampaignSignal]>(SIGNAL_TYPES.RESUME_CAMPAIGN);
export const stopCampaignSignal = defineSignal<[StopCampaignSignal]>(SIGNAL_TYPES.STOP_CAMPAIGN);

// Queries
export const getCampaignStatusQuery = defineQuery<CampaignStatus>(QUERY_TYPES.CAMPAIGN_STATUS);
export const getWorkflowMetricsQuery = defineQuery<WorkflowMetrics>(QUERY_TYPES.WORKFLOW_METRICS);

/**
 * Campaign Orchestrator Workflow Implementation
 */
export async function CampaignOrchestratorWorkflow(
    input: CampaignOrchestratorInput
): Promise<CampaignStatus> {
    // Initialize workflow state
    const state: CampaignState = {
        status: 'running',
        totalLeads: 0,
        processedLeads: 0,
        successfulLeads: 0,
        failedLeads: 0,
        startTime: new Date(),
        leadWorkflows: new Map(),
        completedLeads: new Set(),
        failedLeads: new Set(),
    };

        log.info('Campaign orchestrator workflow started', {
        campaignId: input.campaignId,
        organizationId: input.organizationId,
        accountId: input.accountId,
        leadListId: input.leadListId,
    });

    // Set up signal handlers
    setHandler(pauseCampaignSignal, async (signal: PauseCampaignSignal) => {
        log.info('Received pause campaign signal', {
            campaignId: input.campaignId,
            reason: signal.reason,
        });
        
        state.status = 'paused';
        state.pauseReason = signal.reason;
    });

    setHandler(resumeCampaignSignal, async (signal: ResumeCampaignSignal) => {
        log.info('Received resume campaign signal', {
            campaignId: input.campaignId,
        });
        
        if (state.status === 'paused') {
            state.status = 'running';
            state.pauseReason = undefined;
        }
    });

    setHandler(stopCampaignSignal, async (signal: StopCampaignSignal) => {
        log.info('Received stop campaign signal', {
            campaignId: input.campaignId,
            reason: signal.reason,
            completeCurrentExecutions: signal.completeCurrentExecutions,
        });
        
        state.status = signal.completeCurrentExecutions ? 'stopping' : 'stopped';
        state.stopReason = signal.reason;
    });

    // Set up query handlers
    setHandler(getCampaignStatusQuery, (): CampaignStatus => {
        return {
            campaignId: input.campaignId,
            status: mapWorkflowStatusToCampaignStatus(state.status),
            totalLeads: state.totalLeads,
            processedLeads: state.processedLeads,
            successfulLeads: state.successfulLeads,
            failedLeads: state.failedLeads,
            startTime: state.startTime.toISOString(),
            endTime: state.endTime?.toISOString(),
            workflows: Array.from(state.leadWorkflows.entries()).map(([leadId, workflowId]) => ({
                workflowId,
                runId: '', // Will be filled by client
                status: state.completedLeads.has(leadId) 
                    ? 'COMPLETED' 
                    : state.failedLeads.has(leadId) 
                    ? 'FAILED' 
                    : 'RUNNING',
                startTime: state.startTime.toISOString(),
            })),
        };
    });

    setHandler(getWorkflowMetricsQuery, (): WorkflowMetrics => {
        const totalTime = state.endTime 
            ? state.endTime.getTime() - state.startTime.getTime()
            : Date.now() - state.startTime.getTime();

        return {
            campaignId: input.campaignId,
            totalWorkflows: state.totalLeads,
            runningWorkflows: state.totalLeads - state.processedLeads,
            completedWorkflows: state.successfulLeads,
            failedWorkflows: state.failedLeads,
            averageExecutionTime: state.processedLeads > 0 ? totalTime / state.processedLeads : 0,
            successRate: state.processedLeads > 0 ? state.successfulLeads / state.processedLeads : 0,
            errorRate: state.processedLeads > 0 ? state.failedLeads / state.processedLeads : 0,
            throughput: totalTime > 0 ? (state.processedLeads / totalTime) * 3600000 : 0, // per hour
        };
    });

    try {
        // Step 1: Load campaign data and validate
        log.info('Loading campaign data', { campaignId: input.campaignId });
        
        // TODO: Load leads from database via activity
        // For now, we'll simulate lead loading
        const leads: Lead[] = await loadLeadsFromDatabase(input.leadListId);
        state.totalLeads = leads.length;

        if (leads.length === 0) {
            log.warn('No leads found for campaign', {
                campaignId: input.campaignId,
                leadListId: input.leadListId,
            });
            
            state.status = 'completed';
            state.endTime = new Date();
            
            return getCampaignStatusQuery();
        }

        log.info('Loaded leads for campaign', {
            campaignId: input.campaignId,
            totalLeads: leads.length,
        });

        // Step 2: Process leads with rate limiting and staggered execution
        const maxConcurrentLeads = input.maxConcurrentLeads || 100;
        const leadProcessingDelay = (input.leadProcessingDelay || 30) * 1000; // Convert to milliseconds
        
        let processedCount = 0;
        const activeWorkflows = new Map<string, Promise<any>>();

        for (const lead of leads) {
            // Check if workflow should be paused or stopped
            await condition(() => state.status !== 'paused');
            
            if (state.status === 'stopped') {
                log.info('Campaign stopped, skipping remaining leads', {
                    campaignId: input.campaignId,
                    remainingLeads: leads.length - processedCount,
                });
                break;
            }

            // Wait for available slot if at max concurrency
            while (activeWorkflows.size >= maxConcurrentLeads) {
                await Promise.race(Array.from(activeWorkflows.values()));
            }

            // Create execution record and start lead workflow
            const executionId = `exec-${input.campaignId}-${lead.id}-${Date.now()}`;
            
            const leadWorkflowInput: LeadOutreachInput = {
                campaignId: input.campaignId,
                accountId: input.accountId,
                lead,
                workflowDefinition: input.workflowDefinition,
                startDelay: processedCount * leadProcessingDelay,
                executionId,
            };

            const childWorkflowOptions: ChildWorkflowOptions = {
                workflowId: `lead-${lead.id}-${input.campaignId}-${Date.now()}`,
                parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
                workflowExecutionTimeout: '30d',
                workflowRunTimeout: '30d',
                workflowTaskTimeout: '10s',
                memo: {
                    leadId: lead.id,
                    campaignId: input.campaignId,
                    executionId,
                },
                searchAttributes: {
                    LeadId: [lead.id],
                    CampaignId: [input.campaignId],
                    ExecutionId: [executionId],
                },
            };

            // Start child workflow
            const childWorkflow = startChild(WORKFLOW_TYPES.LEAD_OUTREACH, {
                args: [leadWorkflowInput],
                ...childWorkflowOptions,
            });

            // Track the workflow
            state.leadWorkflows.set(lead.id, childWorkflowOptions.workflowId!);
            
            // Handle workflow completion
            const workflowPromise = childWorkflow.then(
                (result) => {
                    // Workflow completed successfully
                    state.successfulLeads++;
                    state.processedLeads++;
                    state.completedLeads.add(lead.id);
                    activeWorkflows.delete(lead.id);
                    
                    log.info('Lead workflow completed successfully', {
                        campaignId: input.campaignId,
                        leadId: lead.id,
                        executionId,
                    });
                    
                    return result;
                },
                (error) => {
                    // Workflow failed
                    state.failedLeads++;
                    state.processedLeads++;
                    state.failedLeads.add(lead.id);
                    activeWorkflows.delete(lead.id);
                    
                    log.error('Lead workflow failed', {
                        campaignId: input.campaignId,
                        leadId: lead.id,
                        executionId,
                        error: error.message,
                    });
                    
                    return null;
                }
            );

            activeWorkflows.set(lead.id, workflowPromise);
            processedCount++;

            log.info('Started lead workflow', {
                campaignId: input.campaignId,
                leadId: lead.id,
                executionId,
                workflowId: childWorkflowOptions.workflowId,
                activeWorkflows: activeWorkflows.size,
                processedCount,
                totalLeads: leads.length,
            });

            // Apply staggered delay between lead starts
            if (processedCount < leads.length && leadProcessingDelay > 0) {
                await sleep(leadProcessingDelay);
            }
        }

        // Step 3: Wait for all active workflows to complete (unless stopped)
        if (state.status !== 'stopped') {
            log.info('Waiting for all lead workflows to complete', {
                campaignId: input.campaignId,
                activeWorkflows: activeWorkflows.size,
            });

            // Wait for all workflows to complete
            await Promise.allSettled(Array.from(activeWorkflows.values()));
        }

        // Step 4: Determine final status
        state.endTime = new Date();
        
        if (state.status === 'stopped') {
            state.status = 'stopped';
        } else if (state.failedLeads === state.totalLeads && state.totalLeads > 0) {
            state.status = 'failed';
        } else {
            state.status = 'completed';
        }

        log.info('Campaign orchestrator workflow completed', {
            campaignId: input.campaignId,
            status: state.status,
            totalLeads: state.totalLeads,
            processedLeads: state.processedLeads,
            successfulLeads: state.successfulLeads,
            failedLeads: state.failedLeads,
            duration: state.endTime.getTime() - state.startTime.getTime(),
        });

        return getCampaignStatusQuery();

    } catch (error: any) {
        log.error('Campaign orchestrator workflow failed', {
            campaignId: input.campaignId,
            error: error.message,
        });

        state.status = 'failed';
        state.endTime = new Date();

        throw error;
    }
}

/**
 * Helper function to load leads from database
 * TODO: Implement as Temporal activity
 */
async function loadLeadsFromDatabase(leadListId: string): Promise<Lead[]> {
    // This would be implemented as a Temporal activity
    // For now, return empty array as placeholder
    return [];
}

/**
 * Helper function to map workflow status to campaign status
 */
function mapWorkflowStatusToCampaignStatus(
    workflowStatus: CampaignState['status']
): CampaignStatus['status'] {
    switch (workflowStatus) {
        case 'running':
        case 'stopping':
            return 'running';
        case 'paused':
            return 'paused';
        case 'stopped':
        case 'completed':
            return 'completed';
        case 'failed':
            return 'failed';
        default:
            return 'pending';
    }
}
