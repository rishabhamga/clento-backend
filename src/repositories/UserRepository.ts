import { BaseRepository } from './BaseRepository';
import { UserProfileRepository } from './UserProfileRepository';
import { NotFoundError } from '../errors/AppError';
import logger from '../utils/logger';
import {
  UserResponseDto,
  UserInsertDto,
  UserUpdateDto,
  UserProfileResponseDto,
  UserProfileInsertDto,
  UserProfileUpdateDto
} from '../dto/users.dto';

/**
 * Repository for user-related database operations
 */
export class UserRepository extends BaseRepository<UserResponseDto, UserInsertDto, UserUpdateDto> {
  private profileRepository: UserProfileRepository;

  constructor() {
    super('users');
    this.profileRepository = new UserProfileRepository();
  }

  /**
   * Find user by Clerk ID
   */
  async findByClerkId(clerkId: string): Promise<UserResponseDto | null> {
    return this.findOneByField('external_id', clerkId);
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<UserResponseDto | null> {
    return this.findOneByField('email', email);
  }

  /**
   * Get user profile by user ID
   */
  async getUserProfile(userId: string): Promise<UserProfileResponseDto | null> {
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
  async upsertUserProfile(profile: UserProfileInsertDto): Promise<UserProfileResponseDto> {
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
  async updateUserProfile(userId: string, profile: UserProfileUpdateDto): Promise<UserProfileResponseDto> {
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
  async getUserWithProfile(userId: string): Promise<{ user: UserResponseDto; profile: UserProfileResponseDto | null }> {
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
  async createFromClerk(clerkId: string, email: string, fullName?: string): Promise<UserResponseDto> {
    return this.create({
      external_id: clerkId,
      email,
      full_name: fullName || null,
    } as UserInsertDto);
}

  /**
   * Sync user from Clerk
   * Creates if doesn't exist, updates if it does
   */
  async syncFromClerk(clerkId: string, email: string, fullName?: string): Promise<UserResponseDto> {
    // Check if user exists
    const existingUser = await this.findByClerkId(clerkId);

    if (existingUser) {
      // Update existing user
      return this.update(existingUser.id, {
        email,
        full_name: fullName || null,
      } as UserUpdateDto);
    }

    // Create new user
    return this.createFromClerk(clerkId, email, fullName);
  }
}