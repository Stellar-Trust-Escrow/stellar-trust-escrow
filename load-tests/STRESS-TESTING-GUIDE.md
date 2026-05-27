# Stress Testing Guide

Comprehensive guide for running and interpreting stress tests on the Stellar Trust Escrow backend.

## Overview

Stress testing simulates extreme load conditions with hundreds of concurrent users to identify:

- **Database connection pool exhaustion** - When too many concurrent queries overwhelm the connection pool
- **Memory leaks** - Gradual memory consumption that isn't released
- **Performance degradation** - System slowdown under sustained high load
- **Rate limiting effectiveness** - Whether rate limiters protect the system
- **Concurrent write conflicts** - Race conditions in milestone completions and evidence uploads
- **Circuit breaker behavior** - How the system handles and recovers from failures

## Quick Start

### Prerequisites

```bash
# Install dependencies
npm ci

# Generate test data
npm run loadtest:generate
```

### Run Stress Tests

```bash
# Default configuration (5 minutes, 200 connections)
npm run loadtest:stress

# Custom configuration
STRESS_DURATION=600 STRESS_CONNECTIONS=300 npm run loadtest:stress

# Against production-like environment
STRESS_TARGET_URL=https://staging.example.com npm run loadtest:stress
```

## Stress Test Scenarios

### 1. High-Volume Escrow Browsing

**Purpose**: Test read-heavy workload with filtering and pagination

- **Connections**: 200 concurrent users
- **Target Rate**: 500 requests/second
- **Duration**: 5 minutes (default)
- **Operations**:
  - Browse active escrows (page 1)
  - Browse active escrows (page 2)
  - Browse sorted by amount

**What it tests**:
- Database query performance under load
- Index effectiveness
- Connection pool management for reads
- Cache hit rates

### 2. Concurrent Escrow Detail Views

**Purpose**: Test detailed read operations with related data

- **Connections**: 160 concurrent users
- **Target Rate**: 400 requests/second
- **Operations**:
  - Fetch escrow details
  - Fetch milestones
  - Fetch events

**What it tests**:
- JOIN query performance
- N+1 query problems
- Related data fetching efficiency

### 3. Concurrent Milestone Completions

**Purpose**: Test write-heavy workload with potential conflicts

- **Connections**: 60 concurrent users
- **Target Rate**: 50 requests/second
- **Duration**: 2.5 minutes
- **Operations**:
  - POST milestone completion with signature

**What it tests**:
- Write transaction handling
- Database locking behavior
- Concurrent update conflicts
- Transaction isolation levels

### 4. Concurrent Evidence Uploads

**Purpose**: Test file upload and IPFS integration under load

- **Connections**: 40 concurrent users
- **Target Rate**: 30 requests/second
- **Duration**: 2 minutes
- **Operations**:
  - POST dispute evidence with IPFS hash

**What it tests**:
- File upload handling
- IPFS integration performance
- Storage system capacity
- Metadata persistence

### 5. User Dashboard Load

**Purpose**: Test complex multi-endpoint user flows

- **Connections**: 120 concurrent users
- **Target Rate**: 300 requests/second
- **Operations**:
  - Fetch user profile
  - Fetch user escrows
  - Fetch user stats
  - Fetch notifications

**What it tests**:
- Multi-query coordination
- User-specific data isolation
- Dashboard aggregation performance

### 6. Mixed Realistic Workload

**Purpose**: Simulate real-world usage patterns

- **Connections**: 200 concurrent users
- **Target Rate**: 600 requests/second
- **Operations**:
  - 50% reads (browse, view details, stats)
  - 50% writes (milestone approval)

**What it tests**:
- Read/write balance
- Real-world performance characteristics
- System behavior under mixed load

## Configuration

### Environment Variables

```bash
# Target URL (default: local test server)
STRESS_TARGET_URL=https://api.example.com

# Test duration in seconds (default: 300)
STRESS_DURATION=600

# Concurrent connections (default: 200)
STRESS_CONNECTIONS=300

# CI mode with stricter thresholds (default: false)
CI=true
```

### Thresholds

Stress tests use more lenient thresholds than regular load tests:

