# Rollback: CQRS write model + exactly-once indexer support

## What this migration adds

- `failed_events` table (compensation log for unpublished domain events)
- `event_id` unique index on `contract_events` (exactly-once event indexing)
- New `EscrowStatus` enum values: `Draft`, `Funded`, `InProgress`, `ReleaseRequested`, `Resolved`, `Released`, `Expired`

## Rollback procedure (run `down()`)

```sql
DROP TABLE IF EXISTS "failed_events";
DROP INDEX IF EXISTS "contract_events_event_id_key";
ALTER TABLE "contract_events" DROP COLUMN IF EXISTS "event_id";
```

> **Note:** The new EscrowStatus enum values (`Draft`, `Funded`, etc.) cannot be
> removed without recreating the entire enum type. They are backward-compatible
> additions and are left in place after rollback.

## Safety check

- No existing rows are deleted or modified during rollback.
- Verify that no application code references `failed_events` or `event_id` before rolling back.
