# Chaos Engineering Runbook

This runbook describes how to run, monitor, and respond to chaos experiments in the `stellar-trust-escrow` backend.

---

## Overview

Chaos engineering deliberately injects failures to verify the system handles them gracefully. The goals are:

1. Confirm circuit breakers open under sustained failures
2. Verify retry logic exhausts correctly before surfacing errors
3. Ensure timeouts prevent indefinite hangs on external calls (Stellar RPC)
4. Validate that the system recovers automatically after a fault is removed

### Architecture

```
HTTP Request
     │
     ▼
chaosMiddleware        ← injects latency / HTTP errors based on CHAOS_EXPERIMENT
     │
     ▼
Express controller
     │
     ▼
retryDatabaseOperation ← wraps DB calls; integrates circuit breaker
│   └── CircuitBreaker("database")  CLOSED → OPEN after 5 failures / 10 s window
│                                   OPEN → HALF_OPEN after 30 s
│                                   HALF_OPEN → CLOSED after 2 successes
     │
     ▼
stellarService         ← wraps Stellar RPC; use CircuitBreaker("stellar-rpc")
     │
     └── CircuitBreaker("stellar-rpc")  same thresholds as database breaker
```

---

## Prerequisites

- Backend running locally or in a staging environment
- `CHAOS_ENABLED` and `CHAOS_EXPERIMENT` env vars available
- Access to Prometheus/Grafana (optional but recommended)

---

## Running an Experiment

### 1. List available experiments

```bash
node backend/chaos/runner.js --list
```

### 2. Validate an experiment config (dry run)

```bash
node backend/chaos/runner.js --validate db-latency
```

### 3. Run an experiment against a local server

Start the server with chaos enabled:

```bash
CHAOS_ENABLED=true CHAOS_EXPERIMENT=db-latency node backend/server.js
```

In a second terminal, run the runner to probe and report:

```bash
node backend/chaos/runner.js --experiment db-latency --duration 60
```

Or point the runner at a remote staging instance:

```bash
CHAOS_TARGET_URL=https://staging.example.com \
  node backend/chaos/runner.js --experiment db-latency --duration 60
```

### 4. Run automated chaos tests (CI)

```bash
cd backend
npm run test:chaos
```

---

## Experiments Reference

### `db-latency` — Database High Latency

| Field            | Value |
|------------------|-------|
| Fault type       | latency |
| Target           | database |
| Delay            | 2 000 ms + 300 ms jitter |
| Probability      | 100% |
| Duration         | 60 s |

**Hypothesis:** Under sustained DB latency the circuit breaker opens within 5 slow requests and the API returns 503 instead of hanging.

**Expected behaviour:**
- First 5 requests time out after ~2 s each (retried 3× = ~6 s total)
- Circuit opens; subsequent requests return 503 in < 1 ms
- After 30 s timeout the circuit probes; 2 healthy probes close it

**Verify in Prometheus:**
```promql
circuit_breaker_state{name="database"}           # should reach 1 (OPEN)
circuit_breaker_transitions_total{to="OPEN"}     # should increment
http_request_duration_ms_bucket{route="/api/v1/escrows"}  # spike in 2000ms bucket
```

---

### `db-failure` — Database Connection Failure

| Field            | Value |
|------------------|-------|
| Fault type       | error (P1001) |
| Target           | database |
| Probability      | 100% |
| Duration         | 30 s |

**Hypothesis:** DB errors trigger 3 retries with backoff (1 s → 2 s → 4 s), then the circuit opens and subsequent requests fail fast.

**Expected behaviour:**
- Each request spends ~7 s in retry before surfacing 503
- After 5 failed requests the circuit opens
- Open circuit: 503 within < 5 ms (fail-fast)

**Verify in Prometheus:**
```promql
db_connection_errors_total{error_type="P1001"}   # should climb
circuit_breaker_state{name="database"}           # reaches 1 (OPEN)
```

---

### `stellar-rpc-timeout` — Stellar RPC Timeout

| Field            | Value |
|------------------|-------|
| Fault type       | timeout |
| Target           | stellar |
| Timeout          | 3 000 ms |
| Routes           | /api/v1/escrows/broadcast |
| Probability      | 100% |
| Duration         | 30 s |

**Hypothesis:** Transaction broadcast times out within 3 s, returning 504 instead of polling for 60 s.

**Expected behaviour:**
- POST `/broadcast` returns 504 within ~3 s
- No goroutine / event loop leak from the abandoned polling loop

**Verify:**
```bash
time curl -X POST $BASE_URL/api/v1/escrows/broadcast \
  -H "Content-Type: application/json" \
  -d '{"signedXdr":"AAAA..."}'
# Should complete in ~3 s with 504
```

---

### `stellar-rpc-error` — Stellar RPC 503 Errors

