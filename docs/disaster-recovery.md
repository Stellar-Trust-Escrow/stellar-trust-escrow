# Disaster Recovery Plan — StellarTrustEscrow

**Critical:** This document must be tested monthly. All procedures in this guide have been practiced in a staging environment.

## Executive Summary

StellarTrustEscrow handles financial transactions. A database failure, server outage, or credential compromise can lead to permanent data loss or unauthorized fund transfers. This guide covers detection, immediate response, and detailed recovery procedures for all critical failure scenarios.

### Recovery Objectives

| Metric | Target | Notes |
|--------|--------|-------|
| **RTO (Recovery Time Objective)** | < 1 hour (SEV1) | Time to restore service and accept traffic |
| **RPO (Recovery Point Objective)** | < 1 hour (with WAL) | Maximum acceptable data loss |
| **Backup Retention** | 30 days (S3) | Supports recovery from weeks-old failures |
| **Testing Frequency** | Monthly | Backup restore drill; annual full failover test |

### Covered Scenarios

1. **Database failure / data loss** — Corruption, accidental deletion, storage failure
2. **API server outage** — Process crash, deployment failure, infrastructure failure
3. **Smart contract exploit** — On-chain state corruption, unauthorized fund movement
4. **Stellar network disruption** — Horizon/RPC unavailable, network partition
5. **Secret/credential compromise** — Leaked API keys, database password exposure
6. **Partial data corruption** — Specific records damaged but DB still running

---

## Quick Reference: Who to Contact First

**During Business Hours:** Page on-call engineer via PagerDuty  
**After Hours (SEV1):** Direct to SEV1 escalation (contact list in Vault: `stellar-trust/secrets/contacts`)  
**Critical Path:** On-call Engineer → Secondary On-call → Engineering Lead → CTO  

---

## 1. Database Failure / Data Loss

## 1. Database Failure / Data Loss

### Detection

- **Primary Signal:** Health check (`GET /health`) returns `500 Database error`
- **Secondary Signals:**
  - PagerDuty alert: "Database connection pool exhausted" or "DB unreachable"
  - Grafana dashboard shows DB connection count = 0
  - CloudWatch logs show connection timeouts
  - Sentry error spike with `ConnectionError` or `ECONNREFUSED`

### Severity Assessment

| Symptom | Severity | Action |
|---------|----------|--------|
| DB responds slowly (latency > 5s) | SEV3 | Investigate slow queries; restart if needed |
| DB returns connection errors intermittently | SEV2 | Restart DB service; if continues, fail over to replica |
| DB is completely offline or corrupted | SEV1 | Initiate immediate backup restore |

### Recovery Procedures (by scenario)

#### Scenario 1A: Database Is Slow (High Latency)

```bash
# 1. Connect to database server
ssh $DB_HOST

# 2. Check running queries
psql -h localhost -U postgres stellar_trust_escrow -c "
  SELECT pid, state, query_start, query
  FROM pg_stat_activity
  WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%'
  ORDER BY query_start ASC;
"

# 3. Identify slow queries (runtime > 10 minutes)
# 4. Kill the query if it's corrupting data (CHECK WITH TEAM FIRST)
SELECT pg_terminate_backend(PID);

# 5. Monitor for recovery
watch -n 2 'psql -c "SELECT count(*) FROM pg_stat_activity WHERE state != '\''idle'\'';"'
```

**If slow query is index corruption:**
```bash
# Run VACUUM ANALYZE to reclaim space and rebuild statistics
psql -h localhost -U postgres stellar_trust_escrow -c "VACUUM ANALYZE;"
```

---

#### Scenario 1B: Database Connection Errors (Still Running)

```bash
# 1. Check connection pool status
psql -h localhost -U postgres stellar_trust_escrow -c "
  SELECT datname, count(*) as connection_count
  FROM pg_stat_activity
  GROUP BY datname;
"

# 2. If connection count > 100:
# Restart the database connection pool on backend
docker compose restart api  # or: pm2 restart backend

# 3. Monitor connections again
psql -h localhost -U postgres stellar_trust_escrow -c "SELECT count(*) FROM pg_stat_activity;"

# 4. If pool still full, restart PostgreSQL
docker compose restart db  # or: systemctl restart postgresql
```

