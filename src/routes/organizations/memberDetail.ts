import ClentoAPI from '../../utils/apiUtil';
import { OrganizationService } from '../../services/OrganizationService';
import { Request, Response } from 'express';
import { NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';

/**
 * Organization Member Detail API - Individual member management endpoints
 */
export class OrganizationMemberDetailAPI extends ClentoAPI {
    public path = '/api/organizations/member-detail';
    public authType: 'DASHBOARD' = 'DASHBOARD';

    private organizationService = new OrganizationService();

    /**
     * Update organization member
     */
    public PATCH = async (req: Request, res: Response): Promise<Response> => {
        try {
            const query = req.getQuery();
            const id = query.getParamAsString('id', true);
            const userIdToUpdate = query.getParamAsString('userId', true);
            const requesterId = req.userId;
            const body = req.getBody();
            const role = body.getParamAsString('role', true);

            if (!requesterId) {
                throw new NotFoundError('User not found');
            }

            const member = await this.organizationService.updateMemberRole(id, userIdToUpdate, role, requesterId);

            return res.sendOKResponse({
                success: true,
                message: 'Member updated successfully',
                data: member,
            });
        } catch (error) {
            throw error;
        }
    };

    /**
     * Remove organization member
     */
    public DELETE = async (req: Request, res: Response): Promise<Response> => {
        try {
            const query = req.getQuery();
            const id = query.getParamAsString('id', true);
            const userIdToRemove = query.getParamAsString('userId', true);
            const requesterId = req.userId;

            if (!requesterId) {
                throw new NotFoundError('User not found');
            }

            await this.organizationService.removeMember(id, userIdToRemove, requesterId);

            return res.sendOKResponse({
                success: true,
                message: 'Member removed successfully',
            });
        } catch (error) {
            throw error;
        }
    };
}

export default new OrganizationMemberDetailAPI();