| Metric | Local Threshold | CI Threshold | Rationale |
|--------|----------------|--------------|-----------|
| Error Rate | ≤5% | ≤2% | Some errors expected under extreme load |
| Tail Latency (p97.5) | ≤3000ms | ≤2000ms | Higher latency acceptable under stress |
| Throughput | ≥20 req/s | ≥30 req/s | Minimum acceptable throughput |
| CPU Usage | ≤90% | ≤90% | Near-maximum CPU utilization |
| Memory Usage | ≤2048MB | ≤2048MB | Memory ceiling |
| DB Pool Utilization | ≤90% | ≤90% | Connection pool near capacity |

## Understanding Results

### HTML Report

The HTML report (`load-tests/results/stress/latest.html`) includes:

1. **Summary Section**
   - Total requests processed
   - Average throughput across all scenarios
   - Average error rate
   - Maximum p99 latency

2. **Alerts Section**
   - Critical, high, and medium severity alerts
   - Specific metrics that exceeded thresholds
   - Affected scenarios

3. **Scenario Cards**
   - Per-scenario metrics
   - Latency percentiles (p50, p95, p99)
   - Error rates
   - System resource usage

### JSON Report

The JSON report (`load-tests/results/stress/latest.json`) contains:

```json
{
  "generatedAt": "2026-05-28T...",
  "targetUrl": "http://localhost:...",
  "configuration": {
    "duration": 300,
    "connections": 200,
    "scenarios": 6
  },
  "summary": {
    "totalRequests": 450000,
    "avgThroughput": 250.5,
    "avgErrorRate": 0.8,
    "maxLatencyP99": 1850.2
  },
  "results": [...],
  "alerts": [...],
  "thresholds": {...}
}
```

### Alert Severity Levels

- **Critical**: Immediate action required (e.g., DB pool exhaustion)
- **High**: Significant performance degradation (e.g., excessive CPU/memory)
- **Medium**: Noticeable issues that should be addressed (e.g., high latency)

## Common Issues and Solutions

### High Error Rates

**Symptoms**: Error rate >5%

**Possible Causes**:
- Database connection pool exhausted
- Rate limiting triggered
- Backend crashes under load
- Network timeouts

**Solutions**:
1. Increase database connection pool size
2. Add connection pooling middleware
3. Implement request queuing
4. Scale horizontally

### High Latency

**Symptoms**: p99 latency >3000ms

**Possible Causes**:
- Slow database queries
- Missing indexes
- N+1 query problems
- Insufficient resources

**Solutions**:
1. Add database indexes
2. Optimize queries
3. Implement caching
4. Use query batching

### DB Pool Exhaustion

**Symptoms**: Pool utilization >90%

**Possible Causes**:
- Too many concurrent connections
- Long-running queries
- Connection leaks
- Insufficient pool size

**Solutions**:
1. Increase pool size: `max: 30` → `max: 50`
2. Reduce query execution time
3. Implement connection timeout
4. Add connection monitoring

### Memory Leaks

**Symptoms**: Memory usage continuously increasing

**Possible Causes**:
- Unclosed database connections
- Event listener leaks
- Large object retention
- Cache without eviction

**Solutions**:
1. Profile with Node.js heap snapshots
2. Implement proper cleanup in finally blocks
3. Add cache size limits
4. Use weak references where appropriate

### CPU Saturation

**Symptoms**: CPU usage >90%

**Possible Causes**:
- CPU-intensive operations in request path
- Synchronous blocking operations
- Inefficient algorithms
- Insufficient parallelization

**Solutions**:
1. Move heavy operations to background jobs
2. Use worker threads for CPU-intensive tasks
3. Optimize algorithms
4. Scale horizontally

## Automated Nightly Testing

### GitHub Actions Workflow

The nightly stress test workflow runs automatically at 2:00 AM UTC:

```yaml
# .github/workflows/nightly-stress-test.yml
on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:
```

### What It Does

1. **Runs stress tests** with CI thresholds
2. **Generates reports** (JSON + HTML)
3. **Uploads artifacts** (90-day retention)
4. **Checks for critical alerts**
5. **Sends Slack notifications** on failures

### Viewing Results

1. Go to GitHub Actions → Nightly Stress Test
2. Click on the latest run
3. Download artifacts: `stress-test-reports-{run_number}`
4. Open `latest.html` in a browser

### Manual Trigger

```bash
# Using GitHub CLI
gh workflow run nightly-stress-test.yml

# Or via GitHub UI
Actions → Nightly Stress Test → Run workflow
```

