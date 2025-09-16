import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Define environment variable schema
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(val => parseInt(val, 10)).default('3003'),

  // Supabase (optional for development)
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),

  // Clerk Authentication (optional for development)
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),

  // Unipile Integration
  UNIPILE_API_URL: z.string().default('https://api.unipile.com/v1'),
  UNIPILE_API_KEY: z.string().optional(),

  // Google Cloud Storage (optional for development)
  GCS_PROJECT_ID: z.string().optional(),
  GCS_KEY_FILE: z.string().optional(),
  GCS_BUCKET_NAME: z.string().default('clento-lead-lists'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
});

// Parse and validate environment variables
const env = envSchema.safeParse(process.env);

if (!env.success) {
  console.error('❌ Invalid environment variables:', env.error.format());
  process.exit(1);
}

export default env.data;