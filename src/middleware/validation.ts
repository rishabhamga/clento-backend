import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from '../errors/AppError';
import logger from '../utils/logger';

/**
 * Middleware to validate request body against a Zod schema
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        logger.warn('Request body validation failed', { 
          errors,
          body: req.body,
          path: req.path 
        });
        
        return next(new ValidationError('Request body validation failed', errors));
      }
      
      // Replace request body with validated data
      req.body = result.data;
      next();
    } catch (error) {
      logger.error('Error validating request body', { error });
      next(error);
    }
  };
};

/**
 * Middleware to validate query parameters against a Zod schema
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        logger.warn('Query parameters validation failed', { 
          errors,
          query: req.query,
          path: req.path 
        });
        
        return next(new ValidationError('Query parameters validation failed', errors));
      }
      
      // Replace query with validated data
      req.query = result.data;
      next();
    } catch (error) {
      logger.error('Error validating query parameters', { error });
      next(error);
    }
  };
};

/**
 * Middleware to validate route parameters against a Zod schema
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.params);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        logger.warn('Route parameters validation failed', { 
          errors,
          params: req.params,
          path: req.path 
        });
        
        return next(new ValidationError('Route parameters validation failed', errors));
      }
      
      // Replace params with validated data
      req.params = result.data;
      next();
    } catch (error) {
      logger.error('Error validating route parameters', { error });
      next(error);
    }
  };
};

/**
 * Common parameter validation schemas
 */
export const commonParams = {
  id: z.object({
    id: z.string().min(1, 'ID is required'),
  }),
  
  organizationId: z.object({
    organizationId: z.string().uuid('Invalid organization ID format'),
  }),
  
  userId: z.object({
    userId: z.string().uuid('Invalid user ID format'),
  }),
  
  campaignId: z.object({
    campaignId: z.string().uuid('Invalid campaign ID format'),
  }),
  
  leadId: z.object({
    leadId: z.string().uuid('Invalid lead ID format'),
  }),
  
  leadListId: z.object({
    leadListId: z.string().uuid('Invalid lead list ID format'),
  }),
  
  accountId: z.object({
    accountId: z.string().uuid('Invalid account ID format'),
  }),
};

/**
 * Sanitize input by removing potentially dangerous characters
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    
    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }
    
    next();
  } catch (error) {
    logger.error('Error sanitizing input', { error });
    next(error);
  }
};

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Sanitize a string by removing potentially dangerous characters
 */
function sanitizeString(str: string): string {
  if (typeof str !== 'string') {
    return str;
  }
  
  // Remove null bytes and control characters
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Validate file upload
 */
export const validateFileUpload = (options: {
  maxSize?: number;
  allowedTypes?: string[];
  required?: boolean;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { maxSize = 10 * 1024 * 1024, allowedTypes = [], required = false } = options;
      
      if (!req.file && required) {
        return next(new ValidationError('File is required'));
      }
      
      if (!req.file) {
        return next();
      }
      
      // Check file size
      if (req.file.size > maxSize) {
        return next(new ValidationError(`File size exceeds maximum allowed size of ${maxSize} bytes`));
      }
      
      // Check file type
      if (allowedTypes.length > 0 && !allowedTypes.includes(req.file.mimetype)) {
        return next(new ValidationError(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`));
      }
      
      next();
    } catch (error) {
      logger.error('Error validating file upload', { error });
      next(error);
    }
  };
};
