import { Request, Response } from 'express';
import { DisplayError, ValidationError } from '../../../errors/AppError';
import { ReporterConnectedAccountService } from '../../../services/ReporterConnectedAccountService';
import { ReporterLeadMonitorService } from '../../../services/ReporterLeadMonitorService';
import { ReporterLeadRepository } from '../../../repositories/reporterRepositories/LeadRepository';
import ClentoAPI from '../../../utils/apiUtil';
import '../../../utils/expressExtensions';

/**
 * Reporter Account Disconnect API - Disconnect a reporter account
 * Before disconnecting, checks all user leads and handles their workflows:
 * - If leads are running: pauses them and asks user to pause first
 * - If leads are paused: cancels them
 * - Then proceeds with account disconnection
 */
class ReporterAccountDisconnectAPI extends ClentoAPI {
    public path = '/api/reporter/accounts/disconnect';
    public authType: 'REPORTER' = 'REPORTER';

    private connectedAccountService = new ReporterConnectedAccountService();
    private leadMonitorService = new ReporterLeadMonitorService();
    private leadRepository = new ReporterLeadRepository();

    public POST = async (req: Request, res: Response): Promise<Response> => {
        const reporterUserId = req.reporter.id;
        const body = req.getBody();
        const accountId = body.getParamAsUUID('accountId', true);

        if (!accountId) {
            throw new ValidationError('Account ID is required');
        }

        // Get all leads for the user
        const userLeads = await this.leadRepository.getUserLeads(reporterUserId);

        if (userLeads.length === 0) {
            // No leads, proceed with disconnection
            await this.connectedAccountService.disconnectAccount(accountId, reporterUserId);
            return res.sendOKResponse({ success: true, message: 'Account disconnected successfully' });
        }

        // Check status of all leads
        const leadStatuses = await Promise.all(
            userLeads.map(async lead => {
                try {
                    const status = await this.leadMonitorService.getMonitoringStatus(lead.id);
                    return {
                        leadId: lead.id,
                        ...status,
                    };
                } catch (error) {
                    // If status check fails, assume not running
                    return {
                        leadId: lead.id,
                        isRunning: false,
                    };
                }
            }),
        );

        // Separate leads by status
        const runningLeads = leadStatuses.filter(status => status.isRunning && !status.isPaused);
        const pausedLeads = leadStatuses.filter(status => status.isRunning && status.isPaused);

        // If there are running leads (not paused), tell user to pause them first
        if (runningLeads.length > 0) {
            throw new DisplayError(`There are ${runningLeads.length} lead(s) currently running. Please pause all leads first before disconnecting the account. Once paused, you can disconnect the account and all paused leads will be cancelled automatically.`);
        }

        // If there are paused leads (not cancelled), cancel them automatically
        if (pausedLeads.length > 0) {
            await Promise.all(
                pausedLeads.map(leadStatus =>
                    this.leadMonitorService.stopMonitoring(leadStatus.leadId).catch(error => {
                        // Log error but continue with other leads
                        console.error(`Failed to cancel lead ${leadStatus.leadId}:`, error);
                    }),
                ),
            );
        }

        // Now proceed with account disconnection
        await this.connectedAccountService.disconnectAccount(accountId, reporterUserId);

        return res.sendOKResponse({
            success: true,
            message: 'Account disconnected successfully',
            cancelledLeadsCount: pausedLeads.length,
        });
    };
}

export default new ReporterAccountDisconnectAPI();
