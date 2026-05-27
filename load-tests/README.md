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

## Stress Testing

The stress testing suite (`stress-test.js`) simulates high transaction volume with hundreds of concurrent users performing realistic actions. This helps identify:

- Database connection pool exhaustion
- Memory leaks under sustained load
- System degradation over extended periods
- Rate limiting and circuit breaker behavior
- Concurrent write operation handling

### Stress Test Scenarios

1. **High-Volume Escrow Browsing** - 200 concurrent users browsing listings (500 req/s)
2. **Concurrent Escrow Detail Views** - 160 users viewing details and milestones (400 req/s)
3. **Concurrent Milestone Completions** - 60 users completing milestones (50 req/s)
4. **Concurrent Evidence Uploads** - 40 users uploading dispute evidence (30 req/s)
5. **User Dashboard Load** - 120 users loading dashboards (300 req/s)
6. **Mixed Realistic Workload** - 200 users with mixed read/write operations (600 req/s)

### Run Stress Tests

```bash
npm run loadtest:stress
```

With custom configuration:

```bash
STRESS_DURATION=600 STRESS_CONNECTIONS=300 npm run loadtest:stress
```

### Stress Test Thresholds

More lenient than regular load tests to account for extreme conditions:

- Error rate: ≤2% (CI), ≤5% (local)
- Tail latency (p97.5): ≤2000ms (CI), ≤3000ms (local)
- Throughput: ≥30 req/s (CI), ≥20 req/s (local)
- CPU usage: ≤90%
- Memory usage: ≤2048MB
- DB pool utilization: ≤90%

### Stress Test Reports

Reports are generated in `load-tests/results/stress/`:

- `latest.json` - Most recent stress test results
- `latest.html` - Interactive HTML report with metrics
- `stress-{timestamp}.json` - Historical JSON reports
- `stress-{timestamp}.html` - Historical HTML reports

### Automated Nightly Stress Testing

The GitHub Actions workflow `.github/workflows/nightly-stress-test.yml` runs automatically every night at 2:00 AM UTC:

1. Runs full stress test suite (5 minutes per scenario)
2. Generates detailed HTML and JSON reports
3. Uploads reports as artifacts (90-day retention)
4. Triggers Slack alerts on critical failures
5. Fails workflow if critical or multiple high-severity alerts detected

Manual trigger:

```bash
gh workflow run nightly-stress-test.yml
```

## Notes

- The harness runs against a local Express server with route shapes that mirror the backend API contract.
- The generated dataset is deterministic enough for repeatable baselines while still covering multiple users, escrows, statuses, and milestones.
