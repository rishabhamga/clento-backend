import OpenAI from 'openai';
import logger from '../utils/logger';

export class OpenAiManager {
    private static client: OpenAI | null = null;

    constructor() {
        this.initialize();
    }
    public async initialize() {
        try {
            logger.info('Initializing OPENAI Service');

            if (!process.env.OPENAI_API_KEY) {
                throw new Error('OPEN AI KEY ISNT PRESENT');
            }

            OpenAiManager.client = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
            });

            logger.info('OPENAI Initialization successful');
        } catch (error) {
            logger.error('OPENAI Initialization Failed', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                name: error instanceof Error ? error.name : undefined,
                cause: error instanceof Error ? error.cause : undefined,
                fullError: error,
            });
            throw error;
        }
    }
    public async summarize(text: string): Promise<{isCritical: boolean, summary: string}> {
        if (!OpenAiManager.client) {
            throw new Error('OpenAI client not initialized');
        }

        const res = await OpenAiManager.client.chat.completions.create({
            model: 'gpt-4.1-mini',
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: `
You summarize posts in third person and also detect critical career/company events.
Return ONLY valid JSON.
Critical if it indicates:
- job change
- promotion
- layoff
- company merger or acquisition
- funding / investment
- major business milestone.
                `,
                },
                {
                    role: 'user',
                    content: `
Analyze this post.

1) Write a short third-person summary.
2) Set isCritical = true if any of the above conditions are implied.

Text:
${text}
                `,
                },
            ],
        });

        return JSON.parse(res.choices[0].message?.content ?? '{}');
    }
}