**Expected recovery time:** 30-60 seconds after restart

---

#### Scenario 1C: Database Is Offline or Corrupted

**RTO Target: 45-60 minutes**

##### Step 1: Confirm Database Is Unrecoverable

```bash
# Try to connect
psql -h $DB_HOST -U $DB_USER -d stellar_trust_escrow -c "SELECT 1;"

# If connection fails or returns errors, proceed to restore

# Check if any processes are still using the old DB
lsof | grep $DB_DATA_DIR | wc -l
# If > 0, kill them: kill -9 <PID>
```

##### Step 2: Identify Latest Valid Backup

```bash
# List available backups (local)
ls -lth /var/backups/stellar-trust/backup_*.dump | head -10
# Output: backup_20260620T0300Z.dump backup_20260619T0300Z.dump ...

# OR list from S3 (recommended for safety)
aws s3 ls s3://$BACKUP_S3_BUCKET/daily-backups/ --recursive | sort
# Output: 
#  2026-06-20 03:00:00 backup_20260620T0300Z.dump
#  2026-06-19 03:00:00 backup_20260619T0300Z.dump
```

**Choose a backup:**
- Latest successful backup (if data loss < 1 hour acceptable)
- Point-in-time restore if available (requires WAL archiving enabled)

##### Step 3: Verify Backup Integrity

```bash
# Download backup from S3 if needed
aws s3 cp s3://$BACKUP_S3_BUCKET/daily-backups/backup_20260620T0300Z.dump \
  /tmp/backup_20260620T0300Z.dump

# Verify checksum
aws s3 cp s3://$BACKUP_S3_BUCKET/daily-backups/backup_20260620T0300Z.dump.sha256 \
  /tmp/backup_20260620T0300Z.dump.sha256

sha256sum -c /tmp/backup_20260620T0300Z.dump.sha256
# Output: backup_20260620T0300Z.dump: OK

# Verify backup can be listed (sanity check)
pg_restore --list /tmp/backup_20260620T0300Z.dump | head -20
# If this fails, backup is corrupted; try previous backup
```

##### Step 4: Prepare Fresh Database

```bash
# 1. Stop all backend services (prevent writes during restore)
docker compose stop api
# or: pm2 stop all

# 2. Drop corrupted database
psql -h $DB_HOST -U postgres -c "DROP DATABASE stellar_trust_escrow;"

# 3. Create empty database
psql -h $DB_HOST -U postgres -c "CREATE DATABASE stellar_trust_escrow OWNER $DB_USER;"

# 4. Verify empty database is ready
psql -h $DB_HOST -U $DB_USER -d stellar_trust_escrow -c "SELECT 1;"
```

##### Step 5: Restore from Backup

```bash
# Restore in verbose mode to monitor progress
pg_restore \
  --host=$DB_HOST \
  --port=$DB_PORT \
  --username=$DB_USER \
  --dbname=stellar_trust_escrow \
  --verbose \
  /tmp/backup_20260620T0300Z.dump 2>&1 | tee /tmp/restore.log

# Monitor progress (in separate terminal)
tail -f /tmp/restore.log | grep -E "COPY|TABLE|INDEX|CONSTRAINT"

# Restore typical size (100GB database) takes 20-30 minutes on SSD
# Do NOT interrupt; wait for completion
```

##### Step 6: Post-Restore Validation

