# Clento Backend Service

Backend service for Clento Clay LinkedIn and email outreach automation platform.

## Architecture

This service follows clean architecture principles with the following structure:

- **Controllers**: Handle HTTP requests and responses
- **Services**: Implement business logic
- **Repositories**: Data access layer
- **DTOs**: Data transfer objects for validation and type safety
- **Models**: Business entities
- **Middleware**: Request processing middleware
- **Utils**: Utility functions
- **Config**: Application configuration

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project
- Clerk account

### Installation

1. Clone the repository
2. Install dependencies:

```bash
cd clento-backend
npm install
```

3. Copy the example environment file and update with your values:

```bash
cp .env.example .env
```

4. Set up the database:

```bash
npm run migrate
```

5. Start the development server:

```bash
npm run dev
```

## API Documentation

The API documentation is available at `/api-docs` when the server is running.

## Database Schema

The database schema is defined in `database/schema.sql` and includes tables for:

- Organizations
- Users
- Organization Members
- Connected Accounts
- Lead Lists
- Leads
- Campaigns
- Campaign Executions
- Activities
- Audit Logs

## Authentication

Authentication is handled by Clerk. The middleware in `src/middleware/auth.ts` provides:

- `requireAuth`: Verifies the JWT token from Clerk
- `loadUser`: Loads the user from the database
- `requireOrganization`: Ensures the request has an organization context
- `verifyOrganizationMembership`: Verifies that the user is a member of the organization
- `requireOrganizationAdmin`: Verifies that the user has admin role in the organization

## Database Access

Database access is handled by Supabase. The repository pattern is used to abstract database access:

- `BaseRepository`: Provides common CRUD operations for all entities
- Entity-specific repositories extend BaseRepository with specialized methods

## Error Handling

The application uses custom error classes defined in `src/errors/AppError.ts` and a global error handler middleware in `src/middleware/errorHandler.ts`.

## Webhooks

The service handles Clerk webhooks for user and organization events:

- User creation and updates
- Organization creation and updates
- Organization membership changes

## Scripts

- `npm run build`: Build the TypeScript code
- `npm run start`: Start the production server
- `npm run dev`: Start the development server with hot reloading
- `npm run lint`: Run ESLint
- `npm run test`: Run tests
- `npm run migrate`: Run database migrations