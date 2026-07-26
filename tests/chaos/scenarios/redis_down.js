import { setupToxiproxy, teardownToxiproxy, getProxy } from '../setup.js';
import { assertNo5xx, assertHealthStatus, request } from '../assertions.js';

export async function runRedisDownScenario() {
  console.log('=== Running Redis Down Scenario ===');

  try {
    await setupToxiproxy();

    // Disable Redis proxy
    const redisProxy = await getProxy('redis');
    await redisProxy.disable();
    console.log('✓ Redis proxy disabled');

    // Test /api/v1/escrows
    console.log('Testing GET /api/v1/escrows...');
    await assertNo5xx('/api/v1/escrows', 'get');

    // Test /api/v1/auth/login
    console.log('Testing POST /api/v1/auth/login...');
    await assertNo5xx('/api/v1/auth/login', 'post');

    // Test health
    console.log('Testing GET /health...');
    await assertHealthStatus();

    console.log('=== Redis Down Scenario PASSED ===');
  } finally {
    await teardownToxiproxy();
  }
}

// If called directly, run the scenario
if (import.meta.url === `file://${process.argv[1]}`) {
  runRedisDownScenario().catch(err => {
    console.error('❌ Redis Down Scenario FAILED:', err);
    process.exitCode = 1;
  });
}

export default runRedisDownScenario;
