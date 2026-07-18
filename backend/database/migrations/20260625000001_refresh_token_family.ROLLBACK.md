# Rollback: 20260625000001_refresh_token_family

## Summary

Removes the `family_id` and `used` columns added to `refresh_tokens` for token family tracking and reuse detection.

## Steps

```sql
DROP INDEX IF EXISTS idx_refresh_tokens_family_id;

ALTER TABLE refresh_tokens
  DROP COLUMN IF EXISTS family_id,
  DROP COLUMN IF EXISTS used;
```

## Verification

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'refresh_tokens'
  AND column_name IN ('family_id', 'used');
-- Should return 0 rows
```
