# Temporal Architecture for Clento LinkedIn Outreach

## 🏗️ Architecture Overview

This document outlines the Temporal architecture implementation for Clento's LinkedIn outreach automation system. The architecture is designed to handle 10,000+ parallel workflows while respecting LinkedIn's rate limits and ensuring reliable execution through Temporal Cloud.

## 📁 File Structure

```
src/
├── temporal/
│   ├── config/
│   │   ├── temporal.config.ts          # Temporal client configuration
│   │   ├── worker.config.ts            # Worker configuration
│   │   └── rate-limiter.config.ts      # Rate limiting configuration
│   │
│   ├── workflows/
│   │   ├── campaign-orchestrator.workflow.ts    # Parent workflow for campaigns
│   │   ├── lead-outreach.workflow.ts            # Individual lead workflow
│   │   └── workflow.types.ts                    # Workflow type definitions
│   │
│   ├── activities/
│   │   ├── linkedin/
│   │   │   ├── profile-visit.activity.ts        # Profile visit activity
│   │   │   ├── like-post.activity.ts            # Like post activity
│   │   │   ├── comment-post.activity.ts         # Comment on post activity
│   │   │   ├── send-invitation.activity.ts      # Send connection request
│   │   │   ├── check-invitation.activity.ts     # Check invitation status
│   │   │   ├── send-followup.activity.ts        # Send follow-up message
│   │   │   ├── withdraw-request.activity.ts     # Withdraw connection request
│   │   │   └── linkedin.types.ts                # LinkedIn activity types
│   │   │
│   │   ├── database/
│   │   │   ├── campaign-execution.activity.ts   # Database operations
│   │   │   └── database.types.ts                # Database activity types
│   │   │
│   │   ├── webhook/
│   │   │   ├── notify-webhook.activity.ts       # Webhook notifications
│   │   │   └── webhook.types.ts                 # Webhook types
│   │   │
│   │   └── activity.types.ts                    # Common activity types
│   │
│   ├── services/
│   │   ├── temporal-client.service.ts           # Temporal client service
│   │   ├── workflow-executor.service.ts         # Workflow execution service
│   │   ├── rate-limiter.service.ts              # Rate limiting service
│   │   └── unipile-wrapper.service.ts           # Unipile SDK wrapper
│   │
│   ├── utils/
│   │   ├── workflow-parser.util.ts              # Parse workflow JSON
│   │   ├── delay-calculator.util.ts             # Calculate delays
│   │   ├── error-handler.util.ts                # Error handling utilities
│   │   └── logger.util.ts                       # Temporal-specific logging
│   │
│   ├── worker.ts                                # Temporal worker setup
│   └── index.ts                                 # Temporal module exports
│
├── routes/
│   ├── campaigns/
│   │   ├── start.ts                             # Start campaign endpoint
│   │   ├── pause.ts                             # Pause campaign endpoint
│   │   ├── resume.ts                            # Resume campaign endpoint
│   │   ├── stop.ts                              # Stop campaign endpoint
│   │   └── status.ts                            # Campaign status endpoint
│   │
│   └── temporal/
│       ├── workflow-status.ts                   # Workflow status endpoint
│       └── workflow-history.ts                  # Workflow history endpoint
│
└── services/
    ├── TemporalService.ts                       # Main Temporal service
    └── CampaignExecutionService.ts              # Campaign execution tracking
```

