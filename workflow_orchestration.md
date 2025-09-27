# Temporal Workflow Architecture Plan for LinkedIn Outreach Automation


================================================================================
OVERVIEW
================================================================================

This document outlines a comprehensive Temporal architecture plan for executing 
LinkedIn outreach workflows at scale. The system is designed to handle 10,000+ 
parallel workflows while respecting LinkedIn's rate limits and ensuring reliable 
execution through the Unipile API.

================================================================================
WORKFLOW ANALYSIS SUMMARY
================================================================================



MAJOR NODE TYPES:
1. profile_visit - Visit LinkedIn profile (notify: true)
2. comment_post - Comment on recent posts with AI-generated content
3. send_invite - Send connection request with custom message
4. send_followup - Send follow-up messages
5. withdraw_request - Withdraw connection request if not accepted
6. notify_webhook - Send webhook notifications for tracking
7. addStep - Placeholder for adding more steps

EDGE TYPES:
- buttonedge - Sequential flow with time delays
- conditional - Branching based on connection acceptance (accepted/not-accepted paths)

KEY FEATURES:
- Time delays between steps (15m, 2d, 7d)
- Conditional branching based on connection request status
- AI-powered content generation for comments and messages
- Webhook notifications for tracking

================================================================================
TEMPORAL ARCHITECTURE DESIGN
================================================================================

MULTI-LEVEL WORKFLOW HIERARCHY:

Campaign Workflow (Parent)
└── Individual Lead Workflow (Child) - Processes single lead through entire flow
    ├── Profile Visit Activity
    ├── Comment Post Activity  
    ├── Send Invitation Activity
    ├── Follow-up Activities (conditional)
    └── Webhook Notification Activities

================================================================================
WORKFLOW IMPLEMENTATIONS
================================================================================

1. CAMPAIGN ORCHESTRATOR WORKFLOW
---------------------------------

Purpose: Manages entire campaign execution and coordinates lead processing

Input Parameters:
- campaignId: string
- organizationId: string
- accountId: string (Unipile account ID)
- leadListId: string
- workflowDefinition: WorkflowDefinition

Process Flow:
1. Load campaign and lead data from database
2. Execute individual lead workflows in parallel with rate limiting
3. Apply staggered execution (30 seconds between leads) to respect LinkedIn limits
4. Wait for all lead workflows to complete
5. Mark campaign as completed

Scalability: Handles unlimited leads through parallel execution with rate limiting

2. INDIVIDUAL LEAD WORKFLOW
---------------------------

Purpose: Executes complete workflow for a single lead

Input Parameters:
- campaignId: string
- accountId: string
- lead: Lead
- workflowDefinition: WorkflowDefinition
- startDelay: number (optional)

Process Flow:
1. Apply initial delay for staggered execution (if specified)
2. Create execution record in database
3. Process workflow nodes in sequence according to flow definition
4. Handle conditional branching based on results
5. Complete or fail execution with proper logging

Error Handling: Comprehensive try-catch with execution status tracking

================================================================================
ACTIVITY IMPLEMENTATIONS
================================================================================

1. PROFILE VISIT ACTIVITY
-------------------------

Unipile SDK Function: client.users.getProfile()

Parameters:
- account_id: Unipile account ID
- identifier: LinkedIn profile ID or URL
- notify: true (triggers profile view notification)
- linkedin_sections: '*' (all sections)

Rate Limit: 100 requests per hour per account

Error Handling: Log failed visits, continue workflow execution

2. COMMENT ON POST ACTIVITY
---------------------------

Unipile SDK Functions:
- client.users.getAllPosts() - Get recent posts
- client.users.sendPostComment() - Post comment

Process:
1. Retrieve recent posts from lead's profile
2. Filter posts within specified timeframe (default: 15 days)
3. Generate AI comment or use custom message
4. Post comment on most recent eligible post

Configuration Options:
- useAI: boolean
- language: string
- length: 'short' | 'medium' | 'long'
- commentTone: 'agreeable' | 'professional' | 'casual'
- customGuidelines: string
- postCount: number
- recentPostWithin: number (days)

