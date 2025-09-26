import { Storage } from '@google-cloud/storage';
import { ExternalAPIError, ServiceUnavailableError } from '../errors/AppError';
import logger from '../utils/logger';
import env from '../config/env';

export interface UploadResult {
    url: string;
    filename: string;
    size: number;
    contentType: string;
}

/**
 * Service for handling Google Cloud Storage operations
 */
export class StorageService {
    private static storage: Storage | null = null;

    constructor() {
        StorageService.initializeStorage();
    }

    /**
     * Initialize Google Cloud Storage client
     */
    private static initializeStorage(): Storage | null {
        if(!StorageService.storage){
            try {
                if (!env.GOOGLE_CLOUD_PROJECT_ID || !env.GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY) {
                    logger.warn('Google Cloud Storage credentials not configured, using mock for development');
                    return null;
                }

                // Initialize GCS client
                StorageService.storage = new Storage({
                    projectId: env.GOOGLE_CLOUD_PROJECT_ID,
                    credentials: JSON.parse(env.GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY),
                });

                logger.info('Google Cloud Storage initialized successfully');
            } catch (error) {
                logger.error('Failed to initialize Google Cloud Storage', { error });
            }
        }
        return StorageService.storage
    }

    /**
     * Check if storage is configured
     */
    static isConfigured(): boolean {
        return StorageService.storage !== null && !!env.GOOGLE_CLOUD_PROJECT_ID && !!env.GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY;
    }

    /**
     * Upload CSV file to Google Cloud Storage
     */
    async uploadCsvFile(
        fileBuffer: Buffer,
        filename: string,
        organizationId: string,
        leadListId: string,
        bucketName: string
    ): Promise<UploadResult> {
        try {
            if (!StorageService.storage) {
                throw new ServiceUnavailableError('Storage service not configured');
            }

            // Generate file path
            const filePath = `lead-lists/${organizationId}/${leadListId}/${filename}`;

            // Get bucket
            const bucket = StorageService.storage.bucket(bucketName);
            const file = bucket.file(filePath);

            // Upload file
            await file.save(fileBuffer, {
                metadata: {
                    contentType: 'text/csv',
                    metadata: {
                        organizationId,
                        leadListId,
                        uploadedAt: new Date().toISOString(),
                    },
                },
                public: false, // Keep files private
            });

            // Generate signed URL (valid for 1 hour)
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 60 * 60 * 1000, // 1 hour
            });

            logger.info('CSV file uploaded successfully', {
                filename,
                organizationId,
                leadListId,
                filePath,
                size: fileBuffer.length,
            });

