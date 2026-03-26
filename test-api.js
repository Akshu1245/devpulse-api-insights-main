/**
 * DevPulse API Testing - Node.js Version
 * Cross-platform API endpoint testing
 *
 * Usage:
 *   node test-api.js http://localhost:3001
 *   node test-api.js https://your-railway-app.up.railway.app JWT_TOKEN
 */

const http = require('http');
const https = require('https');
const url = require('url');

// Color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const backendUrl = process.argv[2] || 'http://localhost:3001';
const jwtToken = process.argv[3] || null;

let passed = 0;
let failed = 0;

console.log(`${colors.cyan}🧪 DevPulse API Testing Suite${colors.reset}`);
console.log('================================');
console.log(`Backend URL: ${backendUrl}`);
if (jwtToken) {
  console.log(`JWT Token: ${jwtToken.substring(0, 20)}...`);
}
console.log('');

/**
 * Make HTTP request
 */
function makeRequest(method, endpoint, data = null, expectedCode = 200) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(endpoint, backendUrl);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (jwtToken) {
      options.headers['Authorization'] = `Bearer ${jwtToken}`;
    }

    if (data) {
      const bodyStr = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = protocol.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Test endpoint
 */
async function testEndpoint(name, method, endpoint, data = null, expectedCode = 200) {
  process.stdout.write(`Testing ${name}... `);

  try {
    const response = await makeRequest(method, endpoint, data, expectedCode);

    if (response.statusCode === expectedCode || response.statusCode === 200) {
      console.log(`${colors.green}✓ PASSED${colors.reset} (HTTP ${response.statusCode})`);
      passed++;
    } else {
      console.log(
        `${colors.red}✗ FAILED${colors.reset} (HTTP ${response.statusCode}, expected ${expectedCode})`
      );
      console.log(`  Response: ${response.body.substring(0, 100)}`);
      failed++;
    }
  } catch (err) {
    console.log(`${colors.red}✗ ERROR${colors.reset} - ${err.message}`);
    failed++;
  }

  console.log('');
}

/**
 * Test CORS
 */
async function testCors() {
  process.stdout.write('Testing CORS Preflight... ');

  try {
    const urlObj = new URL('/api/generate', backendUrl);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
      },
    };

    const req = protocol.request(options, (res) => {
      const hasCorHeaders =
        res.headers['access-control-allow-origin'] ||
        res.headers['access-control-allow-methods'];

      if (hasCorHeaders) {
        console.log(`${colors.green}✓ PASSED${colors.reset}`);
        console.log(`  Allow-Origin: ${res.headers['access-control-allow-origin']}`);
        passed++;
      } else {
        console.log(`${colors.red}✗ FAILED${colors.reset} - No CORS headers`);
        failed++;
      }
      console.log('');
    });

    req.on('error', (err) => {
      console.log(`${colors.red}✗ ERROR${colors.reset} - ${err.message}`);
      failed++;
      console.log('');
    });

    req.end();
  } catch (err) {
    console.log(`${colors.red}✗ ERROR${colors.reset} - ${err.message}`);
    failed++;
    console.log('');
  }
}

/**
 * Run tests
 */
async function runTests() {
  // Test 1: Health Check
  await testEndpoint('Health Check', 'GET', '/health', null, 200);

  // Test 2: Generate endpoint (with auth)
  await testEndpoint('Generate Briefing (no JWT)', 'POST', '/api/generate', { topic: 'API Security' }, 401);

  // Test 3: CORS
  await testCors();

  // Summary
  console.log('================================');
  console.log('Test Results:');
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);

  if (failed > 0) {
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  } else {
    console.log(`${colors.green}Failed: 0${colors.reset}`);
  }
  console.log('');

  if (failed === 0) {
    console.log(`${colors.green}✓ All tests passed!${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`${colors.red}✗ Some tests failed${colors.reset}`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
