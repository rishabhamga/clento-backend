import { Request, Response } from 'express';
import { ValidationError } from '../errors/AppError';

// Define UploadedFile interface if express-fileupload is not available
interface UploadedFile {
    name: string;
    mimetype: string;
    size: number;
    data: Buffer;
}

export interface ExpressRequestParams {
    [key: string]: { [key: string]: string };
    bodyParams: { [key: string]: string };
    queryParams: { [key: string]: string };
    pathParams: { [key: string]: string };
}

declare module 'express-serve-static-core' {
    export interface Response {
        sendOKResponse(json: object): this;
        sendErrorResponse(statusCode: number, errorMessage: string, json?: object): this;
        sendValidationError(errorMessage: string): this;
        sendCreatedResponse(json: object): this;
        sendNoContentResponse(): this;
    }

    export interface ClentoAPIClass {
        path: string;
        authType: 'NONE' | 'API' | 'DASHBOARD';
    }

    export interface Request {
        user: {
            id: string;
            external_id: string;
            email: string;
            full_name?: string;
            avatar_url?: string;
            created_at: Date;
            updated_at: Date;
        };
        userId: string;
        organizationId: string;
        requestParams?: {
            bodyParams: { [key: string]: any };
            queryParams: { [key: string]: any };
            pathParams: { [key: string]: any };
        };
        clentoAPIClass?: ClentoAPIClass | null;
        getBody: () => ClentoRequestBody;
        getQuery: () => ClentoRequestBody;
        getPathParams: () => ClentoRequestBody;
        getFiles: () => ClentoRequestBody;
        getIPAddress: () => string | null;
    }
}

interface RequestBody { [key: string]: any; }

interface GenericEnum<T> {
    [id: string]: T | string;
    [nu: number]: string;
}

/* This class can be used for req.query as well as req.body */
export class ClentoRequestBody {
    private rawBody: RequestBody;
    private expressRequest: Request;
    private bodyName: string;

    constructor(expressRequest: Request, rawBody: RequestBody, bodyName: string) {
        this.expressRequest = expressRequest;
        this.rawBody = rawBody;
        this.bodyName = bodyName;
    }

    public rawJSON = () => {
        return this.rawBody;
    }

    public getParamAsNestedBody(parameterName: string): ClentoRequestBody;
    public getParamAsNestedBody(parameterName: string, required: true): ClentoRequestBody;
    public getParamAsNestedBody(parameterName: string, required: false): ClentoRequestBody | null;
    public getParamAsNestedBody(parameterName: string, required = true): ClentoRequestBody | null {
        const result = this.getParamOfType(parameterName, 'object', required);
        if (result === null) {
            return null;
        }
        return new ClentoRequestBody(this.expressRequest, result, parameterName);
    }

    public getParamAsArrayOfNestedBodies(parameterName: string): ClentoRequestBody[];
    public getParamAsArrayOfNestedBodies(parameterName: string, required: true): ClentoRequestBody[];
    public getParamAsArrayOfNestedBodies(parameterName: string, required: false): ClentoRequestBody[] | null;
    public getParamAsArrayOfNestedBodies(parameterName: string, required = true): ClentoRequestBody[] | null {
        const result: object[] = this.getParamOfType(parameterName, 'object[]', required);
        if (result === null) {
            return null;
        }
        return result.map((it, idx) => new ClentoRequestBody(this.expressRequest, it, `${parameterName}[${idx}]`));
    }

    public getParamAsString(parameterName: string): string;
    public getParamAsString(parameterName: string, required: true): string;
    public getParamAsString(parameterName: string, required: false): string | null;
    public getParamAsString(parameterName: string, required = true): string | null {
        const result = this.getParamOfType(parameterName, 'string', required);
        if(result === null) {
            return null;
        }
        return result.trim();
    }

    public getParamAsStringArray(parameterName: string): string[];
    public getParamAsStringArray(parameterName: string, required: true): string[];
    public getParamAsStringArray(parameterName: string, required: false): string[] | null;
    public getParamAsStringArray(parameterName: string, required = true): string[] | null {
        const result: string[] = this.getParamOfType(parameterName, 'string[]', required);
        if (result === null) {
            return null;
        }
        return result.map(it => it.trim());
    }

    public getParamAsEnumValue <T>(enumm: GenericEnum<T>, parameterName: string): T
    public getParamAsEnumValue <T>(enumm: GenericEnum<T>, parameterName: string, required : true): T
    public getParamAsEnumValue <T>(enumm: GenericEnum<T>, parameterName: string, required :false): T | null
    public getParamAsEnumValue <T>(enumm: GenericEnum<T>, parameterName: string, required = true): T | null {
        const paramAsString = this.getParamOfType(parameterName, 'string', required);
        if (!required && paramAsString === null) {
            return null;
        }
        if (Object.values(enumm).includes(paramAsString)) {
            return paramAsString as T;
        } else {
            throw new ValidationError(`${parameterName} is not a valid enum value in ${this.bodyName}`);
        }
    };

