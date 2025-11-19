import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../errors/AppError';

/**
 * Middleware to validate request body against a Zod schema
 */
export const validateRequest = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = schema.safeParse(req.body);

            if (!result.success) {
                throw new ValidationError(result.error.message);
            }

            // Replace request body with validated data
            req.body = result.data;
            next();
        } catch (error) {
            next(error);
        }
    };
};
