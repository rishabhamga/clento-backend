# Temporal Setup Guide for Clento Backend

This guide explains how to set up and configure Temporal for LinkedIn outreach automation in the Clento backend.

## 🚀 Quick Start

### 1. Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Temporal Configuration (Development)
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_WORKER_ENABLED=true

# Temporal Cloud Configuration (Production)
TEMPORAL_CLOUD_ENABLED=false
# TEMPORAL_ADDRESS=your-namespace.tmprl.cloud:7233
# TEMPORAL_NAMESPACE=your-namespace
# TEMPORAL_CLIENT_CERT=base64_encoded_client_cert
# TEMPORAL_CLIENT_KEY=base64_encoded_client_key

# Unipile Configuration (Required)
UNIPILE_DSN=https://your-dsn.unipile.com
UNIPILE_ACCESS_TOKEN=your_unipile_access_token

# Build Configuration
BUILD_ID=dev-build
```

### 2. Local Development Setup

For local development, you need to run Temporal Server:

#### Option A: Using Docker (Recommended)
```bash
# Clone Temporal Docker Compose
git clone https://github.com/temporalio/docker-compose.git temporal-docker
cd temporal-docker

# Start Temporal Server
docker-compose up -d

# Verify it's running
curl http://localhost:8080
```

#### Option B: Using Temporal CLI
```bash
# Install Temporal CLI
brew install temporal

# Start Temporal Server
temporal server start-dev
```

### 3. Production Setup (Temporal Cloud)

For production, use Temporal Cloud:

1. **Sign up for Temporal Cloud**: https://cloud.temporal.io
2. **Create a namespace**: Follow the Temporal Cloud setup guide
3. **Generate client certificates**: Download the client cert and key
4. **Configure environment variables**:
   ```bash
   TEMPORAL_CLOUD_ENABLED=true
   TEMPORAL_ADDRESS=your-namespace.tmprl.cloud:7233
   TEMPORAL_NAMESPACE=your-namespace
   TEMPORAL_CLIENT_CERT=base64_encoded_client_cert
   TEMPORAL_CLIENT_KEY=base64_encoded_client_key
   ```

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLENTO TEMPORAL SETUP                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Frontend Dashboard                                             │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │   Backend API   │────│  Temporal       │                    │
│  │   (Express)     │    │  Client         │                    │
│  └─────────────────┘    └─────────────────┘                    │
│         │                         │                            │
│         │                         │                            │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │   Temporal      │────│  Temporal       │                    │
│  │   Worker        │    │  Server/Cloud   │                    │
│  └─────────────────┘    └─────────────────┘                    │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │   Unipile SDK   │────│   LinkedIn      │                    │
│  │   Activities    │    │   API           │                    │
│  └─────────────────┘    └─────────────────┘                    │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐                                           │
│  │   Supabase      │                                           │
│  │   Database      │                                           │
│  └─────────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 📋 Database Schema Updates

The Temporal implementation uses the existing `campaign_executions` table. Ensure your database has this table:

```sql
CREATE TABLE public.campaign_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid,
  lead_id uuid,
  workflow_execution_id text,
  status character varying DEFAULT 'pending'::character varying,
  current_step integer DEFAULT 0,
  total_steps integer NOT NULL,
  execution_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  CONSTRAINT campaign_executions_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_executions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id),
  CONSTRAINT campaign_executions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id)
);
```

## 🔧 Configuration Options

### Worker Configuration

The worker can be configured via environment variables:

```bash
# Enable/disable worker
TEMPORAL_WORKER_ENABLED=true

