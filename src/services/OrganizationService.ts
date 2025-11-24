import { OrganizationRepository, Organization, CreateOrganization, UpdateOrganization } from '../repositories/OrganizationRepository';
import { UserRepository } from '../repositories/UserRepository';
import { ConflictError, NotFoundError, ForbiddenError, BadRequestError } from '../errors/AppError';
import logger from '../utils/logger';

/**
 * Service for organization business logic
 */
export class OrganizationService {
    private organizationRepository: OrganizationRepository;
    private userRepository: UserRepository;

    constructor() {
        this.organizationRepository = new OrganizationRepository();
        this.userRepository = new UserRepository();
    }

    /**
     * Create a new organization
     */
    async createOrganization(data: CreateOrganization, creatorId: string): Promise<Organization> {
        try {
            // Generate slug if not provided
            let slug = data.slug;
            if (!slug) {
                slug = this.generateSlug(data.name);
            }

            // Check if slug is available
            const isSlugAvailable = await this.organizationRepository.isSlugAvailable(slug);
            if (!isSlugAvailable) {
                throw new ConflictError('Organization slug already exists');
            }

            // Create organization
            const organization = await this.organizationRepository.create({
                ...data,
                slug,
                timezone: data.timezone || 'UTC',
            });

            // Add creator as owner
            await this.organizationRepository.addMember({
                organization_id: organization.id,
                user_id: creatorId,
                role: 'owner',
                permissions: {
                    all: true,
                },
            });

            logger.info('Organization created', {
                organizationId: organization.id,
                creatorId,
                name: organization.name,
            });

            return organization;
        } catch (error) {
            logger.error('Error creating organization', { error, data, creatorId });
            throw error;
        }
    }

    /**
     * Get organization by ID
     */
    async getOrganization(id: string, userId: string): Promise<Organization> {
        try {
            // Verify user has access to organization
            const isMember = await this.organizationRepository.isMember(id, userId);
            if (!isMember) {
                throw new ForbiddenError('Access denied to organization');
            }

            return await this.organizationRepository.findById(id);
        } catch (error) {
            logger.error('Error getting organization', { error, id, userId });
            throw error;
        }
    }

    async getOrganizationByClerkOrgId(id: string): Promise<Organization | null> {
        try {
            return await this.organizationRepository.findByClerkOrgId(id);
        } catch (error) {
            logger.error('Error getting organization', { error, id });
            throw error;
        }
    }

    /**
     * Update organization
     */
    async updateOrganization(id: string, data: UpdateOrganization, userId: string): Promise<Organization> {
        try {
            // Verify user has admin access
            const membership = await this.organizationRepository.getMembership(id, userId);
            if (!membership || !['owner', 'admin'].includes(membership.role || '')) {
                throw new ForbiddenError('Admin access required');
            }

            // Check slug availability if updating slug
            if (data.slug) {
                const isSlugAvailable = await this.organizationRepository.isSlugAvailable(data.slug, id);
                if (!isSlugAvailable) {
                    throw new ConflictError('Organization slug already exists');
                }
            }

            const organization = await this.organizationRepository.update(id, data);

            logger.info('Organization updated', {
                organizationId: id,
                userId,
                updates: Object.keys(data),
            });

            return organization;
        } catch (error) {
            logger.error('Error updating organization', { error, id, data, userId });
            throw error;
        }
    }

    /**
     * Delete organization
     */
    async deleteOrganization(id: string, userId: string): Promise<void> {
        try {
            // Verify user is owner
            const membership = await this.organizationRepository.getMembership(id, userId);
            if (!membership || membership.role !== 'owner') {
                throw new ForbiddenError('Owner access required');
            }

            await this.organizationRepository.delete(id);

            logger.info('Organization deleted', { organizationId: id, userId });
        } catch (error) {
            logger.error('Error deleting organization', { error, id, userId });
            throw error;
        }
    }

    /**
     * Get user's organizations
     */
    async getUserOrganizations(userId: string): Promise<Array<Organization & { role: string; status: string }>> {
        try {
            return await this.organizationRepository.getUserOrganizations(userId);
        } catch (error) {
            logger.error('Error getting user organizations', { error, userId });
            throw error;
        }
    }

    /**
     * Get organization members
     */
    async getOrganizationMembers(organizationId: string, userId: string, page = 1, limit = 20) {
        try {
            // Verify user has access to organization
            const isMember = await this.organizationRepository.isMember(organizationId, userId);
            if (!isMember) {
                throw new ForbiddenError('Access denied to organization');
            }

            return await this.organizationRepository.getMembers(organizationId, page, limit);
        } catch (error) {
            logger.error('Error getting organization members', { error, organizationId, userId });
            throw error;
        }
    }