## 🔄 Workflow Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        CAMPAIGN ORCHESTRATOR WORKFLOW                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  START → Load Campaign Data → Load Lead List → Validate Accounts               │
│    │                                                                            │
│    ▼                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                    PARALLEL LEAD PROCESSING                                 ││
│  │                                                                             ││
│  │  Lead 1 ──┐                                                                ││
│  │  Lead 2 ──┼── Rate Limited Queue ──→ Individual Lead Workflows             ││
│  │  Lead N ──┘    (30s stagger)                                               ││
│  │                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│    │                                                                            │
│    ▼                                                                            │
│  Wait for All Workflows → Update Campaign Status → END                         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                        INDIVIDUAL LEAD WORKFLOW                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  START → Create Execution Record → Parse Workflow Definition                   │
│    │                                                                            │
│    ▼                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                        SEQUENTIAL STEP PROCESSING                           ││
│  │                                                                             ││
│  │  Profile Visit ──(15m delay)──→ Like Post ──(15m delay)──→ Comment Post    ││
│  │       │                                                           │         ││
│  │       ▼                                                           ▼         ││
│  │  Send Connection Request ──(15m delay)──→ Check Status                     ││
│  │       │                                       │                             ││
│  │       ▼                                       ▼                             ││
│  │  ┌─────────────┐                    ┌─────────────────┐                    ││
│  │  │  ACCEPTED   │                    │  NOT ACCEPTED   │                    ││
│  │  │             │                    │                 │                    ││
│  │  │ Follow-up 1 │                    │ Withdraw        │                    ││
│  │  │     │       │                    │ Request         │                    ││
│  │  │ Follow-up 2 │                    │                 │                    ││
│  │  │     │       │                    │                 │                    ││
│  │  │    END      │                    │      END        │                    ││
│  │  └─────────────┘                    └─────────────────┘                    ││
│  │                                                                             ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│    │                                                                            │
│    ▼                                                                            │
│  Update Execution Status → Send Webhook Notifications → END                    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🔧 Activity Types Mapping

Based on the workflow JSON structure, here are the activity mappings:

| Workflow Node Type | Activity Implementation | Unipile SDK Method |
|-------------------|------------------------|-------------------|
| `profile_visit` | ProfileVisitActivity | `client.users.getProfile()` |
| `like_post` | LikePostActivity | `client.users.sendPostReaction()` |
| `comment_post` | CommentPostActivity | `client.users.sendPostComment()` |
| `send_connection_request` | SendInvitationActivity | `client.users.sendInvitation()` |
| `send_followup` | SendFollowupActivity | `client.messaging.startNewChat()` |
| `withdraw_request` | WithdrawRequestActivity | `client.users.cancelInvitationSent()` |
| `notify_webhook` | NotifyWebhookActivity | HTTP POST request |

## 📊 Rate Limiting Strategy

```
Per-Account Limits (Unipile):
├── Profile Visits: 100 per hour
├── Invitations: 20 per hour  
├── Messages: 50 per hour
├── Post Comments: 30 per hour
└── Post Reactions: 100 per hour

Implementation:
├── Bottleneck.js for rate limiting
├── Per-account, per-operation tracking
├── Automatic backoff when limits approached
└── Queue management for pending requests
```

## 🛡️ Error Handling Strategy

```
Error Categories:
├── Critical Errors (Stop Workflow)
│   ├── Account authentication failed
│   ├── Account suspended/restricted
│   └── Invalid lead data
│
├── Retryable Errors (Retry with backoff)
│   ├── Network timeouts
│   ├── Rate limit exceeded
│   ├── Temporary server errors
│   └── Connection failures
│
└── Non-Critical Errors (Continue workflow)
    ├── Profile not found
    ├── No recent posts available
    ├── Message delivery failed
    └── Webhook notification failed
```

## 🚀 Scalability Configuration

```
Default Settings:
├── maxConcurrentLeads: 100 leads processing in parallel
├── leadProcessingDelay: 30 seconds between lead starts
├── maxRetriesPerActivity: 3 retries
├── backoffStrategy: exponential (1s, 2s, 4s)
└── maxWorkflowDuration: 30 days
```

## 📈 Monitoring & Observability

```
Key Metrics:
├── Campaign execution success rate
├── Lead processing throughput (leads/hour)
├── Average execution time per lead
├── Workflow completion rate
├── Error rate by activity type
├── API response times (Unipile)
├── Rate limit utilization
└── Worker resource usage
```

## 🔐 Security Considerations

```
Authentication & Authorization:
├── Secure storage of Unipile credentials
├── Account-level access controls
├── Organization-based data isolation
└── API key rotation and management

Data Protection:
├── Encryption at rest for sensitive data
├── Encryption in transit for all API calls
├── PII data handling compliance
└── Audit logging for all data access
```

## 🎯 Implementation Benefits

- **Scalability**: Handles 10,000+ parallel workflows
- **Reliability**: Temporal's built-in durability and error recovery
- **Rate Limiting**: Respects LinkedIn's API constraints
- **Observability**: Comprehensive monitoring and logging
- **Maintainability**: Clean separation of concerns
- **Extensibility**: Easy to add new workflow steps and activities

This architecture provides a robust, scalable foundation for LinkedIn outreach automation while maintaining code quality and following Clento's coding standards.
