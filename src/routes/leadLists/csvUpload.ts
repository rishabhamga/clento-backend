import ClentoAPI from '../../utils/apiUtil';
import { LeadListService } from '../../services/LeadListService';
import { CsvService } from '../../services/CsvService';
import { Request, Response, NextFunction } from 'express';
import { NotFoundError, BadRequestError, AppError } from '../../errors/AppError';
import multer from 'multer';
import { CsvPreviewResponseDto } from '../../dto/leads.dto';
import '../../utils/expressExtensions';

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
 * Lead List CSV Upload API - CSV upload endpoint with file handling
 */
class LeadListCsvUploadAPI extends ClentoAPI {
  public path = '/api/lead-lists/upload-csv';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private leadListService = new LeadListService();

  /**
   * Upload and preview CSV
   */
  public POST = async (req: Request, res: Response): Promise<Response> => {
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

      return res.sendOKResponse({
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
  public wrapper = async (req: Request, res: Response, next: NextFunction) => {
    const uploadMiddleware = upload.single('csv_file');
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        return next(err);
      }

      try {
        // Attach API class to request
        req.clentoAPIClass = this;

        // Set up request parameters
        req.requestParams = {
          bodyParams: req.body || {},
          queryParams: req.query || {},
          pathParams: req.params || {},
        };

        // Apply authentication based on authType
        if (this.authType === 'DASHBOARD') {
          // Authentication logic would be implemented here
          // This would integrate with your existing auth middleware
        }

        // Set common headers
        res.setHeader('Content-Security-Policy', 'frame-ancestors \'self\'');

        // Validate JSON content type if required
        if (this.forceJSON && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
          if (!req.is('application/json')) {
            throw new BadRequestError('Only JSON requests are allowed. Please set the header Content-Type: application/json');
          }
        }

        // Route to appropriate HTTP method handler
        switch (req.method) {
          case 'GET':
            await this.GET(req, res);
            break;
          case 'POST':
            await this.POST(req, res);
            break;
          case 'PUT':
            await this.PUT(req, res);
            break;
          case 'DELETE':
            await this.DELETE(req, res);
            break;
          case 'HEAD':
            await this.HEAD(req, res);
            break;
          case 'OPTIONS':
            await this.OPTIONS(req, res);
            break;
          default:
            throw new AppError(`Unsupported HTTP method: ${req.method}`, 405);
        }
      } catch (error) {
        next(error);
      }
    });
  };
}

export default new LeadListCsvUploadAPI();
