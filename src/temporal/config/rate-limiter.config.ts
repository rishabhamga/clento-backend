import Bottleneck from 'bottleneck';

export const LINKEDIN_RATE_LIMITS = {
    PROFILE_VISITS_PER_HOUR: 100,
    INVITATIONS_PER_HOUR: 20,
    MESSAGES_PER_HOUR: 50,
    POST_COMMENTS_PER_HOUR: 30,
    POST_REACTIONS_PER_HOUR: 100,
} as const;

export interface RateLimitConfig {
    profileVisits: Bottleneck.ConstructorOptions;
    invitations: Bottleneck.ConstructorOptions;
    messages: Bottleneck.ConstructorOptions;
    postComments: Bottleneck.ConstructorOptions;
    postReactions: Bottleneck.ConstructorOptions;
    globalConfig: Bottleneck.ConstructorOptions;
}

export function getRateLimiterConfig(): RateLimitConfig {
    const isProduction = process.env.NODE_ENV === 'production';

    // More conservative limits in production to avoid account restrictions
    const safetyFactor = isProduction ? 0.8 : 0.9;

    return {
        // Profile visits: 100 per hour per account
        profileVisits: {
            reservoir: Math.floor(LINKEDIN_RATE_LIMITS.PROFILE_VISITS_PER_HOUR * safetyFactor),
            reservoirRefreshAmount: Math.floor(LINKEDIN_RATE_LIMITS.PROFILE_VISITS_PER_HOUR * safetyFactor),
            reservoirRefreshInterval: 60 * 60 * 1000, // 1 hour
            maxConcurrent: 5,
            minTime: 1000, // 1 second between requests
            trackDoneStatus: true,
            id: 'profile-visits',
        },

        // Invitations: 20 per hour per account
        invitations: {
            reservoir: Math.floor(LINKEDIN_RATE_LIMITS.INVITATIONS_PER_HOUR * safetyFactor),
            reservoirRefreshAmount: Math.floor(LINKEDIN_RATE_LIMITS.INVITATIONS_PER_HOUR * safetyFactor),
            reservoirRefreshInterval: 60 * 60 * 1000, // 1 hour
            maxConcurrent: 2,
            minTime: 3000, // 3 seconds between requests (more conservative)
            trackDoneStatus: true,
            id: 'invitations',
        },

        // Messages: 50 per hour per account
        messages: {
            reservoir: Math.floor(LINKEDIN_RATE_LIMITS.MESSAGES_PER_HOUR * safetyFactor),
            reservoirRefreshAmount: Math.floor(LINKEDIN_RATE_LIMITS.MESSAGES_PER_HOUR * safetyFactor),
            reservoirRefreshInterval: 60 * 60 * 1000, // 1 hour
            maxConcurrent: 3,
            minTime: 2000, // 2 seconds between requests
            trackDoneStatus: true,
            id: 'messages',
        },

        // Post comments: 30 per hour per account
        postComments: {
            reservoir: Math.floor(LINKEDIN_RATE_LIMITS.POST_COMMENTS_PER_HOUR * safetyFactor),
            reservoirRefreshAmount: Math.floor(LINKEDIN_RATE_LIMITS.POST_COMMENTS_PER_HOUR * safetyFactor),
            reservoirRefreshInterval: 60 * 60 * 1000, // 1 hour
            maxConcurrent: 2,
            minTime: 2000, // 2 seconds between requests
            trackDoneStatus: true,
            id: 'post-comments',
        },

        // Post reactions: 100 per hour per account
        postReactions: {
            reservoir: Math.floor(LINKEDIN_RATE_LIMITS.POST_REACTIONS_PER_HOUR * safetyFactor),
            reservoirRefreshAmount: Math.floor(LINKEDIN_RATE_LIMITS.POST_REACTIONS_PER_HOUR * safetyFactor),
            reservoirRefreshInterval: 60 * 60 * 1000, // 1 hour
            maxConcurrent: 5,
            minTime: 1000, // 1 second between requests
            trackDoneStatus: true,
            id: 'post-reactions',
        },

        // Global rate limiter for all operations
        globalConfig: {
            maxConcurrent: isProduction ? 50 : 20,
            minTime: 500, // 500ms between any API calls
            trackDoneStatus: true,
            id: 'global-linkedin-api',
        },
    };
}

export class RateLimiterRegistry {
    private static instance: RateLimiterRegistry;
    private limiters: Map<string, Map<string, Bottleneck>> = new Map();
    private config: RateLimitConfig;

    private constructor() {
        this.config = getRateLimiterConfig();
    }

    public static getInstance(): RateLimiterRegistry {
        if (!RateLimiterRegistry.instance) {
            RateLimiterRegistry.instance = new RateLimiterRegistry();
        }
        return RateLimiterRegistry.instance;
    }
}