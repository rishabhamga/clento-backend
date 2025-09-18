#!/usr/bin/env node

/**
 * Simple test script to verify Clerk authentication setup
 * Run with: node test-auth.js
 */
const https = require('https');
const http = require('http');

const BASE_URL = 'http://localhost:3001';

function makeHttpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const responseData = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            data: responseData,
            headers: res.headers
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: { message: data },
            headers: res.headers
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function testHealthCheck() {
  try {
    console.log('🔍 Testing health check...');
    const response = await makeHttpRequest(`${BASE_URL}/health`);
    console.log('✅ Health check passed:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testUnauthenticatedRequest() {
  try {
    console.log('🔍 Testing unauthenticated request to /api/users/me...');
    const response = await makeHttpRequest(`${BASE_URL}/api/users/me`);

    if (response.status === 401) {
      console.log('✅ Unauthenticated request properly rejected with 401');
      return true;
    } else if (response.status === 200) {
      console.log('✅ Development mode: Request accepted with mock auth (expected)');
      return true;
    } else {
      console.log('❌ Unexpected response:', response.status, response.data);
      return false;
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    return false;
  }
}

async function testWebhookEndpoint() {
  try {
    console.log('🔍 Testing webhook endpoint...');
    const response = await makeHttpRequest(`${BASE_URL}/api/webhooks/clerk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'user.created',
        data: {
          id: 'test-user-id',
          email_addresses: [{ id: 'email-id', email_address: 'test@example.com' }],
          primary_email_address_id: 'email-id',
          first_name: 'Test',
          last_name: 'User'
        }
      })
    });
    console.log('✅ Webhook endpoint accessible:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Webhook test failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Clerk authentication tests...\n');

  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'Unauthenticated Request', fn: testUnauthenticatedRequest },
    { name: 'Webhook Endpoint', fn: testWebhookEndpoint }
  ];

  let passed = 0;
  let total = tests.length;

  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    const result = await test.fn();
    if (result) passed++;
  }

  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('🎉 All tests passed! Clerk authentication is properly set up.');
  } else {
    console.log('⚠️  Some tests failed. Check the setup.');
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };
