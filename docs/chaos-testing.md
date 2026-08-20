# Chaos Testing Suite

This document describes the chaos testing suite that uses Toxiproxy to inject network-level failures between the backend and its dependencies (Redis, Stellar RPC, Postgres).

## Overview

The chaos test suite is designed to verify that the system degrades gracefully rather than crashing when dependencies fail or experience high latency.

## Architecture

The test suite uses Docker Compose to spin up the required services:
- `toxiproxy`: The proxy layer that injects faults
- `redis`: The Redis dependency
- `postgres`: The PostgreSQL database
- `stellar`: The Stellar quickstart node
- `backend`: The main API server, configured to connect through Toxiproxy

```
Backend
   │
   ▼
Toxiproxy (Proxies: 26379 → Redis:6379, 25432 → Postgres:5432, 28001 → Stellar:8001)
   │
   ├─→ Redis
   ├─→ Postgres
   └─→ Stellar
```

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 20+

### Running Locally

1. Start all services using Docker Compose:
   ```bash
   docker compose -f docker-compose.chaos.yml up -d --wait
   ```

2. Run all chaos scenarios:
   ```bash
   node tests/chaos/index.js
   ```

3. Or run a specific scenario:
   ```bash
   node tests/chaos/index.js redis_down
   ```

4. Stop all services when done:
   ```bash
   docker compose -f docker-compose.chaos.yml down
   ```

## Scenarios

### 1. Redis Down (`redis_down.js`)
- **Fault injected**: Disable all traffic to Redis
- **Assertions**:
  - GET /api/v1/escrows → 200 (falls back to DB)
  - POST /api/v1/auth/login → 200 (rate limiter fails open)
  - GET /health → 200 with redis: degraded
  - No unhandled promise rejections

### 2. Redis Latency (`redis_latency.js`)
- **Fault injected**: 1000ms latency to Redis
- **Assertions**:
  - API responses within acceptable time (5000ms)
  - No 5xx errors

### 3. Stellar RPC Timeout (`stellar_rpc_timeout.js`)
- **Fault injected**: 5000ms latency to Stellar RPC
- **Assertions**:
  - POST /api/v1/escrows/:id/broadcast responds within 10s
  - Circuit breaker opens after 5 failures
  - GET /api/v1/fees/estimate uses cached values

### 4. Stellar RPC Errors (`stellar_rpc_errors.js`)
- **Fault injected**: Reset peer errors for Stellar RPC
- **Assertions**:
  - Circuit breaker behavior
  - Appropriate error handling

### 5. DB Slow Queries (`db_slow_queries.js`)
- **Fault injected**: 500ms latency to Postgres
- **Assertions**:
  - GET /api/v1/escrows uses cached results (fast)
  - Uncached GET /api/v1/escrows/:id responds within 2s
  - Prisma connection pool not exhausted

### 6. Combined Degraded (`combined_degraded.js`)
- **Fault injected**: Redis down + Stellar RPC 2000ms latency
- **Assertions**:
  - No 500 errors on GET endpoints
  - System remains functional

## CI Integration

The GitHub Actions workflow is defined in `.github/workflows/chaos.yml`. It:
- Runs on `workflow_dispatch` and weekly cron (Sunday at 01:00 UTC)
- Uses Docker Compose to spin up all services
- Runs all chaos scenarios using `node tests/chaos/index.js`
- Fails if any scenario fails

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TOXIPROXY_HOST` | Host where Toxiproxy API is running | `localhost` |
| `TOXIPROXY_PORT` | Port for Toxiproxy API | `8474` |
| `API_BASE_URL` | Base URL for backend API | `http://localhost:4000` |

## Adding New Scenarios

1. Create a new file in `tests/chaos/scenarios/`
2. Use `setup.js` and `teardown.js` for Toxiproxy management
3. Use `assertions.js` for shared validation logic
4. Export a default async function that runs the scenario
5. Add it to `tests/chaos/index.js`
6. Run the scenario locally to test it
7. Update this document with scenario details

## Related Documents

- [Chaos Engineering Runbook](./runbooks/chaos-engineering.md)
