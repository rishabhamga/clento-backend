import OpenAI from 'openai';
import logger from '../utils/logger';

export class OpenAiManager {
    /**
     * Given an array of rows, sends them to OpenAI and returns an array of answers (one per row).
     * Each row is an array of strings (columns). Returns array of answers.
     */
    public async generateCsvAnswers(rows: string[][], prompt: string): Promise<string[]> {
        if (!OpenAiManager.client) {
            throw new Error('OpenAI client not initialized');
        }

        // Assign unique IDs to each row
        const rowMap: { [id: string]: string[] } = {};
        rows.forEach((cols, idx) => {
            rowMap[`row_${idx}`] = cols;
        });
        const inputText = JSON.stringify(rowMap, null, 2);
        const fullPrompt = `You will be given a JSON object where each key is a unique row ID and the value is an array of CSV columns. For each row, provide a single answer that best fits the prompt below.\n\nReturn ONLY valid JSON in the format: {answers: {row_0: string, row_1: string, ...}}, where each answer corresponds to the row ID.\n\nRows (JSON object):\n${inputText}\n\nPrompt for each row: ${prompt}`;

        const res = await OpenAiManager.client.chat.completions.create({
            model: 'gpt-4.1-mini',
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that answers questions for each row in a CSV. Return ONLY valid JSON in the format: {answers: [string, string, ...]}.',
                },
                {
                    role: 'user',
                    content: fullPrompt,
                },
            ],
        });

        let answers: string[] = [];
        try {
            const parsed = JSON.parse(res.choices[0].message?.content ?? '{}');
            if (parsed.answers && typeof parsed.answers === 'object' && !Array.isArray(parsed.answers)) {
                // Map answers back to row order
                answers = rows.map((_, idx) => parsed.answers[`row_${idx}`] ?? '');
            } else {
                throw new Error('OpenAI did not return valid answers object');
            }
        } catch {
            throw new Error('OpenAI did not return valid JSON object of answers');
        }
        return answers;
    }
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
    public async summarize(text: string): Promise<{ isCritical: boolean; summary: string }> {
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
