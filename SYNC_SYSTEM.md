# Clento Sync System Documentation

## Overview

The Clento sync system provides comprehensive data synchronization between Clerk and your database. It includes both webhook-based real-time sync and manual sync capabilities for handling edge cases and ensuring data consistency.

## 🆕 Enhanced Organization Sync Features

The sync system has been enhanced to automatically sync organizations and their relationships with users:

### Key Enhancements:
- **Automatic Organization Sync**: When users are synced, their organizations are automatically synced too
- **Membership Tracking**: User-organization relationships with roles are properly tracked
- **Bulk Organization Sync**: New endpoint to sync all members of an organization
- **Comprehensive Webhook Handling**: User webhooks now trigger full sync including organizations
- **Enhanced Data Integrity**: Ensures users and their organizational context are always in sync

### What Gets Synced:
- ✅ User profiles and authentication data
- ✅ Organizations the user belongs to
- ✅ User roles within each organization
- ✅ Organization metadata and settings
- ✅ Membership status and permissions

## Architecture

### Core Components

1. **SyncService** - Main service handling all sync operations
2. **ClerkApiService** - Service for interacting with Clerk API
3. **ClerkWebhookService** - Enhanced webhook handler using SyncService
4. **SyncController** - API endpoints for manual sync operations
5. **Enhanced Auth Middleware** - Automatic sync on user login

### Sync Mechanisms

#### 1. Webhook-Based Sync (Real-time)

**Webhook Events Handled:**
- `user.created` - Create new user record and sync all their organizations
- `user.updated` - Update existing user data and sync all their organizations
- `user.deleted` - Log deletion event (soft delete)
- `organization.created` - Create organization and admin membership
- `organization.updated` - Update organization details
- `organization.deleted` - Log deletion event (soft delete)
- `organizationMembership.created` - Add user to organization
- `organizationMembership.updated` - Update user role in organization
- `organizationMembership.deleted` - Remove user from organization

**Implementation:**
- Verifies webhook signatures using Clerk's webhook secret
- Maps Clerk user/org IDs to database records
- Handles organization creation with proper admin role assignment
- Comprehensive error handling and logging

#### 2. Manual Sync Functions

**Core Functions:**
- `syncUserToDatabase(clerkUserId)` - Sync user by Clerk ID
- `getOrCreateUserByClerkId(clerkUserId)` - API-friendly version with fallback
- `syncOrganizationToDatabase(clerkOrgId)` - Sync organization by Clerk ID
- `syncOrganizationMembership(clerkOrgId, clerkUserId, role)` - Sync membership
- `syncUserOrganizations(clerkUserId)` - Sync all user's organizations
- `fullUserSync(clerkUserId)` - Complete sync (user + orgs + memberships)

**Features:**
- Handles race conditions with duplicate key errors
- Creates temporary user data if Clerk API unavailable
- Includes verification steps for data integrity
- Comprehensive error handling and fallback mechanisms

#### 3. Authentication Middleware Integration

**Enhanced Middleware:**
- `loadUser` - Now includes automatic user sync on login
- `loadOrganization` - Includes automatic organization sync when needed
- Fallback mechanisms for development and error scenarios

**Process:**
1. Verify Clerk authentication
2. Sync user to database (create/update as needed)
3. Load organization context with sync if needed
4. Validate permissions and access control

## API Endpoints

### Manual Sync Endpoints

All endpoints require authentication and are prefixed with `/api/sync/`

#### User Sync
- `POST /api/sync/user` - Sync current user and organizations (full sync)
- `POST /api/sync/user/:clerkUserId` - Sync user and organizations by Clerk ID (admin only)
- `POST /api/sync/user/organizations` - Sync current user and organizations (full sync)
- `POST /api/sync/user/full` - Full sync for current user (same as above endpoints)

#### Organization Sync
- `POST /api/sync/organization/:clerkOrgId` - Sync organization by Clerk ID
- `POST /api/sync/organization/:clerkOrgId/members` - Sync all organization members

#### Membership Sync
- `POST /api/sync/membership` - Sync organization membership
  ```json
  {
    "clerkOrgId": "org_xxx",
    "clerkUserId": "user_xxx",
    "role": "member"
  }
  ```

#### Status Check
- `GET /api/sync/status` - Get sync status for current user

