import { setupToxiproxy, teardownToxiproxy, getProxy, Toxic } from '../setup.js';
import { assertApiResponseTime, request } from '../assertions.js';

export async function runStellarRpcTimeoutScenario() {
  console.log('=== Running Stellar RPC Timeout Scenario ===');

  try {
    await setupToxiproxy();

    const stellarProxy = await getProxy('stellar');
    const toxic = new Toxic(stellarProxy, {
      type: 'latency',
      stream: 'downstream',
      toxicity: 1.0,
      attributes: { latency: 5000, jitter: 0 }
    });
    await stellarProxy.addToxic(toxic);
    console.log('✓ Stellar RPC latency toxic added (5000ms)');

    // Test broadcast endpoint responds within 10s
    console.log('Testing POST /api/v1/escrows/:id/broadcast...');
    await assertApiResponseTime('/api/v1/escrows/test-id/broadcast', 10000, 'post');

    console.log('=== Stellar RPC Timeout Scenario PASSED ===');
  } finally {
    await teardownToxiproxy();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStellarRpcTimeoutScenario().catch(err => {
    console.error('❌ Stellar RPC Timeout Scenario FAILED:', err);
    process.exitCode = 1;
  });
}

export default runStellarRpcTimeoutScenario;
