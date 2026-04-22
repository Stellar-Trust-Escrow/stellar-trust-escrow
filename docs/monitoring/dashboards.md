# Grafana Dashboards

## STE Overview (ste-overview.json)
Auto-provisioned. Access: http://localhost:3001/d/ste-overview

**Panels**:
1. Request Rate (req/s): `sum(rate(http_requests_total[1m])) by (route)`
2. P95 Latency (ms): `histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le, route))`
3. Error Rate (%): 5xx / total * 100
4. DB Query P95 (ms): `histogram_quantile(0.95, sum(rate(db_query_duration_ms_bucket[5m])) by (le, model, operation))`
5. Cache Hit Rate (%)
6. In-Flight Requests
7. Active Escrows
8. Slow Queries (1h)
9. Node Heap Used (MB)
10. Event Loop Lag (ms)
11-14. DB Connections/Pool/Query Rate

**Export**: Full JSON in `backend/monitoring/grafana/provisioning/dashboards/ste-overview.json`

## Recommended Additions
- **Indexer Lag**: `indexer_lag_seconds` (add gauge in services/escrowIndexer.js)
- **Contract Events**: `contract_events_processed_total{chain,contract}`
- **SLA Uptime**: `100 - (sum(rate(http_requests_total{status_code=~"5.."}[24h])) / sum(rate(http_requests_total[24h])))`

Import via Grafana UI → Dashboards → Import → Upload JSON.

