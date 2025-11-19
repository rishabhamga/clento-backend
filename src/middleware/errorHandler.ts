import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { ZodError } from 'zod';

/**
 * Global error handling middleware
 */
export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: NextFunction,
) => {
    // Log error
    logger.error(`Error: ${err.message}`, {
        error: err,
        path: req.path,
        method: req.method,
        ip: req.ip,
    });

    // Handle AppError instances
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            error: err.message,
            statusCode: err.statusCode,
        });
    }

    // Handle Zod validation errors
    if (err instanceof ZodError) {
        return res.status(400).json({
            success: false,
            error: 'Validation error',
            details: err.errors,
            statusCode: 400,
        });
    }

    // Handle other errors as 500 Internal Server Error
    return res.status(500).json({
        success: false,
        error: 'Internal server error',
        statusCode: 500,
    });
};
