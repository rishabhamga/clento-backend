# Environment Setup Guide

## Required Environment Variables

Create a `.env` file in the `clento-backend` directory with the following variables:

### Server Configuration
```
NODE_ENV=development
PORT=3004
```

### Supabase Configuration
```
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### Clerk Authentication
```
CLERK_SECRET_KEY=your_clerk_secret_key_here
CLERK_WEBHOOK_SECRET=your_clerk_webhook_secret_here
```

### Unipile Integration
```
UNIPILE_API_URL=https://api.unipile.com/v1
UNIPILE_API_KEY=your_unipile_api_key_here
```

### Google Cloud Storage
```
GCS_PROJECT_ID=your_gcs_project_id_here
GCS_KEY_FILE=path/to/your/service-account-key.json
GCS_BUCKET_NAME=clento-lead-lists
```

### CORS
```
CORS_ORIGIN=http://localhost:3000,http://localhost:3001,http://localhost:3004
```

### Logging
```
LOG_LEVEL=info
```

## Notes

- **Unipile Integration**: The system will use mock data if `UNIPILE_API_KEY` is not provided
- **Google Cloud Storage**: The system will use mock storage if GCS credentials are not provided
- **Development Mode**: Most services will work in mock mode for development without requiring actual API keys
- **Port Configuration**: Make sure the frontend is configured to call the backend on the correct port (3004)

## Frontend Configuration

The frontend should be configured to call the backend API at:
```
http://localhost:3004/api
```

This is already configured in `clento-frontend/src/config/site.ts`.
