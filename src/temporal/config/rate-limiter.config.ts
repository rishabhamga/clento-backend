/**
 * Rate Limiter Configuration
 * 
 * Configuration for rate limiting LinkedIn API calls through Unipile.
 * Implements per-account, per-operation rate limiting to respect LinkedIn's constraints.
 */

import Bottleneck from 'bottleneck';
import { logger } from '../../utils/logger';

export interface RateLimitConfig {
    profileVisits: Bottleneck.ConstructorOptions;
    invitations: Bottleneck.ConstructorOptions;
    messages: Bottleneck.ConstructorOptions;
    postComments: Bottleneck.ConstructorOptions;
    postReactions: Bottleneck.ConstructorOptions;
    globalConfig: Bottleneck.ConstructorOptions;
}

/**
 * LinkedIn API rate limits per account (based on Unipile documentation)
 */
export const LINKEDIN_RATE_LIMITS = {
    PROFILE_VISITS_PER_HOUR: 100,
    INVITATIONS_PER_HOUR: 20,
    MESSAGES_PER_HOUR: 50,
    POST_COMMENTS_PER_HOUR: 30,
    POST_REACTIONS_PER_HOUR: 100,
} as const;

/**
 * Get rate limiter configuration
 */
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

/**
 * Rate limiter registry for managing per-account rate limiters
 */
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

    /**
     * Get rate limiter for specific account and operation
     */
    public getRateLimiter(accountId: string, operation: keyof RateLimitConfig): Bottleneck {
        if (!this.limiters.has(accountId)) {
            this.limiters.set(accountId, new Map());
        }

        const accountLimiters = this.limiters.get(accountId)!;
        
        if (!accountLimiters.has(operation)) {
            const config = this.config[operation];
            const limiter = new Bottleneck({
                ...config,
                id: `${accountId}-${operation}`,
            });

            // Add event listeners for monitoring
            limiter.on('error', (error) => {
                logger.error('Rate limiter error', {
                    accountId,
                    operation,
                    error: error.message,
                });
            });

            limiter.on('depleted', () => {
                logger.warn('Rate limiter depleted', {
                    accountId,
                    operation,
                });
            });

            limiter.on('debug', (message, data) => {
                logger.debug('Rate limiter debug', {
                    accountId,
                    operation,
                    message,
                    data,
                });
            });

            accountLimiters.set(operation, limiter);
        }

        return accountLimiters.get(operation)!;
    }

    /**
     * Get global rate limiter
     */
    public getGlobalRateLimiter(): Bottleneck {
        if (!this.limiters.has('global')) {
            this.limiters.set('global', new Map());
        }

        const globalLimiters = this.limiters.get('global')!;
        
        if (!globalLimiters.has('globalConfig')) {
            const limiter = new Bottleneck(this.config.globalConfig);
            
            limiter.on('error', (error) => {
                logger.error('Global rate limiter error', {
                    error: error.message,
                });
            });

            globalLimiters.set('globalConfig', limiter);
        }

        return globalLimiters.get('globalConfig')!;
    }

    /**
     * Get rate limiter status for monitoring
     */
    public getRateLimiterStatus(accountId: string): Record<string, any> {
        const accountLimiters = this.limiters.get(accountId);
        if (!accountLimiters) {
            return {};
        }

        const status: Record<string, any> = {};
        
        for (const [operation, limiter] of accountLimiters.entries()) {
            status[operation] = {
                reservoir: limiter.reservoir(),
                running: limiter.running(),
                queued: limiter.queued(),
            };
        }

        return status;
    }

    /**
     * Cleanup rate limiters for account
     */
    public cleanup(accountId: string): void {
        const accountLimiters = this.limiters.get(accountId);
        if (accountLimiters) {
            for (const limiter of accountLimiters.values()) {
                limiter.stop();
            }
            this.limiters.delete(accountId);
        }
    }

    /**
     * Cleanup all rate limiters
     */
    public cleanupAll(): void {
        for (const [accountId, accountLimiters] of this.limiters.entries()) {
            for (const limiter of accountLimiters.values()) {
                limiter.stop();
            }
        }
        this.limiters.clear();
    }
}

/**
 * Validate rate limiter configuration
 */
export function validateRateLimiterConfig(): void {
    try {
        const config = getRateLimiterConfig();
        
        // Validate each rate limiter configuration
        for (const [operation, operationConfig] of Object.entries(config)) {
            if (!operationConfig.reservoir || operationConfig.reservoir <= 0) {
                throw new Error(`Invalid reservoir configuration for ${operation}`);
            }
            
            if (!operationConfig.reservoirRefreshInterval || operationConfig.reservoirRefreshInterval <= 0) {
                throw new Error(`Invalid refresh interval configuration for ${operation}`);
            }
        }

        logger.info('Rate limiter configuration validated successfully');
    } catch (error) {
        logger.error('Rate limiter configuration validation failed', { error });
        throw error;
    }
}
