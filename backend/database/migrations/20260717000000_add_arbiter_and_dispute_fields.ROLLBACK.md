# Rollback: 20260717000000_add_arbiter_and_dispute_fields

## Summary

Reverses the arbiter and dispute escalation fields added to `reputation_records` and `disputes`.

## Steps

### 1. Drop indexes

```sql
DROP INDEX IF EXISTS reputation_records_is_arbiter_idx;
DROP INDEX IF EXISTS disputes_current_arbiter_idx;
DROP INDEX IF EXISTS disputes_auto_escalate_at_idx;
```

### 2. Remove columns from `reputation_records`

```sql
ALTER TABLE reputation_records
  DROP COLUMN IF EXISTS is_arbiter,
  DROP COLUMN IF EXISTS active_disputes,
  DROP COLUMN IF EXISTS total_resolved,
  DROP COLUMN IF EXISTS created_at;
```

### 3. Remove columns from `disputes`

```sql
ALTER TABLE disputes
  DROP COLUMN IF EXISTS escalation_count,
  DROP COLUMN IF EXISTS auto_escalate_at,
  DROP COLUMN IF EXISTS current_arbiter;
```

## Verification

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name IN ('reputation_records', 'disputes')
  AND column_name IN ('is_arbiter', 'active_disputes', 'total_resolved',
                      'escalation_count', 'auto_escalate_at', 'current_arbiter');
-- Should return 0 rows
```
