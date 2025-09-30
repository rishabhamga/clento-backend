/**
 * Workflow Type Definitions
 * 
 * Type definitions for Temporal workflows including campaign orchestration
 * and individual lead workflows.
 */

// Workflow Definition Types (from JSON structure)
export interface WorkflowNode {
    id: string;
    type: 'action' | 'addStep';
    position: {
        x: number;
        y: number;
    };
    data: {
        type: 'profile_visit' | 'like_post' | 'comment_post' | 'send_connection_request' | 'send_followup' | 'withdraw_request' | 'notify_webhook';
        label: string;
        isConfigured: boolean;
        config: Record<string, any>;
        pathType?: 'accepted' | 'not-accepted';
    };
    measured?: {
        width: number;
        height: number;
    };
    selected?: boolean;
    deletable?: boolean;
}

export interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    type: 'delay' | 'conditional';
    animated: boolean;
    data: {
        delay?: string;
        delayData?: {
            delay: number;
            unit: 'm' | 'h' | 'd';
        };
        isPositive?: boolean;
        isConditionalPath?: boolean;
    };
    deletable?: boolean;
}

export interface WorkflowDefinition {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    timestamp: string;
}

// Campaign and Lead Types
export interface Lead {
    id: string;
    full_name: string;
    first_name: string;
    last_name: string;
    email?: string;
    linkedin_url?: string;
    linkedin_id?: string;
    title?: string;
    company?: string;
    campaignId?: string;
}

export interface Campaign {
    id: string;
    organization_id: string;
    creator_id: string;
    name: string;
    description?: string;
    status: 'draft' | 'active' | 'paused' | 'completed' | 'failed';
    lead_list_id: string;
    account_id: string;
    workflow_id?: string;
    workflow_definition: WorkflowDefinition;
    schedule: Record<string, any>;
    stats: Record<string, any>;
    created_at: string;
    updated_at: string;
    started_at?: string;
    completed_at?: string;
}

export interface CampaignExecution {
    id: string;
    campaign_id: string;
    lead_id: string;
    workflow_execution_id: string;
    status: 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'failed' | 'skipped';
    current_step: number;
    total_steps: number;
    execution_data: Record<string, any>;
    created_at: string;
    updated_at: string;
    started_at?: string;
    completed_at?: string;
}

// Workflow Input Types
export interface CampaignOrchestratorInput {
    campaignId: string;
    organizationId: string;
    accountId: string;
    leadListId: string;
    workflowDefinition: WorkflowDefinition;
    maxConcurrentLeads?: number;
    leadProcessingDelay?: number; // seconds
}

export interface LeadOutreachInput {
    campaignId: string;
    accountId: string;
    lead: Lead;
    workflowDefinition: WorkflowDefinition;
    startDelay?: number; // milliseconds
    executionId: string;
}

// Activity Result Types
export interface ActivityResult {
    success: boolean;
    data?: any;
    error?: string;
    retryable?: boolean;
    metadata?: Record<string, any>;
}

export interface ProfileVisitResult extends ActivityResult {
    profileData?: {
        id: string;
        name: string;
        title?: string;
        company?: string;
        profileUrl: string;
    };
    notificationSent?: boolean;
}

export interface LikePostResult extends ActivityResult {
    postsLiked?: number;
    postIds?: string[];
}

export interface CommentPostResult extends ActivityResult {
    commentsPosted?: number;
    postIds?: string[];
    comments?: Array<{
        postId: string;
        comment: string;
        commentId?: string;
    }>;
}

export interface SendInvitationResult extends ActivityResult {
    invitationId?: string;
    message?: string;
    status?: 'sent' | 'failed' | 'already_connected';
}

export interface CheckInvitationResult extends ActivityResult {
    status: 'accepted' | 'pending' | 'declined' | 'withdrawn';
    invitationId: string;
    acceptedAt?: string;
    declinedAt?: string;
}

export interface SendFollowupResult extends ActivityResult {
    messageId?: string;
    chatId?: string;
    message?: string;
}

export interface WithdrawRequestResult extends ActivityResult {
    invitationId: string;
    withdrawnAt: string;
}

export interface NotifyWebhookResult extends ActivityResult {
    webhookUrl: string;
    responseStatus?: number;
    responseData?: any;
}

