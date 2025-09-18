# Clerk Webhook Configuration Guide

## Overview
This guide explains how to configure Clerk webhooks to automatically sync users and organizations with your Clento backend database.

## Webhook Events Supported

### User Events
- **`user.created`** - Creates a new user in the database when they sign up
- **`user.updated`** - Updates user information when profile changes
- **`user.deleted`** - Logs user deletion (preserves data integrity)

### Organization Events
- **`organization.created`** - Creates organization and adds creator as owner
- **`organization.updated`** - Updates organization details
- **`organization.deleted`** - Logs organization deletion

### Membership Events
- **`organizationMembership.created`** - Adds user to organization
- **`organizationMembership.updated`** - Updates user role in organization
- **`organizationMembership.deleted`** - Removes user from organization

### Session Events
- **`session.created`** - Logs user login sessions

## Setup Instructions

### 1. Configure Webhook in Clerk Dashboard

1. Go to your Clerk Dashboard
2. Navigate to **Webhooks** section
3. Click **Add Endpoint**
4. Set the webhook URL: `https://your-domain.com/api/webhooks/clerk`
5. Select the following events:
   ```
   ✅ user.created
   ✅ user.updated
   ✅ user.deleted
   ✅ organization.created
   ✅ organization.updated
   ✅ organization.deleted
   ✅ organizationMembership.created
   ✅ organizationMembership.updated
   ✅ organizationMembership.deleted
   ✅ session.created
   ```
6. Copy the **Signing Secret** and add it to your `.env` file

### 2. Environment Variables

Add these to your `.env` file:

```env
# Clerk Webhook Configuration
CLERK_WEBHOOK_SECRET=whsec_your_webhook_secret_here
CLERK_SECRET_KEY=your_clerk_secret_key

# Database (Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Test Webhook Configuration

Run the webhook test script:

```bash
# Start your server
npm run dev

# In another terminal, run the test
node test-webhooks.js
```

## Webhook Data Flow

### User Creation Flow
1. User signs up in frontend → Clerk
2. Clerk sends `user.created` webhook → Your backend
3. Backend creates user record in database
4. User can now authenticate and access protected routes

### Organization Creation Flow
1. User creates organization in frontend → Clerk
2. Clerk sends `organization.created` webhook → Your backend
3. Backend creates organization record
4. Backend adds creator as organization owner
5. Organization is available for user management

### Membership Flow
1. User is added to organization → Clerk
2. Clerk sends `organizationMembership.created` webhook → Your backend
3. Backend adds user to organization with specified role
4. User can now access organization resources

## Database Schema Requirements

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR NOT NULL UNIQUE, -- Clerk user ID
  email VARCHAR NOT NULL,
  full_name VARCHAR,
  avatar_url VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Organizations Table
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR NOT NULL UNIQUE, -- Clerk organization ID
  name VARCHAR NOT NULL,
  slug VARCHAR UNIQUE,
  plan VARCHAR DEFAULT 'free',
  timezone VARCHAR DEFAULT 'UTC',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Organization Members Table
```sql
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR DEFAULT 'member',
  status VARCHAR DEFAULT 'active',
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);
```

## Manual Sync Endpoints

If you need to manually sync data, use these endpoints:

### Sync User from Clerk
```bash
POST /api/users/sync-from-clerk
Authorization: Bearer <clerk_token>
Content-Type: application/json

{
  "clerkUserId": "user_123456789"
}
```

### Sync Organization (via webhook simulation)
```bash
POST /api/webhooks/clerk
Content-Type: application/json

{
  "type": "organization.created",
  "data": {
    "id": "org_123456789",
    "name": "My Organization",
    "created_by": "user_123456789"
  }
}
```

## Troubleshooting

### Common Issues

1. **Webhook not received**
   - Check webhook URL is correct and accessible
   - Verify webhook secret is set correctly
   - Check server logs for errors

2. **User not created**
   - Verify `user.created` event is enabled
   - Check database connection
   - Look for validation errors in logs

3. **Organization not created**
   - Verify `organization.created` event is enabled
   - Check if creator user exists in database
   - Verify organization table schema

4. **Membership not working**
   - Verify `organizationMembership.created` event is enabled
   - Check if both user and organization exist
   - Verify organization_members table schema

### Debug Mode

Enable detailed logging:

```env
LOG_LEVEL=debug
```

### Testing Webhooks Locally

Use ngrok or similar tool to expose your local server:

```bash
# Install ngrok
npm install -g ngrok

# Start your server
npm run dev

# In another terminal, expose port 3003
ngrok http 3003

# Use the ngrok URL in Clerk webhook configuration
# Example: https://abc123.ngrok.io/api/webhooks/clerk
```

## Security Considerations

1. **Webhook Verification**: All webhooks are verified using Svix signatures
2. **Rate Limiting**: Consider implementing rate limiting for webhook endpoints
3. **Error Handling**: Failed webhooks are logged but don't crash the server
4. **Data Validation**: All webhook data is validated before processing

## Monitoring

Monitor webhook health:

1. Check server logs for webhook processing
2. Monitor database for user/organization creation
3. Set up alerts for webhook failures
4. Track webhook processing times

## Production Checklist

- [ ] Webhook URL is HTTPS and accessible
- [ ] All required events are enabled in Clerk
- [ ] Webhook secret is properly configured
- [ ] Database schema matches requirements
- [ ] Error handling is in place
- [ ] Logging is configured
- [ ] Monitoring is set up
- [ ] Rate limiting is implemented (optional)
