import { setupToxiproxy, teardownToxiproxy, getProxy, Toxic } from '../setup.js';
import { assertNo5xx, assertApiResponseTime } from '../assertions.js';

export async function runCombinedDegradedScenario() {
  console.log('=== Running Combined Degraded Scenario ===');

  try {
    await setupToxiproxy();

    const redisProxy = await getProxy('redis');
    const stellarProxy = await getProxy('stellar');

    // Disable Redis
    await redisProxy.disable();
    console.log('✓ Redis proxy disabled');

    // Add latency to Stellar RPC
    const toxic = new Toxic(stellarProxy, {
      type: 'latency',
      stream: 'downstream',
      toxicity: 1.0,
      attributes: { latency: 2000, jitter: 200 }
    });
    await stellarProxy.addToxic(toxic);
    console.log('✓ Stellar RPC latency toxic added (2000ms)');

    await assertNo5xx('/api/v1/escrows');
    await assertApiResponseTime('/api/v1/escrows', 5000);
    console.log('✓ All read endpoints respond without errors');

    console.log('=== Combined Degraded Scenario PASSED ===');
  } finally {
    await teardownToxiproxy();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCombinedDegradedScenario().catch(err => {
    console.error('❌ Combined Degraded Scenario FAILED:', err);
    process.exitCode = 1;
  });
}

export default runCombinedDegradedScenario;
