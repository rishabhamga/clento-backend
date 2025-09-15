import { UserRepository } from '../repositories/UserRepository';
import { CreateUserDtoType, UpdateUserDtoType } from '../dto/users.dto';
import { ConflictError } from '../errors/AppError';

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
        fullName: userData.fullName,
        avatarUrl: userData.avatarUrl,
      });
    }
    
    // Create new user
    return this.userRepository.create(userData);
  }

  /**
   * Update user profile
   */
  async updateUser(id: string, userData: UpdateUserDtoType) {
    return this.userRepository.update(id, userData);
  }
}
