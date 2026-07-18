# Rollback: 20260625000000_add_composite_indexes

## Summary

Drops the composite indexes added for common Escrow, Dispute, Milestone, and Reputation query patterns.

## Steps

```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_escrows_tenant_status_deadline;
DROP INDEX CONCURRENTLY IF EXISTS idx_escrows_tenant_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_escrows_status_deadline;
DROP INDEX CONCURRENTLY IF EXISTS idx_disputes_tenant_raised_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_milestones_tenant_status_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_reputation_tenant_address_score;
```

## Verification

```sql
SELECT indexname FROM pg_indexes
WHERE indexname IN (
  'idx_escrows_tenant_status_deadline',
  'idx_escrows_tenant_created_at',
  'idx_escrows_status_deadline',
  'idx_disputes_tenant_raised_at',
  'idx_milestones_tenant_status_created_at',
  'idx_reputation_tenant_address_score'
);
-- Should return 0 rows
```
