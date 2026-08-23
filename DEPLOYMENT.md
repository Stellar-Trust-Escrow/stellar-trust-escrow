# Blue-Green Deployment

This document covers the blue-green deployment pipeline (`.github/workflows/blue-green-deploy.yml`):
normal flow, flag-gated cutover, manual rollback, and the drain period.

## Normal flow

1. **Push to `main`** triggers the pipeline.
2. **Build** — the backend image is built and pushed, tagged `:{commit-sha}`.
3. **Deploy to green** — the new image is deployed to the green environment
   (`green.{BASE_DOMAIN}`), running alongside blue on a separate port/target
   group. Blue keeps serving 100% of production traffic through this whole
   phase — there is no interruption.
4. **Smoke test** — a k6 single-user script and a Playwright API suite
   (`tests/smoke/`) hit green's `/healthz`, auth login, `/api/v1/escrows`,
   and `/api/v1/contracts/status` (Soroban RPC connectivity) endpoints.
   - **Pass** → proceeds to the cutover gate.
   - **Fail** → green is torn down and traffic rolled back to blue
     automatically (target: within 2 minutes of failure detection), a Slack
     alert fires, and a GitHub issue is opened with the commit SHA,
     environment, and a link to the failed run's logs.
5. **Cutover gate** — see below.
6. **Cutover** — if the gate passes, traffic shifts to green **atomically**
   at the load balancer (one ALB `modify-listener` call or one nginx
   config write + reload — never a partial split visible mid-update).
   Blue is tagged, given a 10-minute drain period, then torn down.

## Flag-gated cutover

The traffic shift is gated behind the `enable_blue_green_cutover` feature
flag (see the feature flag service, issue #1528), checked via the public,
read-only:

```
GET /api/v1/flags/enable_blue_green_cutover/status
→ { "key": "enable_blue_green_cutover", "enabled": true|false }
```

- **Flag on** → cutover proceeds automatically once smoke tests pass.
- **Flag off** → the pipeline **exits 0** (success, not a failure) and
  leaves green running, smoke-tested, awaiting manual promotion. Nothing
  is torn down and nothing shifts.

To promote manually while the flag is off, either enable the flag (which
requires a subsequent pipeline run or a manual trigger of the `cutover` job
via `workflow_dispatch`), or run `scripts/shift-traffic.sh green` directly
against the target load balancer.

## Manual rollback

```bash
bash scripts/rollback.sh
```

This shifts traffic back to blue, tears down green, and sends a Slack
alert. **It's idempotent** — running it again when already on blue (green
already torn down or never existed) is a no-op:

```
[rollback] Already on blue (per /path/to/status/file) — nothing to roll back. No-op.
```

The idempotency check reads an optional `GREEN_STATUS_FILE`; if that isn't
configured, the script still runs safely on a repeat call — both the
traffic shift and the teardown are themselves idempotent operations.

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `SLACK_DEPLOY_WEBHOOK` | Slack webhook for deploy/rollback alerts | none (notifications skipped) |
| `GREEN_ENV_NAME` | Name of the green service/environment to tear down | `green` |
| `TEARDOWN_CMD` | Actual ECS/K8s teardown command | no-op echo (wire this to your infra) |
| `GREEN_STATUS_FILE` | Optional file tracking current cutover state (`blue`/`green`) | unset |
| `LB_BACKEND` | `alb` or `nginx` (used by `shift-traffic.sh`) | `alb` |
| `ALB_LISTENER_ARN`, `ALB_BLUE_TG_ARN`, `ALB_GREEN_TG_ARN` | Required when `LB_BACKEND=alb` | — |
| `NGINX_UPSTREAM_CONF`, `NGINX_RELOAD_CMD` | Required when `LB_BACKEND=nginx` | — |

## Drain period

After a successful cutover, the previous blue environment is **not** torn
down immediately. It's tagged and kept running for a 10-minute drain
period so any in-flight requests that started against blue before the
traffic shift can complete. After the drain window, blue is torn down.

If a problem is discovered during the drain window, run
`bash scripts/rollback.sh` — since blue is still running at that point,
this is a fast, safe recovery.

## Traffic-shift abstraction

`scripts/shift-traffic.sh {blue|green|split:N}` abstracts the load
balancer mechanics behind one interface, so the pipeline and rollback
script don't need to know whether the target infra is an AWS ALB (target
group weights) or an nginx upstream (server weights). See the script's
header comment for the full environment variable list.

## Known limitations / follow-ups

The actual cloud-provider deploy and teardown commands (image push, ECS/K8s
service update, blue teardown) are placeholders in this PR, matching the
existing `deploy.yml` workflow's current fidelity level in this repo (which
also has `# Insert actual deployment commands here` placeholders) — there's
no Terraform/ECS/K8s manifest in this codebase yet to wire real calls
against. The pipeline's structure, gating logic, atomicity guarantees, and
rollback idempotency are all real and tested; only the "call the cloud
provider" lines need filling in once actual infra exists.
