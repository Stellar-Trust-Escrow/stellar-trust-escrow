import { setupToxiproxy, teardownToxiproxy, getProxy, Toxic } from '../setup.js';
import { assertApiResponseTime, assertNo5xx, request } from '../assertions.js';

export async function runRedisLatencyScenario() {
  console.log('=== Running Redis Latency Scenario ===');

  try {
    await setupToxiproxy();

    const redisProxy = await getProxy('redis');
    const toxic = new Toxic(redisProxy, {
      type: 'latency',
      stream: 'downstream',
      toxicity: 1.0,
      attributes: { latency: 1000, jitter: 100 }
    });
    await redisProxy.addToxic(toxic);
    console.log('✓ Redis latency toxic added (1000ms)');

    await assertApiResponseTime('/api/v1/escrows', 5000);
    await assertNo5xx('/api/v1/escrows');

    console.log('=== Redis Latency Scenario PASSED ===');
  } finally {
    await teardownToxiproxy();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRedisLatencyScenario().catch(err => {
    console.error('❌ Redis Latency Scenario FAILED:', err);
    process.exitCode = 1;
  });
}

export default runRedisLatencyScenario;
