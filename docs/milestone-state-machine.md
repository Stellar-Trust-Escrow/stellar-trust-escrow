# Milestone State Machine

This document describes the valid states and transitions for a `Milestone`
in `stellar-trust-escrow`, which function drives each transition, and the
authorization required.

Source: `contracts/escrow_contract/src/types.rs` — `MilestoneStatus`
Functions: `contracts/escrow_contract/src/lib.rs`

---

## Table of Contents

1. [MilestoneStatus Variants](#milestonestatus-variants)
2. [State Transition Diagram](#state-transition-diagram)
3. [Transition Reference Table](#transition-reference-table)
4. [Function Details](#function-details)
5. [Cancellation Guard](#cancellation-guard)
6. [Terminal States](#terminal-states)

---

## MilestoneStatus Variants

```rust
pub enum MilestoneStatus {
    Pending,    // 0 — initial state
    Submitted,  // 1 — freelancer submitted work
    Approved,   // 2 — client approved; funds pending release
    Rejected,   // 3 — client rejected; freelancer may resubmit
    Disputed,   // 4 — dispute raised; funds frozen
}
```

| Variant | Description |
|---------|-------------|
| `Pending` | Milestone created but no work submitted yet. This is the initial state for every milestone added via `add_milestone`. |
| `Submitted` | Freelancer has called `submit_milestone`. The client can now approve or reject. |
| `Approved` | Client has called `approve_milestone`. Funds have been transferred to the freelancer. |
| `Rejected` | Client has called `reject_milestone`. The freelancer may resubmit by calling `submit_milestone` again. |
| `Disputed` | A dispute was raised (via `raise_dispute`) while the milestone was `Pending` or `Submitted`. Funds are frozen until the dispute is resolved. |

---

## State Transition Diagram

```
                    add_milestone
                         |
                         v
                    +---------+
                    | Pending |<-----------+
                    +---------+            |
                         |                |
          submit_milestone|                | reject_milestone
          (freelancer)    |                | (client)
                         v                |
                   +-----------+          |
                   | Submitted |----------+
                   +-----------+
                    |         |
     approve_       |         | reject_
     milestone      |         | milestone
     (client)       |         | (client)
                    v         v
              +----------+ +----------+
              | Approved | | Rejected |
              +----------+ +----------+
                    |
              release_funds
              (admin / auto)
                    |
                    v
               [Released]
                 (funds
                transferred)


  raise_dispute (client or freelancer) can be called on:
    Pending  --> Disputed
    Submitted --> Disputed

                    +-----------+
                    | Disputed  |
                    +-----------+
                          |
               resolve_dispute
               (arbiter / admin)
                          |
                    (escrow resolved;
                     milestone stays
                     Disputed in storage)
```

Note: `Approved` and `Disputed` are effectively terminal for the
milestone itself — no further status changes occur after those states.
`Rejected` is not terminal; the freelancer can resubmit.

---

## Transition Reference Table

| From | To | Function | Auth required |
|------|----|----------|---------------|
| *(none)* | `Pending` | `add_milestone` | Client |
| `Pending` | `Submitted` | `submit_milestone` | Freelancer |
| `Rejected` | `Submitted` | `submit_milestone` | Freelancer |
| `Submitted` | `Approved` | `approve_milestone` | Client |
| `Submitted` | `Rejected` | `reject_milestone` | Client |
| `Pending` | `Disputed` | `raise_dispute` (with `milestone_id`) | Client or Freelancer |
| `Submitted` | `Disputed` | `raise_dispute` (with `milestone_id`) | Client or Freelancer |

`Approved` and `Disputed` have no outgoing transitions — they are
terminal states for the milestone record.

---

## Function Details

### add_milestone → Pending

```rust
pub fn add_milestone(
    env: Env,
    caller: Address,      // must be escrow client
    escrow_id: u64,
    title: String,
    description_hash: BytesN<32>,
    amount: i128,
) -> Result<u32, EscrowError>
```

Creates a new `Milestone` with `status = Pending`. The milestone ID is
assigned sequentially starting from 0. The escrow must be `Active`.

---

### submit_milestone → Submitted

```rust
pub fn submit_milestone(
    env: Env,
    caller: Address,      // must be escrow freelancer
    escrow_id: u64,
    milestone_id: u32,
) -> Result<(), EscrowError>
```

Transitions `Pending` or `Rejected` → `Submitted`. Sets `submitted_at`
to the current ledger timestamp. Emits `mil_sub` event.

**Accepted from:** `Pending`, `Rejected`
**Rejected from:** any other state → `InvalidMilestoneState` (14)

---

### approve_milestone → Approved

```rust
pub fn approve_milestone(
    env: Env,
    caller: Address,      // must be escrow client
    escrow_id: u64,
    milestone_id: u32,
) -> Result<(), EscrowError>
```

Transitions `Submitted` → `Approved`. Transfers `milestone.amount` to
the freelancer. Sets `resolved_at`. Increments `approved_count` on
`EscrowMeta`. If `approved_count == milestone_count`, the escrow status
is set to `Completed`. Emits `mil_apr` and `funds_rel` events.

**Accepted from:** `Submitted` only
**Rejected from:** any other state → `InvalidMilestoneState` (14)

---

### reject_milestone → Rejected

```rust
pub fn reject_milestone(
    env: Env,
    caller: Address,      // must be escrow client
    escrow_id: u64,
    milestone_id: u32,
) -> Result<(), EscrowError>
```

Transitions `Submitted` → `Rejected`. Sets `resolved_at`. Emits
`mil_rej` event. The freelancer may call `submit_milestone` again.

**Accepted from:** `Submitted` only
**Rejected from:** any other state → `InvalidMilestoneState` (14)

---

### raise_dispute → Disputed

```rust
pub fn raise_dispute(
    env: Env,
    caller: Address,      // must be client or freelancer
    escrow_id: u64,
    milestone_id: Option<u32>,
) -> Result<(), EscrowError>
```

When `milestone_id` is provided and the milestone is `Pending` or
`Submitted`, its status is set to `Disputed`. The escrow-level status
is also set to `Disputed` regardless of whether a milestone ID is given.

**Accepted from:** `Pending`, `Submitted`
**No effect on:** `Approved`, `Rejected`, `Disputed` (milestone left unchanged)

---

### resolve_dispute — no milestone status change

`resolve_dispute` distributes the escrow's `remaining_balance` between
client and freelancer. It does not change individual milestone statuses —
disputed milestones remain `Disputed` in storage after resolution. The
escrow-level status is set to `Completed`.

---

## Cancellation Guard

`cancel_escrow` checks every milestone before allowing cancellation:

```rust
for mid in 0..meta.milestone_count {
    let m = ContractStorage::load_milestone(&env, escrow_id, mid)?;
    if m.status == MilestoneStatus::Submitted || m.status == MilestoneStatus::Approved {
        return Err(EscrowError::CannotCancelWithPendingFunds);
    }
}
```

Cancellation is **blocked** when any milestone is in `Submitted` or
`Approved` state. This prevents the client from cancelling after the
freelancer has submitted work or after funds have been approved but not
yet released.

States that **do not** block cancellation: `Pending`, `Rejected`, `Disputed`.

---

## Terminal States

| State | Terminal? | Reason |
|-------|-----------|--------|
| `Pending` | No | Can transition to `Submitted` or `Disputed`. |
| `Submitted` | No | Can transition to `Approved`, `Rejected`, or `Disputed`. |
| `Approved` | Yes | Funds have been released. No further transitions. |
| `Rejected` | No | Freelancer can resubmit → `Submitted`. |
| `Disputed` | Yes | Milestone is frozen. Resolution happens at the escrow level. |

`Approved` and `Disputed` are terminal for the milestone record. Once a
milestone reaches either state, its `status` field will not change again.
