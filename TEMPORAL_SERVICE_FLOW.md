# Temporal Service Flow Documentation

## Overview

The Clento backend uses Temporal for orchestrating LinkedIn outreach campaigns. This document explains the complete flow from API request to worker execution, providing a reference for building new services.

## Architecture Components

### 1. **API Layer** (`/src/routes/campaigns/`)
- **Start Campaign API** (`start.ts`): Initiates campaign execution
- **Campaign Management APIs**: Pause, resume, stop campaigns
- **Status APIs**: Monitor campaign progress

### 2. **Service Layer** (`/src/services/`)
- **TemporalService**: Main orchestrator service
- **CampaignService**: Campaign business logic
- **LeadListService**: Lead management
- **ConnectedAccountService**: Account management

### 3. **Temporal Client** (`/src/temporal/services/`)
- **TemporalClientService**: Low-level Temporal operations
- **UnipileWrapperService**: LinkedIn API wrapper

### 4. **Workflows** (`/src/temporal/workflows/`)
- **CampaignOrchestratorWorkflow**: Parent workflow managing entire campaign
- **LeadOutreachWorkflow**: Individual lead processing workflow

### 5. **Activities** (`/src/temporal/activities/`)
- **LinkedIn Activities**: Profile visit, like post, send invitation, etc.
- **Database Activities**: Execution tracking, status updates

### 6. **Worker** (`/src/temporal/worker.ts`)
- **Temporal Worker**: Processes workflows and activities

## Complete Flow Diagram

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Routes     │    │   Services      │
│                 │    │                  │    │                 │
│ POST /campaigns │───▶│ StartCampaignAPI │───▶│ TemporalService │
│ /start          │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Temporal      │    │   Temporal       │    │   Database       │
│   Worker        │◀───│   Client          │◀───│   Updates        │
│                 │    │                  │    │                 │
│ Processes       │    │ Starts Workflows │    │ Campaign Status  │
│ Activities      │    │ Sends Signals    │    │ Execution Records│
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Workflows     │    │   Activities     │    │   External APIs │
│                 │    │                  │    │                 │
│ Campaign        │───▶│ LinkedIn Actions │───▶│ Unipile/LinkedIn│
│ Orchestrator    │    │ Database Updates│    │                 │
│ Lead Outreach   │    │ Webhook Notify  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Detailed Flow Breakdown

### Phase 1: API Request & Service Initialization

#### 1.1 API Request
```typescript
// POST /api/campaigns/start
{
  "campaignId": "uuid",
  "organizationId": "uuid",
  "maxConcurrentLeads": 100,
  "leadProcessingDelay": 30
}
```

#### 1.2 Service Processing
```typescript
// StartCampaignAPI.POST()
const temporalService = TemporalService.getInstance();
const workflowHandle = await temporalService.startCampaign({
  campaignId,
  organizationId,
  maxConcurrentLeads,
  leadProcessingDelay
});
```

#### 1.3 Campaign Validation
```typescript
// TemporalService.startCampaign()
const campaign = await this.campaignService.getCampaignById(campaignId);
const leadList = await this.leadListService.getLeadListById(campaign.prospect_list);
const account = await this.connectedAccountService.getConnectedAccountById(campaign.sender_account);

// Validate account is connected
if (account.status !== 'connected') {
  throw new Error(`Account is not connected: ${account.display_name}`);
}
```

### Phase 2: Workflow Initialization

#### 2.1 Temporal Client Connection
```typescript
// TemporalClientService.startCampaignWorkflow()
const client = this.getClient();
const workflowId = `campaign-${input.campaignId}-${Date.now()}`;

const handle = await client.workflow.start(WORKFLOW_TYPES.CAMPAIGN_ORCHESTRATOR, {
  args: [workflowInput],
  taskQueue: this.config.taskQueue,
  workflowId,
  workflowExecutionTimeout: '30d',
  // ... other options
});
```

