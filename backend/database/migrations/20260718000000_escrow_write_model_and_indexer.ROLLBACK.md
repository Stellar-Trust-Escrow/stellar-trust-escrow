# Rollback: 20260718000000_escrow_write_model_and_indexer

## What this migration does

- Extends `EscrowStatus` enum with full lifecycle values (Draft, Funded, InProgress, etc.)
- Adds `contract_events.event_id` unique column for exactly-once idempotency
- Creates `failed_events` table for compensation log of failed domain-event publications

## Rollback procedure

The `down()` function reverses structural changes:

1. Drop `failed_events` table
2. Drop `contract_events_event_id_key` unique index
3. Drop `contract_events.event_id` column

Note: Enum values (`EscrowStatus` additions) cannot be removed in PostgreSQL without
recreating the type. They are left in place as backward-compatible additions.

## Data impact

All failed domain-event records in `failed_events` are permanently lost on rollback.
The `event_id` column and its uniqueness constraint are removed — any escrow event
deduplication relying on this column will no longer function after rollback.