Rate Limit: 30 requests per hour per account

3. SEND INVITATION ACTIVITY
---------------------------

Unipile SDK Function: client.users.sendInvitation()

Parameters:
- account_id: Unipile account ID
- provider_id: LinkedIn profile ID
- message: Personalized invitation message

Process:
1. Generate personalized message (AI or template)
2. Send connection request
3. Store invitation ID for tracking
4. Return invitation status

Configuration Options:
- useAI: boolean
- tone: 'Warm' | 'Professional' | 'Casual'
- formality: 'Formal' | 'Casual'
- approach: 'Direct' | 'Indirect'
- focus: 'Personal' | 'Business'
- intention: 'Networking' | 'Sales' | 'Recruitment'
- personalization: 'Generic' | 'Specific'

Rate Limit: 20 requests per hour per account

4. CHECK INVITATION STATUS ACTIVITY
-----------------------------------

Unipile SDK Function: client.users.getAllInvitationsSent()

Purpose: Determine if invitation was accepted, declined, or pending

Process:
1. Retrieve all sent invitations
2. Find specific invitation by ID
3. Return status: 'accepted' | 'pending' | 'declined'

Used for conditional branching in workflow

5. SEND FOLLOW-UP MESSAGE ACTIVITY
----------------------------------

Unipile SDK Function: client.messaging.startNewChat()

Parameters:
- account_id: Unipile account ID
- attendees_ids: [LinkedIn profile ID]
- text: Personalized follow-up message

Process:
1. Generate personalized follow-up message
2. Start new chat or send to existing conversation
3. Log message delivery

Configuration Options:
- useAI: boolean
- isFollowUp: boolean
- mentionPost: boolean
- messageLength: 'short' | 'medium' | 'long'
- tone: 'casual' | 'professional' | 'friendly'

Rate Limit: 50 requests per hour per account

6. WITHDRAW REQUEST ACTIVITY
----------------------------

Unipile SDK Function: client.users.cancelInvitationSent()

Parameters:
- account_id: Unipile account ID
- invitation_id: ID of invitation to withdraw

Used when invitation not accepted within specified timeframe

7. WEBHOOK NOTIFICATION ACTIVITY
--------------------------------

Purpose: Send notifications to external systems for tracking

Process:
1. Prepare webhook payload with lead and execution data
2. Send HTTP POST request to configured webhook URL
3. Handle webhook delivery failures with retries

Configuration:
- targetUrl: string
- integrationId: string
- timeDelay: { value: number, unit: string }

================================================================================
WORKFLOW NODE PROCESSING LOGIC
================================================================================

SEQUENTIAL PROCESSING:
1. Find starting node (no incoming edges)
2. Execute current node activity
3. Apply time delays as specified in edges
4. Evaluate conditional branches
5. Process next nodes recursively

CONDITIONAL BRANCHING:
- Evaluate conditions based on previous activity results
- Support for accepted/not-accepted paths after invitations
- Boolean logic for positive/negative conditions

TIME DELAY HANDLING:
- Convert delay specifications (15m, 2d, 7d) to milliseconds
- Use Temporal's workflow.sleep() for reliable delays
- Support for minutes, hours, and days

ERROR HANDLING:
- Activity-level error catching and logging
- Configurable retry strategies per activity type
- Non-retryable error detection (auth failures, invalid data)
- Graceful degradation for non-critical failures

================================================================================
SCALABILITY AND RATE LIMITING
================================================================================

RATE LIMITING STRATEGY:

Per-Account Limits:
- Profile Visits: 100 per hour
- Invitations: 20 per hour
- Messages: 50 per hour
- Post Comments: 30 per hour

Implementation:
- Rate limiter using bottleneck or similar library
- Per-account, per-operation rate tracking
- Automatic backoff when limits approached
- Queue management for pending requests

PARALLEL EXECUTION CONFIGURATION:

Default Settings:
- maxConcurrentLeads: 100 leads processing in parallel
- leadProcessingDelay: 30 seconds between lead starts
- maxRetriesPerActivity: 3 retries
- backoffStrategy: exponential