#### 2.2 Campaign Orchestrator Workflow Starts
```typescript
// CampaignOrchestratorWorkflow()
export async function CampaignOrchestratorWorkflow(
  input: CampaignOrchestratorInput
): Promise<CampaignStatus> {
  // Initialize workflow state
  const state: CampaignState = {
    status: 'running',
    totalLeads: 0,
    processedLeads: 0,
    // ... other state
  };

  // Load leads from database
  const leads: Lead[] = await loadLeadsFromDatabase(input.leadListId);
  state.totalLeads = leads.length;
}
```

### Phase 3: Lead Processing & Child Workflows

#### 3.1 Lead Workflow Creation
```typescript
// For each lead, create child workflow
for (const lead of leads) {
  const leadWorkflowInput: LeadOutreachInput = {
    campaignId: input.campaignId,
    accountId: input.accountId,
    lead,
    workflowDefinition: input.workflowDefinition,
    startDelay: processedCount * leadProcessingDelay,
    executionId: `exec-${input.campaignId}-${lead.id}-${Date.now()}`,
  };

  const childWorkflow = startChild(WORKFLOW_TYPES.LEAD_OUTREACH, {
    args: [leadWorkflowInput],
    workflowId: `lead-${lead.id}-${input.campaignId}-${Date.now()}`,
    // ... other options
  });
}
```

#### 3.2 Lead Outreach Workflow Execution
```typescript
// LeadOutreachWorkflow()
export async function LeadOutreachWorkflow(input: LeadOutreachInput): Promise<ActivityResult> {
  // Apply start delay for staggered execution
  if (input.startDelay && input.startDelay > 0) {
    await sleep(input.startDelay);
  }

  // Create execution record
  await CreateExecutionActivity({
    campaignId: input.campaignId,
    leadId: input.lead.id,
    executionId: input.executionId,
    totalSteps: countWorkflowSteps(input.workflowDefinition),
  });

  // Process workflow nodes
  const workflowResult = await processWorkflowNodes(input);
}
```

### Phase 4: Activity Execution

#### 4.1 Activity Processing
```typescript
// processWorkflowNodes() processes each node in sequence
async function processNodeRecursively(
  currentNode: WorkflowNode,
  input: LeadOutreachInput,
  // ... other params
): Promise<void> {
  // Execute activity based on node type
  if (currentNode.type === 'action') {
    nodeResult = await executeNodeActivity(currentNode, input);
  }
}
```

#### 4.2 LinkedIn Activity Execution
```typescript
// executeNodeActivity() routes to specific activities
switch (type) {
  case 'profile_visit':
    return await ProfileVisitActivity({
      accountId: input.accountId,
      leadId: input.lead.id,
      identifier: input.lead.linkedin_url || input.lead.linkedin_id,
      config,
    });

  case 'like_post':
    return await LikePostActivity({
      accountId: input.accountId,
      leadId: input.lead.id,
      identifier: input.lead.linkedin_url || input.lead.linkedin_id,
      config,
    });
}
```

#### 4.3 Unipile API Integration
```typescript
// LikePostActivity()
export async function LikePostActivity(input: LikePostActivityInput): Promise<LikePostResult> {
  const unipileService = UnipileWrapperService.getInstance();

  const result = await unipileService.likePosts({
    accountId: input.accountId,
    identifier: input.identifier,
    numberOfPosts: input.config.numberOfPosts || 1,
    recentPostDays: input.config.recentPostDays || 7,
  });

  return result as LikePostResult;
}
```

### Phase 5: Worker Processing

#### 5.1 Worker Initialization
```typescript
// worker.ts - createTemporalWorker()
export async function createTemporalWorker(): Promise<Worker> {
  const connection = await NativeConnection.connect(getTemporalConnectionOptions());
  const config = getTemporalConfig();
  const workerOptions = getWorkerOptions();

  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    workflowsPath: require.resolve('./workflows'),
    activities, // All activities imported
    ...workerOptions,
  });

  return worker;
}
```

