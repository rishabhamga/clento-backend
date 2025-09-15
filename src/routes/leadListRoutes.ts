import { Router } from 'express';
import { LeadListController } from '../controllers/LeadListController';
import { requireAuth, loadUser, loadOrganization, requireOrganization } from '../middleware/auth';
import { validateBody, validateQuery, validateParams } from '../middleware/validation';
import { 
  CreateLeadListDto,
  UpdateLeadListDto,
  LeadListQueryDto,
  PreviewCsvDto,
  PublishLeadListDto
} from '../dto/leads.dto';
import { z } from 'zod';

const router = Router();
const leadListController = new LeadListController();

// Apply authentication middleware to all routes
// TODO: TEMPORARILY DISABLED FOR DEVELOPMENT - DO NOT REVERT UNTIL DEVELOPMENT IS COMPLETED
// router.use(requireAuth);
// router.use(loadUser);
// router.use(loadOrganization);
// router.use(requireOrganization);

/**
 * @swagger
 * components:
 *   schemas:
 *     LeadList:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         organization_id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         source:
 *           type: string
 *           enum: [csv_import, filter_search, api, manual]
 *         total_leads:
 *           type: integer
 *         status:
 *           type: string
 *           enum: [draft, active, archived]
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         filters:
 *           type: object
 *         file_url:
 *           type: string
 *         file_size:
 *           type: integer
 *         creator_id:
 *           type: string
 *           format: uuid
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/lead-lists:
 *   get:
 *     summary: Get lead lists
 *     tags: [Lead Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [csv_import, filter_search, api, manual]
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated tags
 *       - in: query
 *         name: with_stats
 *         schema:
 *           type: boolean
 *         description: Include statistics for each lead list
 *     responses:
 *       200:
 *         description: Lead lists retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', 
  validateQuery(LeadListQueryDto), 
  leadListController.getLeadLists
);

/**
 * @swagger
 * /api/lead-lists:
 *   post:
 *     summary: Create lead list
 *     tags: [Lead Lists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateLeadList'
 *     responses:
 *       201:
 *         description: Lead list created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post('/', 
  validateBody(CreateLeadListDto), 
  leadListController.createLeadList
);

/**
 * @swagger
 * /api/lead-lists/upload-csv:
 *   post:
 *     summary: Upload and preview CSV file
 *     tags: [Lead Lists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               csv_file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: CSV uploaded and previewed successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post('/upload-csv', 
  leadListController.getUploadMiddleware(),
  leadListController.uploadCsv
);

/**
 * @swagger
 * /api/lead-lists/preview-csv:
 *   post:
 *     summary: Preview CSV data
 *     tags: [Lead Lists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PreviewCsv'
 *     responses:
 *       200:
 *         description: CSV previewed successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post('/preview-csv', 
  validateBody(PreviewCsvDto), 
  leadListController.previewCsv
);

/**
 * @swagger
 * /api/lead-lists/publish:
 *   post:
 *     summary: Publish lead list from CSV
 *     tags: [Lead Lists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PublishLeadList'
 *     responses:
 *       201:
 *         description: Lead list published successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post('/publish', 
  validateBody(PublishLeadListDto), 
  leadListController.publishLeadList
);

/**
 * @swagger
 * /api/lead-lists/{id}:
 *   get:
 *     summary: Get lead list by ID
 *     tags: [Lead Lists]
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
 *         description: Lead list retrieved successfully
 *       404:
 *         description: Lead list not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', 
  validateParams(z.object({ id: z.string().uuid() })), 
  leadListController.getLeadListById
);

/**
 * @swagger
 * /api/lead-lists/{id}:
 *   put:
 *     summary: Update lead list
 *     tags: [Lead Lists]
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
 *             $ref: '#/components/schemas/UpdateLeadList'
 *     responses:
 *       200:
 *         description: Lead list updated successfully
 *       404:
 *         description: Lead list not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', 
  validateParams(z.object({ id: z.string().uuid() })),
  validateBody(UpdateLeadListDto), 
  leadListController.updateLeadList
);

/**
 * @swagger
 * /api/lead-lists/{id}:
 *   delete:
 *     summary: Delete lead list
 *     tags: [Lead Lists]
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
 *         description: Lead list deleted successfully
 *       404:
 *         description: Lead list not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', 
  validateParams(z.object({ id: z.string().uuid() })), 
  leadListController.deleteLeadList
);

/**
 * @swagger
 * /api/lead-lists/{id}/archive:
 *   post:
 *     summary: Archive lead list
 *     tags: [Lead Lists]
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
 *         description: Lead list archived successfully
 *       404:
 *         description: Lead list not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/archive', 
  validateParams(z.object({ id: z.string().uuid() })), 
  leadListController.archiveLeadList
);

/**
 * @swagger
 * /api/lead-lists/{id}/activate:
 *   post:
 *     summary: Activate lead list
 *     tags: [Lead Lists]
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
 *         description: Lead list activated successfully
 *       404:
 *         description: Lead list not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/activate', 
  validateParams(z.object({ id: z.string().uuid() })), 
  leadListController.activateLeadList
);

/**
 * @swagger
 * /api/lead-lists/{id}/duplicate:
 *   post:
 *     summary: Duplicate lead list
 *     tags: [Lead Lists]
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
 *             required:
 *               - name
 *     responses:
 *       201:
 *         description: Lead list duplicated successfully
 *       404:
 *         description: Lead list not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/duplicate', 
  validateParams(z.object({ id: z.string().uuid() })),
  validateBody(z.object({ name: z.string().min(1) })),
  leadListController.duplicateLeadList
);

/**
 * @swagger
 * /api/lead-lists/{id}/statistics:
 *   get:
 *     summary: Get lead list statistics
 *     tags: [Lead Lists]
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
 *         description: Lead list statistics retrieved successfully
 *       404:
 *         description: Lead list not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id/statistics', 
  validateParams(z.object({ id: z.string().uuid() })), 
  leadListController.getLeadListStatistics
);

export default router;
