# Runbook: Database Outage

**Severity:** SEV1 if full outage, SEV2 if partial (read-only or slow).

## Diagnosis

```bash
# Test connectivity
psql $DATABASE_URL -c "SELECT version();"

# Check active connections
psql $DATABASE_URL -c "
  SELECT state, count(*)
  FROM pg_stat_activity
  WHERE datname = current_database()
  GROUP BY state;"

# Check for long-running queries (> 30s)
psql $DATABASE_URL -c "
  SELECT pid, now() - query_start AS duration, query, state
  FROM pg_stat_activity
  WHERE state != 'idle'
    AND now() - query_start > interval '30 seconds'
  ORDER BY duration DESC;"
```

## Mitigation

### Kill long-running queries
```bash
psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE now() - query_start > interval '5 minutes' AND state != 'idle';"
```

### Connection pool exhaustion
1. Reduce `connection_limit` in `DATABASE_URL` temporarily
2. Restart the API to release connections
3. Consider enabling PgBouncer

### DB server unreachable
1. Check cloud provider status page (AWS RDS / Supabase / Neon)
2. Verify security group / firewall rules allow the API server IP
3. If RDS: check Multi-AZ failover status in AWS console

### Run pending migrations
```bash
npx prisma migrate deploy
```

### Restore from backup (last resort)
1. Identify the latest clean backup in your cloud provider console
2. Restore to a new instance
3. Update `DATABASE_URL` to point to the restored instance
4. Restart the API

## Resolution Checklist

- [ ] `psql $DATABASE_URL -c "SELECT 1"` succeeds
- [ ] `/health` endpoint shows `db.status: ok`
- [ ] No connection errors in application logs for 5 minutes
- [ ] Prisma migrations are up to date