```bash
# 1. Check database size
psql -h $DB_HOST -U $DB_USER -d stellar_trust_escrow -c "
  SELECT pg_database.datname,
         pg_size_pretty(pg_database_size(pg_database.datname)) AS size
  FROM pg_database
  WHERE datname = 'stellar_trust_escrow';
"
# Should be close to original backup size (e.g., 95GB)

# 2. Verify table counts match backup manifest
psql -h $DB_HOST -U $DB_USER -d stellar_trust_escrow -c "
  SELECT schemaname, tablename, 
         (SELECT count(*) FROM information_schema.tables 
          WHERE table_schema = schemaname) as count
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
"

# 3. Run integrity check
psql -h $DB_HOST -U $DB_USER -d stellar_trust_escrow -c "
  REINDEX DATABASE stellar_trust_escrow;  -- This may take 5-10 min for large DB
"

# 4. Verify critical data exists
psql -h $DB_HOST -U $DB_USER -d stellar_trust_escrow -c "
  SELECT 
    (SELECT count(*) FROM escrows) as escrow_count,
    (SELECT count(*) FROM milestones) as milestone_count,
    (SELECT count(*) FROM users) as user_count,
    (SELECT count(*) FROM disputes) as dispute_count;
"
# Should all be > 0
```

##### Step 7: Restart Backend Services

```bash
# 1. Start backend
docker compose up -d api
# or: pm2 start backend

# 2. Verify health endpoint returns 200
curl -s http://localhost:3000/health | jq .
# Should return: { "status": "ok", "db": "connected", ... }

# 3. Monitor logs for 2 minutes (ensure no errors)
docker compose logs -f api --tail=50
# or: pm2 logs backend | head -100

# 4. Run smoke tests
npm test -- --testPathPattern=smoke
```

**Recovery Complete When:**
- ✅ Health endpoint returns 200
- ✅ Critical tables have expected row counts
- ✅ No errors in logs
- ✅ Users can login and view escrows

**Recovery Time:** 45-60 minutes total

---

### 1.1 Point-in-Time Recovery (PITR) with WAL Archiving

**Prerequisites:** WAL archiving must be enabled in `postgresql.conf`:

```conf
wal_level = replica
archive_mode = on
archive_timeout = 60
archive_command = 'aws s3 cp "%p" "${WAL_ARCHIVE_S3_BUCKET}/wal/%f" --sse AES256'
restore_command = 'aws s3 cp "${WAL_ARCHIVE_S3_BUCKET}/wal/%f" "%p"'
```

**Use PITR if:**
- Database is online but contains corrupted data
- You need to recover to a specific point-in-time within WAL retention (typically 7 days)
- Example: Accidental DELETE statement at 2pm; recover to 1:59pm state

**Procedure:**

```bash
# 1. Take a base backup
pg_basebackup -h $DB_HOST -U postgres -D /tmp/basebackup_20260620 -Ft -z -P

# 2. Get WAL segments from that backup
# (The backup includes the timeline and LSN to recover from)

# 3. Restore to a specific point-in-time
# Create recovery config
cat > /tmp/recovery.conf <<EOF
restore_command = 'aws s3 cp ${WAL_ARCHIVE_S3_BUCKET}/wal/%f "%p" || exit 1'
recovery_target_timeline = 'latest'
recovery_target_time = '2026-06-20 13:59:00 UTC'
recovery_target_inclusive = true
EOF

# 4. Extract base backup and apply WAL
cd /tmp
tar xzf basebackup_20260620/base.tar.gz -C /var/lib/postgresql/pitr_data
tar xzf basebackup_20260620/pg_wal.tar.gz -C /var/lib/postgresql/pitr_data/pg_wal

# 5. Move recovery config into place
cp /tmp/recovery.conf /var/lib/postgresql/pitr_data/recovery.conf

# 6. Start PostgreSQL with PITR config
# It will replay WAL up to recovery_target_time, then open for connections
systemctl start postgresql  # or: pg_ctl -D /var/lib/postgresql/pitr_data start

# 7. Verify recovery
pg_controldata /var/lib/postgresql/pitr_data | grep "Database cluster state"
# Should show: "in production" or "shut down in recovery"

# 8. Once verified, promote to primary
psql -c "SELECT pg_wal_replay_resume();"
# or: touch /var/lib/postgresql/pitr_data/recovery.done
```