// Workflow Status Types
export interface WorkflowStatus {
    workflowId: string;
    runId: string;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'TERMINATED' | 'CONTINUED_AS_NEW' | 'TIMED_OUT';
    startTime: string;
    endTime?: string;
    executionTime?: number;
    result?: any;
    error?: string;
}

export interface CampaignStatus {
    campaignId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
    totalLeads: number;
    processedLeads: number;
    successfulLeads: number;
    failedLeads: number;
    startTime?: string;
    endTime?: string;
    estimatedCompletion?: string;
    workflows: WorkflowStatus[];
}

// Error Types
export interface WorkflowError {
    type: 'ACTIVITY_ERROR' | 'WORKFLOW_ERROR' | 'TIMEOUT_ERROR' | 'CANCELED_ERROR';
    message: string;
    details?: any;
    retryable: boolean;
    activityType?: string;
    workflowType?: string;
}

// Configuration Types
export interface WorkflowConfig {
    maxRetries: number;
    retryBackoffCoefficient: number;
    retryInitialInterval: string;
    retryMaximumInterval: string;
    activityTimeout: string;
    workflowTimeout: string;
    heartbeatTimeout: string;
}

// Monitoring Types
export interface WorkflowMetrics {
    campaignId: string;
    totalWorkflows: number;
    runningWorkflows: number;
    completedWorkflows: number;
    failedWorkflows: number;
    averageExecutionTime: number;
    successRate: number;
    errorRate: number;
    throughput: number; // workflows per hour
}

export interface ActivityMetrics {
    activityType: string;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
    successRate: number;
    errorRate: number;
    retryRate: number;
}

// Webhook Types
export interface WebhookPayload {
    campaignId: string;
    leadId: string;
    executionId: string;
    event: 'workflow_started' | 'workflow_completed' | 'workflow_failed' | 'activity_completed' | 'activity_failed';
    timestamp: string;
    data: Record<string, any>;
}

// Rate Limiting Types
export interface RateLimitStatus {
    accountId: string;
    operation: string;
    remaining: number;
    resetTime: string;
    isLimited: boolean;
}

// Temporal Signal Types
export interface PauseCampaignSignal {
    reason?: string;
    pauseAt?: string; // ISO timestamp
}

export interface ResumeCampaignSignal {
    resumeAt?: string; // ISO timestamp
}

export interface StopCampaignSignal {
    reason?: string;
    completeCurrentExecutions: boolean;
}

export interface UpdateWorkflowSignal {
    workflowDefinition: WorkflowDefinition;
    applyToRunning: boolean;
}

// Temporal Query Types
export interface CampaignStatusQuery {
    includeWorkflows?: boolean;
    includeMetrics?: boolean;
}

export interface LeadStatusQuery {
    leadId: string;
    includeHistory?: boolean;
}

// Export workflow names as constants
export const WORKFLOW_TYPES = {
    CAMPAIGN_ORCHESTRATOR: 'CampaignOrchestratorWorkflow',
    LEAD_OUTREACH: 'LeadOutreachWorkflow',
} as const;

export const ACTIVITY_TYPES = {
    PROFILE_VISIT: 'ProfileVisitActivity',
    LIKE_POST: 'LikePostActivity',
    COMMENT_POST: 'CommentPostActivity',
    SEND_INVITATION: 'SendInvitationActivity',
    CHECK_INVITATION: 'CheckInvitationActivity',
    SEND_FOLLOWUP: 'SendFollowupActivity',
    WITHDRAW_REQUEST: 'WithdrawRequestActivity',
    NOTIFY_WEBHOOK: 'NotifyWebhookActivity',
    UPDATE_EXECUTION: 'UpdateExecutionActivity',
    CREATE_EXECUTION: 'CreateExecutionActivity',
} as const;

export const SIGNAL_TYPES = {
    PAUSE_CAMPAIGN: 'pauseCampaign',
    RESUME_CAMPAIGN: 'resumeCampaign',
    STOP_CAMPAIGN: 'stopCampaign',
    UPDATE_WORKFLOW: 'updateWorkflow',
} as const;

export const QUERY_TYPES = {
    CAMPAIGN_STATUS: 'getCampaignStatus',
    LEAD_STATUS: 'getLeadStatus',
    WORKFLOW_METRICS: 'getWorkflowMetrics',
} as const;
