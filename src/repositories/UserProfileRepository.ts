import { BaseRepository } from './BaseRepository';
import { DatabaseError, NotFoundError } from '../errors/AppError';
import logger from '../utils/logger';
import {
  UserProfileResponseDto,
  UserProfileInsertDto,
  UserProfileUpdateDto
} from '../dto/users.dto';

/**
 * Repository for user_profile table operations
 */
export class UserProfileRepository extends BaseRepository<UserProfileResponseDto, UserProfileInsertDto, UserProfileUpdateDto> {
  constructor() {
    super('user_profile');
  }

  /**
   * Get user profile by user ID
   */
  async findByUserId(userId: string): Promise<UserProfileResponseDto | null> {
    try {
      return await this.findOneByField('user_id', userId);
    } catch (error) {
      logger.error('Error finding user profile by user ID', { error, userId });
      throw new DatabaseError('Failed to find user profile');
    }
  }

  /**
   * Create or update user profile (upsert)
   */
  async upsert(profile: UserProfileInsertDto): Promise<UserProfileResponseDto> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .upsert(profile as any)
        .select()
        .single();

      if (error) {
        logger.error('Error upserting user profile', { error, profile });
        throw new DatabaseError('Failed to upsert user profile');
      }

      return data as UserProfileResponseDto;
    } catch (error) {
      logger.error('Error in upsert', { error, profile });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to upsert user profile');
    }
  }

  /**
   * Update user profile by user ID
   */
  async updateByUserId(userId: string, profile: UserProfileUpdateDto): Promise<UserProfileResponseDto> {
    try {
      const existingProfile = await this.findByUserId(userId);
      if (!existingProfile) {
        throw new NotFoundError(`User profile for user ${userId} not found`);
      }

      return await this.update(existingProfile.user_id, profile);
    } catch (error) {
      logger.error('Error updating user profile by user ID', { error, userId, profile });
      throw error instanceof DatabaseError ? error : new DatabaseError('Failed to update user profile');
    }
  }
}