**When recovery completes:**
- WAL replay stops at the recovery target time
- Database is in read-only state while replaying
- After replay completes, database becomes writable
- Verify data is correct before restarting applications

---

### 1.2 Backup Schedule & Verification Policy

---

## 2. API Server Outage

### Detection

- Health check (`GET /health`) returns 5xx error or times out
- Uptime monitor (UptimeRobot, etc.) alerts
- Sentry shows error spike in all endpoints
- CloudWatch logs show no requests being processed
- Users report "site is down" or "cannot connect"

### Recovery Procedures

#### Step 1: Verify the Outage

```bash
# Quick health check
curl -s -w "\nhttp_code: %{http_code}\n" http://localhost:3000/health

# Check if endpoint responds at all
timeout 5 curl -v http://localhost:3000/health

# Check if process is running
docker ps | grep stellar-trust-escrow-api
# or: pm2 list
```

#### Step 2: Check Logs for Error Root Cause

```bash
# Docker logs (last 100 lines, follow for live output)
docker compose logs --tail=100 -f api

# PM2 logs
pm2 logs backend | head -200

# Look for:
#   - Uncaught exceptions
#   - Out of memory errors (ENOMEM)
#   - Connection pool exhausted
#   - Segmentation faults
```

#### Step 3: Graceful Restart (First Attempt)

```bash
# Docker: Restart the container
docker compose restart api
# Waits up to 10 seconds for container to stop; kills if not stopped

# PM2: Restart the process
pm2 restart backend
# Triggers graceful shutdown (Node signal handlers)

# Wait for restart
sleep 10

# Verify health
curl -s http://localhost:3000/health | jq .
```

#### Step 4: Full Redeployment (If Restart Fails)

```bash
# Docker: Pull latest image and restart
docker compose pull api && docker compose up -d api

# PM2: Re-deploy from git
cd /app/stellar-trust-escrow
git fetch origin
git checkout develop  # or your deployment branch
npm install
pm2 restart backend

# Verify
curl -s http://localhost:3000/health
```

#### Step 5: Check Database Connection (If Health Still Fails)

```bash
# Verify database is reachable
psql -h $DB_HOST -U $DB_USER -d stellar_trust_escrow -c "SELECT 1;"

# Check backend database connection pool
docker compose exec api node -e "console.log(process.env.DATABASE_URL)"

# Restart database if needed
docker compose restart db
```

#### Step 6: Full System Restart (Last Resort)

```bash
# Stop all services
docker compose down
# Wait 10 seconds
sleep 10

# Ensure no orphaned processes
lsof -i :3000 | grep -v COMMAND | awk '{print $2}' | xargs kill -9

# Start clean
docker compose up -d

# Monitor startup
docker compose logs -f api --tail=50
# Wait 30 seconds for startup
sleep 30

# Verify
curl -s http://localhost:3000/health
```

**RTO at this step:** 5-10 minutes  
**When to call escalation:** If health still returns error after full restart

---

## 3. Smart Contract Exploit / On-Chain Anomaly

### Detection

- Unauthorized fund transfers detected via Sentry alert
- Users report missing funds or unexpected balance changes
- Soroban RPC returns error when calling contract
- On-chain event log shows unexpected state transitions (e.g., milestone approved without request)
- Audit flag triggered in `backend/services/contractAuditService.js`

### Severity Assessment

| Symptom | Severity | Action |
|---------|----------|--------|
| Contract read operation fails | SEV2 | Investigate RPC connection; may be temporary |
| Unauthorized state change on-chain | SEV1 | **STOP ALL TRANSACTIONS IMMEDIATELY** |
| Funds transferred without corresponding escrow action | SEV1 | **FREEZE CONTRACT; initiate audit** |

### Immediate Response (First 30 Minutes)

