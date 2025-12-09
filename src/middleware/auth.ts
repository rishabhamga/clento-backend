import { Request, Response, NextFunction } from 'express';
import { ClerkExpressRequireAuth, ClerkExpressWithAuth } from '@clerk/clerk-sdk-node';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError';
import { UserRepository } from '../repositories/UserRepository';
import { OrganizationRepository } from '../repositories/OrganizationRepository';
import logger from '../utils/logger';
import env from '../config/env';
import { SubscriptionRepository } from '../repositories/SubscriptionRepository';
import { plans } from '../config/plans';
import { SubscriptionType } from '../dto/subscriptions.dto';

// Extend Express Request type to include user and organization information
declare global {
    namespace Express {
        interface Request {
            auth?: {
                userId?: string;
                orgId?: string;
                getToken?: (options?: { template?: string }) => Promise<string>;
            };
            userId: string;
            externalId: string; // Clerk ID
            organizationId: string;
            user: {
                id: string;
                external_id: string;
                email: string;
                full_name?: string;
                avatar_url?: string;
                timezone?: string;
            };
            organization: {
                id: string;
                name: string;
                slug?: string;
                plan: string;
                timezone: string;
            };
            organizationMember?: {
                role: string;
                permissions: Record<string, any>;
                status: string;
            };
            subscription: {
                hasPlans: boolean
                hasAddons: boolean,
                totalSeats: number;
            };
            reporter?: {
                id: string;
                name: string;
                email: string;
            };
        }
    }
}

/**
 * Middleware to verify authentication using Clerk
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const headers = req.headers.authorization;
    return ClerkExpressWithAuth({
        onError: error => {
            console.error('❌ Clerk auth error:', error);
            next(new UnauthorizedError('Authentication required'));
        },
        signInUrl: '/sign-in',
    })(req, res, next);
};

/**
 * Middleware to load user from database with automatic sync
 */
export const loadUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.auth || !req.auth.userId) {
            return next(new UnauthorizedError('Authentication required'));
        }

        // Get clerk user ID from auth
        const clerkUserId = req.auth.userId;
        const userRepository = new UserRepository();

        const user = await userRepository.findByClerkId(clerkUserId);

        if (!user) {
            throw new UnauthorizedError('User not found');
        }

        // Attach user to request
        req.userId = user.id;
        req.externalId = user.external_id;
        req.user = {
            id: user.id,
            external_id: user.external_id,
            email: user.email,
            full_name: user.full_name || undefined,
            avatar_url: user.avatar_url || undefined,
            created_at: user.created_at ? new Date(user.created_at) : new Date(),
            updated_at: user.updated_at ? new Date(user.updated_at) : new Date(),
        };

        next();
    } catch (error) {
        logger.error('Error loading user', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });
        next(error);
    }
};

/**
 * Middleware to load organization context from header or query param with sync
 */
export const loadOrganization = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.userId) {
            return next(new UnauthorizedError('User context required'));
        }

        // Get organization ID from header or query param
        const orgId = (req.headers['x-organization-id'] as string) || (req.query.organization_id as string);

        if (!orgId) {
            // Try to get user's default organization
            const userRepo = new UserRepository();
            const user = await userRepo.findById(req.userId);
            const organizationRepository = new OrganizationRepository();
            const userOrgs = await organizationRepository.getUserOrganizations(req.userId);
            if (!user.selected_org) {
                console.log('no org selected setting original org');
                if (userOrgs.length > 0) {
                    // Use the first organization as default
                    const defaultOrg = userOrgs[0];
                    req.organizationId = defaultOrg.id;
                    req.organization = {
                        id: defaultOrg.id,
                        name: defaultOrg.name,
                        slug: defaultOrg.slug,
                        plan: defaultOrg.plan,
                        timezone: defaultOrg.timezone,
                    };
                    req.organizationMember = {
                        role: defaultOrg.role,
                        permissions: {},
                        status: defaultOrg.status,
                    };
                    await userRepo.update(user.id, { selected_org: defaultOrg.id });
                } else {
                    // User has no organizations - this might be an error case
                    logger.warn('User has no organizations', { userId: req.userId });
                    // Don't set organizationId - let the route handle this case
                }
            } else {
                const selected_org_data = userOrgs.find(it => it.id === user.selected_org);
                console.log('setting org data of this org', selected_org_data?.id);
                if (!selected_org_data) {
                    throw new UnauthorizedError('Error');
                }
                req.organizationId = selected_org_data.id;
                req.organization = {
                    id: selected_org_data.id,
                    name: selected_org_data.name,
                    slug: selected_org_data.slug,
                    plan: selected_org_data.plan,
                    timezone: selected_org_data.timezone,
                };
                req.organizationMember = {
                    role: selected_org_data.role,
                    permissions: {},
                    status: selected_org_data.status,
                };
            }
            return next();
        }

        // Load specific organization
        const organizationRepository = new OrganizationRepository();
        const organization = await organizationRepository.findById(orgId);

        if (!organization) {
            return next(new UnauthorizedError('Organization not found'));
        }

        // Verify user is a member
        const membership = await organizationRepository.getMembership(orgId, req.userId);
        if (!membership) {
            return next(new ForbiddenError('User is not a member of this organization'));
        }

        req.organizationId = organization.id;
        req.organization = {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            plan: organization.plan,
            timezone: organization.timezone,
        };
        req.organizationMember = {
            role: membership.role || 'member',
            permissions: membership.permissions || {},
            status: membership.status || 'active',
        };

        next();
    } catch (error) {
        logger.error('Error loading organization', { error });
        next(error);
    }
};

