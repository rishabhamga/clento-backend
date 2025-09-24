# Express Extensions Usage Guide

## Overview
The Express Extensions utility provides enhanced parameter validation and response methods for the Clento backend API.

## ✅ Status: Working
- ✅ Express extensions are properly loaded
- ✅ `sendOKResponse` and other response methods working
- ✅ Parameter validation working
- ✅ No more "sendOKResponse is not a function" errors

## Testing the Campaign Create Endpoint

### Endpoint
```
POST /api/campaigns/create
```

### Sample Request Body
```json
{
  "name": "Test Campaign",
  "description": "A test campaign using express extensions",
  "leadListId": "some-lead-list-id",
  "settings": {
    "emailTemplate": "default",
    "maxRecipients": 1000
  },
  "scheduledAt": "2025-01-01T10:00:00Z"
}
```

### Minimal Request (only required fields)
```json
{
  "name": "Minimal Campaign",
  "leadListId": "test-lead-list-id"
}
```

## Express Extensions Features

### 1. Request Parameter Validation
```typescript
const body = req.getBody();

// String validation
const name = body.getParamAsString('name', true); // required
const description = body.getParamAsString('description', false); // optional

// Number validation
const age = body.getParamAsNumber('age', true);

// Boolean validation
const isActive = body.getParamAsBoolean('isActive', true);

// Date validation
const scheduledAt = body.getParamAsDate('scheduledAt', false);

// UUID validation (when needed)
const userId = body.getParamAsUUID('userId', true);

// Email validation
const email = body.getParamAsEmail('email', true);
```

### 2. Nested Object Validation
```typescript
// Nested object
const settings = body.getParamAsNestedBody('settings', false);
if (settings) {
  const emailTemplate = settings.getParamAsString('emailTemplate', true);
  const maxRecipients = settings.getParamAsNumber('maxRecipients', false);
}

// Array of nested objects
const recipients = body.getParamAsArrayOfNestedBodies('recipients', false);
```

### 3. Enhanced Response Methods
```typescript
// Success response (200)
res.sendOKResponse({
  success: true,
  data: result,
  message: 'Operation successful'
});

// Created response (201)
res.sendCreatedResponse(newResource);

// No content response (204)
res.sendNoContentResponse();

// Error response (custom status)
res.sendErrorResponse(400, 'Bad request', { details: 'Invalid input' });

// Validation error (422)
res.sendValidationError('Required field missing');
```

### 4. Request Information
```typescript
const ipAddress = req.getIPAddress(); // Gets real IP address
const query = req.getQuery(); // Validated query parameters
const pathParams = req.getPathParams(); // Validated path parameters
```

## Error Handling
The extensions automatically throw `ValidationError` for invalid parameters:
- Invalid email format
- Invalid UUID format
- Invalid date format
- Missing required parameters
- Wrong parameter types

## Integration
The extensions are automatically loaded in `src/index.ts` and available in all routes. Just import the extensions in your route files:

```typescript
import '../../utils/expressExtensions';
```

## Current Implementation Status
- ✅ All route files using `sendOKResponse` are working
- ✅ Parameter validation working in campaign routes
- ✅ No TypeScript linting errors
- ✅ Compatible with existing ClentoAPI pattern
- ✅ Proper error handling and validation
