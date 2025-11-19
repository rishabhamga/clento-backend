import ClentoAPI from '../../utils/apiUtil';
import { LeadListService } from '../../services/LeadListService';
import { Request, Response } from 'express';
import { DisplayError, NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';

/**
 * Lead List Publish API - Publish lead list from CSV
 */
class LeadListPublishAPI extends ClentoAPI {
    public path = '/api/lead-lists/publish';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private leadListService = new LeadListService();

    /**
     * Publish lead list from CSV
     */
    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const organizationId = req.organizationId;
            const userId = req.userId;

            if (!organizationId || !userId) {
                throw new NotFoundError('Organization or user not found');
            }

            const body = req.getBody();
            const name = body.getParamAsString('name', true);
            const description = body.getParamAsString('description', false);
            const connected_account_id = body.getParamAsUUID('connected_account_id', true);
            const csv_data = body.getParamAsString('csv_data', true);
            const mapping = body.getParamAsNestedBody('mapping', false);

            // Check file size (10MB limit)
            const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
            const csvDataSize = Buffer.byteLength(csv_data, 'utf8');

            if (csvDataSize > MAX_FILE_SIZE) {
                throw new DisplayError('The lead list file size exceeds the maximum allowed size of 10MB. Please upload a smaller file.');
            }

            const publishData = {
                name,
                description: description || undefined,
                connected_account_id,
                csv_data,
                mapping: mapping ? mapping.rawJSON() : undefined,
            };

            const result = await this.leadListService.publishLeadList(publishData, organizationId, userId);

            return res.sendOKResponse({
                data: result,
                message: 'Lead list published successfully',
            });
        } catch (error) {
            throw error;
        }
    };
}

export default new LeadListPublishAPI();

/**
 * @swagger
 * /api/lead-lists/publish:
 *   post:
 *     summary: Publish lead list from CSV data
 *     tags: [Lead Lists]
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
 *               - connected_account_id
 *               - csv_data
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: Name of the lead list
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Optional description of the lead list
 *               connected_account_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the connected account to use for outreach
 *               csv_data:
 *                 type: string
 *                 description: 'CSV data as string (maximum size: 10MB)'
 *               mapping:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *                 description: Field mapping configuration (optional)
 *     responses:
 *       200:
 *         description: Lead list published successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     leadList:
 *                       $ref: '#/components/schemas/LeadList'
 *                     importResult:
 *                       type: object
 *                       properties:
 *                         totalRows:
 *                           type: number
 *                         importedLeads:
 *                           type: number
 *                         skippedLeads:
 *                           type: number
 *                         failedLeads:
 *                           type: number
 *                         errors:
 *                           type: array
 *                           items:
 *                             type: string
 *                     fileUrl:
 *                       type: string
 *                       format: uri
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request - invalid data (e.g., file size exceeds 10MB limit)
 *       404:
 *         description: Organization or user not found
 *       422:
 *         description: Validation error
 */
