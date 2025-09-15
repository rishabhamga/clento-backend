import { Database } from '../types/database';
import { BaseRepository } from './BaseRepository';
import { NotFoundError } from '../errors/AppError';

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
  constructor() {
    super('users');
  }

  /**
   * Find user by Clerk ID
   */
  async findByClerkId(clerkId: string): Promise<User | null> {
    return this.findOneByField('clerk_id', clerkId);
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
    const { data, error } = await this.client
      .from('user_profile')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      throw error;
    }

    return data as UserProfile;
  }

  /**
   * Create or update user profile
   */
  async upsertUserProfile(profile: UserProfileInsert): Promise<UserProfile> {
    const { data, error } = await this.client
      .from('user_profile')
      .upsert(profile)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as UserProfile;
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, profile: UserProfileUpdate): Promise<UserProfile> {
    const { data, error } = await this.client
      .from('user_profile')
      .update(profile)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new NotFoundError(`User profile for user ${userId} not found`);
    }

    return data as UserProfile;
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
      clerk_id: clerkId,
      email,
      full_name: fullName || null,
    });
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
        updated_at: new Date().toISOString(),
      });
    }

    // Create new user
    return this.createFromClerk(clerkId, email, fullName);
  }
}