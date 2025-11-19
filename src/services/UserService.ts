import { UserRepository } from '../repositories/UserRepository';
import { CreateUserDtoType, UpdateUserDtoType, UserInsertDto, UserUpdateDto } from '../dto/users.dto';
import logger from '../utils/logger';

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
     * @deprecated Use syncService.syncUserToDatabase instead
     */
    async syncUser(userData: CreateUserDtoType) {
        logger.warn('syncUser method is deprecated, use SyncService.syncUserToDatabase instead');

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
}
