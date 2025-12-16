// Activity Return Types - Type-safe return types for all activities

export interface ProfileVisitResult {
    providerId: string;
    lead_data: {
        first_name: string;
        last_name: string;
        company?: string;
    };
}

export interface ConnectionRequestResult {
    providerId: string;
    alreadyConnected?: boolean;
    alreadyInvited?: boolean;
}

export interface ConnectionStatusResult {
    status: 'accepted' | 'rejected' | 'pending';
    providerId: string;
}

export interface LikePostResult {
    success: true;
    message: string;
}

export interface CommentPostResult {
    success: true;
    message: string;
}

export interface FollowUpResult {
    success: true;
    message: string;
    data?: unknown;
}

export interface WithdrawRequestResult {
    success: true;
    message: string;
}

export interface WebhookResult {
    success: boolean;
    message: string;
    webhookId?: string;
}

// Node execution result for workflows
export interface NodeResult {
    success: boolean;
    data: ProfileVisitResult | ConnectionRequestResult | ConnectionStatusResult | LikePostResult | CommentPostResult | FollowUpResult | WithdrawRequestResult | WebhookResult;
    error?: {
        type: string;
        message: string;
        statusCode?: number;
    };
}
