# SLA Monitoring & Anomaly Detection

## 99.9% Uptime SLA
**Definition**: ≤43m30s downtime/month (error budget).  
**Metric**: `100 - (sum(rate(http_requests_total{status_code=~"5.."}[24h])) / sum(rate(http_requests_total[24h]))) * 100`

**Error Budget Dashboard**:
```
Burn Rate (1h): rate(errors[1h])/0.1%_expected
Burn Rate (6h): rate(errors[6h])/0.1%_expected
Remaining Budget: 100% - integral(err_rate - 0.1%)(*)
```

PromQL: 
```
sum_over_time(
  (1 - (sum(rate(http_requests_total{status_code=~"5.."}[1h])) / sum(rate(http_requests_total[1h]))))[30d:1h]
) * 24 * 30  # Monthly budget consumed (hours)
```

## Anomaly Detection
**PromQL Examples**:
```
# Forecast deviation (HTTP rate)
avg_over_time(req_rate[7d]) + 2*stddev_over_time(req_rate[7d]) < current_rate

# DB anomaly
anomaly(db_query_duration_ms_sum / db_query_duration_ms_count, 7d, 0.95)
```

**Grafana ML Plugins**:
1. Install `grafana-ml` or `prometheus-anomaly-detector`
2. Panel: `predict_linear(req_rate[1h], 24h)` vs actual

## Indexer Lag (Recommended)
Add to `escrowIndexer.js`:
```js
const indexerLag = new Gauge({
  name: 'indexer_lag_seconds',
  help: 'Seconds behind latest block'
});
setInterval(() => {
  indexerLag.set(Date.now()/1000 - latestBlockTimestamp);
}, 30000);
```

**Alert**: `indexer_lag_seconds > 300` (5min lag → critical)