#### 5.2 Worker Configuration
```typescript
// worker.config.ts - getWorkerOptions()
const workerOptions: Partial<WorkerOptions> = {
  taskQueue: config.taskQueue,
  maxConcurrentActivityTaskExecutions: 100, // Handle many LinkedIn API calls
  maxConcurrentWorkflowTaskExecutions: 50,  // Manage workflow decisions
  maxActivitiesPerSecond: 200, // Rate limit activities
  // ... other options
};
```

### Phase 6: Monitoring & Control

#### 6.1 Campaign Status Monitoring
```typescript
// GET /api/campaigns/status
const status = await temporalService.getCampaignStatus(campaignId);

// TemporalClientService.getCampaignStatus()
const workflows = client.workflow.list({
  query: `CampaignId = "${campaignId}"`,
});

// Aggregate status from all workflows
return {
  campaignId,
  status: campaignStatus,
  totalLeads,
  processedLeads,
  successfulLeads,
  failedLeads,
  workflows: workflowStatuses,
};
```

#### 6.2 Campaign Control Signals
```typescript
// Pause Campaign
await temporalService.pauseCampaign(campaignId, reason);
// Sends pauseCampaignSignal to workflow

// Resume Campaign
await temporalService.resumeCampaign(campaignId);
// Sends resumeCampaignSignal to workflow

// Stop Campaign
await temporalService.stopCampaign(campaignId, reason, completeCurrentExecutions);
// Sends stopCampaignSignal to workflow
```

## Key Configuration Files

### 1. Temporal Configuration (`/src/temporal/config/temporal.config.ts`)
```typescript
export function getTemporalConfig(): TemporalConfig {
  return {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: 'clento-outreach-queue',
    workflowExecutionTimeout: '30d',
    activityExecutionTimeout: '5m',
    // ... other config
  };
}
```

### 2. Worker Configuration (`/src/temporal/config/worker.config.ts`)
```typescript
export function getWorkerConfig(): WorkerConfig {
  return {
    maxConcurrentActivityTaskExecutions: 100,
    maxConcurrentWorkflowTaskExecutions: 50,
    maxActivitiesPerSecond: 200,
    // ... other config
  };
}
```

### 3. Workflow Types (`/src/temporal/workflows/workflow.types.ts`)
```typescript
export const WORKFLOW_TYPES = {
  CAMPAIGN_ORCHESTRATOR: 'CampaignOrchestratorWorkflow',
  LEAD_OUTREACH: 'LeadOutreachWorkflow',
} as const;

export const ACTIVITY_TYPES = {
  PROFILE_VISIT: 'ProfileVisitActivity',
  LIKE_POST: 'LikePostActivity',
  SEND_INVITATION: 'SendInvitationActivity',
  // ... other activities
} as const;
```

## Environment Variables

### Required for Production
```bash
# Temporal Cloud
TEMPORAL_NAMESPACE=your-namespace
TEMPORAL_ADDRESS=your-namespace.tmprl.cloud:7233
TEMPORAL_CLIENT_CERT=base64-encoded-cert
TEMPORAL_CLIENT_KEY=base64-encoded-key

# Unipile Integration
UNIPILE_DSN=your-unipile-dsn
UNIPILE_ACCESS_TOKEN=your-access-token
```

### Development Setup
```bash
# Local Temporal Server
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_WORKER_ENABLED=true

# Mock Unipile (optional)
UNIPILE_DNS=https://api.unipile.com/v1
UNIPILE_ACCESS_TOKEN=your-api-key
```

## Error Handling & Retry Logic

### Activity Retry Configuration
```typescript
const activities = proxyActivities<typeof activities>({
  startToCloseTimeout: '5m',
  heartbeatTimeout: '30s',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumInterval: '60s',
    maximumAttempts: 3,
    nonRetryableErrorTypes: [
      'AuthenticationError',
      'InvalidCredentialsError',
      'AccountSuspendedError',
    ],
  },
});
```

### Error Types
```typescript
function isRetryableError(error: any): boolean {
  const retryableErrors = [
    'network', 'timeout', 'rate_limit',
    'server_error', 'temporary', 'connection'
  ];

  const errorMessage = error.message?.toLowerCase() || '';
  return retryableErrors.some(retryable =>
    errorMessage.includes(retryable)
  );
}
```

