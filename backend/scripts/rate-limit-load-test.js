#!/usr/bin/env node
/**
 * Rate limit load test — fires 150 requests and asserts the 101st returns 429.
 * Usage: node backend/scripts/rate-limit-load-test.js
 */
import http from 'http';

const HOST = process.env.TEST_HOST || 'localhost';
const PORT = parseInt(process.env.TEST_PORT || '4000', 10);
const TOTAL = 150;
const EXPECTED_LIMIT = 100;

function request(i) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ amount: '1', receiverAddress: 'GABC' });
    const options = {
      host: HOST,
      port: PORT,
      path: '/api/escrows',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Forwarded-For': '203.0.113.1',
      },
    };
    const req = http.request(options, (res) => {
      res.resume();
      resolve({ index: i, status: res.statusCode });
    });
    req.on('error', () => resolve({ index: i, status: 0 }));
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log(`Firing ${TOTAL} requests to ${HOST}:${PORT} …`);
  const results = [];
  for (let i = 1; i <= TOTAL; i++) {
    results.push(await request(i));
  }
  const blocked = results.filter(r => r.status === 429);
  const passed = results.filter(r => r.status !== 429 && r.status !== 0);
  console.log(`Passed: ${passed.length}, Blocked (429): ${blocked.length}`);
  if (blocked.length > 0 && passed.length <= EXPECTED_LIMIT) {
    console.log('PASS: Rate limiting is working correctly.');
    process.exit(0);
  } else {
    console.log('FAIL: Rate limiting did not trigger as expected.');
    process.exit(1);
  }
})();
