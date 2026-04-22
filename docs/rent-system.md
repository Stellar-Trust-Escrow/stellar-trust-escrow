# Rent / Storage Reserve System

This document explains the storage rent mechanism in `stellar-trust-escrow`.
Soroban charges rent for persistent storage entries. The contract
pre-collects a reserve from the escrow client at creation time and
periodically deducts it, expiring the escrow if the reserve runs out.

Source: `contracts/escrow_contract/src/lib.rs`
Relevant functions: `charge_rent_reserve`, `charge_entry_rent`,
`collect_rent_due`, `settle_rent_for_access`, `collect_rent`, `expire_escrow`,
`active_storage_entries`, `rent_due_per_period`, `rent_has_expired`,
`rent_expires_at`, `top_up_rent`

---

## Table of Contents

1. [Constants](#constants)
2. [EscrowMeta Rent Fields](#escrowmeta-rent-fields)
3. [active_storage_entries](#active_storage_entries)
4. [Rent Formulas](#rent-formulas)
5. [Rent Lifecycle](#rent-lifecycle)
6. [settle_rent_for_access — Lazy Collection](#settle_rent_for_access--lazy-collection)
7. [expire_escrow](#expire_escrow)
8. [Topping Up Rent](#topping-up-rent)
9. [Worked Example](#worked-example)
10. [Events](#events)

---

## Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `RENT_PERIOD_SECONDS` | `86_400` | One rent period = 1 day (in ledger seconds). |
| `RENT_RESERVE_PERIODS` | `30` | Number of periods prepaid at creation or per new entry. |
| `RENT_PER_ENTRY_PER_PERIOD` | `1` | Cost per storage entry per period (in token base units / stroops). |

These constants are defined in `lib.rs` and apply to all escrows uniformly.

---

## EscrowMeta Rent Fields

| Field | Type | Description |
|-------|------|-------------|
| `rent_balance` | `i128` | Token amount (stroops) held by the contract as prepaid rent. Decremented by `collect_rent_due`. When it reaches zero the escrow is eligible for expiry. |
| `last_rent_collection_at` | `u64` | Ledger timestamp of the last successful rent collection. Used to calculate elapsed periods. Advanced by `collect_rent_due` after each collection. |

---

## active_storage_entries

```rust
fn active_storage_entries(env: &Env, meta: &EscrowMeta) -> i128 {
    let mut entries = 1 + i128::from(meta.milestone_count);
    if recurring_config exists  { entries += 1; }
    if cancellation_request exists { entries += 1; }
    if slash_record exists      { entries += 1; }
    entries
}
```

The rent cost scales with the number of active persistent storage entries
for the escrow:

| Entry | Always present? |
|-------|----------------|
| `PackedDataKey::EscrowMeta(id)` | Yes — counts as 1. |
| `PackedDataKey::Milestone(id, mid)` | One per milestone added. |
| `PackedDataKey::RecurringConfig(id)` | Only if recurring schedule is active. |
| `DataKey::CancellationRequest(id)` | Only during a pending cancellation. |
| `DataKey::SlashRecord(id)` | Only while a slash is pending. |

Adding milestones increases the rent cost. Removing entries (e.g. after
cancellation resolves) reduces it.

---

## Rent Formulas

```
rent_due_per_period = active_entries × RENT_PER_ENTRY_PER_PERIOD
                    = active_entries × 1

elapsed_periods = (now - last_rent_collection_at) / RENT_PERIOD_SECONDS

rent_due = rent_due_per_period × elapsed_periods

collectable = min(rent_due, rent_balance)

reserve_for_entries(n) = n × RENT_PER_ENTRY_PER_PERIOD × RENT_RESERVE_PERIODS
                       = n × 1 × 30
                       = 30 × n   (stroops)
```

`reserve_for_entries(n)` is the amount charged upfront when `n` new
storage entries are created (at escrow creation or `add_milestone`).

---

## Rent Lifecycle

```
create_escrow(client, ...)
      |
      | charge_rent_reserve(token, client, reserve_for_entries(1))
      | → transfers 30 stroops from client to contract
      | → meta.rent_balance = 30
      | → meta.last_rent_collection_at = now
      v
add_milestone(...)
      |
      | charge_entry_rent(meta, caller, entries=1)
      | → transfers 30 stroops from caller to contract
      | → meta.rent_balance += 30
      v
[time passes — each day is one RENT_PERIOD_SECONDS]
      |
      v
Any state-reading call (get_escrow, approve_milestone, etc.)
      |
      | settle_rent_for_access(env, meta)
      |   → rent_has_expired? → EscrowNotFound (8)
      |   → collect_rent_due(env, meta)
      |       elapsed = (now - last_rent_collection_at) / 86_400
      |       due = active_entries × elapsed
      |       collectable = min(due, rent_balance)
      |       transfer collectable to admin
      |       meta.rent_balance -= collectable
      |       meta.last_rent_collection_at += covered_periods × 86_400
      v
collect_rent (explicit call)
      |
      | collect_rent_due(env, meta)
      | if rent_has_expired → expire_escrow(env, meta)
      v
expire_escrow
      |
      | transfer (remaining_balance + rent_balance) to client
      | delete all milestone entries
      | delete recurring config, cancellation request, slash record
      | delete EscrowMeta entry
      | emit rent_exp event
```

---

## settle_rent_for_access — Lazy Collection

`settle_rent_for_access` is called at the start of every function that
reads or modifies escrow state. It performs **lazy rent collection**:

1. Checks `rent_has_expired`. If expired → returns `EscrowNotFound` (8),
   preventing any further interaction with the escrow.
2. Calls `collect_rent_due` to deduct elapsed periods from `rent_balance`.
3. Saves the updated `EscrowMeta`.

This means rent is collected on-demand rather than on a fixed schedule.
An escrow with no activity will not have rent collected until someone
interacts with it.

`rent_has_expired` returns `true` when:

```
elapsed_periods > covered_periods
where:
  elapsed_periods = (now - last_rent_collection_at) / RENT_PERIOD_SECONDS
  covered_periods = rent_balance / rent_due_per_period
```

---

## expire_escrow

When `collect_rent` detects that rent has expired after collection, it
calls `expire_escrow`:

1. Calculates `refund = remaining_balance + rent_balance`.
2. Transfers `refund` to the client (any remaining escrow funds are returned).
3. Deletes all milestone storage entries.
4. Deletes `RecurringConfig`, `CancellationRequest`, `SlashRecord` if present.
5. Deletes `EscrowMeta`.
6. Emits `rent_exp` event with `(refund_amount, remaining_balance)`.

After expiry the escrow no longer exists in storage. `get_escrow` will
return `EscrowNotFound` (8).

---

## Topping Up Rent

Call `top_up_rent` to add more rent reserve to an existing escrow:

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --source $CLIENT_SECRET \
  --network testnet \
  -- top_up_rent \
  --caller $CLIENT_ADDRESS \
  --escrow_id 42 \
  --amount 300
```

This transfers `amount` stroops from `caller` to the contract and adds
it to `meta.rent_balance`. Anyone can top up rent for any escrow.

To check when an escrow will expire:

```
rent_expires_at = last_rent_collection_at
                + (rent_balance / rent_due_per_period + 1) × RENT_PERIOD_SECONDS
```

---

## Worked Example

**Scenario:** A 3-milestone escrow, no recurring config, no cancellation
request, no slash record. How much rent is needed to keep it alive for
30 days?

```
active_entries = 1 (EscrowMeta) + 3 (milestones) = 4

rent_due_per_period = 4 × 1 = 4 stroops/day

rent_needed_for_30_days = 4 × 30 = 120 stroops
```

**At creation** (1 entry — EscrowMeta only, no milestones yet):

```
reserve_for_entries(1) = 1 × 1 × 30 = 30 stroops charged from client
```

**After add_milestone × 3** (each call charges for 1 new entry):

```
reserve_for_entries(1) = 30 stroops charged per milestone
Total additional rent = 3 × 30 = 90 stroops
Total rent_balance = 30 + 90 = 120 stroops
```

This covers exactly 30 days at 4 stroops/day. To extend by another 30
days, top up with 120 more stroops.

**Note:** `RENT_PER_ENTRY_PER_PERIOD = 1` stroop is a symbolic amount.
In production this constant would be set to reflect actual Soroban
storage costs. The formulas remain the same regardless of the value.

---

## Events

| Event | Topic | Data | When |
|-------|-------|------|------|
| `rent_col` | `(rent_col, escrow_id)` | `(collected, new_balance, expires_at)` | After each successful `collect_rent_due`. |
| `rent_exp` | `(rent_exp, escrow_id)` | `(refund_amount, remaining_balance)` | When `expire_escrow` is called. |
