# Rollback: 20260717000000_webhook_endpoints

## What this migration does

- Renames `webhook_subscriptions` → `webhook_endpoints`
- Renames `webhook_deliveries.subscription_id` → `endpoint_id`
- Adds `next_retry_at`, `response_body` columns; drops `error_message`, `last_attempt_at`
- Adds `webhook_deliveries_status_idx`

## Rollback procedure

The `down()` function reverses each step:

1. Drop `webhook_deliveries_status_idx`
2. Re-add `error_message TEXT`, `last_attempt_at TIMESTAMPTZ`
3. Drop `next_retry_at`, `response_body`
4. Rename column `endpoint_id` → `subscription_id`
5. Rename table `webhook_endpoints` → `webhook_subscriptions`

## Data impact

Columns `next_retry_at` and `response_body` are dropped — retry schedule and
response body data is permanently lost on rollback.

## Notes

All rename operations are guarded with existence checks so this migration is
idempotent when run against a schema already in its final state (e.g. after
`prisma db push`).
