# Rollback: 20260625000002_dispute_escalation

## Summary

Removes the `escalated_at` and `escalation_count` columns added to the `disputes` table.

## Steps

```sql
DROP INDEX IF EXISTS idx_disputes_escalated_at;

ALTER TABLE disputes
  DROP COLUMN IF EXISTS escalated_at,
  DROP COLUMN IF EXISTS escalation_count;
```

## Verification

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'disputes'
  AND column_name IN ('escalated_at', 'escalation_count');
-- Should return 0 rows
```
