import ClentoAPI from '../../utils/apiUtil';
import { OrganizationService } from '../../services/OrganizationService';
import { Request, Response } from 'express';
import { DisplayError, NotFoundError } from '../../errors/AppError';
import '../../utils/expressExtensions';
import { OrganizationRepository } from '../../repositories/OrganizationRepository';
import { UserRepository } from '../../repositories/UserRepository';

class API extends ClentoAPI {
    public path = '/api/organizations/switch-org';

    public authType: 'DASHBOARD' = 'DASHBOARD';

    private organizationService = new OrganizationService();
    private organizationRepository = new OrganizationRepository();
    private userRepo = new UserRepository();

    public POST = async (req: Request, res: Response) => {
        const reqBody = req.getBody();
        const userId = req.user.id;
        const organizationId = reqBody.getParamAsString('organizationId');
        const organization = await this.organizationService.getOrganizationByClerkOrgId(organizationId);

        if (!organization) {
            throw new DisplayError('organization does not exist');
        }

        const isMember = await this.organizationRepository.isMember(organization.id, userId);
        if (!isMember) {
            throw new DisplayError('This user is not part of this organization');
        }

        await this.userRepo.update(userId, {selected_org: organization.id});

        return res.sendOKResponse({ organizationSwitched: 'true' });
    };
}

export default new API();
