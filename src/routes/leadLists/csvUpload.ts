import { Request, Response } from 'express';
import { CsvPreviewResponseDto } from '../../dto/leads.dto';
import { BadRequestError } from '../../errors/AppError';
import { CsvService } from '../../services/CsvService';
import { LeadListService } from '../../services/LeadListService';
import ClentoAPI from '../../utils/apiUtil';
import '../../utils/expressExtensions';
import { ConnectedAccountService } from '../../services/ConnectedAccountService';

/**
 * Lead List CSV Upload API - CSV upload endpoint with file handling
 */
class LeadListCsvUploadAPI extends ClentoAPI {
    public path = '/api/lead-lists/upload-csv';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private leadListService = new LeadListService();
    private connectedAccountService = new ConnectedAccountService();

    /**
     * Upload and preview CSV
     */
    public POST = async (req: Request, res: Response): Promise<Response> => {
        const reqBody = req.getBody();
        const accountId = reqBody.getParamAsString('account_id');
        const files = req.getFiles();
        const file = files.getFileAsCSV('csv_file');
        const fileBuffer = file.buffer;
        const fileSize = file.size;

        // Validate file size
        CsvService.validateFileSize(fileSize);

        // Convert buffer to string
        const csvData = fileBuffer.toString('utf8');
        const account = await this.connectedAccountService.getAccountById(accountId)

        // Preview CSV
        const result = await this.leadListService.previewCsv({ csv_data: csvData }, account.provider_account_id);

        return res.sendOKResponse({
            data: result,
            message: 'CSV uploaded and previewed successfully',
        });
    };
}

export default new LeadListCsvUploadAPI();
