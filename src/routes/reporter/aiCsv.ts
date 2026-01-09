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

        // Use OpenAiManager.generateCsvAnswers for all rows in one request
        const openAi = new OpenAiManager();
        await openAi.initialize();

        let answers: string[] = [];
        try {
            answers = await openAi.generateCsvAnswers(nonEmptyDataRows, prompt);
            console.log(answers);
        } catch (err) {
            throw new DisplayError('OpenAI request failed');
        }
        if (!Array.isArray(answers) || answers.length !== nonEmptyDataRows.length) {
            throw new DisplayError('OpenAI answer count mismatch');
        }

        // Map answers back to original dataRows (empty rows get empty string)
        let answerIdx = 0;
        const fullAnswers = dataRows.map(cols => {
            if (cols.join('').trim().length > 0) {
                return answers[answerIdx++];
            } else {
                return '';
            }
        });

        // Respond with just the answers array
        return res.sendOKResponse({ answers: fullAnswers });
    };
}

export default new API();