## Database Integration

### Campaign Execution Tracking
```typescript
// Create execution record
const executionData = {
  campaign_id: campaignId,
  lead_id: leadId,
  workflow_execution_id: workflowExecutionId,
  status: 'pending',
  current_step: 0,
  total_steps: totalSteps,
  execution_data: {},
};

const { data } = await supabaseAdmin
  .from('campaign_executions')
  .insert(executionData)
  .select()
  .single();
```

### Status Updates
```typescript
// Update execution status
await UpdateExecutionActivity({
  executionId: input.executionId,
  status: 'in_progress',
  started_at: new Date().toISOString(),
  current_step: stepNumber,
});
```

## Building New Services

### 1. Create New Activity
```typescript
// /src/temporal/activities/your-feature/your-activity.ts
export async function YourActivity(input: YourActivityInput): Promise<YourActivityResult> {
  logger.info('Starting your activity', { input });

  try {
    // Your business logic here
    const result = await yourService.doSomething(input);

    return {
      success: true,
      data: result,
    };
  } catch (error: any) {
    logger.error('Your activity failed', { error });

    return {
      success: false,
      error: error.message,
      retryable: isRetryableError(error),
    };
  }
}
```

### 2. Add Activity to Workflow
```typescript
// In LeadOutreachWorkflow
case 'your_action':
  return await YourActivity({
    accountId: input.accountId,
    leadId: input.lead.id,
    config,
  });
```

### 3. Export Activity
```typescript
// /src/temporal/activities/index.ts
export * from './your-feature/your-activity';
```

### 4. Update Workflow Types
```typescript
// /src/temporal/workflows/workflow.types.ts
export const ACTIVITY_TYPES = {
  // ... existing activities
  YOUR_ACTIVITY: 'YourActivity',
} as const;
```

## Monitoring & Debugging

### 1. Workflow Status Queries
```typescript
// Query campaign status
const status = await temporalService.getCampaignStatus(campaignId);

// Query individual workflow
const workflowStatus = await temporalService.getWorkflowStatus(workflowId);
```

### 2. Temporal Web UI
- Access Temporal Web UI at `http://localhost:8080` (local) or your Temporal Cloud URL
- View workflow executions, activities, and logs
- Monitor task queue performance

### 3. Logging
```typescript
// Structured logging throughout the system
logger.info('Campaign started successfully', {
  campaignId: options.campaignId,
  workflowId: workflowHandle.workflowId,
  runId: workflowHandle.firstExecutionRunId,
});
```

## Best Practices

### 1. Workflow Design
- Keep workflows deterministic (no random values, current time, etc.)
- Use activities for external API calls
- Implement proper error handling and retries

### 2. Activity Design
- Make activities idempotent when possible
- Use heartbeat for long-running activities
- Handle rate limiting gracefully

### 3. Configuration
- Use environment variables for all configuration
- Separate development and production settings
- Validate configuration on startup

### 4. Monitoring
- Log all important events with structured data
- Use Temporal's built-in monitoring capabilities
- Track business metrics alongside technical metrics

## Troubleshooting

### Common Issues

1. **Worker Not Starting**
   - Check `TEMPORAL_WORKER_ENABLED=true` in development
   - Verify Temporal server is running
   - Check connection configuration

2. **Activities Failing**
   - Check Unipile API credentials
   - Verify account connection status
   - Review activity retry configuration

3. **Workflows Not Progressing**
   - Check worker logs for errors
   - Verify task queue configuration
   - Monitor Temporal Web UI for stuck workflows

4. **Rate Limiting**
   - Adjust `maxActivitiesPerSecond` in worker config
   - Implement exponential backoff in activities
   - Monitor LinkedIn API rate limits

This documentation provides a comprehensive reference for understanding and extending the Temporal service in the Clento backend. Use it as a guide when building new features or troubleshooting issues.
