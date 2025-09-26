import ClentoAPI from '../../utils/apiUtil';
import { UserService } from '../../services/UserService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';

/**
 * User Profile API - Authenticated user endpoints
 */
class UserProfileAPI extends ClentoAPI {
  public path = '/api/users/me';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private userService = new UserService();

  public GET = async (req: Request, res: Response): Promise<Response> => {
    try {
      // Get user from request (set by loadUser middleware)
      const user = req.user;

      if (!user) {
        throw new NotFoundError('User not found');
      }

      return res.sendOKResponse({
        success: true,
        data: user,
        message: 'User profile retrieved successfully'
      });
    } catch (error) {
      throw error;
    }
  };

  public PATCH = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.userId;

      if (!userId) {
        throw new NotFoundError('User not found');
      }

      // Using express extensions for parameter validation
      const body = req.getBody();
      const fullName = body.getParamAsString('fullName', false);
      const avatarUrl = body.getParamAsString('avatarUrl', false);

      // Update user profile
      const updatedUser = await this.userService.updateUser(userId, {
        fullName: fullName || undefined,
        avatarUrl: avatarUrl || undefined
      });

      return res.sendOKResponse({
        success: true,
        data: updatedUser,
        message: 'User profile updated successfully'
      });
    } catch (error) {
      throw error;
    }
  };
}

export default new UserProfileAPI();

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
