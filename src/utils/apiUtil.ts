import { NextFunction, Request, Response } from 'express';
import { promisify } from 'util';
import { BadRequestError, AppError } from '../errors/AppError';
import { defaultAuth } from '../middleware/auth';

export interface ExpressRequestParams {
    bodyParams: Record<string, any>;
    queryParams: Record<string, any>;
    pathParams: Record<string, any>;
    [key: string]: Record<string, any>;
}

// Extend Express Request type to include additional properties
declare global {
    namespace Express {
        interface Request {
            clentoAPIClass?: ClentoAPI;
            requestParams?: ExpressRequestParams;
        }
    }
}

export const isNullOrUndefined = (it: any) => it === null || it === undefined;

export const CheckNever = (value: never): never => {
    throw new Error(`Unhandled case: ${value}`);
};

export default abstract class ClentoAPI {
    public abstract path: string;

    public authType: 'NONE' | 'API' | 'DASHBOARD';

    public forceJSON: boolean;
    public redisLockEnabled: boolean;
    public redisLockTimeout: number;

    public requestParams: {
        [key: string]: ExpressRequestParams;
        GET: ExpressRequestParams;
        POST: ExpressRequestParams;
        PUT: ExpressRequestParams;
        DELETE: ExpressRequestParams;
    };

    constructor() {
        this.authType = 'DASHBOARD';
        this.requestParams = this.getDefaultClentoAPIRequestParams();
        this.forceJSON = false;
        this.redisLockEnabled = false;
        this.redisLockTimeout = 120 * 1000; // 2 minutes
    }

    public getRedisLockString = (req: Request): string => {
        throw new AppError(`getLockString method is not implemented for ${this.path}`, 500);
    };

    public getDefaultClentoAPIRequestParams() {
        return {
            GET: this.getDefaultExpressRequestParams(),
            POST: this.getDefaultExpressRequestParams(),
            PUT: this.getDefaultExpressRequestParams(),
            DELETE: this.getDefaultExpressRequestParams(),
        };
    }

    public getDefaultExpressRequestParams(): ExpressRequestParams {
        return {
            bodyParams: {},
            queryParams: {},
            pathParams: {},
        };
    }

    public GET = async (req: Request, res: Response): Promise<Response> => {
        // The child class has to override this method so that we dont throw this error
        throw new AppError('Method not implemented', 405);
    };

    public POST = async (req: Request, res: Response): Promise<Response> => {
        // The child class has to override this method so that we dont throw this error
        throw new AppError('Method not implemented', 405);
    };

    public PUT = async (req: Request, res: Response): Promise<Response> => {
        // The child class has to override this method so that we dont throw this error
        throw new AppError('Method not implemented', 405);
    };

    public DELETE = async (req: Request, res: Response): Promise<Response> => {
        // The child class has to override this method so that we dont throw this error
        throw new AppError('Method not implemented', 405);
    };

    public HEAD = async (req: Request, res: Response): Promise<void> => {
        // I dont know who stupid is calling our servers with HEAD as request method.
        // but anyway, to handle it, I have added this method
        res.send();
    };

    public OPTIONS = async (req: Request, res: Response): Promise<void> => {
        // I dont know who stupid is calling our servers with OPTIONS as request method.
        // but anyway, to handle it, I have added this method
        res.send();
    };

    public wrapper = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Attach API class to request
            req.clentoAPIClass = this;

            // Set up request parameters
            req.requestParams = {
                bodyParams: req.body || {},
                queryParams: req.query || {},
                pathParams: req.params || {},
            };

            // Apply authentication based on authType
            if (this.authType !== 'NONE') {
                // Apply authentication middleware for DASHBOARD and API auth types
                if (this.authType === 'DASHBOARD' || this.authType === 'API') {
                    // Create a middleware chain for authentication
                    const authChain = [...defaultAuth];

                    // Execute each middleware in sequence
                    let currentIndex = 0;
                    const executeNext = async () => {
                        if (currentIndex < authChain.length) {
                            const middleware = authChain[currentIndex++];
                            await new Promise<void>((resolve, reject) => {
                                middleware(req, res, (err?: any) => {
                                    if (err) reject(err);
                                    else resolve();
                                });
                            });
                            await executeNext();
                        }
                    };

                    await executeNext();
                }
            }

            // Set common headers
            this.setCommonHeaders(res);

            // Validate JSON content type if required
            if (this.forceJSON && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
                if (!req.is('application/json')) {
                    throw new BadRequestError('Only JSON requests are allowed. Please set the header Content-Type: application/json');
                }
            }

            // Route to appropriate HTTP method handler
            switch (req.method) {
                case 'GET':
                    await this.GET(req, res);
                    break;
                case 'POST':
                    await this.POST(req, res);
                    break;
                case 'PUT':
                    await this.PUT(req, res);
                    break;
                case 'DELETE':
                    await this.DELETE(req, res);
                    break;
                case 'HEAD':
                    await this.HEAD(req, res);
                    break;
                case 'OPTIONS':
                    await this.OPTIONS(req, res);
                    break;
                default:
                    throw new AppError(`Unsupported HTTP method: ${req.method}`, 405);
            }
        } catch (error) {
            next(error);
        }
    };

    private setCommonHeaders = (res: Response) => {
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    };

    /**
     * Helper method to create a router with automatic route setup
     */
    public static createRouter<T extends ClentoAPI>(apiClass: new () => T, routes: { [method: string]: string }) {
        const { Router } = require('express');
        const router = Router();
        const apiInstance = new apiClass();

        Object.entries(routes).forEach(([method, path]) => {
            const httpMethod = method.toLowerCase() as keyof typeof Router;
            if (typeof router[httpMethod] === 'function') {
                (router[httpMethod] as any)(path, apiInstance.wrapper.bind(apiInstance));
            }
        });

        return router;
    }
}
