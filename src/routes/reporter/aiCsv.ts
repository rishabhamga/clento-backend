import { Request, Response } from 'express';
import { DisplayError } from '../../errors/AppError';
import { UserRepository } from '../../repositories/reporterRepositories/UserRepository';
import ClentoAPI from '../../utils/apiUtil';
import { OpenAiManager } from '../../services/OpenAiManager';
import { parse } from 'csv-parse/sync';
import '../../utils/expressExtensions';

class API extends ClentoAPI {
    public path = '/api/reporter/aicsv';
    public authType: 'REPORTER' = 'REPORTER';

    private userRepository = new UserRepository();

    public GET = async (req: Request, res: Response) => {
        const userId = req.reporter.id;
        const user = await this.userRepository.findById(userId);

        if(!user){
            throw new DisplayError('User not found');
        }
        return res.sendOKResponse({ allowed: user?.is_superuser });
    }

    public POST = async (req: Request, res: Response) => {
        const csvFile = req.getFiles().getFile('file');
        const prompt = req.getBody().getParamAsString('prompt');

        const csvFileBuffer = csvFile?.buffer;
        const csvString = csvFileBuffer?.toString('utf-8');

        if (!csvString) {
            throw new DisplayError('CSV file missing or empty');
        }

        // Parse CSV using a robust parser to handle quoted fields with commas
        let records: string[][] = [];
        try {
            records = parse(csvString, { skip_empty_lines: true });
        } catch (err) {
            throw new DisplayError('CSV parsing failed');
        }
        if (records.length < 2) {
            throw new DisplayError('CSV must have at least one data row');
        }
        const header = records[0];
        const dataRows = records.slice(1);
        // Only keep non-empty, non-whitespace data rows
        const nonEmptyDataRows = dataRows.filter(cols => cols.join('').trim().length > 0);

        // Hard limit of 4000 rows
        if (nonEmptyDataRows.length > 4000) {
            throw new DisplayError('CSV exceeds maximum allowed 4000 data rows');
        }

        // Batch into chunks of 100
        function chunkArray<T>(arr: T[], size: number): T[][] {
            const out: T[][] = [];
            for (let i = 0; i < arr.length; i += size) {
                out.push(arr.slice(i, i + size));
            }
            return out;
        }
        const batches = chunkArray(nonEmptyDataRows, 100);

        const openAi = new OpenAiManager();
        await openAi.initialize();

        let allAnswers: string[] = [];
        // Process batches in groups of 5 in parallel, then sequentially
        async function processBatchesInGroups<T>(batches: T[][], groupSize: number, handler: (batch: T[]) => Promise<string[]>) {
            let results: string[] = [];
            for (let i = 0; i < batches.length; i += groupSize) {
                const group = batches.slice(i, i + groupSize);
                // Run up to 5 requests in parallel
                const groupResults = await Promise.all(group.map(async batch => {
                    let batchAnswers: string[] = [];
                    try {
                        batchAnswers = await handler(batch);
                    } catch (err) {
                        throw new DisplayError('OpenAI request failed during batch processing');
                    }
                    if (!Array.isArray(batchAnswers) || batchAnswers.length !== batch.length) {
                        throw new DisplayError('OpenAI answer count mismatch in batch');
                    }
                    return batchAnswers;
                }));
                results = results.concat(...groupResults);
            }
            return results;
        }

        let requestsDone = 0;
        const totalRequests = batches.length;
        console.log(`[AI CSV] Starting batch processing: ${totalRequests} total requests, ${batches.length * 100} rows (max 100 per batch)`);
        allAnswers = await processBatchesInGroups(batches, 5, async (batch) => {
            console.log(`[AI CSV] Sending batch ${requestsDone + 1}/${totalRequests} (rows ${requestsDone * 100 + 1}-${requestsDone * 100 + batch.length})`);
            const result = await openAi.generateCsvAnswers(batch, prompt);
            requestsDone++;
            console.log(`[AI CSV] Completed batch ${requestsDone}/${totalRequests}`);
            return result;
        });
        console.log(`[AI CSV] All batches complete. Total requests: ${totalRequests}`);
        console.log(allAnswers);
        // Map answers back to original dataRows (empty rows get empty string)
        let answerIdx = 0;
        const fullAnswers = dataRows.map(cols => {
            if (cols.join('').trim().length > 0) {
                return allAnswers[answerIdx++];
            } else {
                return '';
            }
        });

        // Respond with just the answers array
        return res.sendOKResponse({ answers: fullAnswers });
    };
}

export default new API();
