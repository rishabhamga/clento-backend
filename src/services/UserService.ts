import { UserRepository } from '../repositories/UserRepository';
import { CreateUserDtoType, UpdateUserDtoType, UserInsertDto, UserUpdateDto } from '../dto/users.dto';

/**
 * Service for user-related operations
 */
export class UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string) {
    return this.userRepository.findById(id);
  }

  /**
   * Create or sync user from Clerk
   */
  async syncUser(userData: CreateUserDtoType) {
    // Check if user already exists
    const existingUser = await this.userRepository.findByClerkId(userData.externalId);

    if (existingUser) {
      // Update existing user if needed
      return this.userRepository.update(existingUser.id, {
        full_name: userData.fullName || null,
        avatar_url: userData.avatarUrl || null,
      });
    }

    // Create new user
    return this.userRepository.create(userData as unknown as UserInsertDto);
  }

  /**
   * Update user profile
   */
  async updateUser(id: string, userData: UpdateUserDtoType) {
    return this.userRepository.update(id, userData as unknown as UserUpdateDto);
  }

  /**
   * Sync user from Clerk by Clerk user ID
   */
  async syncFromClerk(clerkUserId: string) {
    // This would typically fetch user data from Clerk API
    // For now, we'll just return the existing user or create a placeholder
    const existingUser = await this.userRepository.findByClerkId(clerkUserId);

    if (existingUser) {
      return existingUser;
    }

    // If user doesn't exist, create a placeholder
    // In a real implementation, you'd fetch from Clerk API
    return this.userRepository.createFromClerk(
      clerkUserId,
      `user-${clerkUserId}@example.com`,
      'Synced User'
    );
  }
}