/**
 * Middleware to require organization context
 */
export const requireOrganization = (req: Request, res: Response, next: NextFunction) => {
    if (!req.organizationId) {
        return next(new UnauthorizedError('Organization context required'));
    }
    next();
};

export const loadSubscription = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.organizationId) {
        return next(new UnauthorizedError('Organization context required'));
    }
    const subscriptionRepository = new SubscriptionRepository();
    const subscriptions = await subscriptionRepository.getActiveSubscription(req.organizationId);
    const orgPlans = subscriptions.map(it => plans.find(p => p.id === it.plan_id))
    req.subscription = {
        hasPlans: orgPlans.length > 0,
        hasAddons: subscriptions.some(it => it.type === SubscriptionType.ADDON),
        totalSeats: subscriptions.reduce((acc, it) => acc + it.numberOfSeats, 0)
    }
    next();
};

/**
 * Middleware to verify organization membership
 */
export const verifyOrganizationMembership = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.userId || !req.organizationId) {
            return next(new UnauthorizedError('User and organization context required'));
        }

        if (!req.organizationMember) {
            return next(new ForbiddenError('User is not a member of this organization'));
        }

        if (req.organizationMember.status !== 'active') {
            return next(new ForbiddenError('User membership is not active'));
        }

        next();
    } catch (error) {
        logger.error('Error verifying organization membership', { error });
        next(error);
    }
};

/**
 * Middleware to verify organization admin role
 */
export const requireOrganizationAdmin = (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.organizationMember) {
            return next(new UnauthorizedError('Organization membership required'));
        }

        const adminRoles = ['owner', 'admin'];
        if (!adminRoles.includes(req.organizationMember.role)) {
            return next(new ForbiddenError('Admin role required'));
        }

        next();
    } catch (error) {
        logger.error('Error verifying admin role', { error });
        next(error);
    }
};

/**
 * Middleware to verify specific organization role
 */
export const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.organizationMember) {
                return next(new UnauthorizedError('Organization membership required'));
            }

            if (!roles.includes(req.organizationMember.role)) {
                return next(new ForbiddenError(`Required role: ${roles.join(' or ')}`));
            }

            next();
        } catch (error) {
            logger.error('Error verifying role', { error, requiredRoles: roles });
            next(error);
        }
    };
};

/**
 * Middleware to create a Supabase auth client from Clerk JWT
 */
export const createSupabaseAuthClient = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.auth || !req.auth.getToken) {
            return next(new UnauthorizedError('Authentication required'));
        }

        // Get JWT token for Supabase
        const token = await req.auth.getToken({ template: 'supabase' });

        // Store token in request for later use
        req.headers['supabase-auth-token'] = token;

        next();
    } catch (error) {
        logger.error('Error creating Supabase auth client', { error });
        next(error);
    }
};

/**
 * Default authentication middleware that applies auth, user loading, and organization loading
 * This should be applied to all routes by default
 */
export const defaultAuth = [requireAuth, loadUser, loadOrganization, loadSubscription];

/**
 * Skip authentication middleware - use this to opt out of default auth
 */
export const skipAuth = (req: Request, res: Response, next: NextFunction) => {
    // This is a no-op middleware that just passes through
    // Routes can use this to explicitly skip authentication
    next();
};
