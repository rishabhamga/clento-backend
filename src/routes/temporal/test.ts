import ClentoAPI from '../../utils/apiUtil';
import { Request, Response } from 'express';
import '../../utils/expressExtensions';
import { TemporalService } from '../../services/TemporalService';
import logger from '../../utils/logger';

/**
 * @swagger
 * /api/temporal/test:
 *   post:
 *     summary: Test Temporal workflow execution
 *     description: Runs a simple test workflow to verify Temporal is working correctly
 *     tags: [Temporal]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: Test message to process
 *                 example: "Hello from Temporal test!"
 *               delay:
 *                 type: number
 *                 description: Optional delay in milliseconds
 *                 example: 1000
 *               iterations:
 *                 type: number
 *                 description: Number of iterations to run
 *                 example: 3
 *             required:
 *               - message
 *     responses:
 *       200:
 *         description: Test workflow executed successfully
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
 *                     workflowId:
 *                       type: string
 *                     runId:
 *                       type: string
 *                     result:
 *                       type: object
 *       400:
 *         description: Bad request - invalid input
 *       500:
 *         description: Internal server error
 */
class TemporalTestAPI extends ClentoAPI {
    public path = '/api/temporal/test';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private temporalService = TemporalService.getInstance();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        try {
            const body = req.getBody();
            const message = body.getParamAsString('message', true);
            const delay = body.getParamAsNumber('delay', false);
            const iterations = body.getParamAsNumber('iterations', false);

            logger.info('Temporal test API called', { message, delay, iterations });

            const result = await this.temporalService.runTestWorkflow({
                message,
                delay: delay || undefined,
                iterations: iterations || 1,
            });

            return res.sendOKResponse({
                data: result,
                message: 'Test workflow executed successfully',
            });
        } catch (error) {
            logger.error('Temporal test API error', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });

            return res.sendErrorResponse(500, 'Failed to execute test workflow', { error: error instanceof Error ? error.message : String(error) });
        }
    };
}

export default new TemporalTestAPI();