### Webhook Endpoints

- `POST /api/webhooks/clerk` - Clerk webhook endpoint

## Usage Examples

### 1. Automatic Sync on Login

The system automatically syncs users when they authenticate:

```typescript
// This happens automatically in the auth middleware
app.use('/api/protected', requireAuth, loadUser, loadOrganization);
```

### 2. Manual User Sync

```typescript
// Sync current user and organizations (all endpoints now do full sync)
const response = await fetch('/api/sync/user', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer <token>' }
});

// Alternative: Full sync with organizations (same as above)
const response = await fetch('/api/sync/user/full', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer <token>' }
});

// Sync user organizations (also does full sync now)
const response = await fetch('/api/sync/user/organizations', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer <token>' }
});

// Sync specific organization members
const response = await fetch('/api/sync/organization/org_123/members', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer <token>' }
});
```

### 3. Programmatic Sync

```typescript
import { SyncService } from './services/SyncService';

const syncService = new SyncService();

// Sync user
const user = await syncService.syncUserToDatabase('clerk_user_id');

// Sync organization
const org = await syncService.syncOrganizationToDatabase('clerk_org_id');

// Full sync
const result = await syncService.fullUserSync('clerk_user_id');
```

## Development vs Production

### Development Mode
- Uses mock data when Clerk API is unavailable
- Skips webhook verification for localhost testing
- Provides fallback mechanisms for testing

### Production Mode
- Full Clerk API integration
- Webhook signature verification
- Comprehensive error handling and logging

## Error Handling

### Sync Errors
- **User not found in Clerk** - Creates temporary user with fallback data
- **Organization not found** - Logs warning and continues
- **API rate limits** - Implements retry logic with exponential backoff
- **Database errors** - Comprehensive error logging and graceful degradation

### Fallback Mechanisms
1. **Primary**: Fetch from Clerk API and sync to database
2. **Secondary**: Use existing database records if available
3. **Tertiary**: Create temporary records with minimal data

## Monitoring and Logging

### Log Levels
- **INFO**: Successful sync operations
- **WARN**: Non-critical issues (missing data, fallbacks)
- **ERROR**: Critical failures requiring attention

### Key Metrics
- Sync success/failure rates
- API response times
- Database operation performance
- Webhook processing times

## Configuration

### Environment Variables
```env
CLERK_SECRET_KEY=your_clerk_secret_key
CLERK_WEBHOOK_SECRET=your_webhook_secret
```

### Webhook Configuration
Configure these events in your Clerk dashboard:
- User events: `user.created`, `user.updated`, `user.deleted`
- Organization events: `organization.created`, `organization.updated`, `organization.deleted`
- Membership events: `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`

## Testing

### Local Development
1. Use ngrok for webhook testing: `ngrok http 3000`
2. Configure Clerk webhooks to point to your ngrok URL
3. Use manual sync endpoints for testing edge cases

### Manual Testing
```bash
# Test user sync
curl -X POST http://localhost:3000/api/sync/user \
  -H "Authorization: Bearer <token>"

# Test full sync
curl -X POST http://localhost:3000/api/sync/user/full \
  -H "Authorization: Bearer <token>"

# Check sync status
curl -X GET http://localhost:3000/api/sync/status \
  -H "Authorization: Bearer <token>"
```

## Best Practices

1. **Always use the SyncService** for sync operations instead of direct repository calls
2. **Handle errors gracefully** - the system provides multiple fallback mechanisms
3. **Monitor sync status** - use the status endpoint to check sync health
4. **Test webhook endpoints** - ensure they're working in your environment
5. **Use manual sync** for edge cases and data recovery

## Troubleshooting

### Common Issues

1. **User not syncing**
   - Check Clerk API credentials
   - Verify webhook configuration
   - Use manual sync endpoints for testing

2. **Organization sync failing**
   - Ensure user exists before syncing organization
   - Check organization permissions in Clerk

3. **Webhook not receiving events**
   - Verify webhook URL is accessible
   - Check webhook secret configuration
   - Test with manual sync first

### Debug Steps

1. Check application logs for sync errors
2. Use sync status endpoint to verify current state
3. Test with manual sync endpoints
4. Verify Clerk API connectivity
5. Check database connection and permissions
