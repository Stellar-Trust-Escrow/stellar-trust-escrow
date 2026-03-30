# Key Metrics Definitions

All metrics exposed via prom-client at `/metrics`. Default labels: `{app="stellar-trust-escrow", env=...}`

## HTTP Metrics
| Metric | Type | Labels | Description | Grafana Query |
|--------|------|--------|-------------|---------------|
| `http_request_duration_ms` | Histogram | method,route,status_code | Req latency buckets [5..5000]ms | `histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))` |
| `http_requests_total` | Counter | method,route,status_code | Total reqs | `sum(rate(http_requests_total[5m])) by (route)` |
| `http_requests_in_flight` | Gauge | - | Concurrent reqs | `http_requests_in_flight` |

## Database (Prisma)
| Metric | Type | Labels | Description | Grafana Query |
|--------|------|--------|-------------|---------------|
| `db_query_duration_ms` | Histogram | model,operation | Query latency | p95: `histogram_quantile(0.95, rate(db_query_duration_ms_bucket[5m]))` |
| `db_queries_total` | Counter | model,operation | Query count | `sum(rate(db_queries_total[5m])) by (model)` |
| `db_slow_queries_total` | Counter | model,operation | >200ms queries | `increase(db_slow_queries_total[1h])` |
| `db_connections_active` | Gauge | - | Active conns | `db_connections_active` |
| `db_connection_pool_exhaustion_total` | Counter | - | Pool exhausted | `increase(...[5m]) > 0` |

## Cache
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `cache_hits_total`/`misses_total` | Counter | key_prefix | Hit rate: `rate(hits[5m]) / (hits+misses)` |
| `cache_size` | Gauge | - | Current size |

## Business Metrics
| Metric | Type | Description |
|--------|------|-------------|
| `active_escrows` | Gauge | Live escrows |
| `escrows_created_total` | Counter | Created count |
| `disputes_raised_total` | Counter | Disputes |
| `milestones_completed_total` | Counter | Milestones |

## Other
- **Node.js**: Heap used, event loop lag (default prom-client)
- **Circuit Breaker**: `circuit_breaker_state{name=...}` (0=closed,1=open)
- **Chaos**: `chaos_injected_total{experiment_id,fault_type}`

