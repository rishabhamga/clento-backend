import { Request, Response, NextFunction } from 'express';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError';
import { UserRepository } from '../repositories/UserRepository';
import { OrganizationRepository } from '../repositories/OrganizationRepository';
import logger from '../utils/logger';
import env from '../config/env';

// Extend Express Request type to include user and organization information
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId?: string;
        orgId?: string;
        getToken?: (options?: { template?: string }) => Promise<string>;
      };
      userId?: string;
      externalId?: string; // Clerk ID
      organizationId?: string;
      user?: {
        id: string;
        external_id: string;
        email: string;
        full_name?: string;
        avatar_url?: string;
        timezone?: string;
      };
      organization?: {
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
    }
  }
}

/**
 * Middleware to verify authentication using Clerk
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  console.log("=== requireAuth middleware called ===");
  console.log("CLERK_SECRET_KEY exists:", !!env.CLERK_SECRET_KEY);

  // Check if Authorization header exists
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log("No valid Authorization header found");
    return next(new UnauthorizedError('Authentication required'));
  }

  // Use Clerk middleware for token verification
  return ClerkExpressRequireAuth({
    onError: (error: any) => {
      console.log("Clerk authentication error:", error);
      logger.error('Authentication error', { error });
      return next(new UnauthorizedError('Authentication required'));
    },
  })(req, res, next);
};

/**
 * Middleware to load user from database with automatic sync
 */
export const loadUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log("=== loadUser middleware called ===");
    console.log("req.auth:", req.auth);
    console.log("env.CLERK_SECRET_KEY exists:", !!env.CLERK_SECRET_KEY);

    if (!req.auth || !req.auth.userId) {
      console.log("No auth or userId found, returning UnauthorizedError");
      return next(new UnauthorizedError('Authentication required'));
    }


    // Get clerk user ID from auth
    const clerkUserId = req.auth.userId;
    const userRepository = new UserRepository();

    const user = await userRepository.findByClerkId(clerkUserId);

    if(!user){
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
    };

    next();
  } catch (error) {
    logger.error('Error loading user', { error });
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
    const orgId = req.headers['x-organization-id'] as string || req.query.organization_id as string;

    if (!orgId) {
      // Try to get user's default organization
      const organizationRepository = new OrganizationRepository();
      const userOrgs = await organizationRepository.getUserOrganizations(req.userId);

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