# Runbook: SEV3 — Degraded Performance

**Use when:** Slow responses, high error rate on non-critical paths, cache issues, indexer lag.

## Diagnosis

### Check response times
```bash
# Look for SLOW log lines
grep "\[SLOW\]" /var/log/stellar-trust-escrow.log | tail -50
```

### Check cache hit rate
```bash
curl -H "x-admin-api-key: $ADMIN_API_KEY" https://api.stellartrustescrow.com/api/admin/cache/stats
```
If hit rate < 0.5, the cache may have been flushed or Redis is down.

### Check DB slow queries
Look for `[DB SLOW]` log lines. If queries are slow:
1. Check DB CPU and connection count
2. Run `EXPLAIN ANALYZE` on the slow query
3. Consider adding an index or increasing connection pool size

### Check Redis
```bash
redis-cli -u $REDIS_URL ping
redis-cli -u $REDIS_URL info stats | grep -E "hits|misses"
```

## Mitigation

### Warm the cache manually
```bash
# Invalidate and let it rebuild naturally, or call warm endpoints
curl https://api.stellartrustescrow.com/api/reputation/leaderboard
curl https://api.stellartrustescrow.com/api/escrows
```

### Flush a specific cache tag
```bash
curl -X DELETE -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tag":"escrows"}' \
  https://api.stellartrustescrow.com/api/admin/cache
```

### Scale DB connections
Update `DATABASE_URL` connection_limit parameter and restart.

## Resolution

- [ ] Response times back to baseline (< 500ms p95)
- [ ] Cache hit rate > 0.7
- [ ] No slow query log lines in last 5 minutes
- [ ] Update incident status to `resolved`
