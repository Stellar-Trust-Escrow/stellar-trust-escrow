## Description

Closes #1445.

This PR introduces a comprehensive k6 load testing suite to ensure that our 5 core API endpoints meet their p95 latency Service Level Objectives (SLOs) and that no unexpected regressions are merged into production.

### Changes Made
- Added a full load testing suite in `tests/load/k6/` encompassing endpoint coverage for:
  - `POST /api/v1/auth/login`
  - `GET /api/v1/escrows`
  - `POST /api/v1/escrows`
  - `GET /api/v1/escrows/:id`
  - `POST /api/v1/escrows/:id/milestones/:idx/approve`
- Implemented a baseline comparison mechanic (`tests/load/compare.js` and `summary.js`) that captures the `p(95)` latencies into `tests/load/current.json` and evaluates them against `tests/load/baseline.json`. A >20% latency regression results in a strict CI gate failure (exit 1).
- Updated `docker-compose.test.yml` to include the `backend`, `postgres`, `redis`, and `elasticsearch` services natively for testing.
- Created `loadTestSeed.js` database seeder to establish a consistent, dedicated dataset specifically for load testing (10 users, 50 escrows, 200 milestones).
- Configured a new GitHub Actions workflow (`.github/workflows/load-test.yml`) that runs on `workflow_dispatch` and weekly to execute the k6 suite automatically, post PR comments of the baseline diffs, and upload execution artifacts.

### Testing/Verification
- `docker-compose.test.yml` starts up correctly and passes internal health checks.
- Load data seeding runs cleanly and generates the expected payload volumes.
- All 5 k6 scripts pass locally with `<1%` failure rates.
- The comparison script generates `baseline.json` properly on its first pass and accurately registers >20% regressions on subsequent runs.
