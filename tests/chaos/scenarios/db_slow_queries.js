import { setupToxiproxy, teardownToxiproxy, getProxy, Toxic } from '../setup.js';
import { assertApiResponseTime, assertNo5xx, request } from '../assertions.js';

export async function runDbSlowQueriesScenario() {
  console.log('=== Running DB Slow Queries Scenario ===');

  try {
    await setupToxiproxy();

    const postgresProxy = await getProxy('postgres');
    const toxic = new Toxic(postgresProxy, {
      type: 'latency',
      stream: 'downstream',
      toxicity: 1.0,
      attributes: { latency: 500, jitter: 50 }
    });
    await postgresProxy.addToxic(toxic);
    console.log('✓ Postgres latency toxic added (500ms)');

    // Test cached endpoint is still fast
    console.log('Testing cached GET /api/v1/escrows...');
    await assertApiResponseTime('/api/v1/escrows', 3000);
    await assertNo5xx('/api/v1/escrows');

    console.log('=== DB Slow Queries Scenario PASSED ===');
  } finally {
    await teardownToxiproxy();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDbSlowQueriesScenario().catch(err => {
    console.error('❌ DB Slow Queries Scenario FAILED:', err);
    process.exitCode = 1;
  });
}

export default runDbSlowQueriesScenario;
