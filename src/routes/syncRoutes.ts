import { Router } from 'express';
import { SyncController } from '../controllers/SyncController';
import { requireAuth, loadUser, requireOrganizationAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { z } from 'zod';

const router = Router();
const syncController = new SyncController();

/**
 * @swagger
 * components:
 *   schemas:
 *     SyncResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         data:
 *           type: object
 *     SyncStatusResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             user:
 *               type: object
 *               properties:
 *                 exists:
 *                   type: boolean
 *                 id:
 *                   type: string
 *                 email:
 *                   type: string
 *                 last_synced:
 *                   type: string
 *             organizations:
 *               type: object
 *               properties:
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       role:
 *                         type: string
 *                       status:
 *                         type: string
 */

/**
 * @swagger
 * /api/sync/user:
 *   post:
 *     summary: Sync current user and organizations to database (full sync)
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User and organizations synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncResponse'
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Failed to sync user and organizations
 */
router.post('/user', requireAuth, loadUser, syncController.syncCurrentUser);

/**
 * @swagger
 * /api/sync/user/organizations:
 *   post:
 *     summary: Sync current user and organizations (full sync)
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User and organizations synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncResponse'
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Failed to sync user and organizations
 */
router.post('/user/organizations', requireAuth, loadUser, syncController.syncUserOrganizations);

/**
 * @swagger
 * /api/sync/user/full:
 *   post:
 *     summary: Perform full sync for current user (user + organizations + memberships)
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Full user sync completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncResponse'
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Failed to perform full user sync
 */
router.post('/user/full', requireAuth, loadUser, syncController.fullUserSync);

/**
 * @swagger
 * /api/sync/status:
 *   get:
 *     summary: Get sync status for current user
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncStatusResponse'
 *       401:
 *         description: User not authenticated
 *       500:
 *         description: Failed to get sync status
 */
router.get('/status', requireAuth, loadUser, syncController.getSyncStatus);

/**
 * @swagger
 * /api/sync/user/{clerkUserId}:
 *   post:
 *     summary: Sync user and organizations by Clerk ID (admin only) - full sync
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clerkUserId
 *         required: true
 *         schema:
 *           type: string
 *         description: Clerk user ID
 *     responses:
 *       200:
 *         description: User and organizations synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncResponse'
 *       400:
 *         description: Clerk user ID is required
 *       500:
 *         description: Failed to sync user and organizations
 */
router.post(
  '/user/:clerkUserId',
  requireAuth,
  loadUser,
  requireOrganizationAdmin,
  syncController.syncUserById
);

/**
 * @swagger
 * /api/sync/organization/{clerkOrgId}:
 *   post:
 *     summary: Sync organization by Clerk ID
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clerkOrgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Clerk organization ID
 *     responses:
 *       200:
 *         description: Organization synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncResponse'
 *       400:
 *         description: Clerk organization ID is required
 *       500:
 *         description: Failed to sync organization
 */
router.post(
  '/organization/:clerkOrgId',
  requireAuth,
  loadUser,
  syncController.syncOrganizationById
);

/**
 * @swagger
 * /api/sync/membership:
 *   post:
 *     summary: Sync organization membership
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clerkOrgId
 *               - clerkUserId
 *             properties:
 *               clerkOrgId:
 *                 type: string
 *                 description: Clerk organization ID
 *               clerkUserId:
 *                 type: string
 *                 description: Clerk user ID
 *               role:
 *                 type: string
 *                 description: User role in organization
 *                 default: member
 *     responses:
 *       200:
 *         description: Membership synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncResponse'
 *       400:
 *         description: Clerk organization ID and user ID are required
 *       500:
 *         description: Failed to sync membership
 */
router.post(
  '/membership',
  requireAuth,
  loadUser,
  validateRequest(z.object({
    clerkOrgId: z.string().min(1, 'Clerk organization ID is required'),
    clerkUserId: z.string().min(1, 'Clerk user ID is required'),
    role: z.string().optional()
  })),
  syncController.syncMembership
);

/**
 * @swagger
 * /api/sync/organization/{clerkOrgId}/members:
 *   post:
 *     summary: Sync all organization members
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clerkOrgId
 *         required: true
 *         schema:
 *           type: string
 *         description: Clerk organization ID
 *     responses:
 *       200:
 *         description: Organization members synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncResponse'
 *       400:
 *         description: Clerk organization ID is required
 *       500:
 *         description: Failed to sync organization members
 */
router.post(
  '/organization/:clerkOrgId/members',
  requireAuth,
  loadUser,
  syncController.syncOrganizationMembers
);

export default router;
