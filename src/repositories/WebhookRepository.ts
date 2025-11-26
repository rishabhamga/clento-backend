import { BaseRepository } from "./BaseRepository";
import {CreateWebhookDto,UpdateWebhookDto,WebhookResponseDto} from "../dto/webhooks.dto";

export class WebhookRepository extends BaseRepository<WebhookResponseDto, CreateWebhookDto, UpdateWebhookDto>{
    constructor() {
        super('webhooks');
    }
}