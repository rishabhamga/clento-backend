import { Router } from 'express';
import { OrganizationController } from '../controllers/OrganizationController';
import { requireOrganization, requireOrganizationAdmin } from '../middleware/auth';
import { validateBody, validateQuery, validateParams, commonParams } from '../middleware/validation';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  OrganizationQueryDto,
  AddOrganizationMemberDto,
  UpdateOrganizationMemberDto,
  OrganizationMemberQueryDto,
  OrganizationUsageDto
} from '../dto/organizations.dto';

const router = Router();
const organizationController = new OrganizationController();

// Authentication middleware is applied globally in routes/index.ts

/**
 * @swagger
 * components:
 *   schemas:
 *     Organization:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         slug:
 *           type: string
 *         logo_url:
 *           type: string
 *           format: uri
 *         website_url:
 *           type: string
 *           format: uri
 *         industry:
 *           type: string
 *         company_size:
 *           type: string
 *           enum: [startup, small, medium, large, enterprise]
 *         timezone:
 *           type: string
 *         plan:
 *           type: string
 *         billing_email:
 *           type: string
 *           format: email
 *         subscription_status:
 *           type: string
 *         monthly_campaign_limit:
 *           type: integer
 *         monthly_lead_limit:
 *           type: integer
 *         user_limit:
 *           type: integer
 *         onboarding_completed:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/organizations:
 *   get:
 *     summary: Get user's organizations
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's organizations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Organization'
 *                       - type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                           status:
 *                             type: string
 */
router.get('/', organizationController.getUserOrganizations);

/**
 * @swagger
 * /api/organizations:
 *   post:
 *     summary: Create a new organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               logo_url:
 *                 type: string
 *                 format: uri
 *               website_url:
 *                 type: string
 *                 format: uri
 *               industry:
 *                 type: string
 *               company_size:
 *                 type: string
 *                 enum: [startup, small, medium, large, enterprise]
 *               timezone:
 *                 type: string
 *               billing_email:
 *                 type: string
 *                 format: email
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Organization'
 */
router.post('/',
  validateBody(CreateOrganizationDto),
  organizationController.createOrganization
);

/**
 * @swagger
 * /api/organizations/{id}:
 *   get:
 *     summary: Get organization by ID
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Organization details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Organization'
 */
router.get('/:id',
  validateParams(commonParams.id),
  organizationController.getOrganization
);

/**
 * @swagger
 * /api/organizations/{id}:
 *   put:
 *     summary: Update organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               logo_url:
 *                 type: string
 *                 format: uri
 *               website_url:
 *                 type: string
 *                 format: uri
 *               industry:
 *                 type: string
 *               company_size:
 *                 type: string
 *                 enum: [startup, small, medium, large, enterprise]
 *               timezone:
 *                 type: string
 *               billing_email:
 *                 type: string
 *                 format: email
 *               onboarding_completed:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Organization updated successfully
 */
router.put('/:id',
  validateParams(commonParams.id),
  validateBody(UpdateOrganizationDto),
  organizationController.updateOrganization
);

/**
 * @swagger
 * /api/organizations/{id}:
 *   delete:
 *     summary: Delete organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Organization deleted successfully
 */
router.delete('/:id',
  validateParams(commonParams.id),
  organizationController.deleteOrganization
);

/**
 * @swagger
 * /api/organizations/{id}/members:
 *   get:
 *     summary: Get organization members
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [owner, admin, member, viewer]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, pending]
 *     responses:
 *       200:
 *         description: List of organization members
 */
router.get('/:id/members',
  validateParams(commonParams.id),
  validateQuery(OrganizationMemberQueryDto),
  organizationController.getOrganizationMembers
);

/**
 * @swagger
 * /api/organizations/{id}/members:
 *   post:
 *     summary: Add member to organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *             properties:
 *               user_id:
 *                 type: string
 *                 format: uuid
 *               role:
 *                 type: string
 *                 enum: [owner, admin, member, viewer]
 *                 default: member
 *     responses:
 *       201:
 *         description: Member added successfully
 */
router.post('/:id/members',
  validateParams(commonParams.id),
  validateBody(AddOrganizationMemberDto),
  organizationController.addOrganizationMember
);

/**
 * @swagger
 * /api/organizations/{id}/members/{userId}:
 *   put:
 *     summary: Update organization member
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [owner, admin, member, viewer]
 *               status:
 *                 type: string
 *                 enum: [active, inactive, pending]
 *     responses:
 *       200:
 *         description: Member updated successfully
 */
router.put('/:id/members/:userId',
  validateParams(commonParams.id),
  validateBody(UpdateOrganizationMemberDto),
  organizationController.updateOrganizationMember
);

/**
 * @swagger
 * /api/organizations/{id}/members/{userId}:
 *   delete:
 *     summary: Remove organization member
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Member removed successfully
 */
router.delete('/:id/members/:userId',
  validateParams(commonParams.id),
  organizationController.removeOrganizationMember
);

/**
 * @swagger
 * /api/organizations/{id}/usage:
 *   get:
 *     summary: Get organization usage statistics
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           pattern: ^\d{4}-\d{2}$
 *           description: Month in YYYY-MM format
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           minimum: 2020
 *           maximum: 2030
 *     responses:
 *       200:
 *         description: Organization usage statistics
 */
router.get('/:id/usage',
  validateParams(commonParams.id),
  validateQuery(OrganizationUsageDto),
  organizationController.getOrganizationUsage
);

export default router;