Scalability Calculations:
- 10,000 leads with 100 concurrent executions
- Staggered start: 30 seconds between each lead workflow initiation
- Lead workflow initiation time: 10,000 leads ÷ 100 concurrent = 100 cycles
- Total initiation time: 100 cycles × 30 seconds = 50 minutes
- Individual workflow duration: varies based on delays (15m to 7d between steps)
- Total campaign time: depends on longest workflow path

PARALLEL EXECUTION:
- Campaign level: Multiple campaigns can run simultaneously
- Lead level: Multiple leads processed in parallel per campaign
- Activity level: Rate-limited parallel API calls

================================================================================
ERROR HANDLING AND RESILIENCE
================================================================================

RETRY LOGIC:

Exponential Backoff:
- Initial delay: 1 second
- Multiplier: 2x per retry
- Maximum retries: 3 per activity
- Maximum delay: 60 seconds

Non-Retryable Errors:
- Authentication failures
- Invalid credentials
- Insufficient privileges
- Invalid data format
- Account restrictions

Retryable Errors:
- Network timeouts
- Rate limit exceeded
- Temporary server errors
- Connection failures

ERROR CATEGORIZATION:

Critical Errors (Stop Workflow):
- Account authentication failed
- Account suspended/restricted
- Invalid lead data

Non-Critical Errors (Continue Workflow):
- Profile not found
- No recent posts available
- Message delivery failed
- Webhook notification failed

RECOVERY MECHANISMS:
- Automatic workflow resumption after transient failures
- Manual intervention points for critical errors
- Comprehensive error logging for debugging
- Alert system for high error rates

================================================================================
DATA STRUCTURES AND INTERFACES
================================================================================

WORKFLOW DEFINITION:
```
WorkflowDefinition {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  timestamp: string
}
```

WORKFLOW NODE:
```
WorkflowNode {
  id: string
  type: 'action' | 'addStep'
  position: { x: number, y: number }
  data: {
    type: 'profile_visit' | 'comment_post' | 'send_invite' | 'send_followup' | 'withdraw_request' | 'notify_webhook'
    label: string
    isConfigured: boolean
    config: any
    pathType?: 'accepted' | 'not-accepted'
  }
}
```

WORKFLOW EDGE:
```
WorkflowEdge {
  id: string
  source: string
  target: string
  type: 'buttonedge' | 'conditional'
  animated: boolean
  data: {
    delay?: string
    delayData?: {
      delay: number
      unit: 'm' | 'h' | 'd'
    }
    isPositive?: boolean
    isConditionalPath?: boolean
  }
}
```

LEAD DATA:
```
Lead {
  id: string
  full_name: string
  first_name: string
  last_name: string
  email?: string
  linkedin_url?: string
  linkedin_id?: string
  title?: string
  company?: string
  campaignId?: string
}
```

CAMPAIGN EXECUTION:
```
CampaignExecution {
  id: string
  campaignId: string
  leadId: string
  workflowExecutionId: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  currentStep: string
  executionData: any
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}
```

================================================================================
DEPLOYMENT ARCHITECTURE
================================================================================

SYSTEM COMPONENTS:

1. Load Balancer
   - Distributes traffic across API instances
   - Health checks and failover

2. Campaign API Service
   - REST API for campaign management
   - Temporal workflow initiation
   - Real-time status monitoring

3. Temporal Cluster
   - Workflow Workers (multiple instances)
   - Activity Workers (multiple instances)
   - Temporal Server (HA setup)

4. PostgreSQL Database
   - Campaign and lead data
   - Execution tracking
   - Audit logs

INFRASTRUCTURE REQUIREMENTS:

Temporal Workers:
- CPU: 4-8 cores per worker
- Memory: 8-16 GB per worker
- Instances: 5-10 workers for 10,000 parallel workflows

Database:
- PostgreSQL 14+
- Connection pooling (100-200 connections)
- Read replicas for reporting

Network:
- High bandwidth for Unipile API calls
- Low latency for Temporal communication
- Monitoring and alerting

