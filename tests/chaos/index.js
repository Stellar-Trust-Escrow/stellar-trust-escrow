import runRedisDownScenario from './scenarios/redis_down.js';
import runRedisLatencyScenario from './scenarios/redis_latency.js';
import runStellarRpcTimeoutScenario from './scenarios/stellar_rpc_timeout.js';
import runStellarRpcErrorsScenario from './scenarios/stellar_rpc_errors.js';
import runDbSlowQueriesScenario from './scenarios/db_slow_queries.js';
import runCombinedDegradedScenario from './scenarios/combined_degraded.js';

export const scenarios = {
  redis_down: runRedisDownScenario,
  redis_latency: runRedisLatencyScenario,
  stellar_rpc_timeout: runStellarRpcTimeoutScenario,
  stellar_rpc_errors: runStellarRpcErrorsScenario,
  db_slow_queries: runDbSlowQueriesScenario,
  combined_degraded: runCombinedDegradedScenario
};

async function runAllScenarios() {
  console.log('=== Running All Chaos Scenarios ===');

  const allScenarios = Object.entries(scenarios);

  for (const [name, runFn] of allScenarios) {
    try {
      await runFn();
      console.log(`✅ ${name} passed\n`);
    } catch (err) {
      console.error(`❌ ${name} failed:`, err);
      process.exit(1);
    }
  }

  console.log('=== All Chaos Scenarios Passed ===');
}

async function runSingleScenario(name) {
  const runFn = scenarios[name];
  if (!runFn) {
    console.error(`Unknown scenario: ${name}`);
    console.error('Available scenarios:', Object.keys(scenarios).join(', '));
    process.exit(1);
  }
  await runFn();
}

const args = process.argv.slice(2);
if (args.length > 0) {
  runSingleScenario(args[0]).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  runAllScenarios().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
