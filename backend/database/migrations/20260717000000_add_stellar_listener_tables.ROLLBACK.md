# Rollback: 20260717000000_add_stellar_listener_tables

## Summary

Drops the `processed_events` and `system_config` tables created for the Stellar Horizon event listener.

## Steps

```sql
DROP TABLE IF EXISTS processed_events CASCADE;
DROP TABLE IF EXISTS system_config CASCADE;
```

## Verification

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('processed_events', 'system_config');
-- Should return 0 rows
```
