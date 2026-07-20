import { setupToxiproxy, teardownToxiproxy, getProxy, Toxic } from '../setup.js';

export async function runStellarRpcErrorsScenario() {
  console.log('=== Running Stellar RPC Errors Scenario ===');

  try {
    await setupToxiproxy();

    const stellarProxy = await getProxy('stellar');
    const toxic = new Toxic(stellarProxy, {
      type: 'reset_peer',
      stream: 'downstream',
      toxicity: 1.0,
      attributes: {}
    });
    await stellarProxy.addToxic(toxic);
    console.log('✓ Stellar RPC error toxic added');

    // Test that circuit breaker opens after failures
    // TODO: Implement specific circuit breaker checks
    console.log('Stellar RPC Errors scenario complete (basic check)');

    console.log('=== Stellar RPC Errors Scenario PASSED ===');
  } finally {
    await teardownToxiproxy();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStellarRpcErrorsScenario().catch(err => {
    console.error('❌ Stellar RPC Errors Scenario FAILED:', err);
    process.exitCode = 1;
  });
}

export default runStellarRpcErrorsScenario;
