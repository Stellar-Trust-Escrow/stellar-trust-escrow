# Rollback: 20260717000000_webhook_endpoints

## Summary

Reverses the webhook table rename and `webhook_deliveries` schema changes. Renames `webhook_endpoints` back to `webhook_subscriptions`, restores the old column names, and removes the new columns.

## Steps

```sql
DROP INDEX IF EXISTS webhook_deliveries_status_idx;

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

ALTER TABLE webhook_deliveries
  DROP COLUMN IF EXISTS next_retry_at,
  DROP COLUMN IF EXISTS response_body;

ALTER TABLE webhook_deliveries
  RENAME COLUMN endpoint_id TO subscription_id;

ALTER TABLE IF EXISTS webhook_endpoints RENAME TO webhook_subscriptions;
```

## Verification

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name = 'webhook_subscriptions';
-- Should return 1 row

SELECT column_name FROM information_schema.columns
WHERE table_name = 'webhook_deliveries'
  AND column_name IN ('subscription_id', 'error_message', 'last_attempt_at');
-- Should return 3 rows
```
