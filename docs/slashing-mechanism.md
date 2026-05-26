# Slashing Mechanism

This document explains how the slashing subsystem works in
`stellar-trust-escrow`: when a slash is created, how the dispute window
operates, and what happens to reputation on both outcomes.

Relevant source locations:

- `contracts/escrow_contract/src/lib.rs` — `finalize_slash` (L2441),
  `dispute_slash` (L2480), `resolve_slash_dispute` (L2518),
  `apply_slash` (L2662), `calculate_slash_amount` (L2657)
- `contracts/escrow_contract/src/types.rs` — `SlashRecord` struct
- Constants: `SLASH_DISPUTE_PERIOD` (L86), `SLASH_PERCENTAGE` (L87)

---

## Table of Contents

1. [Overview](#overview)
2. [Constants](#constants)
3. [SlashRecord Type](#slashrecord-type)
4. [Slash Lifecycle](#slash-lifecycle)
   - [Creation via execute_cancellation](#creation-via-execute_cancellation)
   - [calculate_slash_amount Formula](#calculate_slash_amount-formula)
   - [Dispute Window](#dispute-window)
   - [finalize_slash](#finalize_slash)
   - [dispute_slash](#dispute_slash)
   - [resolve_slash_dispute](#resolve_slash_dispute)
5. [Reputation Effects](#reputation-effects)
6. [Error Codes](#error-codes)

---

## Overview

Slashing is a penalty mechanism applied when a party requests cancellation
of an escrow and the cancellation is later deemed unjustified. A percentage
of the escrow's remaining balance is transferred from the requester to the
other party as a deterrent against bad-faith cancellation requests.

The slashed party has a `SLASH_DISPUTE_PERIOD` window to challenge the
slash. If they do not dispute within that window, `finalize_slash` can be
called to execute the transfer. If they dispute, an admin calls
`resolve_slash_dispute` to either uphold or reverse the slash.

---

## Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `SLASH_DISPUTE_PERIOD` | `51_840` ledger seconds (~6 days) | How long the slashed party has to call `dispute_slash` before the slash can be finalized. |
| `SLASH_PERCENTAGE` | `10` | Percentage of `remaining_balance` taken as the slash amount. |

---

## SlashRecord Type

```rust
pub struct SlashRecord {
    pub escrow_id: u64,
    pub slashed_user: Address,
    pub recipient: Address,
    pub amount: i128,
    pub reason: String,
    pub slashed_at: u64,
    pub disputed: bool,
}
```

| Field | Description |
|-------|-------------|
| `escrow_id` | The escrow this slash belongs to. |
| `slashed_user` | The address being penalized (the cancellation requester). |
| `recipient` | The address that will receive the slashed funds if the slash is upheld (typically the other party). |
| `amount` | Token amount to be transferred, calculated by `calculate_slash_amount`. |
| `reason` | Human-readable string explaining why the slash was applied. |
| `slashed_at` | Ledger timestamp when the slash was created. Used to enforce `SLASH_DISPUTE_PERIOD`. |
| `disputed` | `true` once `dispute_slash` has been called. Prevents double-disputing and blocks `finalize_slash`. |

---

## Slash Lifecycle

### Creation via execute_cancellation

A `SlashRecord` is created inside `execute_cancellation` when a
cancellation request is executed after its dispute deadline has passed.
The flow is:

```
request_cancellation(escrow_id, reason)
        |
        v
CancellationRequest stored with dispute_deadline = now + CANCELLATION_DISPUTE_PERIOD
        |
        v
[CANCELLATION_DISPUTE_PERIOD elapses without dispute]
        |
        v
execute_cancellation(escrow_id) called
        |
        v
apply_slash(env, escrow_id, slashed_user, recipient, reason)
        |
        v
SlashRecord stored; SLASH_DISPUTE_PERIOD window opens
```

The `slashed_user` is the party who originally called
`request_cancellation`. The `recipient` is the other party in the escrow.

---

### calculate_slash_amount Formula

```rust
fn calculate_slash_amount(remaining_balance: i128) -> i128 {
    remaining_balance * SLASH_PERCENTAGE as i128 / 100
}
```

Example: if `remaining_balance = 10_000_000` (1 USDC at 7 decimal places),
the slash amount is `10_000_000 * 10 / 100 = 1_000_000` (0.1 USDC).

The slash amount is deducted from the escrow's `remaining_balance` and
held in the `SlashRecord` until either `finalize_slash` or
`resolve_slash_dispute` executes the transfer.

---

### Dispute Window

After a `SlashRecord` is created, the `slashed_user` has
`SLASH_DISPUTE_PERIOD` seconds (approximately 6 days) to call
`dispute_slash`. During this window:

- `finalize_slash` will revert with `CancellationDisputePeriodActive`
  (error 35) if called before the window closes.
- `dispute_slash` sets `SlashRecord.disputed = true`, which blocks
  `finalize_slash` permanently and routes resolution to an admin via
  `resolve_slash_dispute`.

---

### finalize_slash

```rust
pub fn finalize_slash(
    env: Env,
    escrow_id: u64,
) -> Result<(), EscrowError>
```

Callable by anyone after `SLASH_DISPUTE_PERIOD` has elapsed and
`disputed == false`. Transfers `SlashRecord.amount` from the contract
to `SlashRecord.recipient` and removes the `SlashRecord` from storage.

**Preconditions:**
- `SlashRecord` exists for `escrow_id`.
- `now >= slashed_at + SLASH_DISPUTE_PERIOD`.
- `disputed == false`.

**Errors:**
- `SlashNotFound` (38) — no slash record for this escrow.
- `CancellationDisputePeriodActive` (35) — dispute window still open.
- `SlashAlreadyDisputed` (39) — `dispute_slash` was already called.

---

### dispute_slash

```rust
pub fn dispute_slash(
    env: Env,
    caller: Address,   // must be the slashed_user
    escrow_id: u64,
) -> Result<(), EscrowError>
```

Called by the slashed party within `SLASH_DISPUTE_PERIOD` to contest
the slash. Sets `SlashRecord.disputed = true`. After this call, only
`resolve_slash_dispute` (admin) can settle the outcome.

**Preconditions:**
- `caller == SlashRecord.slashed_user`.
- `now < slashed_at + SLASH_DISPUTE_PERIOD`.
- `disputed == false`.

**Errors:**
- `SlashNotFound` (38).
- `SlashAlreadyDisputed` (39).
- `SlashDisputeDeadlineExpired` (40) — called after the window closed.
- `Unauthorized` (3) — caller is not the slashed user.

---

### resolve_slash_dispute

```rust
pub fn resolve_slash_dispute(
    env: Env,
    caller: Address,   // must be contract admin
    escrow_id: u64,
    upheld: bool,      // true = slash stands, false = slash reversed
) -> Result<(), EscrowError>
```

Admin-only. Resolves a disputed slash:

- `upheld = true`: transfers `amount` to `recipient`. Updates reputation
  for `slashed_user` (slash upheld, score reduced).
- `upheld = false`: returns `amount` to `slashed_user`. Updates reputation
  for `slashed_user` (slash reversed, no penalty).

In both cases the `SlashRecord` is removed from storage after resolution.

**Errors:**
- `SlashNotFound` (38).
- `AdminOnly` (4) — caller is not the admin.

---

## Reputation Effects

The `ReputationRecord` tracks slash history via two fields:

| Field | Type | Updated when |
|-------|------|-------------|
| `slash_count` | `u32` | Incremented by 1 when a slash is **upheld** by `resolve_slash_dispute` or finalized by `finalize_slash`. |
| `total_slashed` | `i128` | Increased by `SlashRecord.amount` when a slash is upheld or finalized. |

When a slash is **reversed** by `resolve_slash_dispute`, neither
`slash_count` nor `total_slashed` is incremented — the record is clean.

The `total_score` in `ReputationRecord` is also affected:

| Outcome | Score change |
|---------|-------------|
| Slash upheld | `total_score` reduced (exact formula defined in `_update_reputation_internal`). |
| Slash reversed | No score change. |

See [reputation-scoring.md](./reputation-scoring.md) for the full
scoring formula.

---

## Error Codes

| Code | Name | Meaning |
|------|------|---------|
| 38 | `SlashNotFound` | No `SlashRecord` exists for the given `escrow_id`. |
| 39 | `SlashAlreadyDisputed` | `dispute_slash` was already called; cannot dispute again or finalize. |
| 40 | `SlashDisputeDeadlineExpired` | The `SLASH_DISPUTE_PERIOD` window has closed; `dispute_slash` can no longer be called. |
| 41 | `InvalidSlashAmount` | The calculated slash amount is zero or negative (e.g. `remaining_balance` is zero). |
