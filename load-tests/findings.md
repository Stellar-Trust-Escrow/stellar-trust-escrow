# Load Testing Findings

## Functional issue discovered during implementation

- `backend/server.js` used `app` before initialization, which prevented the backend from starting reliably. This was fixed by creating the Express app before middleware registration.

## Baseline observations

- The initial baseline run against the deterministic load-test harness completed with `0%` errors across all four scenarios.
- The slowest scenario in the baseline was `escrow-list`, which still stayed well inside the current tail-latency threshold.

## Follow-up opportunities

- Point `LOAD_TEST_TARGET_URL` at a seeded backend environment once a stable fixture database is available, so the same scenarios can validate the full Prisma and service stack.
- Add write-heavy scenarios when create/update endpoints become stable enough for repeatable CI runs.
