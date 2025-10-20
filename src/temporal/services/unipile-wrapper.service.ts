import { UnipileClient } from "unipile-node-sdk";
import logger from "../../utils/logger";
import { RateLimiterRegistry } from "../config/rate-limiter.config";

export interface UnipileConfig {
    dns: string;
    accessToken: string;
}

export class UnipileWrapperService {
    public static instance: UnipileWrapperService;
    private client: UnipileClient | null = null;
    private rateLimiterRegistry = RateLimiterRegistry.getInstance();

    public static getInstance(): UnipileWrapperService {
        if (!UnipileWrapperService.instance) {
            UnipileWrapperService.instance = new UnipileWrapperService();
        }
        return UnipileWrapperService.instance;
    }

    /**
     * Initialize Unipile client
     */
    public initialize(config: UnipileConfig): void {
        this.client = new UnipileClient(config.dns, config.accessToken);
        logger.info('Unipile client initialized');
    }

    /**
     * Get Unipile client instance
     */
    private getClient(): UnipileClient {
        if (!this.client) {
            throw new Error('Unipile client not initialized. Call initialize() first.');
        }
        return this.client;
    }
}