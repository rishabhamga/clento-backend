import { TemporalClientService } from "../temporal/services/temporal-client.service";
import { UnipileWrapperService } from "../temporal/services/unipile-wrapper.service";
import logger from "../utils/logger";

export class TemporalService {
    private static instance: TemporalService
    private temporalClient = TemporalClientService.getInstance();
    private unipileService = UnipileWrapperService.getInstance();

    public static getInstance(): TemporalService{
        if(!TemporalService.instance){
            TemporalService.instance = new TemporalService();
        }
        return TemporalService.instance;
    }

    public async initialize() {
        try {
            logger.info("Initializing Temporal Service")

            await this.temporalClient.initialize();

            const unipileConfig = {
                dns: process.env.UNIPILE_DNS!,
                accessToken: process.env.UNIPILE_ACCESS_TOKEN!,
            }

            if(!unipileConfig.dns || !unipileConfig.accessToken){
                throw new Error("Missing Unipile DNS or Key")
            }

            this.unipileService.initialize(unipileConfig);

            logger.info("Temporal Initialization successful")
        } catch (error) {
            logger.error("Temporal Initialization Failed", {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                name: error instanceof Error ? error.name : undefined,
                cause: error instanceof Error ? error.cause : undefined,
                fullError: error
            });
            throw error;
        }
    }

    public async startCampaign() {

    }
}