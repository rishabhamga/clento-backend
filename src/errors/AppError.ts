/**
 * Base error class for application errors
 */
export class AppError extends Error {
    statusCode: number;
    isOperational: boolean;

    constructor(message: string, statusCode: number, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;

        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Error for invalid input data
 */
export class ValidationError extends AppError {
    errors?: Array<{
        field: string;
        message: string;
        code?: string;
    }>;

    constructor(message: string, errors?: Array<{ field: string; message: string; code?: string }>) {
        super(message, 400);
        this.errors = errors;
    }
}

/**
 * Error for unauthorized access
 */
export class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401);
    }
}

/**
 * Error for forbidden access
 */
export class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 403);
    }
}

/**
 * Error for resource not found
 */
export class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404);
    }
}

/**
 * Error for conflict with current state
 */
export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 409);
    }
}

/**
 * Error for internal server errors
 */
export class InternalServerError extends AppError {
    constructor(message = 'Internal server error') {
        super(message, 500, false);
    }
}

/**
 * Error for rate limiting
 */
export class RateLimitError extends AppError {
    constructor(message = 'Rate limit exceeded') {
        super(message, 429);
    }
}

/**
 * Error for bad requests
 */
export class BadRequestError extends AppError {
    constructor(message: string) {
        super(message, 400);
    }
}

/**
 * Error for service unavailable
 */
export class ServiceUnavailableError extends AppError {
    constructor(message = 'Service temporarily unavailable') {
        super(message, 503);
    }
}

// Error for general use
export class DisplayError extends AppError {
    constructor(message = 'Service temporarily unavailable') {
        super(message, 467);
    }
}

/**
 * Error for database operations
 */
export class DatabaseError extends AppError {
    constructor(message: string, originalError?: Error) {
        super(message, 500, false);
        if (originalError) {
            this.stack = originalError.stack;
        }
    }
}

/**
 * Error for external API operations
 */
export class ExternalAPIError extends AppError {
    constructor(message: string, statusCode = 502) {
        super(message, statusCode);
    }
}

export class MethodNotImplementedError extends AppError {
    constructor(message = 'Method not implemented') {
        super(message, 405);
    }
}
