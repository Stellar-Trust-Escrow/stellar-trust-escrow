# Emergency Pause — Operational Guide

## Overview

The escrow contract has an admin-only emergency pause mechanism that halts all
mutating operations instantly. Use it when a security incident, exploit, or
critical bug is detected and you need to freeze the contract while a fix is
prepared.

---

## Pause / Unpause

Only the address passed to `initialize(admin)` can call these functions.

```bash
# Pause — halts all mutations immediately
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_SECRET_KEY> \
  --network <NETWORK> \
  -- pause \
  --caller <ADMIN_ADDRESS>

# Unpause — resumes normal operation
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_SECRET_KEY> \
  --network <NETWORK> \
  -- unpause \
  --caller <ADMIN_ADDRESS>

# Check current state (no auth required)
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network <NETWORK> \
  -- is_paused
```

---

## What Is Blocked While Paused

Every state-changing function reverts with `ContractPaused (error 31)`:

| Function | Who calls it |
|---|---|
| `create_escrow` / `create_escrow_with_buyer_signers` | client |
| `create_recurring_escrow` | client |
| `add_milestone` | client |
| `submit_milestone` | freelancer |
| `approve_milestone` | client / buyer signers |
| `reject_milestone` | client |
| `release_funds` | admin / timelock expiry |
| `cancel_escrow` | client |
| `start_timelock` | client or freelancer |
| `extend_lock_time` | client |
| `raise_dispute` | client or freelancer |
| `resolve_dispute` | arbiter or admin |
| `update_reputation` | public |
| `process_recurring_payments` | public |
| `pause_recurring_schedule` | client |
| `resume_recurring_schedule` | client |
| `cancel_recurring_escrow` | client |
| `top_up_rent` | client |
| `request_cancellation` | client or freelancer |
| `execute_cancellation` | public |
| `dispute_cancellation` | non-requester |
| `finalize_slash` | public |
| `dispute_slash` | slashed user |
| `resolve_slash_dispute` | arbiter or admin |

## What Remains Available While Paused

Read-only queries are never blocked:

- `get_escrow`, `get_milestone`, `get_reputation`
- `get_recurring_config`, `get_cancellation_request`, `get_slash_record`
- `get_price`, `convert_amount`
- `escrow_count`, `is_paused`
- `collect_rent` (maintenance — does not move user funds)

Admin-only management functions also remain available so the admin can act
during an incident:

- `pause` / `unpause`
- `upgrade`
- `set_oracle` / `set_fallback_oracle`

---

## Events

| Event topic | Emitted when |
|---|---|
| `paused` | `pause()` transitions `false → true` |
| `unpaused` | `unpause()` transitions `true → false` |

Both events carry the admin address as payload for audit trails.

---

## Incident Response Runbook

1. **Detect** — monitor for anomalous on-chain activity or off-chain alerts.
2. **Pause** — call `pause()` from the admin key immediately.
3. **Verify** — call `is_paused()` to confirm the state is `true`.
4. **Investigate** — analyse the incident with the contract frozen.
5. **Fix** — prepare and audit a patched WASM.
6. **Upgrade** — call `upgrade(new_wasm_hash)` to deploy the fix.
   (`upgrade` is not blocked by pause.)
7. **Unpause** — call `unpause()` to resume normal operation.
8. **Post-mortem** — document root cause, timeline, and remediation.

---

## Gas Impact

Both `pause()` and `unpause()` perform:
- One instance storage read (`is_paused`)
- One instance storage write (`set_paused` + TTL bump)
- One event publish

Measured overhead is well under 10 000 gas units per call.

The `require_not_paused` guard on each mutating function is a single instance
storage read — effectively free relative to the rest of the function's work.

---

## Upgradeable Pattern Compatibility

Pause state is stored in **instance storage** under `DataKey::Paused`. Instance
storage survives contract upgrades, so:

- A paused contract remains paused after `upgrade()`.
- The admin can unpause after upgrading to the fixed version.
- No migration is needed for the pause flag across storage versions.
