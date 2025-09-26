import ClentoAPI from '../../utils/apiUtil';
import { LeadListService } from '../../services/LeadListService';
import { Request, Response } from 'express';
import '../../utils/expressExtensions';

/**
 * Lead List CSV Preview API - CSV preview from data
 */
class LeadListCsvPreviewAPI extends ClentoAPI {
  public path = '/api/lead-lists/preview-csv';
  public authType: 'DASHBOARD' = 'DASHBOARD';

  private leadListService = new LeadListService();

  /**
   * Preview CSV from data
   */
  public POST = async (req: Request, res: Response): Promise<Response> => {
    try {
      const body = req.getBody();
      const csv_data = body.getParamAsString('csv_data', true);

      const result = await this.leadListService.previewCsv({ csv_data });

      return res.sendOKResponse({
        success: true,
        data: result,
        message: 'CSV previewed successfully',
      });
    } catch (error) {
      throw error;
    }
  };
}

export default new LeadListCsvPreviewAPI();
