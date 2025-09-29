import { parse } from 'csv-parse/sync';
import { ValidationError, BadRequestError } from '../errors/AppError';
import logger from '../utils/logger';
import { UnipileService } from './UnipileService';

export interface CsvParseResult {
  headers: string[];
  data: Record<string, any>[];
  totalRows: number;
  validRows: number;
  errors: string[];
}

export interface CsvValidationResult {
  isValid: boolean;
  hasLinkedInColumn: boolean;
  linkedInColumnName?: string;
  emailColumns: string[];
  phoneColumns: string[];
  errors: string[];
  warnings: string[];
}

/**
 * Service for handling CSV operations
 */
export class CsvService {
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MAX_ROWS = 10000;
  private static readonly REQUIRED_COLUMNS = ['linkedin_url'];

  // Common column mappings
  private static readonly COLUMN_MAPPINGS = {
    linkedin: ['linkedin_url', 'linkedin', 'linkedin_profile', 'profile_url', 'linkedin_link'],
    email: ['email', 'email_address', 'work_email', 'business_email'],
    phone: ['phone', 'phone_number', 'mobile', 'contact_number'],
    name: ['full_name', 'name', 'contact_name'],
    first_name: ['first_name', 'firstname', 'fname'],
    last_name: ['last_name', 'lastname', 'lname'],
    company: ['company', 'company_name', 'organization'],
    title: ['title', 'job_title', 'position', 'role'],
    location: ['location', 'city', 'country', 'address'],
    industry: ['industry', 'sector'],
  };