## Best Practices

### Before Running Stress Tests

1. **Ensure clean state** - No other load tests running
2. **Check resources** - Sufficient CPU, memory, disk space
3. **Backup data** - If testing against non-production data
4. **Monitor systems** - Have monitoring dashboards ready
5. **Set expectations** - Know what "good" looks like

### During Stress Tests

1. **Monitor in real-time** - Watch CPU, memory, DB connections
2. **Check logs** - Look for errors and warnings
3. **Observe behavior** - Note any unusual patterns
4. **Don't interrupt** - Let tests complete for accurate results

### After Stress Tests

1. **Review reports** - Check all metrics and alerts
2. **Compare trends** - Look at historical data
3. **Investigate anomalies** - Dig into unexpected results
4. **Document findings** - Record issues and solutions
5. **Plan improvements** - Create tickets for optimizations

### Interpreting Trends

- **Gradual degradation** - May indicate memory leaks
- **Sudden spikes** - Could be GC pauses or resource exhaustion
- **Consistent errors** - Likely configuration or code issues
- **Intermittent failures** - Possible race conditions

## Integration with CI/CD

### Pre-Deployment Stress Testing

Run stress tests before deploying to production:

```bash
# In CI pipeline
npm run loadtest:stress
if [ $? -ne 0 ]; then
  echo "Stress tests failed - blocking deployment"
  exit 1
fi
```

### Performance Regression Detection

Compare results against baselines:

```bash
# Check if p99 latency increased by >20%
CURRENT_P99=$(jq '.summary.maxLatencyP99' results/stress/latest.json)
BASELINE_P99=1500

if (( $(echo "$CURRENT_P99 > $BASELINE_P99 * 1.2" | bc -l) )); then
  echo "Performance regression detected"
  exit 1
fi
```

## Troubleshooting

### Tests Timing Out

**Problem**: Stress tests don't complete

**Solutions**:
- Increase timeout in workflow: `timeout-minutes: 120`
- Reduce test duration: `STRESS_DURATION=180`
- Reduce connections: `STRESS_CONNECTIONS=100`

### Server Crashes

**Problem**: Backend crashes during stress test

**Solutions**:
- Check error logs for stack traces
- Reduce load gradually to find breaking point
- Add error handling and graceful degradation
- Implement circuit breakers

### Inconsistent Results

**Problem**: Results vary significantly between runs

**Solutions**:
- Ensure clean state before each run
- Use deterministic test data
- Run multiple iterations and average
- Check for external factors (network, other processes)

### Reports Not Generated

**Problem**: HTML/JSON reports missing

**Solutions**:
- Check for errors in console output
- Verify write permissions on results directory
- Ensure test completed successfully
- Check disk space

## Advanced Topics

### Custom Scenarios

Add new scenarios to `stress-test.js`:

```javascript
{
  id: 'custom-scenario',
  title: 'Custom Stress Test',
  description: 'Your custom scenario',
  requests: [
    {
      method: 'POST',
      path: '/api/custom/endpoint',
      body: JSON.stringify({ data: 'test' }),
    },
  ],
  connections: 100,
  duration: 300,
  overallRate: 200,
}
```

### Distributed Load Testing

For even higher load, distribute across multiple machines:

```bash
# Machine 1
STRESS_CONNECTIONS=200 npm run loadtest:stress

# Machine 2
STRESS_CONNECTIONS=200 npm run loadtest:stress

# Machine 3
STRESS_CONNECTIONS=200 npm run loadtest:stress
```

### Production Stress Testing

**⚠️ Warning**: Only stress test production with proper planning

1. **Schedule maintenance window**
2. **Notify stakeholders**
3. **Have rollback plan ready**
4. **Monitor closely**
5. **Start with low load and ramp up**

## Resources

- [Autocannon Documentation](https://github.com/mcollina/autocannon)
- [Load Testing Best Practices](https://www.nginx.com/blog/load-testing-best-practices/)
- [Database Connection Pooling](https://node-postgres.com/features/pooling)
- [Node.js Performance Optimization](https://nodejs.org/en/docs/guides/simple-profiling/)

## Support

For issues or questions:

1. Check this guide first
2. Review existing stress test reports
3. Check GitHub Issues with `performance` label
4. Ask in team Slack channel
5. Create new issue with `DevOps` label
