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

## Nightly Automated Testing

A nightly runner (`nightly-runner.js`) extends the base load test suite with:

- **Extended metrics capture**: request success rate, latency percentiles (p50/p95/p99), DB connection pool usage, CPU/memory spikes
- **JSON history store**: results are appended to `results/history/history.json` (keeps last 365 runs)
- **Static HTML dashboard**: `results/history/dashboard.html` renders historical comparison charts using Chart.js
- **Alert logic**: flags runs where metrics regress beyond defined thresholds (error rate >1%, tail latency >500ms, throughput <50 req/s, CPU >80%, memory >1024MB)
- **Alert history**: stored in `results/history/alerts.json`

### Run Nightly

```bash
node load-tests/nightly-runner.js
```

### Schedule with Cron

```bash
crontab load-tests/nightly.cron
```

This runs the suite every night at 2:00 AM UTC. Results are logged to `results/nightly.log`.

### View Dashboard

Open `load-tests/results/history/dashboard.html` in a browser to see historical latency trend charts, system metrics, and run history.

## Notes

- The harness runs against a local Express server with route shapes that mirror the backend API contract.
- The generated dataset is deterministic enough for repeatable baselines while still covering multiple users, escrows, statuses, and milestones.