  /**
   * Parse CSV data from string
   */
  static parseCsvData(csvData: string): CsvParseResult {
    try {
      if (!csvData || csvData.trim().length === 0) {
        throw new ValidationError('CSV data is empty');
      }

      // Parse CSV
      const records = parse(csvData, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relaxColumnCount: true,
      });

      if (!records || records.length === 0) {
        throw new ValidationError('No data found in CSV');
      }

      if (records.length > this.MAX_ROWS) {
        throw new ValidationError(`CSV contains too many rows. Maximum allowed: ${this.MAX_ROWS}`);
      }

      // Get headers
      const headers = Object.keys(records[0] || {});

      if (headers.length === 0) {
        throw new ValidationError('No columns found in CSV');
      }

      // Validate and clean data
      const validRows: Record<string, any>[] = [];
      const errors: string[] = [];

      records.forEach((row: any, index) => {
        try {
          // Clean row data
          const cleanedRow: Record<string, any> = {};

          headers.forEach(header => {
            const value = row[header];
            if (value !== undefined && value !== null && value !== '') {
              cleanedRow[header] = String(value).trim();
            }
          });

          // Validate row has some data
          if (Object.keys(cleanedRow).length > 0) {
            validRows.push(cleanedRow);
          }
        } catch (error) {
          errors.push(`Row ${index + 1}: ${error instanceof Error ? error.message : 'Invalid data'}`);
        }
      });

      logger.info('CSV parsed successfully', {
        totalRows: records.length,
        validRows: validRows.length,
        headers: headers.length,
        errors: errors.length,
      });

      return {
        headers,
        data: validRows,
        totalRows: records.length,
        validRows: validRows.length,
        errors,
      };
    } catch (error) {
      logger.error('Error parsing CSV data', { error });

      if (error instanceof ValidationError) {
        throw error;
      }

      throw new BadRequestError('Invalid CSV format');
    }
  }

  /**
   * Validate CSV structure and content
   */
  static validateCsv(parseResult: CsvParseResult): CsvValidationResult {
    const { headers, data } = parseResult;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for LinkedIn column
    const linkedInColumn = this.findLinkedInColumn(headers);
    const hasLinkedInColumn = linkedInColumn !== null;

    if (!hasLinkedInColumn) {
      errors.push('CSV must contain a LinkedIn URL column (linkedin_url, linkedin, linkedin_profile, etc.)');
    }

    // Find email and phone columns
    const emailColumns = this.findColumnsByType(headers, 'email');
    const phoneColumns = this.findColumnsByType(headers, 'phone');

    // Validate LinkedIn URLs if column exists
    if (hasLinkedInColumn && linkedInColumn) {
      let validLinkedInUrls = 0;

      data.forEach((row, index) => {
        const linkedInUrl = row[linkedInColumn];
        if (linkedInUrl && this.isValidLinkedInUrl(linkedInUrl)) {
          validLinkedInUrls++;
        }
      });

      if (validLinkedInUrls === 0) {
        errors.push('No valid LinkedIn URLs found in the CSV');
      } else if (validLinkedInUrls < data.length * 0.5) {
        warnings.push(`Only ${validLinkedInUrls} out of ${data.length} rows have valid LinkedIn URLs`);
      }
    }

    // Check for email addresses
    if (emailColumns.length === 0) {
      warnings.push('No email column detected. Email addresses are recommended for better outreach.');
    } else {
      let validEmails = 0;
      emailColumns.forEach(emailCol => {
        data.forEach(row => {
          const email = row[emailCol];
          if (email && this.isValidEmail(email)) {
            validEmails++;
          }
        });
      });

      if (validEmails < data.length * 0.3) {
        warnings.push('Low email address coverage detected');
      }
    }

    // Check for required fields
    const nameColumn = this.findColumnsByType(headers, 'name')[0] ||
                      this.findColumnsByType(headers, 'first_name')[0];

    if (!nameColumn) {
      warnings.push('No name column detected. Names are recommended for personalization.');
    }

    const companyColumn = this.findColumnsByType(headers, 'company')[0];
    if (!companyColumn) {
      warnings.push('No company column detected. Company information is recommended.');
    }

    return {
      isValid: errors.length === 0,
      hasLinkedInColumn,
      linkedInColumnName: linkedInColumn || undefined,
      emailColumns,
      phoneColumns,
      errors,
      warnings,
    };
  }

  /**
   * Generate field mapping suggestions
   */
  static generateMapping(headers: string[]): Record<string, string> {
    const mapping: Record<string, string> = {};

    Object.entries(this.COLUMN_MAPPINGS).forEach(([standardField, possibleNames]) => {
      const matchedHeader = headers.find(header =>
        possibleNames.some(name =>
          header.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(header.toLowerCase())
        )
      );

      if (matchedHeader) {
        mapping[standardField] = matchedHeader;
      }
    });

    return mapping;
  }

  /**
   * Apply mapping to CSV data
   */
  static applyMapping(
    data: Record<string, any>[],
    mapping: Record<string, string>
  ): Record<string, any>[] {
    return data.map(row => {
      const mappedRow: Record<string, any> = {};

      // Apply mapping
      Object.entries(mapping).forEach(([standardField, csvColumn]) => {
        if (row[csvColumn] !== undefined) {
          mappedRow[standardField] = row[csvColumn];
        }
      });

      // Keep unmapped fields as custom_fields
      const customFields: Record<string, any> = {};
      Object.entries(row).forEach(([key, value]) => {
        if (!Object.values(mapping).includes(key)) {
          customFields[key] = value;
        }
      });

      if (Object.keys(customFields).length > 0) {
        mappedRow.custom_fields = customFields;
      }

      return mappedRow;
    });
  }

  /**
   * Find LinkedIn column in headers
   */
  private static findLinkedInColumn(headers: string[]): string | null {
    const linkedInPatterns = this.COLUMN_MAPPINGS.linkedin;

    return headers.find(header =>
      linkedInPatterns.some(pattern =>
        header.toLowerCase().includes(pattern.toLowerCase())
      )
    ) || null;
  }

  /**
   * Find columns by type
   */
  private static findColumnsByType(headers: string[], type: keyof typeof CsvService.COLUMN_MAPPINGS): string[] {
    const patterns = this.COLUMN_MAPPINGS[type];

    return headers.filter(header =>
      patterns.some(pattern =>
        header.toLowerCase().includes(pattern.toLowerCase())
      )
    );
  }

  /**
   * Validate LinkedIn URL format
   */
  private static isValidLinkedInUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('linkedin.com') &&
             (urlObj.pathname.includes('/in/') || urlObj.pathname.includes('/company/'));
    } catch {
      return false;
    }
  }

  /**
   * Validate email format
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get CSV preview (first N rows)
   */
  static getPreview(parseResult: CsvParseResult, maxRows: number = 5): {
    headers: string[];
    data: Record<string, any>[];
    totalRows: number;
    showingRows: number;
  } {
    const previewData = parseResult.data.slice(0, maxRows);

    return {
      headers: parseResult.headers,
      data: previewData,
      totalRows: parseResult.totalRows,
      showingRows: previewData.length,
    };
  }

  //@TODO yash complete this after setting up authentication
  static async getPreviewFromUnipile(parseResult: CsvParseResult, maxRows: number = 5, accountId: string){
      const leads = parseResult.data.slice(0, maxRows);
      const publicIdentifiers = leads.map(it => it.linkedin_url.split("/").pop());

      // Create a map of identifier to lead data
      const leadMap = new Map();
      publicIdentifiers.forEach((identifier, index) => {
        leadMap.set(identifier, leads[index]);
      });

      let leadsFromLinkedin = [];
      if (accountId) {
        try {
          const unipileService = new UnipileService();
          // Get profiles for each identifier
          leadsFromLinkedin = await Promise.all(
            publicIdentifiers.map(async (identifier) => {
              try {
                  const profile = await unipileService.getUserProfile(accountId, identifier);
                  return profile;
              } catch (error) {
                // logger.warn('Failed to get profile for identifier', { identifier, error });
                return null;
              }
            })
          );
        } catch (error) {
        //   logger.warn('Failed to get LinkedIn profiles', { error });
        }
      }

      const parsedData = publicIdentifiers.map((identifier, index) => {
        const linkedinProfile = leadsFromLinkedin[index];
        const csvLead = leadMap.get(identifier);

        const result = {
          identifier,
          name: null as string | null,
          headline: null as string | null,
          isPremium: null as boolean | null,
          websites: null as string[] | null,
          followerCount: null as number | null,
          connectionCount: null as number | null,
          profilePictureUrl: null as string | null
        };

        if (linkedinProfile && !linkedinProfile.error) {
          // Use LinkedIn data when available
          result.name = linkedinProfile.first_name + ' ' + linkedinProfile.last_name;
          result.headline = linkedinProfile.headline;
          result.isPremium = linkedinProfile.is_premium;
          result.websites = linkedinProfile.websites;
          result.followerCount = linkedinProfile.follower_count;
          result.connectionCount = linkedinProfile.connections_count;
          result.profilePictureUrl = linkedinProfile.profile_picture_url;
        } else {
          // Use CSV data when LinkedIn profile not found
          result.name = csvLead.first_name + ' ' + csvLead.last_name || null;
          result.headline = csvLead.title || null;
        }

        return result;
      });

    return {
      data: parsedData,
      total: parsedData.length,
      found: parsedData.filter(it => it.isPremium !== null).length,
      notFound: parsedData.filter(it => it.isPremium === null).length
    };
  }

  /**
   * Validate file size
   */
  static validateFileSize(size: number): void {
    if (size > this.MAX_FILE_SIZE) {
      throw new ValidationError(`File size too large. Maximum allowed: ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }
  }
}
