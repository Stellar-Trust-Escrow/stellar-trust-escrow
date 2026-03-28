# Disaster Recovery Plan — StellarTrustEscrow

## Objectives

| Metric | Target |
|--------|--------|
| RTO (Recovery Time Objective) | < 1 hour for SEV1, < 4 hours for SEV2 |
| RPO (Recovery Point Objective) | < 24 hours (daily backups), < 1 hour with WAL archiving |

---

## Covered Scenarios

1. Database failure / data loss
2. API server outage
3. Smart contract exploit
4. Stellar network disruption
5. Secret/credential compromise

---

## 1. Database Failure

**Detection:** PagerDuty alert, `GET /health` returns DB error, Grafana DB connection metric drops.

**Recovery steps:**

```bash
# 1. Identify latest valid backup
ls -lt /var/backups/stellar-trust/backup_*.dump | head -5
# or from S3:
aws s3 ls $BACKUP_S3_BUCKET --recursive | sort | tail -5

# 2. Restore to a fresh DB
createdb stellar_trust_escrow_restored
pg_restore \
  --host=$DB_HOST --port=$DB_PORT \
  --username=$DB_USER \
  --dbname=stellar_trust_escrow_restored \
  /var/backups/stellar-trust/backup_<TIMESTAMP>.dump

# 3. Verify checksum before restoring
sha256sum -c /var/backups/stellar-trust/backup_<TIMESTAMP>.dump.sha256

# 4. Update DATABASE_URL in Vault / .env to point to restored DB
# 5. Restart backend: pm2 restart all  OR  docker compose restart api
```

**Runbook:** `docs/incidents/runbooks/database-outage.md`

---

## 2. API Server Outage

**Detection:** Health check fails, uptime monitor alerts, Sentry error spike.

**Recovery steps:**

```bash
# Docker deployment
docker compose down && docker compose up -d

# PM2 deployment
pm2 restart all

# Check logs
docker compose logs --tail=100 api
# or
pm2 logs --lines 100
```

If the server itself is gone, redeploy from the last known-good image:

```bash
# Re-run deploy script
bash scripts/deploy.sh
```

**Runbook:** `docs/incidents/runbooks/sev1-critical-outage.md`

---

## 3. Smart Contract Exploit

**Detection:** Anomalous on-chain transactions, Sentry alerts, user reports of unexpected fund movement.

**Immediate actions (first 15 min):**

1. Pause any off-chain automation that submits transactions (stop `escrowIndexer`, `eventIndexer` services).
2. Post SEV1 incident via API or Slack bot.
3. Do NOT attempt on-chain fixes without contract owner key — coordinate with security lead.
4. Preserve all logs and transaction hashes before any remediation.

**Runbook:** `docs/incidents/runbooks/smart-contract-exploit.md`

---

## 4. Stellar Network Disruption

**Detection:** Soroban RPC calls failing, Horizon returning errors, `stellarService.js` circuit breaker open.

**Recovery steps:**

1. Switch `SOROBAN_RPC_URL` and `STELLAR_HORIZON_URL` to a backup provider or community RPC node.
2. Restart backend to pick up new env values.
3. Monitor `GET /health` until Stellar connectivity is confirmed.

Backup RPC endpoints (testnet):
- `https://soroban-testnet.stellar.org` (official)
- `https://rpc-futurenet.stellar.org` (fallback for testing)

For mainnet, maintain at least one alternative RPC URL in Vault under `stellar-trust/app`.

---

## 5. Secret / Credential Compromise

**Detection:** Unauthorized API calls, Vault audit log anomaly, breach notification.

**Immediate actions:**

```bash
# Rotate Vault AppRole secret
vault write -f auth/approle/role/stellar-trust/secret-id

# Revoke all active tokens for the role
vault token revoke -mode=path auth/approle/role/stellar-trust

# Rotate DB password
# Update DATABASE_URL in Vault and restart backend
```

Rotate all affected secrets before bringing services back online. See `backend/config/vault-setup.sh` for re-provisioning steps.

---

## Backup Schedule

Backups are managed by `scripts/backup.sh` and scheduled via `scripts/backup.cron`.

| Frequency | Retention | Storage |
|-----------|-----------|---------|
| Daily (cron) | 7 days local | `/var/backups/stellar-trust` |
| Daily (cron) | 30 days remote | S3 (`BACKUP_S3_BUCKET`) |

To run a manual backup with restore verification:

```bash
bash scripts/backup.sh --restore-test
```

Backup health is monitored by `backend/services/backupMonitor.js` — alerts fire to `SLACK_BACKUP_WEBHOOK` on failure.

---

## DR Test Schedule

| Test | Frequency | Owner |
|------|-----------|-------|
| Backup restore drill | Monthly | On-call engineer |
| Full failover simulation | Quarterly | Engineering lead |
| Secret rotation drill | Quarterly | Security lead |
| Runbook walkthrough | After each SEV1/SEV2 | Incident commander |

To run a restore drill:

```bash
bash scripts/backup.sh --restore-test
```

Document results in `docs/incidents/` as a post-mortem entry.

---

## Communication Plan

| Audience | Channel | Who |
|----------|---------|-----|
| Engineering team | `#incidents` Slack | On-call engineer |
| Stakeholders | Email / status page | Engineering lead |
| Users | Status page update | Engineering lead |

Templates: `docs/incidents/templates/`

Escalation path: On-call → Secondary on-call → Engineering lead → CTO.
See `docs/incidents/on-call-guide.md` for full escalation matrix.

---

## Key Contacts & Access

Before an incident, confirm you have access to:

- AWS console (S3 backups)
- Vault (`VAULT_ADDR`, AppRole credentials)
- Database host
- Deployment platform (Docker host / Render / Heroku)
- PagerDuty + Slack `#incidents`

Current on-call: `GET /api/incidents/oncall`