            return {
                url: signedUrl,
                filename,
                size: fileBuffer.length,
                contentType: 'text/csv',
            };
        } catch (error) {
            logger.error('Error uploading CSV file', {
                error,
                filename,
                organizationId,
                leadListId,
            });

            throw new ExternalAPIError('Failed to upload CSV file');
        }
    }

    /**
     * Delete CSV file from Google Cloud Storage
     */
    async deleteCsvFile(
        organizationId: string,
        leadListId: string,
        filename: string,
        bucketName: string
    ): Promise<void> {
        try {
            // For development, just log the deletion
            if (env.NODE_ENV === 'development') {
                logger.info('Mock CSV file deletion', {
                    filename,
                    organizationId,
                    leadListId,
                });
                return;
            }

            if (!StorageService.storage) {
                throw new ServiceUnavailableError('Storage service not configured');
            }

            // Generate file path
            const filePath = `lead-lists/${organizationId}/${leadListId}/${filename}`;

            // Get bucket and file
            const bucket = StorageService.storage.bucket(bucketName);
            const file = bucket.file(filePath);

            // Delete file
            await file.delete();

            logger.info('CSV file deleted successfully', {
                filename,
                organizationId,
                leadListId,
                filePath,
            });
        } catch (error) {
            logger.error('Error deleting CSV file', {
                error,
                filename,
                organizationId,
                leadListId,
            });

            // Don't throw error for file deletion failures
            // Just log the error as the file might already be deleted
        }
    }

    /**
     * Get signed URL for existing file
     */
    async getSignedUrl(
        organizationId: string,
        leadListId: string,
        filename: string,
        expirationMinutes: number = 60,
        bucketName: string
    ): Promise<string> {
        try {

            if (!StorageService.storage) {
                throw new ServiceUnavailableError('Storage service not configured');
            }

            // Generate file path
            const filePath = `lead-lists/${organizationId}/${leadListId}/${filename}`;

            // Get bucket and file
            const bucket = StorageService.storage.bucket(bucketName);
            const file = bucket.file(filePath);

            // Generate signed URL
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + expirationMinutes * 60 * 1000,
            });

            logger.info('Signed URL generated successfully', {
                filename,
                organizationId,
                leadListId,
                filePath,
                expirationMinutes,
            });

            return signedUrl;
        } catch (error) {
            logger.error('Error generating signed URL', {
                error,
                filename,
                organizationId,
                leadListId,
            });

            throw new ExternalAPIError('Failed to generate file URL');
        }
    }

    /**
     * Check if file exists
     */
    async fileExists(
        organizationId: string,
        leadListId: string,
        filename: string,
        bucketName: string,
        filePath: string
    ): Promise<boolean> {
        try {

            if (!StorageService.storage) {
                return false;
            }

            // Get bucket and file
            const bucket = StorageService.storage.bucket(bucketName);
            const file = bucket.file(filePath);

            // Check if file exists
            const [exists] = await file.exists();

            return exists;
        } catch (error) {
            logger.error('Error checking file existence', {
                error,
                filename,
                organizationId,
                leadListId,
            });

            return false;
        }
    }

    /**
     * Get file metadata
     */
    async getFileMetadata(
        organizationId: string,
        leadListId: string,
        filename: string,
        bucketName: string
    ): Promise<{
        size: number;
        contentType: string;
        created: string;
        updated: string;
    } | null> {
        try {
            // For development, return mock metadata
            if (env.NODE_ENV === 'development') {
                return {
                    size: 1024,
                    contentType: 'text/csv',
                    created: new Date().toISOString(),
                    updated: new Date().toISOString(),
                };
            }

            if (!StorageService.storage) {
                return null;
            }

            // Generate file path
            const filePath = `lead-lists/${organizationId}/${leadListId}/${filename}`;

            // Get bucket and file
            const bucket = StorageService.storage.bucket(bucketName);
            const file = bucket.file(filePath);

            // Get metadata
            const [metadata] = await file.getMetadata();

            return {
                size: parseInt(metadata.size as string || '0'),
                contentType: metadata.contentType || 'text/csv',
                created: metadata.timeCreated || new Date().toISOString(),
                updated: metadata.updated || new Date().toISOString(),
            };
        } catch (error) {
            logger.error('Error getting file metadata', {
                error,
                filename,
                organizationId,
                leadListId,
            });

            return null;
        }
    }

    /**
     * Download file from Google Cloud Storage and return as stream
     */
    async downloadFile(
        organizationId: string,
        leadListId: string,
        filename: string,
        bucketName: string
    ): Promise<{
        stream: NodeJS.ReadableStream;
        metadata: {
            size: number;
            contentType: string;
            filename: string;
        };
    }> {
        try {
            if (!StorageService.storage) {
                throw new ServiceUnavailableError('Storage service not configured');
            }

            // Generate file path
            const filePath = `lead-lists/${organizationId}/${leadListId}/${filename}`;

            // Get bucket and file
            const bucket = StorageService.storage.bucket(bucketName);
            const file = bucket.file(filePath);

            // Check if file exists
            const [exists] = await file.exists();
            if (!exists) {
                throw new ExternalAPIError('File not found');
            }

            // Get file metadata
            const [metadata] = await file.getMetadata();

            // Create download stream
            const stream = file.createReadStream();

            logger.info('File download initiated', {
                filename,
                organizationId,
                leadListId,
                filePath,
                size: parseInt(metadata.size as string || '0'),
            });

            return {
                stream,
                metadata: {
                    size: parseInt(metadata.size as string || '0'),
                    contentType: metadata.contentType || 'text/csv',
                    filename,
                },
            };
        } catch (error) {
            logger.error('Error downloading file', {
                error,
                filename,
                organizationId,
                leadListId,
            });

            if (error instanceof ExternalAPIError || error instanceof ServiceUnavailableError) {
                throw error;
            }

            throw new ExternalAPIError('Failed to download file');
        }
    }

    /**
     * Download file as buffer from Google Cloud Storage
     */
    async downloadFileAsBuffer(
        organizationId: string,
        leadListId: string,
        filename: string,
        bucketName: string,
        filePath: string
    ): Promise<{
        buffer: Buffer;
        metadata: {
            size: number;
            contentType: string;
            filename: string;
        };
    }> {
        try {
            if (!StorageService.storage) {
                throw new ServiceUnavailableError('Storage service not configured');
            }

            // Get bucket and file
            const bucket = StorageService.storage.bucket(bucketName);
            const file = bucket.file(filePath);

            // Check if file exists
            const [exists] = await file.exists();
            if (!exists) {
                throw new ExternalAPIError('File not found');
            }

            // Get file metadata
            const [metadata] = await file.getMetadata();

            // Download file as buffer
            const [buffer] = await file.download();

            logger.info('File downloaded as buffer', {
                filename,
                organizationId,
                leadListId,
                filePath,
                size: buffer.length,
            });

            return {
                buffer,
                metadata: {
                    size: buffer.length,
                    contentType: metadata.contentType || 'text/csv',
                    filename,
                },
            };
        } catch (error) {
            logger.error('Error downloading file as buffer', {
                error,
                filename,
                organizationId,
                leadListId,
            });

            if (error instanceof ExternalAPIError || error instanceof ServiceUnavailableError) {
                throw error;
            }

            throw new ExternalAPIError('Failed to download file');
        }
    }
    public async uploadJson(workflowJson: Record<string, any>, organizationId: string, filename: string, bucketName: string): Promise<void> {
        try {
            if (!StorageService.storage) {
                throw new ServiceUnavailableError('Storage service not configured');
            }
            const filePath = `workflows/${organizationId}/${filename}`;

            const bucket = StorageService.storage.bucket(bucketName);
            const file = bucket.file(filePath);

            await file.save(JSON.stringify(workflowJson), {
                metadata: {
                    contentType: 'application/json',
                },
            });

        }
        catch (error) {
            logger.error('Error uploading JSON file', {
                error,
                filename,
                organizationId,
                bucketName,
            });

            throw new ExternalAPIError('Failed to upload JSON file');
        }
    }
}