```bash
# 1. STOP all off-chain automation
docker compose stop escrow-indexer event-indexer
pm2 stop escrow-indexer event-indexer

# 2. POST SEV1 incident
# Alert incident channel and page security lead
curl -X POST $SLACK_WEBHOOK \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "🚨 SEV1: Potential Smart Contract Exploit",
    "blocks": [{
      "type": "section",
      "text": {"type": "mrkdwn", "text": "*Contract Alert*\n```\nDescription: Unauthorized fund movement detected\nTime: $(date -u +%Y-%m-%dT%H:%M:%SZ)\nRequested Response: Freeze contract, page security lead\n```"}
    }]
  }'

# 3. FREEZE outgoing transactions
# Edit backend config or environment
export CONTRACT_OPERATIONS_DISABLED=true
docker compose restart api

# 4. Document the event
# Collect transaction hash, affected accounts, amounts
# Store in /tmp/exploit_evidence_$(date +%s).json

# 5. Page the security lead and contract owner
# Do NOT attempt on-chain fixes without contract owner authorization
pagerduty trigger --service-key=$SECURITY_LEAD_KEY \
  --description="Potential smart contract exploit detected; manual investigation required"
```

### Investigation (30 Minutes - 2 Hours)

```bash
# 1. Query the suspicious transaction
# From Stellar Expert or Soroban RPC
soroban_cli rpc read --contract-id=$CONTRACT_ADDRESS \
  --function=get_escrow --args '{"id": ESCROW_ID}'

# 2. Examine transaction details
stellar_cli tx show $TRANSACTION_HASH

# 3. Compare with expected state
# Query backend DB for what we expect
psql -c "SELECT * FROM escrows WHERE id = ESCROW_ID;"

# 4. Collect evidence
#   - Transaction hash and timestamp
#   - Before/after contract state
#   - Affected user accounts
#   - Amount of funds moved
#   - Network (testnet vs mainnet)

# 5. Review recent code changes
git log --oneline backend/services/sorobanService.js | head -10
git diff HEAD~5 backend/services/sorobanService.js
```

### Containment & Resolution

**If exploit is confirmed:**

```bash
# 1. Deploy contract patch (if available)
# Contract owner must create patched WASM and deploy

# 2. If no patch is available, options are:
#    - Pause contract admin functions (if pause capability exists)
#    - Deploy new contract version
#    - Manually revert affected transactions (requires careful planning)

# 3. Do NOT restart indexers until fix is deployed and verified

# 4. Once patched:
docker compose start escrow-indexer event-indexer

# 5. Re-sync state from contract
npm run db:seed -- --sync-from-contract

# 6. Verify affected escrows
psql -c "SELECT id, status, balance FROM escrows WHERE id IN (LIST_OF_AFFECTED_IDS);"
```

**Runbook Reference:** See `docs/incidents/runbooks/smart-contract-exploit.md`

---

## 4. Stellar Network Disruption / RPC Unavailability

### Detection

- Soroban RPC requests timeout or return 5xx errors
- Horizon API returns "connection refused" or 503 Service Unavailable
- Backend service `stellarService.js` circuit breaker opens
- Health check returns `"stellar_connection": "disconnected"`
- Users cannot create new escrows or approve milestones

### Root Cause Assessment

```bash
# 1. Check if Stellar network itself is down
curl -s https://horizon.stellar.org/health | jq .

# 2. Check Soroban RPC
curl -s -X POST https://soroban-rpc.stellar.org/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc": "2.0", "id": "1", "method": "getHealth"}' | jq .

# 3. Check backend's RPC connection
curl -s http://localhost:3000/health | jq .stellar_rpc_status

# 4. Check network connectivity from backend
docker compose exec api bash -c "curl -v https://soroban-rpc.stellar.org"

# 5. Check DNS resolution
docker compose exec api bash -c "nslookup soroban-rpc.stellar.org"
```

### Recovery Procedures

#### Option A: Stellar Outage (Official RPC Down, But Network Live)

**Use a backup RPC provider:**

```bash
# Edit .env or update via Vault
export SOROBAN_RPC_URL=https://rpc-futurenet.stellar.org
export STELLAR_HORIZON_URL=https://horizon-futurenet.stellar.org

# Restart backend
docker compose up -d --force-recreate api

# Verify connection
curl -s http://localhost:3000/health | jq .stellar_connection
```

