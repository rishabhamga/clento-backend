# Unipile Setup Instructions

## 🚨 Current Issues & Solutions

Based on your logs, here are the issues and how to fix them:

### 1. Environment Variables Setup

Create a `.env` file in the `clento-backend/` directory with:

```bash
# Unipile Configuration (REQUIRED)
UNIPILE_API_URL=https://api16.unipile.com:14683
UNIPILE_API_KEY=your_actual_unipile_api_key_here

# Other required variables
NODE_ENV=development
PORT=3001
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
# ... other variables
```

### 2. Webhook URL Issue (CRITICAL)

❌ **Problem**: You're using `http://localhost:3000/api/accounts/webhook`
✅ **Solution**: Unipile can't reach localhost URLs. You need a public URL.

#### Option A: Use ngrok (Recommended for development)

1. Install ngrok: `npm install -g ngrok` or download from https://ngrok.com/
2. Run your frontend: `cd clento-frontend && npm run dev` (port 3000)
3. In another terminal: `ngrok http 3000`
4. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)
5. Update your frontend to use this URL for webhook notifications

#### Option B: Deploy to a staging environment

Deploy your frontend to Vercel, Netlify, or similar service.

### 3. Testing Your Setup

Run the test script to verify your Unipile configuration:

```bash
cd clento-backend
node test-unipile-config.js
```

This will:
- ✅ Check if your API key is set
- ✅ Test authentication with Unipile
- ✅ Verify the API is working
- ❌ Show specific error messages if something is wrong

### 4. Updated Frontend URLs

Once you have ngrok running, update your frontend to use the ngrok URL:

```javascript
// In your frontend connection request
{
  "provider": "linkedin",
  "success_redirect_url": "https://your-ngrok-url.ngrok.io/accounts?connected=true",
  "failure_redirect_url": "https://your-ngrok-url.ngrok.io/accounts?error=connection_failed", 
  "notify_url": "https://your-ngrok-url.ngrok.io/api/accounts/webhook"
}
```

### 5. Common Unipile Errors

- **Empty error message**: Usually authentication failure (wrong API key)
- **401 Unauthorized**: Invalid API key
- **403 Forbidden**: API key doesn't have required permissions
- **Timeout**: Network issues or wrong API URL

### 6. Verification Steps

1. ✅ Create `.env` file with correct UNIPILE_API_KEY
2. ✅ Run `node test-unipile-config.js` - should pass
3. ✅ Set up ngrok for public webhook URL
4. ✅ Update frontend to use ngrok URLs
5. ✅ Test account connection flow

### 7. Next Steps

After fixing the environment setup:

1. Restart your backend server
2. Check the logs show "Unipile client initialized successfully"
3. Try connecting a LinkedIn account again
4. The logs should show detailed error information if there are still issues

## 📞 Need Help?

If you're still getting errors after following these steps:

1. Share the output of `node test-unipile-config.js`
2. Share your ngrok URL setup
3. Share the new error logs after implementing these fixes
