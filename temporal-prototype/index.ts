/**
 * Temporal Module Entry Point
 * 
 * This module exports all Temporal-related functionality for the Clento backend.
 * It provides a clean interface for starting workflows, managing workers, and
 * interacting with Temporal Cloud.
 */

// Configuration exports
export * from './config/temporal.config';
export * from './config/worker.config';
export * from './config/rate-limiter.config';

// Workflow exports
export * from './workflows/campaign-orchestrator.workflow';
export * from './workflows/lead-outreach.workflow';
export * from './workflows/workflow.types';

// Activity exports
export * from './activities/linkedin/profile-visit.activity';
export * from './activities/linkedin/like-post.activity';
export * from './activities/linkedin/comment-post.activity';
export * from './activities/linkedin/send-invitation.activity';
export * from './activities/linkedin/check-invitation.activity';
export * from './activities/linkedin/send-followup.activity';
export * from './activities/linkedin/withdraw-request.activity';
export * from './activities/database/campaign-execution.activity';
export * from './activities/webhook/notify-webhook.activity';
export * from './activities/activity.types';

// Service exports
export * from './services/temporal-client.service';
export * from './services/workflow-executor.service';
export * from './services/rate-limiter.service';
export * from './services/unipile-wrapper.service';

// Utility exports
export * from './utils/workflow-parser.util';
export * from './utils/delay-calculator.util';
export * from './utils/error-handler.util';
export * from './utils/logger.util';

// Worker export
export { createTemporalWorker } from './worker';
