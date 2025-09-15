import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { LeadListService } from '../services/LeadListService';
import { CsvService } from '../services/CsvService';
import { ApiResponse } from '../dto/common.dto';
import { 
  LeadListResponseDto, 
  CsvPreviewResponseDto, 
  PublishLeadListResponseDto 
} from '../dto/leads.dto';
import { BadRequestError, ValidationError } from '../errors/AppError';
import logger from '../utils/logger';

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
 * Controller for lead list-related endpoints
 */
export class LeadListController {
  private leadListService: LeadListService;

  constructor() {
    this.leadListService = new LeadListService();
  }

  /**
   * Get multer upload middleware
   */
  getUploadMiddleware() {
    return upload.single('csv_file');
  }

  /**
   * Create lead list
   */
  createLeadList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.userId!;

      const leadList = await this.leadListService.createLeadList(
        req.body,
        organizationId,
        userId
      );

      const response: ApiResponse<typeof leadList> = {
        success: true,
        data: leadList,
        message: 'Lead list created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get lead lists
   */
  getLeadLists = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // TODO: TEMPORARY - Mock values for development (authentication disabled)
      const organizationId = req.organizationId || '550e8400-e29b-41d4-a716-446655440001';
      const withStats = req.query.with_stats === 'true';

      let result;
      if (withStats) {
        result = await this.leadListService.getLeadListsWithStats(organizationId, req.query as any);
      } else {
        result = await this.leadListService.getLeadLists(organizationId, req.query as any);
      }

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: 'Lead lists retrieved successfully',
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get lead list by ID
   */
  getLeadListById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      // TODO: TEMPORARY - Mock values for development (authentication disabled)
      const organizationId = req.organizationId || '550e8400-e29b-41d4-a716-446655440001';

      const leadList = await this.leadListService.getLeadListById(id, organizationId);

      const response: ApiResponse<typeof leadList> = {
        success: true,
        data: leadList,
        message: 'Lead list retrieved successfully',
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update lead list
   */
  updateLeadList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;

      const leadList = await this.leadListService.updateLeadList(id, req.body, organizationId);

      const response: ApiResponse<typeof leadList> = {
        success: true,
        data: leadList,
        message: 'Lead list updated successfully',
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete lead list
   */
  deleteLeadList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;

      await this.leadListService.deleteLeadList(id, organizationId);

      const response: ApiResponse<null> = {
        success: true,
        data: null,
        message: 'Lead list deleted successfully',
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Upload and preview CSV
   * POST /api/lead-lists/upload-csv
   */
  uploadCsv = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new BadRequestError('CSV file is required');
      }

      // TODO: TEMPORARY - Mock values for development (authentication disabled)
      req.organizationId = '550e8400-e29b-41d4-a716-446655440001';
      req.userId = '550e8400-e29b-41d4-a716-446655440000';

      // Validate file size
      CsvService.validateFileSize(req.file.size);

      // Convert buffer to string
      const csvData = req.file.buffer.toString('utf8');

      // Preview CSV
      const result = await this.leadListService.previewCsv({ csv_data: csvData });

      // Validate response structure
      const validatedResult = CsvPreviewResponseDto.parse(result);

      const response: ApiResponse<CsvPreviewResponseDto> = {
        success: true,
        data: validatedResult,
        message: 'CSV uploaded and previewed successfully',
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Preview CSV from data
   */
  previewCsv = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.leadListService.previewCsv(req.body);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: 'CSV previewed successfully',
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Publish lead list from CSV
   * POST /api/lead-lists/publish
   */
  publishLeadList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // TODO: TEMPORARY - Mock values for development (authentication disabled)
      const organizationId = req.organizationId || '550e8400-e29b-41d4-a716-446655440001';
      const userId = req.userId || '550e8400-e29b-41d4-a716-446655440000';

      const result = await this.leadListService.publishLeadList(
        req.body,
        organizationId,
        userId
      );

      // TODO: Temporarily disable response validation until migration is applied
      // const validatedResult = PublishLeadListResponseDto.parse(result);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: 'Lead list published successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Archive lead list
   */
  archiveLeadList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;

      await this.leadListService.archiveLeadList(id, organizationId);

      const response: ApiResponse<null> = {
        success: true,
        data: null,
        message: 'Lead list archived successfully',
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Activate lead list
   */
  activateLeadList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;

      await this.leadListService.activateLeadList(id, organizationId);

      const response: ApiResponse<null> = {
        success: true,
        data: null,
        message: 'Lead list activated successfully',
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Duplicate lead list
   */
  duplicateLeadList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const organizationId = req.organizationId!;
      const userId = req.userId!;

      if (!name) {
        throw new BadRequestError('New lead list name is required');
      }

      const leadList = await this.leadListService.duplicateLeadList(
        id,
        name,
        organizationId,
        userId
      );

      const response: ApiResponse<typeof leadList> = {
        success: true,
        data: leadList,
        message: 'Lead list duplicated successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get lead list statistics
   */
  getLeadListStatistics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;

      const statistics = await this.leadListService.getLeadListStatistics(id, organizationId);

      const response: ApiResponse<typeof statistics> = {
        success: true,
        data: statistics,
        message: 'Lead list statistics retrieved successfully',
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };
}
