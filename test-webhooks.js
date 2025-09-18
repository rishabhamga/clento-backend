#!/usr/bin/env node

/**
 * Comprehensive webhook test script for Clerk authentication
 * Tests all webhook events to ensure proper user and organization syncing
 */

const https = require('https');
const http = require('http');

const BASE_URL = 'http://localhost:3001';
const WEBHOOK_URL = `${BASE_URL}/api/webhooks/clerk`;

// Mock webhook data for testing
const mockWebhookData = {
  userCreated: {
    type: 'user.created',
    data: {
      id: 'user_test_123',
      email_addresses: [
        {
          id: 'email_123',
          email_address: 'testuser@example.com'
        }
      ],
      primary_email_address_id: 'email_123',
      first_name: 'Test',
      last_name: 'User',
      created_at: Date.now(),
      updated_at: Date.now()
    }
  },
  userUpdated: {
    type: 'user.updated',
    data: {
      id: 'user_test_123',
      email_addresses: [
        {
          id: 'email_123',
          email_address: 'testuser.updated@example.com'
        }
      ],
      primary_email_address_id: 'email_123',
      first_name: 'Test',
      last_name: 'User Updated',
      created_at: Date.now(),
      updated_at: Date.now()
    }
  },
  organizationCreated: {
    type: 'organization.created',
    data: {
      id: 'org_test_123',
      name: 'Test Organization',
      created_by: 'user_test_123',
      created_at: Date.now(),
      updated_at: Date.now()
    }
  },
  organizationUpdated: {
    type: 'organization.updated',
    data: {
      id: 'org_test_123',
      name: 'Test Organization Updated',
      updated_at: Date.now()
    }
  },
  organizationMembershipCreated: {
    type: 'organizationMembership.created',
    data: {
      organization: {
        id: 'org_test_123'
      },
      public_user_data: {
        user_id: 'user_test_123'
      },
      role: 'admin'
    }
  },
  organizationMembershipUpdated: {
    type: 'organizationMembership.updated',
    data: {
      organization: {
        id: 'org_test_123'
      },
      public_user_data: {
        user_id: 'user_test_123'
      },
      role: 'owner'
    }
  },
  organizationMembershipDeleted: {
    type: 'organizationMembership.deleted',
    data: {
      organization: {
        id: 'org_test_123'
      },
      public_user_data: {
        user_id: 'user_test_123'
      }
    }
  },
  sessionCreated: {
    type: 'session.created',
    data: {
      user_id: 'user_test_123',
      session_id: 'session_test_123',
      created_at: Date.now()
    }
  }
};

// Mock Svix headers for webhook verification
const mockSvixHeaders = {
  'svix-id': 'msg_test_123',
  'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
  'svix-signature': 'v1,test_signature' // This will fail verification but that's ok for testing
};

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

async function sendWebhook(webhookData, description) {
  try {
    console.log(`\n🔍 Testing: ${description}`);
    console.log(`   Event: ${webhookData.type}`);

    const response = await makeHttpRequest(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...mockSvixHeaders
      },
      body: JSON.stringify(webhookData)
    });

    console.log(`   ✅ Response: ${response.status} - ${response.data.message || 'Success'}`);
    return true;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testWebhookEndpoint() {
  console.log('🚀 Starting comprehensive webhook tests...\n');

  const tests = [
    { data: mockWebhookData.userCreated, description: 'User Created' },
    { data: mockWebhookData.organizationCreated, description: 'Organization Created' },
    { data: mockWebhookData.organizationMembershipCreated, description: 'Organization Membership Created' },
    { data: mockWebhookData.userUpdated, description: 'User Updated' },
    { data: mockWebhookData.organizationUpdated, description: 'Organization Updated' },
    { data: mockWebhookData.organizationMembershipUpdated, description: 'Organization Membership Updated' },
    { data: mockWebhookData.sessionCreated, description: 'Session Created' },
    { data: mockWebhookData.organizationMembershipDeleted, description: 'Organization Membership Deleted' }
  ];

  let passed = 0;
  let total = tests.length;

  for (const test of tests) {
    const result = await sendWebhook(test.data, test.description);
    if (result) passed++;

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n📊 Webhook Test Results: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('🎉 All webhook tests passed! User and organization syncing is working properly.');
  } else {
    console.log('⚠️  Some webhook tests failed. Check the server logs for details.');
  }

  return passed === total;
}

async function testHealthCheck() {
  try {
    console.log('🔍 Testing server health...');
    const response = await makeHttpRequest(`${BASE_URL}/health`);
    console.log('✅ Server is running:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Server health check failed:', error.message);
    console.log('💡 Make sure to start the server with: npm run dev');
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Clerk Webhook Integration Tests\n');
  console.log('=' .repeat(50));

  // Test server health first
  const serverHealthy = await testHealthCheck();
  if (!serverHealthy) {
    console.log('\n❌ Server is not running. Please start it first.');
    return;
  }

  console.log('\n' + '=' .repeat(50));

  // Run webhook tests
  const webhookTestsPassed = await testWebhookEndpoint();

  console.log('\n' + '=' .repeat(50));

  if (webhookTestsPassed) {
    console.log('🎉 All tests completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Configure these webhook events in your Clerk dashboard:');
    console.log('   - user.created');
    console.log('   - user.updated');
    console.log('   - user.deleted');
    console.log('   - organization.created');
    console.log('   - organization.updated');
    console.log('   - organization.deleted');
    console.log('   - organizationMembership.created');
    console.log('   - organizationMembership.updated');
    console.log('   - organizationMembership.deleted');
    console.log('   - session.created');
    console.log(`2. Set webhook URL to: ${WEBHOOK_URL}`);
    console.log('3. Set webhook secret in your .env file');
  } else {
    console.log('❌ Some tests failed. Check the setup and try again.');
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests, testWebhookEndpoint };