    public getParamAsType <T>(type: string, parameterName: string, required :true): T
    public getParamAsType <T>(type: string, parameterName: string, required: false): T | null
    public getParamAsType <T>(type: string, parameterName: string, required = true): T | null{
        const paramAsString =  this.getParamOfType(parameterName, type, required) as T;
        if (!required && paramAsString === null) {
            return null;
        }
        return paramAsString as T;
    }

    public getParamAsNumber(parameterName: string): number;
    public getParamAsNumber(parameterName: string, required: true): number;
    public getParamAsNumber(parameterName: string, required: false): number | null;
    public getParamAsNumber(parameterName: string, required = true): number | null {
        return this.getParamOfType(parameterName, 'number', required);
    }

    public getParamAsBoolean(parameterName: string): boolean;
    public getParamAsBoolean(parameterName: string, required: true): boolean;
    public getParamAsBoolean(parameterName: string, required: false): boolean | null;
    public getParamAsBoolean(parameterName: string, required = true): boolean | null {
        return this.getParamOfType(parameterName, 'boolean', required);
    }
    public getParamAsDate(parameterName: string): Date;
    public getParamAsDate(parameterName: string, required: false): Date | null;
    public getParamAsDate(parameterName: string, required = true): Date | null {
        const dateString = this.getParamOfType(parameterName, 'string', required);
        if (dateString === null) {
            return null;
        }
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            throw new ValidationError(`${parameterName} is not a valid date in ${this.bodyName}`);
        }
        return date;
    }

    public getParamAsUUID(parameterName: string): string;
    public getParamAsUUID(parameterName: string, required: true): string;
    public getParamAsUUID(parameterName: string, required: false): string | null;
    public getParamAsUUID(parameterName: string, required = true): string | null {
        const uuid = required ?
            this.getParamAsString(parameterName, true) :
            this.getParamAsString(parameterName, false);
        if (uuid === null) {
            return null;
        }
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(uuid)) {
            throw new ValidationError(`${parameterName} is not a valid UUID in ${this.bodyName}`);
        }
        return uuid;
    }

    public getParamAsEmail(parameterName: string): string;
    public getParamAsEmail(parameterName: string, required: true): string;
    public getParamAsEmail(parameterName: string, required: false): string | null;
    public getParamAsEmail(parameterName: string, required = true): string | null {
        const email = required ?
            this.getParamAsString(parameterName, true) :
            this.getParamAsString(parameterName, false);
        if (email === null) {
            return null;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new ValidationError(`${parameterName} is not a valid email in ${this.bodyName}`);
        }
        return email;
    }

    public getFileAsPNG = (FormFieldName: string, required = true) => {
        return this.getFileAsMimeType(FormFieldName, 'image/png', required);
    };

    public getFileAsJPG = (FormFieldName: string, required = true) => {
        const jpg = this.getFileAsMimeType(FormFieldName, 'image/jpg', false);
        if (jpg !== null) {
            return jpg;
        }
        const jpeg = this.getFileAsMimeType(FormFieldName, 'image/jpeg', false);
        if (jpeg !== null) {
            return jpeg;
        }
        if (!required) {
            return null;
        } else {
            throw new ValidationError(`${FormFieldName} is required as image/jpg or image/jpeg`);
        }
    };

    public getFileAsCSV = (FormFieldName: string, required = true) => {
        return this.getFileAsMimeType(FormFieldName, 'text/csv', required);
    };

    public getFile(FormFieldName: string) {
        const result = this.rawBody && this.rawBody[FormFieldName] as UploadedFile;
        if (result) {
            return result;
        } else {
            throw new ValidationError(`${FormFieldName} is not present in req.files`);
        }
    }

    private getParamOfType = (parameterName: string, type: string, required = true) => {
        let result = this.rawBody[parameterName];
        if ((result === undefined || result === null) && !required) {
            // if required param is false, only then return the field which is undefined
            return null;
        }
        if (type === 'boolean') {
            if (result === 'true') { result = true; }
            if (result === 'false') { result = false; }
        }
        if (type === 'number') {
            if (typeof (result) === 'string') {
                const resultParsedAsInt = parseInt(result, 10);
                if (!isNaN(resultParsedAsInt)) {
                    result = resultParsedAsInt;
                }
            }
        }
        if (type === 'string[]') {
            if (typeof (result) === 'string' && result) { // We dont get array if the length is 1, we get the value as string
                return [result];
            }
            if (typeof (result) === 'object' && result && result.length !== undefined && result.length !== null) {
                const arr: any[] = result;
                arr.forEach(ele => {
                    if (typeof ele !== 'string') {
                        throw new ValidationError(`${parameterName} in ${this.bodyName} is not a ${type}`);
                    }
                })
                return arr as string[];
            }
        }
        if (type === 'object[]') {
            if (!Array.isArray(result)) {
                throw new ValidationError(`${parameterName} in ${this.bodyName} is not a ${type}`);
            }
            return result.map((it, idx) => {
                if (typeof (it) !== 'object') {
                    throw new ValidationError(`${parameterName}[${idx}] in ${this.bodyName} is not an object`);
                }
                if (Array.isArray(it)) {
                    throw new ValidationError(`${parameterName}[${idx}] in ${this.bodyName} is not an object`);
                }
                return it;
            });
        }
        if (type === 'string' && typeof result === 'number') {
            result = result.toString();
        }
        if (typeof (result) !== type) {
            throw new ValidationError(`${parameterName} in ${this.bodyName} is not a ${type}`);
        }
        if (type === 'object') {
            if (typeof (result) !== type) {
                throw new ValidationError(`${parameterName} in ${this.bodyName} is not a ${type}`);
            }
            if (Array.isArray(result)) {
                throw new ValidationError(`${parameterName} in ${this.bodyName} is not a ${type}`);
            }
        }
        return result;
    };

    private getFileAsMimeType(FormFieldName: string, mimetype: string, required = true) {
        const result = this.getFile(FormFieldName);
        if (result.mimetype === mimetype) {
            return result;
        } else {
            if (!required) {
                return null;
            }
            throw new ValidationError(
                `MimeType for ${FormFieldName} is ${result.mimetype} and not ${mimetype}`);
        }
    }

    public getParamAsEnumArray = <T>(enumm: GenericEnum<T>, parameterName: string, required = true): T[] | null => {
        const arr: string[] = this.getParamOfType(parameterName, 'string[]', required);
        if (arr === null) { // null tbhi aayega jabb required false hoga, and pass bhi ni kia body mei
            return null
        }
        arr.forEach(ele => {
            if (!Object.values(enumm).includes(ele)) {
                throw new ValidationError(`${parameterName} is not a valid enum array - ${ele} failed`);
            }
        })
        return arr as any as T[];
    };
}

// Helper functions to extend Request and Response using proper prototype access
export const extendExpressPrototypes = () => {
    const express = require('express');

    // Request extensions
    Object.defineProperty(express.request, 'getBody', {
        value: function () {
            return new ClentoRequestBody(this, this.body, 'request body');
        },
        configurable: true
    });

    Object.defineProperty(express.request, 'getQuery', {
        value: function () {
            return new ClentoRequestBody(this, this.query, 'queryParams');
        },
        configurable: true
    });

    Object.defineProperty(express.request, 'getPathParams', {
        value: function () {
            return new ClentoRequestBody(this, this.params, 'pathParams');
        },
        configurable: true
    });

    Object.defineProperty(express.request, 'getFiles', {
        value: function () {
            return new ClentoRequestBody(this, this.files || {}, 'files');
        },
        configurable: true
    });

    Object.defineProperty(express.request, 'getIPAddress', {
        value: function () {
            const ipAddressFromHeader = this.headers['x-real-ip']; // this header is set by NGINX
            if (ipAddressFromHeader) {
                if (typeof ipAddressFromHeader === 'string') {
                    return ipAddressFromHeader;
                } else {
                    return ipAddressFromHeader[0];
                }
            } else if (this?.socket?.remoteAddress?.length > 0) {
                const ipAddress: string = this.socket.remoteAddress;
                if (ipAddress.startsWith('::ffff:')) { // ipv4 has this prefix
                    return ipAddress.substring(7);
                } else {
                    return ipAddress;
                }
            } else {
                return null;
            }
        },
        configurable: true
    });

    // Response extensions
    Object.defineProperty(express.response, 'sendOKResponse', {
        value: function (json: object) {
            // If the object already has success/data structure, use it as-is
            if (json && typeof json === 'object' && 'success' in json) {
                return this.status(200).json(json);
            }
            // Otherwise, wrap it in the standard format
            return this.status(200).json({
                success: true,
                data: json,
            });
        },
        configurable: true
    });

    Object.defineProperty(express.response, 'sendCreatedResponse', {
        value: function (json: object) {
            return this.status(201).json({
                success: true,
                data: json,
                message: 'Resource created successfully',
            });
        },
        configurable: true
    });

    Object.defineProperty(express.response, 'sendNoContentResponse', {
        value: function () {
            return this.status(204).send();
        },
        configurable: true
    });

    Object.defineProperty(express.response, 'sendErrorResponse', {
        value: function (statusCode: number, errorMessage: string, json: object = {}) {
            return this.status(statusCode).json({
                success: false,
                error: errorMessage,
                data: json,
            });
        },
        configurable: true
    });

    Object.defineProperty(express.response, 'sendValidationError', {
        value: function (errorMessage: string) {
            return this.sendErrorResponse(422, errorMessage);
        },
        configurable: true
    });
};

// Auto-extend prototypes when this module is imported
extendExpressPrototypes();

export default {};
