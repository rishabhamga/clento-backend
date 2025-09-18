#!/bin/bash

# Script to run database migrations
# Make sure you have DATABASE_URL environment variable set

echo "🚀 Running Clerk integration migrations..."

if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    echo "Please set your DATABASE_URL and run again:"
    echo "export DATABASE_URL='your_supabase_connection_string'"
    exit 1
fi

echo "📂 Running migration 1: Clerk integration setup..."
psql "$DATABASE_URL" -f migrations/20250125_001_clerk_integration_setup.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration 1 completed successfully"
else
    echo "❌ Migration 1 failed"
    exit 1
fi

echo "📂 Running migration 2: Add Clerk columns..."
psql "$DATABASE_URL" -f migrations/20250125_002_add_clerk_columns.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration 2 completed successfully"
else
    echo "❌ Migration 2 failed"
    exit 1
fi

echo "🎉 All migrations completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Set up Clerk webhook endpoints in your Clerk dashboard"
echo "2. Configure Supabase JWT template in Clerk"
echo "3. Test user registration and organization creation"
