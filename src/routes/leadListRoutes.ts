import ClentoAPI from '../utils/apiUtil';
import { LeadListService } from '../services/LeadListService';
import { CsvService } from '../services/CsvService';
import { Request, Response } from 'express';
import { NotFoundError, BadRequestError } from '../errors/AppError';
import multer from 'multer';
import { CsvPreviewResponseDto } from '../dto/leads.dto';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only CSV files are allowed'));
    }
  },
});

/**
 * Lead List API - Main lead list management endpoints
 */
export class LeadListAPI extends ClentoAPI {
  public path = '/api/lead-lists';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private leadListService: LeadListService;

  constructor() {
    super();
    this.leadListService = new LeadListService();

    this.requestParams = {
      GET: {
        bodyParams: {},
        queryParams: {
          page: 'optional',
          limit: 'optional',
          search: 'optional',
          source: 'optional',
          tags: 'optional',
          with_stats: 'optional'
        },
        pathParams: {},
      },
      POST: {
        bodyParams: {
          name: 'required',
          description: 'optional',
          source: 'optional',
          tags: 'optional',
          filters: 'optional'
        },
        queryParams: {},
        pathParams: {},
      },
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Get lead lists
   */
  public GET = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId;
      const withStats = req.query.with_stats === 'true';

      if (!organizationId) {
        throw new NotFoundError('Organization not found');
      }

      let result;
      if (withStats) {
        result = await this.leadListService.getLeadListsWithStats(organizationId, req.query as any);
      } else {
        result = await this.leadListService.getLeadLists(organizationId, req.query as any);
      }

      res.status(200).json({
        success: true,
        data: result,
        message: 'Lead lists retrieved successfully',
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Create lead list
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId;
      const userId = req.userId;

      if (!organizationId || !userId) {
        throw new NotFoundError('Organization or user not found');
      }

      const leadList = await this.leadListService.createLeadList(
        req.body,
        organizationId,
        userId
      );

      res.status(201).json({
        success: true,
        data: leadList,
        message: 'Lead list created successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Lead List Detail API - Individual lead list management endpoints
 */
export class LeadListDetailAPI extends ClentoAPI {
  public path = '/api/lead-lists/:id';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private leadListService: LeadListService;

  constructor() {
    super();
    this.leadListService = new LeadListService();

    this.requestParams = {
      GET: {
        bodyParams: {},
        queryParams: {},
        pathParams: { id: 'required' },
      },
      PUT: {
        bodyParams: {
          name: 'optional',
          description: 'optional',
          source: 'optional',
          tags: 'optional',
          filters: 'optional',
          status: 'optional'
        },
        queryParams: {},
        pathParams: { id: 'required' },
      },
      DELETE: {
        bodyParams: {},
        queryParams: {},
        pathParams: { id: 'required' },
      },
      POST: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Get lead list by ID
   */
  public GET = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId;

      if (!organizationId) {
        throw new NotFoundError('Organization not found');
      }

      const leadList = await this.leadListService.getLeadListDataById(id, organizationId);

      res.status(200).json({
        success: true,
        data: leadList,
        message: 'Lead list retrieved successfully',
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Update lead list
   */
  public PUT = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId;

      if (!organizationId) {
        throw new NotFoundError('Organization not found');
      }

      const leadList = await this.leadListService.updateLeadList(id, req.body, organizationId);

      res.status(200).json({
        success: true,
        data: leadList,
        message: 'Lead list updated successfully',
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Delete lead list
   */
  public DELETE = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId;

      if (!organizationId) {
        throw new NotFoundError('Organization not found');
      }

      await this.leadListService.deleteLeadList(id, organizationId);

      res.status(200).json({
        success: true,
        data: null,
        message: 'Lead list deleted successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Lead List CSV Upload API - CSV upload endpoint with file handling
 */
export class LeadListCsvUploadAPI extends ClentoAPI {
  public path = '/api/lead-lists/upload-csv';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private leadListService: LeadListService;

  constructor() {
    super();
    this.leadListService = new LeadListService();

    this.requestParams = {
      POST: {
        bodyParams: {}, // File upload handled by multer
        queryParams: {},
        pathParams: {},
      },
      GET: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Upload and preview CSV
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        throw new BadRequestError('CSV file is required');
      }

      // Validate file size
      CsvService.validateFileSize(req.file.size);

      // Convert buffer to string
      const csvData = req.file.buffer.toString('utf8');

      // Preview CSV
      const result = await this.leadListService.previewCsv({ csv_data: csvData });

      // Validate response structure
      const validatedResult = CsvPreviewResponseDto.parse(result);

      res.status(200).json({
        success: true,
        data: validatedResult,
        message: 'CSV uploaded and previewed successfully',
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * Override the wrapper to include multer middleware
   */
  public wrapper = async (req: Request, res: Response, next: any) => {
    const uploadMiddleware = upload.single('csv_file');
    uploadMiddleware(req, res, (err) => {
      if (err) {
        return next(err);
      }
      // Call the parent wrapper method
      (this as any).__proto__.__proto__.wrapper.call(this, req, res, next);
    });
  };
}

/**
 * Lead List CSV Preview API - CSV preview from data
 */
export class LeadListCsvPreviewAPI extends ClentoAPI {
  public path = '/api/lead-lists/preview-csv';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private leadListService: LeadListService;

  constructor() {
    super();
    this.leadListService = new LeadListService();

    this.requestParams = {
      POST: {
        bodyParams: {
          csv_data: 'required'
        },
        queryParams: {},
        pathParams: {},
      },
      GET: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Preview CSV from data
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.leadListService.previewCsv(req.body);

      res.status(200).json({
        success: true,
        data: result,
        message: 'CSV previewed successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Lead List Publish API - Publish lead list from CSV
 */
export class LeadListPublishAPI extends ClentoAPI {
  public path = '/api/lead-lists/publish';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private leadListService: LeadListService;

  constructor() {
    super();
    this.leadListService = new LeadListService();

    this.requestParams = {
      POST: {
        bodyParams: {
          name: 'required',
          csv_data: 'required',
          mapping: 'required'
        },
        queryParams: {},
        pathParams: {},
      },
      GET: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Publish lead list from CSV
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId;
      const userId = req.userId;

      if (!organizationId || !userId) {
        throw new NotFoundError('Organization or user not found');
      }

      const result = await this.leadListService.publishLeadList(
        req.body,
        organizationId,
        userId
      );

      res.status(201).json({
        success: true,
        data: result,
        message: 'Lead list published successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Lead List Archive API - Archive lead list endpoint
 */
export class LeadListArchiveAPI extends ClentoAPI {
  public path = '/api/lead-lists/:id/archive';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private leadListService: LeadListService;

  constructor() {
    super();
    this.leadListService = new LeadListService();

    this.requestParams = {
      POST: {
        bodyParams: {},
        queryParams: {},
        pathParams: { id: 'required' },
      },
      GET: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Archive lead list
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId;

      if (!organizationId) {
        throw new NotFoundError('Organization not found');
      }

      await this.leadListService.archiveLeadList(id, organizationId);

      res.status(200).json({
        success: true,
        data: null,
        message: 'Lead list archived successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Lead List Activate API - Activate lead list endpoint
 */
export class LeadListActivateAPI extends ClentoAPI {
  public path = '/api/lead-lists/:id/activate';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private leadListService: LeadListService;

  constructor() {
    super();
    this.leadListService = new LeadListService();

    this.requestParams = {
      POST: {
        bodyParams: {},
        queryParams: {},
        pathParams: { id: 'required' },
      },
      GET: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Activate lead list
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId;

      if (!organizationId) {
        throw new NotFoundError('Organization not found');
      }

      await this.leadListService.activateLeadList(id, organizationId);

      res.status(200).json({
        success: true,
        data: null,
        message: 'Lead list activated successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Lead List Duplicate API - Duplicate lead list endpoint
 */
export class LeadListDuplicateAPI extends ClentoAPI {
  public path = '/api/lead-lists/:id/duplicate';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private leadListService: LeadListService;

  constructor() {
    super();
    this.leadListService = new LeadListService();

    this.requestParams = {
      POST: {
        bodyParams: {
          name: 'required'
        },
        queryParams: {},
        pathParams: { id: 'required' },
      },
      GET: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Duplicate lead list
   */
  public POST = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const organizationId = req.organizationId;
      const userId = req.userId;

      if (!organizationId || !userId) {
        throw new NotFoundError('Organization or user not found');
      }

      if (!name) {
        throw new BadRequestError('New lead list name is required');
      }

      const leadList = await this.leadListService.duplicateLeadList(
        id,
        name,
        organizationId,
        userId
      );

      res.status(201).json({
        success: true,
        data: leadList,
        message: 'Lead list duplicated successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Lead List Statistics API - Lead list statistics endpoint
 */
export class LeadListStatisticsAPI extends ClentoAPI {
  public path = '/api/lead-lists/:id/statistics';
  public authType:'DASHBOARD' = 'DASHBOARD';

  private leadListService: LeadListService;

  constructor() {
    super();
    this.leadListService = new LeadListService();

    this.requestParams = {
      GET: {
        bodyParams: {},
        queryParams: {},
        pathParams: { id: 'required' },
      },
      POST: this.getDefaultExpressRequestParams(),
      PUT: this.getDefaultExpressRequestParams(),
      DELETE: this.getDefaultExpressRequestParams(),
      PATCH: this.getDefaultExpressRequestParams(),
    };
  }

  /**
   * Get lead list statistics
   */
  public GET = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId;

      if (!organizationId) {
        throw new NotFoundError('Organization not found');
      }

      const statistics = await this.leadListService.getLeadListStatistics(id, organizationId);

      res.status(200).json({
        success: true,
        data: statistics,
        message: 'Lead list statistics retrieved successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

// Create routers for each API class
const leadListRouter = ClentoAPI.createRouter(LeadListAPI, {
  GET: '/',
  POST: '/'
});

const leadListDetailRouter = ClentoAPI.createRouter(LeadListDetailAPI, {
  GET: '/:id',
  PUT: '/:id',
  DELETE: '/:id'
});

const leadListCsvUploadRouter = ClentoAPI.createRouter(LeadListCsvUploadAPI, {
  POST: '/upload-csv'
});

const leadListCsvPreviewRouter = ClentoAPI.createRouter(LeadListCsvPreviewAPI, {
  POST: '/preview-csv'
});

const leadListPublishRouter = ClentoAPI.createRouter(LeadListPublishAPI, {
  POST: '/publish'
});

const leadListArchiveRouter = ClentoAPI.createRouter(LeadListArchiveAPI, {
  POST: '/:id/archive'
});

const leadListActivateRouter = ClentoAPI.createRouter(LeadListActivateAPI, {
  POST: '/:id/activate'
});

const leadListDuplicateRouter = ClentoAPI.createRouter(LeadListDuplicateAPI, {
  POST: '/:id/duplicate'
});

const leadListStatisticsRouter = ClentoAPI.createRouter(LeadListStatisticsAPI, {
  GET: '/:id/statistics'
});

// Combine all routers
const { Router } = require('express');
const combinedRouter = Router();

combinedRouter.use('/', leadListRouter);
combinedRouter.use('/', leadListDetailRouter);
combinedRouter.use('/', leadListCsvUploadRouter);
combinedRouter.use('/', leadListCsvPreviewRouter);
combinedRouter.use('/', leadListPublishRouter);
combinedRouter.use('/', leadListArchiveRouter);
combinedRouter.use('/', leadListActivateRouter);
combinedRouter.use('/', leadListDuplicateRouter);
combinedRouter.use('/', leadListStatisticsRouter);

export default combinedRouter;

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
