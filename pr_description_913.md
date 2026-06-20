# feat: Implement Nightly Automated Load and Stress Testing Suite

## Summary

This PR implements a comprehensive nightly automated load and stress testing suite to identify performance regressions, database connection pool exhaustion, and system degradation under high transaction volume.

## Changes

### Core Implementation

- ✅ Created `load-tests/stress-test.js` - Comprehensive stress testing suite with 6 realistic scenarios
- ✅ Added `npm run loadtest:stress` script for easy execution
- ✅ Implemented system metrics capture (CPU, memory, DB pool utilization)
- ✅ Created detailed HTML and JSON report generation
- ✅ Configured custom thresholds for stress conditions

### Stress Test Scenarios

1. **High-Volume Escrow Browsing** (200 connections, 500 req/s)
   - Simulates hundreds of users browsing escrow listings
   - Tests database query performance and index effectiveness

2. **Concurrent Escrow Detail Views** (160 connections, 400 req/s)
   - Multiple users viewing escrow details and milestones
   - Tests JOIN query performance and related data fetching

3. **Concurrent Milestone Completions** (60 connections, 50 req/s)
   - Simulates multiple milestone completion requests
   - Tests write transaction handling and concurrent update conflicts

4. **Concurrent Evidence Uploads** (40 connections, 30 req/s)
   - Multiple users uploading dispute evidence
   - Tests file upload handling and IPFS integration

5. **User Dashboard Load** (120 connections, 300 req/s)
   - Users loading dashboards with multiple API calls
   - Tests multi-query coordination and aggregation performance

6. **Mixed Realistic Workload** (200 connections, 600 req/s)
   - Combination of reads and writes simulating real usage
   - Tests read/write balance and real-world performance

### Metrics Tracked

- **Latency percentiles**: p50, p75, p90, p95, p99, max
- **Throughput**: Requests per second, total requests
- **Error rates**: Errors, timeouts, non-2xx responses
- **System metrics**: CPU usage, memory consumption
- **Database metrics**: Connection pool utilization, active/idle connections

### Thresholds

Configured for stress conditions (more lenient than regular load tests):

| Metric               | Local     | CI Mode   |
| -------------------- | --------- | --------- |
| Error Rate           | ≤5%       | ≤2%       |
| Tail Latency (p97.5) | ≤3000ms   | ≤2000ms   |
| Throughput           | ≥20 req/s | ≥30 req/s |
| CPU Usage            | ≤90%      | ≤90%      |
| Memory Usage         | ≤2048MB   | ≤2048MB   |
| DB Pool Utilization  | ≤90%      | ≤90%      |

### CI/CD Integration

- ✅ Created `.github/workflows/nightly-stress-test.yml`
- ✅ Scheduled to run every night at 2:00 AM UTC
- ✅ Runs both stress tests and nightly load tests
- ✅ Uploads reports as artifacts (90-day retention)
- ✅ Checks for critical alerts and fails workflow if detected
- ✅ Sends Slack notifications on failures and successes
- ✅ Supports manual workflow dispatch

### Reports

Generated reports include:

**HTML Report** (`load-tests/results/stress/latest.html`):

- Summary with total requests, throughput, error rates
- Alert section with severity levels
- Per-scenario metrics cards with detailed breakdowns
- System and database metrics visualization

**JSON Report** (`load-tests/results/stress/latest.json`):

- Complete test configuration
- Detailed results for each scenario
- Alert history with thresholds
- System and database metrics

### Documentation

- ✅ Created `load-tests/STRESS-TESTING-GUIDE.md` - Comprehensive 400+ line guide
  - Overview and quick start
  - Detailed scenario descriptions
  - Configuration options
  - Understanding results and alerts
  - Common issues and solutions
  - Best practices
  - Troubleshooting guide
  - Advanced topics
- ✅ Updated `load-tests/README.md` with stress testing section
- ✅ Added usage examples and threshold documentation

### Configuration

- ✅ Updated `.gitignore` to exclude stress test results
- ✅ Environment variable support:
  - `STRESS_TARGET_URL` - Target URL (default: local server)
  - `STRESS_DURATION` - Test duration in seconds (default: 300)
  - `STRESS_CONNECTIONS` - Concurrent connections (default: 200)
  - `CI` - Enable stricter CI thresholds

## Testing

### Local Testing

```bash
# Generate test data
npm run loadtest:generate

# Run stress tests with defaults
npm run loadtest:stress

# Custom configuration
STRESS_DURATION=600 STRESS_CONNECTIONS=300 npm run loadtest:stress

# Against specific target
STRESS_TARGET_URL=https://staging.example.com npm run loadtest:stress
```

### CI Testing

The nightly workflow runs automatically at 2:00 AM UTC. Manual trigger:

```bash
gh workflow run nightly-stress-test.yml
```

## Benefits

1. **Early Detection** - Identifies performance regressions before production
2. **Capacity Planning** - Understand system limits and breaking points
3. **Database Optimization** - Detect connection pool exhaustion and slow queries
4. **Memory Leak Detection** - Track memory usage over extended periods
5. **Realistic Simulation** - Test with hundreds of concurrent users
6. **Automated Monitoring** - Nightly runs catch issues automatically
7. **Detailed Reports** - HTML and JSON reports for analysis
8. **Alert System** - Automatic notifications on critical failures

## What It Tests

- ✅ Database connection pool exhaustion
- ✅ Memory leaks under sustained load
- ✅ System degradation over extended periods
- ✅ Rate limiting and circuit breaker behavior
- ✅ Concurrent write operation handling
- ✅ Query performance under high load
- ✅ API response times at scale
- ✅ Error handling under stress

## Usage

```bash
# Run stress tests
npm run loadtest:stress

# View latest report
open load-tests/results/stress/latest.html

# Check for alerts
cat load-tests/results/stress/latest.json | jq '.alerts'
```

## Documentation

See `load-tests/STRESS-TESTING-GUIDE.md` for:

- Complete scenario descriptions
- Configuration options
- Understanding results
- Common issues and solutions
- Best practices
- Troubleshooting guide
- Advanced topics

Closes #913
