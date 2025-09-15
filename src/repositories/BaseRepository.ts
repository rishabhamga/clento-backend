import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';
import { NotFoundError } from '../errors/AppError';
import { Database } from '../types/database';

/**
 * Base repository class for Supabase operations
 * Provides common CRUD operations for a specific table
 */
export abstract class BaseRepository<T, InsertT, UpdateT> {
  protected client: SupabaseClient<Database>;
  protected tableName: string;

  constructor(tableName: string, client?: SupabaseClient<Database>) {
    this.tableName = tableName;
    this.client = client || supabaseAdmin!;
  }

  /**
   * Find a record by ID
   */
  async findById(id: string): Promise<T> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new NotFoundError(`${this.tableName} with ID ${id} not found`);
    }

    return data as T;
  }

  /**
   * Find records by a specific field value
   */
  async findByField(field: string, value: any): Promise<T[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq(field, value);

    if (error) {
      throw error;
    }

    return data as T[];
  }

  /**
   * Find a single record by a specific field value
   */
  async findOneByField(field: string, value: any): Promise<T | null> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq(field, value)
      .single();

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
   * Create a new record
   */
  async create(data: InsertT): Promise<T> {
    const { data: result, error } = await (this.client as any)
      .from(this.tableName)
      .insert(data)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return result as T;
  }

  /**
   * Update an existing record
   */
  async update(id: string, data: UpdateT): Promise<T> {
    const { data: result, error } = await (this.client as any)
      .from(this.tableName)
      .update(data)
      .eq('id', id)
      .select()
      .single();

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
  async delete(id: string): Promise<void> {
    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .eq('id', id);

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
    const { count, error: countError } = await this.client
      .from(this.tableName)
      .select('*', { count: 'exact', head: true });

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
}
