import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../config/supabase';
import env from '../config/env';
import logger from '../utils/logger';

/**
 * Database migration script
 */
async function runMigrations() {
  logger.info('Starting database migration...');
  
  try {
    // Read schema file
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema using Supabase
    const { error: schemaError } = await supabaseAdmin.sql(schemaSQL);
    
    if (schemaError) {
      throw schemaError;
    }
    
    logger.info('✅ Schema migration completed successfully');
    
    // Check for migration files
    const migrationsDir = path.join(__dirname, '../../database/migrations');
    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort(); // Ensure migrations run in order
      
      // Execute each migration file
      for (const migrationFile of migrationFiles) {
        const migrationPath = path.join(migrationsDir, migrationFile);
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        logger.info(`Running migration: ${migrationFile}`);
        const { error: migrationError } = await supabaseAdmin.sql(migrationSQL);
        
        if (migrationError) {
          throw migrationError;
        }
        
        logger.info(`✅ Migration ${migrationFile} completed`);
      }
    }
    
    logger.info('✅ All migrations completed successfully');
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations when script is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(err => {
      logger.error('Migration script error:', err);
      process.exit(1);
    });
}

export default runMigrations;