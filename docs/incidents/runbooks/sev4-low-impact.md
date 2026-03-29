# Runbook: SEV4 — Low Impact

**Use when:** Minor issue with no user impact — log noise, non-critical feature glitch, cosmetic bug.

## Process

1. Create a GitHub issue with the `bug` label.
2. If it generates alert noise, silence the alert rule for 24 hours while investigating.
3. Fix in the next regular sprint unless it escalates.
4. No post-mortem required unless it recurs 3+ times.

## Common SEV4 Issues

- Sentry capturing expected errors (e.g. 404s from bots) — add `ignoreErrors` filter
- Indexer logging warnings for unknown event types — update `HANDLERS` map in `eventIndexer.js`
- Rate limit logs from legitimate high-volume clients — whitelist their IP or increase their limit
