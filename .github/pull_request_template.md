## Summary

Briefly describe what changed and why.

Closes #

## Changes

-
-
-

## Testing

List the exact commands you ran locally.

```bash
# Examples
cargo test --workspace
npm run test -w backend
npm run test -w frontend
npm run lint
```

## Review Notes

Call out any context reviewers should know:

- areas that need extra attention
- follow-up work or known limitations
- deployment or migration considerations

### Migration checklist

Required for any PR that changes `backend/database/migrations/**` or `prisma/migrations/**`.
The Migration Safety CI (`.github/workflows/migration-safety.yml`) enforces these automatically.

- [ ] Migration is backward-compatible with the previous version of the app code
- [ ] New NOT NULL columns have a DEFAULT or are added in a separate migration after backfill
- [ ] No table locks held for more than 100ms at expected table sizes
- [ ] Rollback plan documented below (a `ROLLBACK.md` ships with the migration)

#### Rollback plan

Describe how to undo this migration safely (e.g. run `node backend/database/migrations/migrate.js down`,
or the inverse SQL). The `Migration safety` CI verifies that `down()` is a true inverse of `up()`.

## Checklist

- [ ] Code compiles, or the updated docs reference working commands
- [ ] Tests were added or updated when behavior changed
- [ ] Linting and formatting were run
- [ ] Documentation was updated when needed
- [ ] No breaking changes, or they are clearly described
- [ ] Screenshots or recordings are included for UI changes