**Backup RPC providers:**

| Provider | URL | Status |
|----------|-----|--------|
| Stellar Official (Testnet) | https://soroban-testnet.stellar.org | Primary |
| Stellar FutureNet | https://rpc-futurenet.stellar.org | Fallback |
| Stellar Mainnet | https://soroban-rpc.stellar.org | Primary (mainnet) |

#### Option B: Network Partition / Regional Connectivity Issue

```bash
# Check if backend can reach ANY external service
curl -s https://www.google.com -m 5 && echo "Network OK" || echo "Network DOWN"

# If network is down:
#   1. Contact infrastructure team
#   2. Check firewall rules / security groups
#   3. Verify egress routes

# If network is up but Stellar RPC is unreachable:
#   1. Check DNS: nslookup soroban-rpc.stellar.org
#   2. Check firewall rule for port 443
#   3. Try traceroute: traceroute soroban-rpc.stellar.org
```

#### Option C: Local Backend Issue (DNS, Caching, Connection Pool)

```bash
# Clear DNS cache
# In Docker:
docker compose exec api bash -c "systemctl restart systemd-resolved"

# Reset Node.js connection pool
# Restart backend
docker compose restart api

# Check proxy settings (if behind corporate proxy)
docker compose exec api bash -c "echo \$HTTP_PROXY \$HTTPS_PROXY"
```

### Validation

```bash
# After changing RPC URL or restarting:

# 1. Check health endpoint
curl -s http://localhost:3000/health | jq .

# 2. Try creating a test escrow (staging only)
curl -X POST http://localhost:3000/api/escrows \
  -H 'Authorization: Bearer $TEST_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "beneficiary_address": "...",
    "amount_stroops": "1000000",
    "currency": "XLM"
  }'

# 3. Monitor logs
docker compose logs -f api --tail=50 | grep -i stellar
```

**RTO:** 5-15 minutes (account for RPC provider failover + backend restart)

---

## 5. Secret / Credential Compromise

### Detection

- Vault audit log shows unauthorized access
- Unauthorized API calls from unknown IP addresses
- Database user reports suspicious queries
- AWS CloudTrail shows access to backup S3 bucket from unknown role
- Credential appears in GitHub commit history or public logs

### Severity Assessment

| Compromised Secret | Severity | Immediate Action |
|-------------------|----------|------------------|
| Database password | SEV1 | Revoke old password; change in Vault; restart backend |
| API key (low-privilege) | SEV2 | Revoke key; generate new; audit access logs |
| Vault AppRole secret | SEV1 | Revoke all tokens; generate new AppRole secret; rotate all secrets |
| Stellar contract signer key | SEV1 | **Page security + legal; potential fund theft** |
| AWS S3 backup access key | SEV1 | Revoke access; rotate key; audit S3 access logs |

### Immediate Response

```bash
# 1. ISOLATE affected system
#    - Do not restart services (preserves audit logs)
#    - Take snapshot of logs: docker logs > /tmp/compromise_logs.txt
#    - Do not delete any files

# 2. REVOKE all active tokens (Vault)
vault token revoke -mode=path auth/approle/role/stellar-trust
# This invalidates all current tokens but does NOT prevent new authentications
# with the same AppRole secret

# 3. GENERATE new AppRole secret
vault write -f auth/approle/role/stellar-trust/secret-id
# This creates a new secret ID; old one is still valid until explicitly revoked

# 4. DOCUMENT the incident
#    - Time of discovery
#    - Which secret was compromised
#    - Possible exposure window (when was it first compromised?)
#    - Systems affected
```

### Database Password Compromise

