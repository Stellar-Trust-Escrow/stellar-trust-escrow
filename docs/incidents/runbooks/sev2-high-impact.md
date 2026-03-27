# Runbook: SEV2 — High Impact

**Use when:** Major feature broken (escrow creation, payments, dispute resolution), significant user impact but API is partially up.

## Immediate Actions (first 15 minutes)

- [ ] Acknowledge the alert
- [ ] Create incident: `POST /api/incidents` with `severity: SEV2`
- [ ] Identify the broken feature from error logs / Sentry
- [ ] Post initial status page update

## Common SEV2 Scenarios

### Escrow creation failing
1. Check `POST /api/escrows/broadcast` — look for 5xx errors in logs
2. Verify `SOROBAN_RPC_URL` is reachable: `curl $SOROBAN_RPC_URL/health`
3. Check Stellar network status: https://status.stellar.org
4. If RPC is down, update `SOROBAN_RPC_URL` to a backup endpoint

### Payment processing broken
1. Check Stripe dashboard for webhook failures
2. Verify `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set correctly
3. Check `/api/payments` error logs for specific failure messages

### Dispute resolution unavailable
1. Check `POST /api/disputes/:id/resolve/auto` logs
2. Verify DB connectivity and that the `disputes` table is accessible
3. Check for migration issues: `npx prisma migrate status`

### Indexer falling behind
1. Check indexer logs: `[Indexer]` prefix
2. Verify `ESCROW_CONTRACT_ID` and `SOROBAN_RPC_URL` are correct
3. Restart indexer by restarting the API process
4. Check `GET /api/events/stats` to see if new events are being indexed

## Resolution

- [ ] Confirm the affected feature is working end-to-end
- [ ] Update incident status to `resolved`
- [ ] Post resolution update
- [ ] Schedule post-mortem if root cause was non-obvious
