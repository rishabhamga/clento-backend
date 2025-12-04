import { BaseRepository } from './BaseRepository';
import { CreateSubscriptionDto, SubscriptionResponseDto, SubscriptionType, UpdateSubscriptionDto } from '../dto/subscriptions.dto';

/**
 * Repository for orders table operations
 */
export class SubscriptionRepository extends BaseRepository<SubscriptionResponseDto, CreateSubscriptionDto, UpdateSubscriptionDto> {
    constructor() {
        super('subscriptions');
    }

    public async getActiveSubscription(organizationId: string): Promise<SubscriptionResponseDto[]> {
        const {data, error } = await this.client.from(this.tableName).select('*').eq('organization_id', organizationId).lte('period_start', new Date().toISOString()).gte('period_end', new Date().toISOString()).order('created_at', { ascending: false });
        if (error) {
            throw error;
        }
        return data as SubscriptionResponseDto[];
    }

    public async getPrevTrailPlans(organizationId: string): Promise<SubscriptionResponseDto[]> {
        const {data, error} = await this.client.from(this.tableName).select('*').eq('organization_id', organizationId).eq('plan_id', '873ad1c7-42ee-4e75-b813-77178070aa43').order('created_at', { ascending: false });
        if(error){
            throw error;
        }
        return data as SubscriptionResponseDto[];
    }
}
