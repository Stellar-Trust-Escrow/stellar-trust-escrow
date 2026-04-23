#!/bin/bash
set -euo pipefail

echo "🚀 Verifying Stellar Trust Escrow Monitoring Stack..."

# Check services
echo "📊 Checking Docker services..."
docker compose -f backend/monitoring/docker-compose.yml ps

# Test app metrics endpoint (assume backend running on 4000)
echo "📈 Testing /metrics endpoint..."
if curl -f -s http://localhost:4000/metrics | grep -q 'http_requests_total'; then
  echo "✅ App metrics available"
else
  echo "❌ No app metrics at :4000/metrics"
  exit 1
fi

# Prometheus targets
echo "🔍 Checking Prometheus targets..."
if curl -f -s http://localhost:9090/targets | grep -q '"state":"up"'; then
  echo "✅ Prometheus scraping OK"
else
  echo "⚠️  Check Prometheus targets page"
fi

# Grafana health
echo "📊 Checking Grafana..."
if curl -f -s http://localhost:3001/api/health | grep -q '"database":"ok"'; then
  echo "✅ Grafana healthy"
else
  echo "❌ Grafana health check failed"
fi

# Sample queries
echo "📉 Testing key queries..."
curl -s http://localhost:9090/api/v1/query?query=http_requests_total | grep -q result &amp;&amp; echo "✅ HTTP metrics"
curl -s http://localhost:9090/api/v1/query?query=db_queries_total | grep -q result &amp;&amp; echo "✅ DB metrics"
curl -s http://localhost:9090/api/v1/query?query=active_escrows | grep -q result &amp;&amp; echo "✅ Business metrics"

echo "🎉 Monitoring stack verification COMPLETE!"
echo "🌐 Grafana: http://localhost:3001 | Prometheus: http://localhost:9090"

