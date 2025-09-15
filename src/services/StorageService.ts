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
  private storage: Storage | null = null;
  private bucketName: string;

  constructor() {
    this.bucketName = env.GCS_BUCKET_NAME;
    this.initializeStorage();
  }

  /**
   * Initialize Google Cloud Storage client
   */
  private initializeStorage(): void {
    try {
      if (!env.GCS_PROJECT_ID || !env.GCS_KEY_FILE) {
        logger.warn('Google Cloud Storage credentials not configured, using mock for development');
        return;
      }

      // Initialize GCS client
      this.storage = new Storage({
        projectId: env.GCS_PROJECT_ID,
        keyFilename: env.GCS_KEY_FILE,
      });

      logger.info('Google Cloud Storage initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Google Cloud Storage', { error });
    }
  }

  /**
   * Check if storage is configured
   */
  isConfigured(): boolean {
    return this.storage !== null || (!env.GCS_PROJECT_ID || !env.GCS_KEY_FILE);
  }

  /**
   * Upload CSV file to Google Cloud Storage
   */
  async uploadCsvFile(
    fileBuffer: Buffer,
    filename: string,
    organizationId: string,
    leadListId: string
  ): Promise<UploadResult> {
    try {
      // For development, return mock data
      if (env.NODE_ENV === 'development') {
        const mockUrl = `https://storage.googleapis.com/${this.bucketName}/lead-lists/${organizationId}/${leadListId}/${filename}`;
        
        logger.info('Mock CSV file upload', {
          filename,
          organizationId,
          leadListId,
          size: fileBuffer.length,
        });

        return {
          url: mockUrl,
          filename,
          size: fileBuffer.length,
          contentType: 'text/csv',
        };
      }

      if (!this.storage) {
        throw new ServiceUnavailableError('Storage service not configured');
      }

      // Generate file path
      const filePath = `lead-lists/${organizationId}/${leadListId}/${filename}`;
      
      // Get bucket
      const bucket = this.storage.bucket(this.bucketName);
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
    filename: string
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

      if (!this.storage) {
        throw new ServiceUnavailableError('Storage service not configured');
      }

      // Generate file path
      const filePath = `lead-lists/${organizationId}/${leadListId}/${filename}`;
      
      // Get bucket and file
      const bucket = this.storage.bucket(this.bucketName);
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
    expirationMinutes: number = 60
  ): Promise<string> {
    try {
      // For development, return mock URL
      if (env.NODE_ENV === 'development') {
        const mockUrl = `https://storage.googleapis.com/${this.bucketName}/lead-lists/${organizationId}/${leadListId}/${filename}`;
        
        logger.info('Mock signed URL generated', {
          filename,
          organizationId,
          leadListId,
        });

        return mockUrl;
      }

      if (!this.storage) {
        throw new ServiceUnavailableError('Storage service not configured');
      }

      // Generate file path
      const filePath = `lead-lists/${organizationId}/${leadListId}/${filename}`;
      
      // Get bucket and file
      const bucket = this.storage.bucket(this.bucketName);
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
    filename: string
  ): Promise<boolean> {
    try {
      // For development, always return true
      if (env.NODE_ENV === 'development') {
        return true;
      }

      if (!this.storage) {
        return false;
      }

      // Generate file path
      const filePath = `lead-lists/${organizationId}/${leadListId}/${filename}`;
      
      // Get bucket and file
      const bucket = this.storage.bucket(this.bucketName);
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
    filename: string
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

      if (!this.storage) {
        return null;
      }

      // Generate file path
      const filePath = `lead-lists/${organizationId}/${leadListId}/${filename}`;
      
      // Get bucket and file
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(filePath);

      // Get metadata
      const [metadata] = await file.getMetadata();
      
      return {
        size: parseInt(metadata.size || '0'),
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
}