# Worker performance tuning (optional)
TEMPORAL_MAX_CONCURRENT_ACTIVITIES=100
TEMPORAL_MAX_CONCURRENT_WORKFLOWS=50
TEMPORAL_MAX_ACTIVITIES_PER_SECOND=200
```

### Rate Limiting Configuration

LinkedIn API rate limits are automatically configured:

- **Profile Visits**: 100 per hour per account
- **Invitations**: 20 per hour per account  
- **Messages**: 50 per hour per account
- **Post Comments**: 30 per hour per account
- **Post Reactions**: 100 per hour per account

## 🚦 API Endpoints

### Start Campaign
```bash
POST /api/campaigns/start
{
  "campaignId": "uuid",
  "organizationId": "uuid",
  "maxConcurrentLeads": 100,
  "leadProcessingDelay": 30
}
```

### Get Campaign Status
```bash
GET /api/campaigns/status?campaignId=uuid
```

### Pause Campaign
```bash
POST /api/campaigns/pause
{
  "campaignId": "uuid",
  "reason": "Manual pause"
}
```

### Resume Campaign
```bash
POST /api/campaigns/resume
{
  "campaignId": "uuid"
}
```

### Stop Campaign
```bash
POST /api/campaigns/stop
{
  "campaignId": "uuid",
  "reason": "Manual stop",
  "completeCurrentExecutions": true
}
```

## 🔍 Monitoring & Debugging

### Temporal Web UI

Access the Temporal Web UI to monitor workflows:

- **Local Development**: http://localhost:8080
- **Temporal Cloud**: https://cloud.temporal.io

### Logs

The application logs all Temporal operations:

```bash
# View logs
npm run dev

# Filter Temporal logs
npm run dev | grep "Temporal"
```

### Health Checks

Check if Temporal is properly configured:

```bash
# Test Temporal connection
curl -X POST http://localhost:3001/api/campaigns/status \
  -H "Content-Type: application/json" \
  -d '{"campaignId": "test"}'
```

## 🛠️ Development Workflow

### 1. Start Development Environment

```bash
# Start Temporal Server (if using Docker)
cd temporal-docker && docker-compose up -d

# Start backend with Temporal worker
TEMPORAL_WORKER_ENABLED=true npm run dev
```

### 2. Test Workflow Execution

```bash
# Create a test campaign and start it
curl -X POST http://localhost:3001/api/campaigns/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_token" \
  -d '{
    "campaignId": "your-campaign-id",
    "organizationId": "your-org-id"
  }'
```

### 3. Monitor Execution

- Check Temporal Web UI: http://localhost:8080
- View application logs
- Check database for execution records

## 🚨 Troubleshooting

### Common Issues

1. **"Temporal client not initialized"**
   - Check environment variables
   - Ensure Temporal Server is running
   - Verify network connectivity

2. **"Failed to connect to Temporal Server"**
   - Check `TEMPORAL_ADDRESS` configuration
   - Verify Temporal Server is accessible
   - Check firewall settings

3. **"Rate limit exceeded"**
   - Check Unipile account limits
   - Verify rate limiting configuration
   - Consider reducing concurrent executions

4. **"Activity timeout"**
   - Check LinkedIn API response times
   - Increase activity timeout settings
   - Verify Unipile credentials

### Debug Mode

Enable debug logging:

```bash
DEBUG=temporal:* npm run dev
```

## 📚 Additional Resources

- [Temporal Documentation](https://docs.temporal.io/)
- [Temporal TypeScript SDK](https://typescript.temporal.io/)
- [Unipile API Documentation](https://developer.unipile.com/)
- [LinkedIn API Rate Limits](https://docs.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits)

## 🔒 Security Considerations

1. **Credentials Management**
   - Store Temporal certificates securely
   - Use environment variables for sensitive data
   - Rotate API keys regularly

2. **Network Security**
   - Use TLS for Temporal Cloud connections
   - Implement proper firewall rules
   - Monitor API access logs

3. **Data Protection**
   - Encrypt sensitive workflow data
   - Implement proper access controls
   - Follow GDPR compliance requirements

## 🎯 Next Steps

1. **Test the Setup**: Follow the development workflow to test your setup
2. **Configure Production**: Set up Temporal Cloud for production use
3. **Monitor Performance**: Use Temporal Web UI to monitor workflow performance
4. **Scale as Needed**: Adjust worker configuration based on load requirements

For additional support, refer to the main project documentation or contact the development team.
