import ClentoAPI from '../utils/apiUtil';
import { UserService } from '../services/UserService';
import { Request, Response } from 'express';
import { NotFoundError } from '../errors/AppError';

/**
 * User API - Authenticated user endpoints
 */
export class UserAPI extends ClentoAPI {
  public path = '/api/users';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private userService: UserService;

  constructor() {
    super();
    this.userService = new UserService();

    this.requestParams = {
      GET: {
        bodyParams: {},
        queryParams: {},
        pathParams: {},
      },
      PATCH: {
        bodyParams: {
          fullName: 'optional',
          avatarUrl: 'optional',
        },
        queryParams: {},
        pathParams: {},
      },
      POST: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
    };
  }

  public GET = async (req: Request, res: Response): Promise<void> => {
    try {
      // Get user from request (set by loadUser middleware)
      const user = req.user;

      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.status(200).json({
        success: true,
        data: user,
        message: 'User profile retrieved successfully'
      });
    } catch (error) {
      throw error;
    }
  };

  public PATCH = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId;
      const { fullName, avatarUrl } = req.body;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      // Update user profile
      const updatedUser = await this.userService.updateUser(userId, {
        fullName,
        avatarUrl
      });

      res.status(200).json({
        success: true,
        data: updatedUser,
        message: 'User profile updated successfully'
      });
    } catch (error) {
      throw error;
    }
  };
}

export default ClentoAPI.createRouter(UserAPI, {
  GET: '/me',
  PATCH: '/me'
});

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management endpoints
 */

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     external_id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     full_name:
 *                       type: string
 *                     avatar_url:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */

/**
 * @swagger
 * /api/users/me:
 *   patch:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               avatarUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: User profile updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
