import { Request, Response } from 'express';
import { CsvPreviewResponseDto } from '../../dto/leads.dto';
import { BadRequestError } from '../../errors/AppError';
import { CsvService } from '../../services/CsvService';
import { LeadListService } from '../../services/LeadListService';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';

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
        const file = req.getFiles().getFileAsCSV('csv_file');
        const fileBuffer = file.buffer;
        const fileSize = file.size;

        // Validate file size
        CsvService.validateFileSize(fileSize);

        // Convert buffer to string
        const csvData = fileBuffer.toString('utf8');

        // Preview CSV
        const result = await this.leadListService.previewCsv({ csv_data: csvData });

        // Validate response structure
        const validatedResult = CsvPreviewResponseDto.parse(result);

        return res.sendOKResponse({
            data: validatedResult,
            message: 'CSV uploaded and previewed successfully',
        });
    };
}

export default new LeadListCsvUploadAPI();
