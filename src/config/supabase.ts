import { createClient } from '@supabase/supabase-js';
import env from './env';
import logger from '../utils/logger';
import { Database } from '../types/database';

// Check if Supabase credentials are available
const hasSupabaseCredentials = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_ANON_KEY;

if (!hasSupabaseCredentials) {
  logger.warn('Supabase credentials not provided - running in mock mode');
}

/**
 * Supabase client with service role (admin access)
 * Use this for server-side operations that require full database access
 */
export const supabaseAdmin = hasSupabaseCredentials
  ? createClient<Database>(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
  : null;

/**
 * Supabase client with anonymous key (limited access)
 * Use this for operations that should respect RLS policies
 */
export const supabaseAnon = hasSupabaseCredentials
  ? createClient<Database>(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!)
  : null;

/**
 * Create a Supabase client with a user's JWT token
 * This allows the client to act on behalf of the authenticated user
 * and respect RLS policies
 */
export const createAuthClient = (jwt: string) => {
  if (!hasSupabaseCredentials) {
    return null;
  }
  return createClient<Database>(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
};

/**
 * Initialize Supabase connection
 */
export const initSupabase = async (): Promise<void> => {
  if (!hasSupabaseCredentials) {
    logger.info('Skipping Supabase initialization - no credentials provided');
    return;
  }

  try {
    // Test connection with a simple query
    const { data, error } = await supabaseAdmin!.from('users').select('id').limit(1);
    
    if (error) {
      // If users table doesn't exist, that's ok for development
      logger.warn('Supabase connection test failed (table may not exist)', error.message);
    } else {
      logger.info('Supabase connection established');
    }
  } catch (error) {
    logger.warn('Supabase connection test failed', error);
    // Don't throw error in development mode
  }
};

export default {
  supabaseAdmin,
  supabaseAnon,
  createAuthClient,
  initSupabase,
};