| Field            | Value |
|------------------|-------|
| Fault type       | error (STELLAR_RPC_ERROR) |
| Target           | stellar |
| Routes           | /api/v1/escrows/broadcast |
| Probability      | 100% |
| Duration         | 30 s |

**Hypothesis:** Repeated RPC errors open the Stellar circuit breaker; subsequent broadcast attempts return 503 fail-fast.

**Verify in Prometheus:**
```promql
circuit_breaker_state{name="stellar-rpc"}        # reaches 1 (OPEN)
circuit_breaker_calls_total{name="stellar-rpc",outcome="rejected"}
```

---

### `partial-api-errors` — Partial API Error Rate (30%)

| Field            | Value |
|------------------|-------|
| Fault type       | http-error |
| Target           | api |
| Status code      | 500 |
| Probability      | 30% |
| Routes           | /api/v1/escrows |
| Duration         | 60 s |

**Hypothesis:** ~30% of GET `/escrows` fail with 500; the circuit breaker stays CLOSED (below the 5-failure threshold); healthy requests still succeed.

**Verify:**
- Error rate visible in Prometheus: `rate(http_requests_total{status_code="500"}[1m])` ≈ 30% of escrow reads
- Circuit stays CLOSED: `circuit_breaker_state{name="database"} == 0`

---

### `high-latency-reads` — High Latency on Escrow Reads

| Field            | Value |
|------------------|-------|
| Fault type       | latency |
| Target           | api |
| Delay            | 1 000–1 500 ms |
| Routes           | /api/v1/escrows |
| Probability      | 100% |
| Duration         | 60 s |

**Hypothesis:** P99 latency exceeds the 1 000 ms SLO and Grafana alert fires.

**Verify:**
```promql
histogram_quantile(0.99, rate(http_request_duration_ms_bucket{route="/api/v1/escrows"}[5m]))
# Should exceed 1000
```

---

## Circuit Breaker Reference

### Thresholds (default, configurable per-breaker)

| Parameter         | Default | Description |
|-------------------|---------|-------------|
| failureThreshold  | 5       | Failures within windowSize before opening |
| successThreshold  | 2       | Consecutive successes in HALF_OPEN to close |
| timeout           | 30 000 ms | Wait in OPEN before probing |
| windowSize        | 10 000 ms | Sliding window for failure counting |

### States

```
CLOSED ─(5 failures / 10 s)─▶ OPEN ─(after 30 s)─▶ HALF_OPEN
  ▲                                                       │
  └──────────────(2 consecutive successes)────────────────┘
                                 │
  OPEN ◀────────(any failure in HALF_OPEN)────────────────┘
```

### Querying state via health endpoint

```bash
curl http://localhost:3000/health | jq '.circuitBreakers'
```

---

## Monitoring During Experiments

### Grafana dashboard

Open the STE Overview dashboard at `http://localhost:3001` (or your Grafana instance).

Key panels to watch during chaos:
- **HTTP Error Rate** — should spike during fault injection
- **DB Query Duration** — should spike during db-latency experiment
- **Circuit Breaker State** — should transition to 1 (OPEN) during db-failure/stellar-error experiments

### Prometheus queries

```promql
# Circuit breaker states (0=CLOSED, 1=OPEN, 2=HALF_OPEN)
circuit_breaker_state

# Chaos faults injected per experiment
chaos_injected_total

# Error rate
rate(http_requests_total{status_code=~"5.."}[1m])

# DB retry errors
rate(db_connection_errors_total[1m])
```

---

## Recovery Procedures

### Circuit breaker won't close automatically

If the breaker stays OPEN beyond the expected recovery window:

1. Check the dependency is actually healthy: `curl $DB_HOST/health` or Stellar RPC
2. If healthy, manually reset via the admin endpoint (if implemented) or restart the process
3. Review `circuit_breaker_transitions_total` metric to confirm the timeline

### Service unresponsive after chaos experiment

1. Disable chaos: unset `CHAOS_ENABLED` / `CHAOS_EXPERIMENT` and restart the process
2. Check for leaked connections in PostgreSQL: `SELECT count(*) FROM pg_stat_activity`
3. Drain and restart the connection pool if needed

### Experiment caused data corruption

The escrow system is append-only for financial records. No data should be mutated by chaos experiments — they inject faults at the transport/connection layer only. If data inconsistency is observed:

1. Check audit log: `GET /api/v1/admin/audit`
2. Cross-reference on-chain Stellar events with the database via the event indexer

---

## Adding New Experiments

1. Add an entry to [backend/chaos/config/experiments.json](../backend/chaos/config/experiments.json)
2. Add a test case in [backend/tests/chaos/chaosExperiments.test.js](../backend/tests/chaos/chaosExperiments.test.js)
3. Update this runbook with the experiment's hypothesis and verification steps
4. Run `npm run test:chaos` to confirm the test passes
