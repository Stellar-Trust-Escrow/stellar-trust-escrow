# Monitoring Stack Setup Guide

## Quick Start (Local Development)

```bash
cd backend/monitoring
docker compose up -d
```

This launches:
- **Prometheus**: http://localhost:9090 (scrapes app at :4000/metrics)
- **Grafana**: http://localhost:3001 (admin/admin) - auto-provisioned dashboards/datasources

## Production Deployment

1. **App Metrics Endpoint**: Ensure `/metrics` exposed (default in server.js middleware)
2. **Env Vars**:
   ```
   METRICS_TOKEN=your_token  # Optional bearer auth in prometheus.yml
   ```
3. **Docker Compose Override** (prod.yml):
   ```yaml
   services:
     prometheus:
       volumes:
         - prometheus_data:/prometheus
   ```
4. **Helm/K8s**: Use prometheus-operator CRDs for scrape configs

## Verification

```bash
# Check app metrics
curl http://localhost:4000/metrics | head -20

# Prometheus targets
http://localhost:9090/targets

# Grafana Dashboard
http://localhost:3001/d/ste-overview
```

## Key Ports
| Service | Port | Purpose |
|---------|------|---------|
| Prometheus | 9090 | Metrics storage/query |
| Grafana | 3001 | Dashboards/alerting UI |
| App | 4000 | /metrics endpoint |

## Troubleshooting
- **No metrics**: Check `host.docker.internal:4000/metrics` accessible from Prometheus
- **Slow queries**: Threshold 200ms logged + `db_slow_queries_total`
- **Shutdown**: `docker compose down -v`