```bash
# 1. Generate new password
NEW_DB_PASSWORD=$(openssl rand -base64 32)
echo $NEW_DB_PASSWORD  # Save this securely

# 2. Update password in database
psql -h $DB_HOST -U postgres -c "ALTER USER $DB_USER WITH PASSWORD '$NEW_DB_PASSWORD';"

# 3. Update Vault secret
vault kv put secret/data/stellar-trust/database \
  url="postgresql://$DB_USER:$NEW_DB_PASSWORD@$DB_HOST:5432/stellar_trust_escrow"

# 4. Update backend environment
docker compose down
# Edit .env or update via Vault
export DATABASE_URL="postgresql://$DB_USER:$NEW_DB_PASSWORD@$DB_HOST:5432/stellar_trust_escrow"
docker compose up -d api

# 5. Verify connection
curl -s http://localhost:3000/health | jq .db
```

### API Key Compromise

```bash
# 1. Revoke the key
vault kv delete secret/data/stellar-trust/api-keys/compromised_key_id

# 2. Generate new key
NEW_API_KEY=$(openssl rand -hex 32)
vault kv put secret/data/stellar-trust/api-keys/new_key value=$NEW_API_KEY

# 3. Distribute new key to authorized users/services
# (Do NOT send via Slack/email; use Vault directly or password manager)

# 4. Audit access logs (if compromised key was used)
#    - Check /logs for API requests from suspicious IPs
#    - Identify affected accounts/escrows
#    - Take action (disable accounts, freeze transactions)

# 5. Set expiration on old key (revoke after grace period if not critical)
# vault kv patch secret/data/stellar-trust/api-keys/compromised_key revoked=true revoked_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```

### AWS S3 Backup Access Key Compromise

```bash
# 1. Revoke the access key
aws iam delete-access-key --user-name stellar-trust-backups \
  --access-key-id $COMPROMISED_KEY_ID

# 2. Create new access key
aws iam create-access-key --user-name stellar-trust-backups

# 3. Update Vault with new credentials
vault kv put secret/data/stellar-trust/aws-s3-backups \
  access_key_id=$NEW_ACCESS_KEY \
  secret_access_key=$NEW_SECRET_KEY

# 4. Update backend configuration
docker compose restart api

# 5. Audit S3 access logs
aws s3api get-bucket-logging --bucket $BACKUP_S3_BUCKET
# Review CloudTrail events for unauthorized access
aws cloudtrail lookup-events --lookup-attributes AttributeKey=ResourceName,AttributeValue=$BACKUP_S3_BUCKET
```

### Stellar Contract Signer Key Compromise

**🚨 CRITICAL: Potential fund theft risk**

```bash
# 1. IMMEDIATELY page security lead and CTO
# This could result in unauthorized transactions

# 2. Disable off-chain automation
docker compose stop escrow-indexer event-indexer

# 3. Contact Stellar Development Foundation (security@stellar.org)
# Explain: "Contract signer key has been compromised; advise on next steps"

# 4. Document all pending transactions
# Do not submit ANY transactions until remediation is complete

# 5. Possible remediations (coordinate with security lead):
#    - Redeploy contract with new admin key
#    - Pause contract (if pause capability exists)
#    - Migrate to new contract address

# This is a full security incident; follow docs/incidents/templates/security-incident-response.md
```

---

## Backup Schedule & Verification

### Current Backup Policy

| Component | Frequency | Retention | Storage | Verification |
|-----------|-----------|-----------|---------|--------------|
| Full DB backup | Daily @ 03:00 UTC | 30 days (S3) | S3 + local | Monthly restore drill |
| WAL segments | Continuous | 7 days | S3 | Automatic rotation |
| Application config | On each deploy | 7 versions | Git + Vault | Audit log review |

### Backup Scripts

**Location:** `backend/scripts/`

- `backup.sh` — Triggers pg_dump and uploads to S3
- `restore_pitr.sh` — Restores to point-in-time from WAL
- `verify-backup.sh` — Verifies backup integrity and restorability

### Manual Backup

```bash
# Run full backup with verification
bash backend/scripts/backup.sh --verify

# Output: Stores at S3://BACKUP_S3_BUCKET/daily-backups/backup_YYYYMMDDTHHMMSSZ.dump
```

### Restore Drill (Monthly)

