import { Request, Response } from 'express';
import { UserService } from '../services/UserService';
import { CreateUserDto, UpdateUserDto } from '../dto/users.dto';
import { ValidationError } from '../errors/AppError';
import { runInNewContext } from 'vm';

/**
 * Controller for user-related endpoints
 */
export class UserController {
    private userService: UserService;

    constructor() {
        this.userService = new UserService();
    }

    /**
     * Get current user profile
     * @route GET /api/users/me
     */
    getMe = async (req: Request, res: Response) => {
        try {
            console.log('=== UserController.getMe called ===');
            console.log('req.userId:', req.userId);
            console.log('req.auth:', req.auth);
            console.log('req.user:', req.user);

            if (!req.userId) {
                console.log('User ID not found in request - authentication failed');
                throw new ValidationError('Authentication required');
            }

            console.log('Calling userService.getUserById with:', req.userId);
            const user = await this.userService.getUserById(req.userId);
            console.log('User found:', user);

            res.status(200).json({
                success: true,
                data: user,
            });
        } catch (error) {
            console.error('Error in getMe:', error);
            throw error;
        }
    };

    /**
     * Sync user from Clerk
     * @route POST /api/users/sync
     */
    syncUser = async (req: Request, res: Response) => {
        // Validate request body
        const result = CreateUserDto.safeParse(req.body);

        if (!result.success) {
            throw new ValidationError(result.error.message);
        }

        const user = await this.userService.syncUser(result.data);

        res.status(200).json({
            success: true,
            data: user,
        });
    };

    /**
     * Update user profile
     * @route PATCH /api/users/me
     */
    updateProfile = async (req: Request, res: Response) => {
        if (!req.userId) {
            throw new ValidationError('User ID not found in request');
        }

        // Validate request body
        const result = UpdateUserDto.safeParse(req.body);

        if (!result.success) {
            throw new ValidationError(result.error.message);
        }

        const user = await this.userService.updateUser(req.userId, result.data);

        res.status(200).json({
            success: true,
            data: user,
        });
    };
}