================================================================================
MONITORING AND OBSERVABILITY
================================================================================

KEY METRICS:

Workflow Metrics:
- Campaign execution success rate
- Lead processing throughput (leads/hour)
- Average execution time per lead
- Workflow completion rate
- Error rate by activity type

Performance Metrics:
- API response times (Unipile)
- Rate limit utilization
- Worker resource usage
- Database query performance
- Queue depths and processing times

Business Metrics:
- Connection request acceptance rate
- Message response rate
- Campaign ROI metrics
- Lead conversion rates

ALERTING RULES:

Critical Alerts:
- Workflow execution failure rate > 5%
- Account authentication failures
- Rate limit violations
- Database connection failures
- Worker health check failures

Warning Alerts:
- High error rate for specific activities
- Slow API response times
- High resource utilization
- Queue backlog growth

LOGGING STRATEGY:

Structured Logging:
- JSON format for all logs
- Correlation IDs for request tracking
- Contextual information (campaign, lead, account)
- Error stack traces and debugging info

Log Levels:
- DEBUG: Detailed execution flow
- INFO: Normal operations and milestones
- WARN: Recoverable errors and retries
- ERROR: Failed operations requiring attention
- FATAL: System-level failures

================================================================================
IMPLEMENTATION PLAN
================================================================================

PHASE 1: FOUNDATION (WEEK 1-2)
------------------------------

Tasks:
1. Set up Temporal server cluster (development)
2. Create basic project structure and dependencies
3. Implement Unipile client wrapper with basic rate limiting
4. Design and implement database schema updates
5. Create basic workflow and activity interfaces
6. Set up logging and monitoring infrastructure

Deliverables:
- Temporal cluster running locally
- Database schema with execution tracking tables
- Basic Unipile client with rate limiting
- Project structure with TypeScript interfaces

PHASE 2: CORE ACTIVITIES (WEEK 3-4)
-----------------------------------

Tasks:
1. Implement profile visit activity with Unipile integration
2. Implement comment post activity with AI integration
3. Implement invitation sending activity
4. Implement follow-up messaging activity
5. Implement webhook notification activity
6. Create comprehensive activity testing suite

Deliverables:
- All core activities implemented and tested
- AI integration for content generation
- Comprehensive error handling
- Unit tests for all activities

PHASE 3: WORKFLOW LOGIC (WEEK 5-6)
----------------------------------

Tasks:
1. Implement workflow node processing logic
2. Add conditional branching support
3. Implement time delay handling with Temporal sleep
4. Add comprehensive error handling and retry logic
5. Implement workflow state management
6. Create workflow execution monitoring

Deliverables:
- Complete workflow execution engine
- Conditional branching logic
- Time delay processing
- Error handling and recovery
- Workflow monitoring dashboard

PHASE 4: SCALABILITY (WEEK 7-8)
-------------------------------

Tasks:
1. Implement parallel lead processing for campaigns
2. Add comprehensive rate limiting for all activities
3. Optimize for 10,000+ parallel workflows
4. Implement advanced monitoring and alerting
5. Performance testing and optimization
6. Resource usage optimization

Deliverables:
- Parallel lead processing system
- Advanced rate limiting
- Performance optimizations
- Monitoring and alerting system
- Load testing results

PHASE 5: TESTING & OPTIMIZATION (WEEK 9-10)
-------------------------------------------

Tasks:
1. Comprehensive load testing with large lead lists
2. Performance optimization based on test results
3. Error handling refinement and edge case testing
4. Security review and hardening
5. Documentation and deployment guides
6. Production deployment preparation

Deliverables:
- Load testing results and optimizations
- Security audit and fixes
- Complete documentation
- Production deployment scripts
- Go-live readiness assessment

================================================================================
SECURITY CONSIDERATIONS
================================================================================

AUTHENTICATION & AUTHORIZATION:
- Secure storage of Unipile credentials
- Account-level access controls
- Organization-based data isolation
- API key rotation and management

