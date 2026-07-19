
import assert from 'assert';
import supertest from 'supertest';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const request = supertest(API_BASE_URL);

export async function assertApiResponseTime(endpoint, maxMs, method = 'get') {
  const start = Date.now();
  await request[method](endpoint);
  const elapsed = Date.now() - start;
  assert(elapsed <= maxMs, `API response time ${elapsed}ms exceeds ${maxMs}ms`);
  console.log(`✓ ${endpoint} responded in ${elapsed}ms (<= ${maxMs}ms)`);
}

export async function assertNo5xx(endpoint, method = 'get') {
  const response = await request[method](endpoint);
  assert(response.statusCode < 500, `Got ${response.statusCode} from ${endpoint}`);
  console.log(`✓ ${endpoint} returned ${response.statusCode} (no 5xx)`);
}

export async function assertHealthStatus(expectedStatus) {
  const response = await request.get('/health');
  assert(response.statusCode === 200, `Health check failed with status ${response.statusCode}`);
  // Depending on your health endpoint structure, you might want to check specific components
  console.log(`✓ Health check returned ${response.statusCode}`);
}

export { request };
