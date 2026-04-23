# Comprehensive Load Testing

This directory contains the backend load-test harness for issue `#86`.

## Tooling

- `autocannon` drives concurrent HTTP load against a deterministic local API harness.
- `load-tests/data/generate.js` creates representative escrow, milestone, and user data.
- `load-tests/analyze.js` compares the run against stored baselines and emits a Markdown report.

## Scenarios

- `health`: validates the health endpoint stays responsive during burst traffic.
- `escrow-list`: stresses filtered and paginated escrow listings.
- `escrow-details`: alternates between escrow detail and milestone collection reads.
- `user-profile`: exercises the user profile, user escrow history, and stats endpoints together.

## Run Locally

```bash
npm run loadtest:generate
npm run loadtest
```

For CI-style execution that fails on regressions:

```bash
npm run loadtest:ci
```

## Output

- JSON report: `load-tests/results/latest.json`
- Markdown report: `load-tests/results/latest.md`
- Baselines: `load-tests/baselines.json`

## Current Baselines

The initial thresholds are intentionally conservative so CI can catch regressions without flaking:

- `health`: tail latency (p97.5) <= 60 ms, throughput >= 300 req/s
- `escrow-list`: tail latency (p97.5) <= 110 ms, throughput >= 350 req/s
- `escrow-details`: tail latency (p97.5) <= 140 ms, throughput >= 250 req/s
- `user-profile`: tail latency (p97.5) <= 140 ms, throughput >= 180 req/s

## Notes

- The harness runs against a local Express server with route shapes that mirror the backend API contract.
- The generated dataset is deterministic enough for repeatable baselines while still covering multiple users, escrows, statuses, and milestones.
- If the real backend gains a stable test fixture mode later, `LOAD_TEST_TARGET_URL` can point the suite at that server without changing the scenario definitions.