```bash
# Run monthly restore test
bash backend/scripts/backup.sh --restore-test

# This:
#   1. Downloads latest backup from S3
#   2. Verifies checksum
#   3. Restores to temporary database
#   4. Runs SQL integrity checks
#   5. Reports success/failure

# Expected output: "Restore successful: backup is valid"
```

**Document results:** `docs/incidents/backup-restore-drills.md`

---

## Disaster Recovery Testing Schedule

### Monthly Tests

- **Backup restore drill:** Can we restore from latest backup? (30 min)
- **Health check validation:** All monitoring alerts firing correctly? (15 min)

### Quarterly Tests

- **Full failover simulation:** Simulate primary database failure, perform full recovery (2-4 hours)
- **Secret rotation drill:** Rotate all secrets and verify services still work (1 hour)

### Annual Tests

- **Comprehensive DR exercise:** Simulate multiple concurrent failures (cross-team, 4-8 hours)
- **Contract redeployment:** Test smart contract patch and upgrade process

### Test Documentation Template

```markdown
# DR Test Report: [Test Name]

**Date:** YYYY-MM-DD
**Duration:** X minutes
**Owner:** [Name]

## Objectives
- Verify backup restorability
- Test runbook accuracy
- Train team on recovery procedures

## Results
- ✅ Database restored successfully in XX minutes
- ✅ Health endpoint returned 200 after startup
- ❌ Issue: WAL segments not found in S3 (investigate)

## Findings
1. Backup script is working correctly
2. Runbook step 3 was outdated; updated to reflect current schema

## Recommendations
1. Update recovery time estimate from 60 to 45 minutes
2. Add automated backup verification to CI/CD

## Sign-off
- Performed by: [Engineer name]
- Reviewed by: [Lead name]
```

---

## Communication & Escalation

### Incident Channel

- **Slack:** `#incidents` (all incidents > SEV3)
- **PagerDuty:** Automatic page for SEV1/SEV2
- **Status Page:** https://status.stellartrustescrow.io (manual updates)

### Escalation Path

**On-call Engineer discovers incident:**

1. Page on-call → check Slack `#incidents`
2. If unresolved in 15 min → page secondary on-call
3. If unresolved in 30 min → page engineering lead
4. If unresolved in 60 min → page CTO + legal

### Communication Templates

See `docs/incidents/templates/`:
- `initial-notification.md` — First status update
- `update-every-30min.md` — Progress updates
- `incident-resolved.md` — Resolution announcement
- `postmortem-template.md` — After-action review

---

## Pre-Incident Checklist

**Before on-call shift, verify you have:**

- [ ] AWS console access (S3, CloudWatch)
- [ ] Vault access (`vault login`)
- [ ] Database SSH key
- [ ] PostgreSQL client installed locally
- [ ] Docker installed and configured
- [ ] PM2 access (if applicable)
- [ ] PagerDuty mobile app + notifications enabled
- [ ] Slack desktop client open (or mobile app)
- [ ] This runbook downloaded locally or accessible offline
- [ ] Contact list from Vault: `vault kv get secret/stellar-trust/contacts`

**Verify database backups are healthy:**

```bash
# List recent backups
aws s3 ls s3://BACKUP_S3_BUCKET/daily-backups/ --recursive | tail -10

# Check backup age
# Should be < 24 hours old
```

**Test your recovery access once per week:**

```bash
# Practice connecting to database
psql -h $DB_HOST -U $DB_USER -d stellar_trust_escrow -c "SELECT 1;"

# Practice checking logs
docker compose logs api | head -20
```

---

## Related Runbooks & Guides

- [SEV1 Critical Outage Response](./incidents/runbooks/sev1-critical-outage.md)
- [Database Outage Recovery](./incidents/runbooks/database-outage.md)
- [Smart Contract Exploit Response](./incidents/runbooks/smart-contract-exploit.md)
- [On-Call Guide](./incidents/on-call-guide.md)
- [Incident Post-Mortem Template](./incidents/templates/postmortem-template.md)

---

Last updated: 2026-06-24