DATA PROTECTION:
- Encryption at rest for sensitive data
- Encryption in transit for all API calls
- PII data handling compliance
- Audit logging for all data access

API SECURITY:
- Rate limiting to prevent abuse
- Input validation and sanitization
- SQL injection prevention
- CORS configuration for web access

OPERATIONAL SECURITY:
- Secure deployment practices
- Environment variable management
- Network security and firewalls
- Regular security updates

================================================================================
COMPLIANCE AND BEST PRACTICES
================================================================================

LINKEDIN COMPLIANCE:
- Respect LinkedIn's Terms of Service
- Implement appropriate rate limiting
- Handle account restrictions gracefully
- Provide user consent mechanisms

DATA PRIVACY:
- GDPR compliance for EU users
- Data retention policies
- User data deletion capabilities
- Privacy policy alignment

TECHNICAL BEST PRACTICES:
- Clean code principles
- Comprehensive testing
- Code review processes
- Documentation standards
- Version control best practices

================================================================================
COST ESTIMATION
================================================================================

INFRASTRUCTURE COSTS (Monthly):

Temporal Cluster:
- 5-10 worker instances (4 CPU, 8GB RAM): $400-1200
- Temporal server (HA setup): $400-600
- Load balancer: $50-100

Database:
- PostgreSQL (managed service): $300-500
- Backup and monitoring: $100-200

Monitoring & Logging:
- Application monitoring: $200-400
- Log aggregation: $100-300

Total Infrastructure: $1,550-3,100 per month

OPERATIONAL COSTS:

Unipile API:
- Based on usage and account limits
- Estimated $0.01-0.05 per lead processed

Development & Maintenance:
- Initial development: 10 weeks
- Ongoing maintenance: 20-40 hours/month

================================================================================
RISK ASSESSMENT
================================================================================

TECHNICAL RISKS:

High Risk:
- LinkedIn API changes or restrictions
- Unipile service availability
- Rate limiting enforcement changes
- Account suspension/blocking

Medium Risk:
- Temporal cluster failures
- Database performance issues
- Network connectivity problems
- Third-party service dependencies

Low Risk:
- Code bugs and defects
- Configuration errors
- Monitoring failures
- Documentation gaps

MITIGATION STRATEGIES:

LinkedIn/Unipile Risks:
- Multiple account rotation
- Conservative rate limiting
- Graceful degradation
- Alternative API providers

Technical Risks:
- High availability deployment
- Comprehensive monitoring
- Automated failover
- Regular backups

Operational Risks:
- Comprehensive testing
- Staged deployments
- Rollback procedures
- 24/7 monitoring

================================================================================
SUCCESS METRICS
================================================================================

TECHNICAL METRICS:
- System uptime: >99.9%
- Workflow success rate: >95%
- API response time: <2 seconds
- Error rate: <1%
- Throughput: 10,000+ leads/day

BUSINESS METRICS:
- Connection acceptance rate: 15-25%
- Message response rate: 5-15%
- Campaign completion rate: >90%
- Lead processing cost: <$0.10 per lead
- Time to market: <10 weeks

OPERATIONAL METRICS:
- Deployment frequency: Weekly releases
- Mean time to recovery: <1 hour
- Change failure rate: <5%
- Customer satisfaction: >4.5/5

================================================================================
CONCLUSION
================================================================================

This Temporal workflow architecture provides a comprehensive, scalable solution 
for executing LinkedIn outreach campaigns at enterprise scale. The multi-level 
workflow hierarchy, sophisticated rate limiting, and robust error handling 
ensure reliable execution while respecting LinkedIn's constraints.

Key benefits:
- Handles 10,000+ parallel workflows
- Respects LinkedIn rate limits
- Provides reliable execution through Temporal
- Supports complex conditional workflows
- Offers comprehensive monitoring and observability
- Enables rapid scaling and deployment

The phased implementation approach ensures systematic delivery with proper 
testing and optimization at each stage. The architecture is designed to be 
maintainable, extensible, and production-ready for enterprise-scale LinkedIn 
outreach automation.

================================================================================
END OF DOCUMENT
================================================================================


