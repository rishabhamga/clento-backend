# Clerk Authentication Setup Guide

## Overview
Your Clento backend is now fully configured with Clerk authentication. This guide explains how to use and test the authentication system.

## What's Already Set Up

### 1. Authentication Middleware
- **Location**: `src/middleware/auth.ts`
- **Features**:
  - Clerk JWT token verification
  - User loading from database
  - Organization context loading
  - Role-based access control
  - Development mode fallback

### 2. Webhook Handling
- **Location**: `src/controllers/ClerkWebhookController.ts`
- **Events Handled**:
  - `user.created` - Creates user in database
  - `user.updated` - Updates user information
  - `user.deleted` - Logs deletion (preserves data integrity)
  - `organization.created` - Creates organization and adds creator as owner
  - `organization.updated` - Updates organization details
  - `organizationMembership.created` - Adds user to organization

### 3. User Management
- **Location**: `src/controllers/UserController.ts`
- **Endpoints**:
  - `GET /api/users/me` - Get current user profile
  - `POST /api/users/sync` - Sync user from Clerk
  - `PATCH /api/users/me` - Update user profile

### 4. Organization Management
- **Location**: `src/controllers/OrganizationController.ts`
- **Features**:
  - Full CRUD operations
  - Member management
  - Usage statistics
  - Role-based permissions

## Environment Variables Required

Make sure these are set in your `.env` file:

```env
# Clerk Authentication
CLERK_SECRET_KEY=your_clerk_secret_key
CLERK_WEBHOOK_SECRET=your_webhook_secret

# Supabase (for database)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
```

## Testing the Setup

### 1. Start the Server
```bash
npm run dev
```

### 2. Run the Test Script
```bash
node test-auth.js
```

### 3. Test with Frontend
1. Set up Clerk in your frontend app
2. Configure the webhook URL: `https://your-domain.com/api/webhooks/clerk`
3. Enable these webhook events in Clerk dashboard:
   - `user.created`
   - `user.updated`
   - `user.deleted`
   - `organization.created`
   - `organization.updated`
   - `organizationMembership.created`

## API Usage Examples

### Get Current User
```javascript
// Frontend request with Clerk token
const response = await fetch('/api/users/me', {
  headers: {
    'Authorization': `Bearer ${clerkToken}`
  }
});
```

### Create Organization
```javascript
const response = await fetch('/api/organizations', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${clerkToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'My Company',
    industry: 'Technology'
  })
});
```

### Get User's Organizations
```javascript
const response = await fetch('/api/organizations', {
  headers: {
    'Authorization': `Bearer ${clerkToken}`
  }
});
```

## Database Schema

The system expects these tables with the following key fields:

### Users Table
- `id` (UUID, primary key)
- `external_id` (string, Clerk user ID)
- `email` (string)
- `full_name` (string, nullable)
- `avatar_url` (string, nullable)
- `created_at`, `updated_at`

### Organizations Table
- `id` (UUID, primary key)
- `external_id` (string, Clerk organization ID)
- `name` (string)
- `slug` (string, unique)
- `plan` (string, default: 'free')
- `timezone` (string, default: 'UTC')
- `created_at`, `updated_at`

### Organization Members Table
- `id` (UUID, primary key)
- `organization_id` (UUID, foreign key)
- `user_id` (UUID, foreign key)
- `role` (string: 'owner', 'admin', 'member', 'viewer')
- `status` (string: 'active', 'inactive', 'pending')
- `joined_at` (timestamp)

## Security Features

1. **JWT Verification**: All protected routes verify Clerk JWT tokens
2. **Role-Based Access**: Different permission levels for organization members
3. **Organization Context**: Users can only access their organization's data
4. **Webhook Security**: Webhook signatures are verified using Svix
5. **Input Validation**: All requests are validated using Zod schemas

## Development Mode

When `CLERK_SECRET_KEY` is not set, the system runs in development mode with:
- Mock authentication (no real Clerk verification)
- Default user and organization IDs
- All requests are treated as authenticated

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: Check if Clerk token is valid and properly formatted
2. **User not found**: Ensure webhook events are properly configured
3. **Organization not found**: Check if user is a member of the organization
4. **Webhook failures**: Verify webhook secret and endpoint URL

### Debug Mode

Enable debug logging by setting:
```env
LOG_LEVEL=debug
```

## Next Steps

1. Configure your frontend to use Clerk authentication
2. Set up webhook endpoints in Clerk dashboard
3. Test user registration and organization creation
4. Implement role-based UI based on user permissions
5. Set up proper error handling in your frontend

## Support

If you encounter issues:
1. Check the logs for detailed error messages
2. Verify environment variables are set correctly
3. Test webhook endpoints manually
4. Ensure database schema matches expected structure
