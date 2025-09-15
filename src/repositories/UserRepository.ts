import { Database } from '../types/database';
import { BaseRepository } from './BaseRepository';
import { UserProfileRepository } from './UserProfileRepository';
import { NotFoundError } from '../errors/AppError';
import logger from '../utils/logger';

// Define types from the Database interface
type User = Database['public']['Tables']['users']['Row'];
type UserInsert = Database['public']['Tables']['users']['Insert'];
type UserUpdate = Database['public']['Tables']['users']['Update'];

type UserProfile = Database['public']['Tables']['user_profile']['Row'];
type UserProfileInsert = Database['public']['Tables']['user_profile']['Insert'];
type UserProfileUpdate = Database['public']['Tables']['user_profile']['Update'];

/**
 * Repository for user-related database operations
 */
export class UserRepository extends BaseRepository<User, UserInsert, UserUpdate> {
  private profileRepository: UserProfileRepository;

  constructor() {
    super('users');
    this.profileRepository = new UserProfileRepository();
  }

  /**
   * Find user by Clerk ID
   */
  async findByClerkId(clerkId: string): Promise<User | null> {
    return this.findOneByField('external_id', clerkId);
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.findOneByField('email', email);
  }

  /**
   * Get user profile by user ID
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      return await this.profileRepository.findByUserId(userId);
    } catch (error) {
      logger.error('Error getting user profile', { error, userId });
      throw error;
    }
  }

  /**
   * Create or update user profile
   */
  async upsertUserProfile(profile: UserProfileInsert): Promise<UserProfile> {
    try {
      return await this.profileRepository.upsert(profile);
    } catch (error) {
      logger.error('Error upserting user profile', { error, profile });
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, profile: UserProfileUpdate): Promise<UserProfile> {
    try {
      return await this.profileRepository.updateByUserId(userId, profile);
    } catch (error) {
      logger.error('Error updating user profile', { error, userId, profile });
      throw error;
    }
  }

  /**
   * Get user with profile
   */
  async getUserWithProfile(userId: string): Promise<{ user: User; profile: UserProfile | null }> {
    const user = await this.findById(userId);
    const profile = await this.getUserProfile(userId);

    return {
      user,
      profile,
    };
  }

  /**
   * Create user from Clerk data
   */
  async createFromClerk(clerkId: string, email: string, fullName?: string): Promise<User> {
    return this.create({
      external_id: clerkId,
      email,
      full_name: fullName || null,
    } as UserInsert);
}

  /**
   * Sync user from Clerk
   * Creates if doesn't exist, updates if it does
   */
  async syncFromClerk(clerkId: string, email: string, fullName?: string): Promise<User> {
    // Check if user exists
    const existingUser = await this.findByClerkId(clerkId);

    if (existingUser) {
      // Update existing user
      return this.update(existingUser.id, {
        email,
        full_name: fullName || null,
      } as UserUpdate);
    }

    // Create new user
    return this.createFromClerk(clerkId, email, fullName);
  }
}