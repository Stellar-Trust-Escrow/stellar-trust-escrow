# E2E Sandbox Testing Guide

The sandbox runs Playwright tests against the frontend through Toxiproxy so UI flows execute under degraded network conditions.

## Network Constraints

| Constraint      | Value                          |
| --------------- | ------------------------------ |
| Latency         | 300ms plus 30ms jitter         |
| Drop simulation | 2% downstream timeout toxic    |
| Bandwidth       | 48 KB/s, roughly 3G throughput |

## Run

```bash
bash load-tests/sandbox.sh
```

Reports are written to `load-tests/reports/`. The raw run log is `load-tests/reports/test-run.log`.

## Troubleshooting

- If Toxiproxy is not reachable, check that port `8474` is free.
- If the app is unhealthy, inspect `docker compose -f docker-compose.test.yml logs app`.
- If tests time out only in the sandbox, increase Playwright timeouts for the affected E2E flow.
