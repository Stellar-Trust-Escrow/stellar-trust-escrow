# Rollback: 20260717000000_webhook_endpoints

## Summary

Reverses the webhook table rename and `webhook_deliveries` schema changes. Renames `webhook_endpoints` back to `webhook_subscriptions`, restores the old column names, and removes the new columns.

## Steps

```sql
DROP INDEX IF EXISTS webhook_deliveries_status_idx;

ALTER TABLE webhook_deliveries
  DROP COLUMN IF EXISTS next_retry_at,
  DROP COLUMN IF EXISTS response_body;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_deliveries' AND column_name = 'endpoint_id'
  ) THEN
    ALTER TABLE webhook_deliveries RENAME COLUMN endpoint_id TO subscription_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'webhook_endpoints'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'webhook_subscriptions'
  ) THEN
    ALTER TABLE webhook_endpoints RENAME TO webhook_subscriptions;
  END IF;
END $$;
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
