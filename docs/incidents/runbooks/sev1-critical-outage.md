# Runbook: SEV1 — Critical Outage

**Use when:** Full API outage, database unreachable, funds at risk, security breach.

## Immediate Actions (first 5 minutes)

- [ ] Acknowledge the PagerDuty alert
- [ ] Join `#incidents` Slack channel and announce you are the incident commander
- [ ] Create the incident record: `POST /api/incidents` with `severity: SEV1`
- [ ] Post initial status page update (see `templates/status-page-update.md`)
- [ ] Escalate to engineering lead if not already paged

## Diagnosis (5–15 minutes)

### Check API health
```bash
curl https://api.stellartrustescrow.com/health
```
Expected: `{ "status": "ok" }` — if degraded, check DB and cache.

### Check application logs
```bash
# Heroku
heroku logs --tail --app stellar-trust-escrow-api

# Docker / systemd
journalctl -u stellar-trust-escrow -f --since "10 minutes ago"
```

### Check database connectivity
```bash
# Verify DATABASE_URL is reachable
psql $DATABASE_URL -c "SELECT 1"

# Check active connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();"
```

### Check Sentry for error spikes
- Open Sentry → Issues → sort by "First Seen" descending
- Look for new error groups in the last 15 minutes

### Check Stellar network
```bash
curl https://soroban-testnet.stellar.org/health
# or mainnet:
curl https://horizon.stellar.org/
```

## Mitigation Options

### Restart the API
```bash
heroku restart --app stellar-trust-escrow-api
# or
docker compose restart api
```

### Enable maintenance mode
```bash
# Set env var to return 503 on all routes
heroku config:set MAINTENANCE_MODE=true --app stellar-trust-escrow-api
```

### Roll back to previous release
```bash
heroku releases --app stellar-trust-escrow-api
heroku rollback v<N> --app stellar-trust-escrow-api
```

### Scale up if under load
```bash
heroku ps:scale web=3 --app stellar-trust-escrow-api
```

## Resolution

- [ ] Confirm `/health` returns `{ "status": "ok" }`
- [ ] Confirm error rate in Sentry has returned to baseline
- [ ] Update incident status to `resolved`
- [ ] Post resolution update to status page
- [ ] Schedule post-mortem within 48 hours
- [ ] Notify stakeholders

## Post-Incident

Complete the post-mortem template within 48 hours of resolution.
See `templates/post-mortem.md`.
