# Temporal Test Workflow

This document describes the simple test workflow created to verify that Temporal is working correctly in the Clento backend.

## Overview

The test workflow consists of:
- **Test Activity**: A simple activity that processes a message and optionally adds a delay
- **Test Workflow**: A workflow that can run the test activity multiple times
- **API Endpoint**: REST API to trigger the test workflow
- **Temporal Service**: Service method to start and manage the workflow

## Components

### 1. Test Activity (`src/temporal/activities/index.ts`)
```typescript
export async function testActivity(input: { message: string; delay?: number })
```
- Processes a message
- Optionally adds a delay to simulate work
- Returns structured data with timestamps and environment info

### 2. Test Workflow (`src/temporal/workflows/testWorkflow.ts`)
```typescript
export async function testWorkflow(input: TestWorkflowInput): Promise<TestWorkflowResult>
```
- Runs the test activity one or more times
- Tracks total execution time
- Returns comprehensive results

### 3. API Endpoint (`src/routes/temporal/test.ts`)
- **POST** `/api/temporal/test`
- Requires authentication (`DASHBOARD`)
- Accepts JSON body with `message`, `delay`, and `iterations`

### 4. Temporal Service Method (`src/services/TemporalService.ts`)
```typescript
public async runTestWorkflow(input: { message: string; delay?: number; iterations?: number })
```

### 5. Test Script (`test-temporal.ts`)
- TypeScript script with proper type definitions
- Standalone script to test Temporal functionality
- Can be run independently to verify setup
- Includes comprehensive error handling and logging
- Runs multiple test scenarios automatically

## Usage

### Via API Endpoint

```bash
curl -X POST http://localhost:3000/api/temporal/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "Hello from API test!",
    "delay": 1000,
    "iterations": 2
  }'
```

### Via Test Script

```bash
# Simple test (recommended for debugging)
npm run test:temporal:simple

# Full test suite
npm run test:temporal

# Using ts-node directly
npx ts-node test-temporal-simple.ts
npx ts-node test-temporal.ts

# Or compile and run
npx tsc test-temporal.ts && node test-temporal.js
```

## Prerequisites

1. **Temporal Worker Enabled**: Set `TEMPORAL_WORKER_ENABLED=true` in environment
2. **Temporal Configuration**: Ensure all Temporal environment variables are set:
   - `TEMPORAL_NAMESPACE`
   - `TEMPORAL_ADDRESS`
   - `TEMPORAL_API_KEY`
3. **Worker Running**: The Temporal worker must be running to process workflows

## Expected Response

```json
{
  "success": true,
  "data": {
    "workflowId": "test-workflow-1234567890",
    "runId": "abc123-def456-ghi789",
    "result": {
      "success": true,
      "data": {
        "message": "Hello from API test!",
        "iterations": 2,
        "results": [
          {
            "success": true,
            "data": {
              "message": "Hello from API test! - Iteration 1",
              "processedAt": "2024-01-15T10:30:00.000Z",
              "workerId": "clento-backend-dev",
              "environment": "development"
            },
            "timestamp": "2024-01-15T10:30:00.000Z"
          }
        ],
        "totalDuration": 2005,
        "startedAt": "2024-01-15T10:30:00.000Z",
        "completedAt": "2024-01-15T10:30:02.005Z"
      }
    }
  },
  "message": "Test workflow executed successfully"
}
```

## Troubleshooting

### Common Issues

1. **Worker Not Running**: Ensure `TEMPORAL_WORKER_ENABLED=true` and worker is initialized
2. **Connection Issues**: Check Temporal configuration and network connectivity
3. **Authentication Errors**: Ensure valid authentication token for API endpoint
4. **Timeout Issues**: Increase timeout values in Temporal configuration if needed
5. **Tests Hanging**: Use the simple test script first to debug connectivity issues

### Debugging Steps

1. **Start with Simple Test**: Run `npm run test:temporal:simple` first
2. **Check Environment Variables**: Verify all Temporal configuration is set
3. **Check Worker Status**: Ensure `TEMPORAL_WORKER_ENABLED=true`
4. **Check Logs**: Look for initialization and connection errors
5. **Test Connection**: Verify Temporal Cloud connectivity

### Logs to Check

- Temporal worker initialization logs
- Workflow execution logs
- Activity execution logs
- API request/response logs
- Connection and authentication logs

## Next Steps

Once the test workflow is working:
1. Create more complex workflows for actual business logic
2. Add error handling and retry mechanisms
3. Implement workflow monitoring and observability
4. Add workflow versioning for safe deployments