    /**
     * Add member to organization
     */
    async addMember(organizationId: string, userIdToAdd: string, role: string, requesterId: string) {
        try {
            // Verify requester has admin access
            const requesterMembership = await this.organizationRepository.getMembership(organizationId, requesterId);
            if (!requesterMembership || !requesterMembership.role || !['owner', 'admin'].includes(requesterMembership.role || '')) {
                throw new ForbiddenError('Admin access required');
            }

            // Check if user exists
            const userExists = await this.userRepository.findById(userIdToAdd);
            if (!userExists) {
                throw new NotFoundError('User not found');
            }

            // Check if user is already a member
            const existingMembership = await this.organizationRepository.getMembership(organizationId, userIdToAdd);
            if (existingMembership) {
                throw new ConflictError('User is already a member of this organization');
            }

            // Validate role
            const validRoles = ['owner', 'admin', 'member', 'viewer'];
            if (!validRoles.includes(role)) {
                throw new BadRequestError('Invalid role specified');
            }

            // Only owners can add other owners
            if (role === 'owner' && requesterMembership.role !== 'owner') {
                throw new ForbiddenError('Only owners can add other owners');
            }

            const member = await this.organizationRepository.addMember({
                organization_id: organizationId,
                user_id: userIdToAdd,
                role,
            });

            logger.info('Member added to organization', {
                organizationId,
                userIdToAdd,
                role,
                requesterId,
            });

            return member;
        } catch (error) {
            logger.error('Error adding member to organization', {
                error,
                organizationId,
                userIdToAdd,
                role,
                requesterId,
            });
            throw error;
        }
    }

    /**
     * Update member role
     */
    async updateMemberRole(organizationId: string, userIdToUpdate: string, role: string, requesterId: string) {
        try {
            // Verify requester has admin access
            const requesterMembership = await this.organizationRepository.getMembership(organizationId, requesterId);
            if (!requesterMembership || !requesterMembership.role || !['owner', 'admin'].includes(requesterMembership.role || '')) {
                throw new ForbiddenError('Admin access required');
            }

            // Get current membership
            const currentMembership = await this.organizationRepository.getMembership(organizationId, userIdToUpdate);
            if (!currentMembership) {
                throw new NotFoundError('User is not a member of this organization');
            }

            // Validate role
            const validRoles = ['owner', 'admin', 'member', 'viewer'];
            if (!validRoles.includes(role)) {
                throw new BadRequestError('Invalid role specified');
            }

            // Only owners can change owner roles
            if ((role === 'owner' || currentMembership.role === 'owner') && requesterMembership.role !== 'owner') {
                throw new ForbiddenError('Only owners can change owner roles');
            }

            // Prevent user from changing their own role if they're the only owner
            if (userIdToUpdate === requesterId && currentMembership.role === 'owner') {
                const owners = await this.organizationRepository.getMembers(organizationId, 1, 100);
                const ownerCount = owners.data.filter((member: any) => member.role === 'owner').length;
                if (ownerCount === 1) {
                    throw new BadRequestError('Cannot change role of the only owner');
                }
            }

            const updatedMember = await this.organizationRepository.updateMember(organizationId, userIdToUpdate, { role });

            logger.info('Member role updated', {
                organizationId,
                userIdToUpdate,
                oldRole: currentMembership.role,
                newRole: role,
                requesterId,
            });

            return updatedMember;
        } catch (error) {
            logger.error('Error updating member role', {
                error,
                organizationId,
                userIdToUpdate,
                role,
                requesterId,
            });
            throw error;
        }
    }

    /**
     * Remove member from organization
     */
    async removeMember(organizationId: string, userIdToRemove: string, requesterId: string): Promise<void> {
        try {
            // Verify requester has admin access
            const requesterMembership = await this.organizationRepository.getMembership(organizationId, requesterId);
            if (!requesterMembership || !requesterMembership.role || !['owner', 'admin'].includes(requesterMembership.role || '')) {
                throw new ForbiddenError('Admin access required');
            }

            // Get membership to remove
            const membershipToRemove = await this.organizationRepository.getMembership(organizationId, userIdToRemove);
            if (!membershipToRemove) {
                throw new NotFoundError('User is not a member of this organization');
            }

            // Only owners can remove other owners
            if (membershipToRemove.role === 'owner' && requesterMembership.role !== 'owner') {
                throw new ForbiddenError('Only owners can remove other owners');
            }

            // Prevent removing the last owner
            if (membershipToRemove.role === 'owner') {
                const owners = await this.organizationRepository.getMembers(organizationId, 1, 100);
                const ownerCount = owners.data.filter((member: any) => member.role === 'owner').length;
                if (ownerCount === 1) {
                    throw new BadRequestError('Cannot remove the only owner');
                }
            }

            await this.organizationRepository.removeMember(organizationId, userIdToRemove);

            logger.info('Member removed from organization', {
                organizationId,
                userIdToRemove,
                requesterId,
            });
        } catch (error) {
            logger.error('Error removing member from organization', {
                error,
                organizationId,
                userIdToRemove,
                requesterId,
            });
            throw error;
        }
    }

    /**
     * Get organization usage statistics
     */
    async getUsageStats(organizationId: string, userId: string, month?: string) {
        try {
            // Verify user has access to organization
            const isMember = await this.organizationRepository.isMember(organizationId, userId);
            if (!isMember) {
                throw new ForbiddenError('Access denied to organization');
            }

            return await this.organizationRepository.getUsageStats(organizationId, month);
        } catch (error) {
            logger.error('Error getting organization usage stats', { error, organizationId, userId });
            throw error;
        }
    }

    /**
     * Generate a slug from organization name
     */
    private generateSlug(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Replace multiple hyphens with single
            .trim()
            .substring(0, 50); // Limit length
    }
}
