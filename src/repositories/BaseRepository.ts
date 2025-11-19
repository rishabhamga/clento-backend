import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';
import { NotFoundError } from '../errors/AppError';

/**
 * Base repository class for Supabase operations
 * Provides common CRUD operations for a specific table
 */
export abstract class BaseRepository<T, InsertT, UpdateT> {
    protected client: SupabaseClient<any>;
    protected tableName: string;

    constructor(tableName: string, client?: SupabaseClient<any>) {
        this.tableName = tableName;
        this.client = client || supabaseAdmin!;
    }

    /**
     * Find a record by ID
     */
    public async findById(id: string): Promise<T> {
        const { data, error } = await this.client.from(this.tableName).select('*').eq('id', id).single();

        if (error) {
            throw error;
        }

        if (!data) {
            throw new NotFoundError(`${this.tableName} with ID ${id} not found`);
        }

        return data as T;
    }

    public async findByIdIn(ids: string[]): Promise<T[]> {
        const { data, error } = await this.client.from(this.tableName).select('*').in('id', ids);

        if (error) {
            throw error;
        }
        if (!data) {
            return [];
        }
        return data as T[];
    }

    /**
     * Find records by a specific field value
     */
    public async findByField(field: string, value: any): Promise<T[]> {
        const { data, error } = await this.client.from(this.tableName).select('*').eq(field, value);

        if (error) {
            throw error;
        }

        return data as T[];
    }

    /**
     * Find a single record by a specific field value
     */
    public async findOneByField(field: string, value: any): Promise<T | null> {
        const { data, error } = await this.client.from(this.tableName).select('*').eq(field, value).single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No rows returned
                return null;
            }
            throw error;
        }

        return data as T;
    }

    /**
     * Find records by multiple field values
     * @param filters - Object containing field-value pairs to filter by
     * @returns Array of records matching all the specified criteria
     */
    public async findByMultipleFields(filters: Record<string, any>): Promise<T[]> {
        let query = this.client.from(this.tableName).select('*');

        // Apply each filter condition
        Object.entries(filters).forEach(([field, value]) => {
            if (value !== undefined && value !== null) {
                query = query.eq(field, value);
            }
        });

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        return data as T[];
    }

    /**
     * Find a single record by multiple field values
     * @param filters - Object containing field-value pairs to filter by
     * @returns Single record matching all the specified criteria, or null if not found
     */
    public async findOneByMultipleFields(filters: Record<string, any>): Promise<T | null> {
        let query = this.client.from(this.tableName).select('*');

        // Apply each filter condition
        Object.entries(filters).forEach(([field, value]) => {
            if (value !== undefined && value !== null) {
                query = query.eq(field, value);
            }
        });

        const { data, error } = await query.single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No rows returned
                return null;
            }
            throw error;
        }

        return data as T;
    }

    /**
     * Count records by a specific field value
     * @param field - Field name to filter by
     * @param value - Value to match
     * @param countType - Type of count: 'exact' or 'estimated' (default: 'exact')
     * @param head - Whether to use head request for count only (default: true)
     * @returns Number of records matching the criteria
     */
    public async countByField(field: string, value: any, countType: 'exact' | 'estimated' = 'exact', head: boolean = true): Promise<number> {
        const { count, error } = await this.client.from(this.tableName).select('*', { count: countType, head }).eq(field, value);

        if (error) {
            throw error;
        }

        return count || 0;
    }

    /**
     * Count records by multiple field values
     * @param filters - Object containing field-value pairs to filter by
     * @param countType - Type of count: 'exact' or 'estimated' (default: 'exact')
     * @param head - Whether to use head request for count only (default: true)
     * @returns Number of records matching all the specified criteria
     */
    public async countByMultipleFields(filters: Record<string, any>, countType: 'exact' | 'estimated' = 'exact', head: boolean = true): Promise<number> {
        let query = this.client.from(this.tableName).select('*', { count: countType, head });

        // Apply each filter condition
        Object.entries(filters).forEach(([field, value]) => {
            if (value !== undefined && value !== null) {
                query = query.eq(field, value);
            }
        });

        const { count, error } = await query;

        if (error) {
            throw error;
        }

        return count || 0;
    }

    /**
     * Create a new record
     */
    public async create(data: InsertT): Promise<T> {
        const { data: result, error } = await (this.client as any).from(this.tableName).insert(data).select().single();

        if (error) {
            throw error;
        }

        return result as T;
    }

    /**
     * Update an existing record
     */
    public async update(id: string, data: UpdateT): Promise<T> {
        const { data: result, error } = await (this.client as any).from(this.tableName).update(data).eq('id', id).select().single();

        if (error) {
            throw error;
        }

        if (!result) {
            throw new NotFoundError(`${this.tableName} with ID ${id} not found`);
        }

        return result as T;
    }

    /**
     * Delete a record by ID
     */
    public async delete(id: string): Promise<void> {
        const { error } = await this.client.from(this.tableName).delete().eq('id', id);

        if (error) {
            throw error;
        }
    }

    /**
     * List all records with optional pagination
     */
    async list(page = 1, limit = 20): Promise<{ data: T[]; count: number }> {
        const offset = (page - 1) * limit;

        // Get total count
        const { count, error: countError } = await this.client.from(this.tableName).select('*', { count: 'exact', head: true });

        if (countError) {
            throw countError;
        }

        // Get paginated data
        const { data, error } = await this.client
            .from(this.tableName)
            .select('*')
            .range(offset, offset + limit - 1);

        if (error) {
            throw error;
        }

        return {
            data: data as T[],
            count: count || 0,
        };
    }

    /**
     * Find records with pagination, multiple field filtering, and optional sorting
     * @param options - Configuration object for the query
     * @param options.filters - Object containing field-value pairs to filter by
     * @param options.page - Page number (default: 1)
     * @param options.limit - Number of records per page (default: 20)
     * @param options.sortBy - Field to sort by (optional)
     * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'asc')
     * @returns Paginated results with data, count, and pagination metadata
     */
    public async findPaginatedWithFilters(options: { filters?: Record<string, any>; page?: number; limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }): Promise<{
        data: T[];
        count: number;
        page: number;
        limit: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    }> {
        const { filters = {}, page = 1, limit = 20, sortBy, sortOrder = 'asc' } = options;

        const offset = (page - 1) * limit;

        // Build base query for count
        let countQuery = this.client.from(this.tableName).select('*', { count: 'exact', head: true });

        // Build base query for data
        let dataQuery = this.client.from(this.tableName).select('*');

        // Apply filters to both queries
        Object.entries(filters).forEach(([field, value]) => {
            if (value !== undefined && value !== null) {
                countQuery = countQuery.eq(field, value);
                dataQuery = dataQuery.eq(field, value);
            }
        });

        // Apply sorting if specified
        if (sortBy) {
            dataQuery = dataQuery.order(sortBy, { ascending: sortOrder === 'asc' });
        }

        // Apply pagination
        dataQuery = dataQuery.range(offset, offset + limit - 1);

        // Execute count query
        const { count, error: countError } = await countQuery;

        if (countError) {
            throw countError;
        }

        // Execute data query
        const { data, error } = await dataQuery;

        if (error) {
            throw error;
        }

        const totalCount = count || 0;
        const totalPages = Math.ceil(totalCount / limit);

        return {
            data: data as T[],
            count: totalCount,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
        };
    }
}
