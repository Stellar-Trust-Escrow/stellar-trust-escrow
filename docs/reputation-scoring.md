# Reputation Scoring Algorithm

This document explains the `ReputationRecord` data structure, every
field's semantics and update rules, and the scoring algorithm implemented
in `_update_reputation_internal`.

Relevant source locations:

- `contracts/escrow_contract/src/types.rs` — `ReputationRecord` struct
- `contracts/escrow_contract/src/lib.rs` — `_update_reputation_internal`,
  `update_reputation` (public), `get_reputation`
- `contracts/escrow_contract/src/events.rs` — `emit_reputation_updated`

---

## Table of Contents

1. [ReputationRecord Fields](#reputationrecord-fields)
2. [When Reputation Is Updated](#when-reputation-is-updated)
3. [Scoring Algorithm](#scoring-algorithm)
4. [emit_reputation_updated Event](#emit_reputation_updated-event)
5. [Default Record for New Addresses](#default-record-for-new-addresses)
6. [Worked Examples](#worked-examples)
7. [get_reputation Function](#get_reputation-function)

---

## ReputationRecord Fields

```rust
pub struct ReputationRecord {
    pub address: Address,
    pub total_score: u64,
    pub completed_escrows: u32,
    pub disputed_escrows: u32,
    pub disputes_won: u32,
    pub total_volume: i128,
    pub slash_count: u32,
    pub total_slashed: i128,
    pub last_updated: u64,
}
```

| Field | Unit | Increment rule | Decrement rule |
|-------|------|----------------|----------------|
| `address` | — | Set at record creation; never changes. | — |
| `total_score` | points | +10 base on completion; +1 per 1 000 units of volume (capped at +10 bonus); +3 on winning a dispute. | −5 on disputed escrow; reduced on upheld slash. |
| `completed_escrows` | count | +1 when an escrow reaches `Completed` status and this address was a party. | Never decremented. |
| `disputed_escrows` | count | +1 when a dispute is raised on an escrow this address was party to. | Never decremented. |
| `disputes_won` | count | +1 when `resolve_dispute` is called and this address is on the winning side. | Never decremented. |
| `total_volume` | token base units (stroops) | Increased by the escrow's `total_amount` on successful completion. | Never decremented. |
| `slash_count` | count | +1 when a slash against this address is upheld (finalized or resolved upheld). | Never decremented. |
| `total_slashed` | token base units | Increased by `SlashRecord.amount` when a slash is upheld. | Never decremented. |
| `last_updated` | ledger timestamp | Updated on every call to `_update_reputation_internal`. | — |

---

## When Reputation Is Updated

`_update_reputation_internal` is called in three situations:

| Trigger | `completed` | `disputed` | `volume` |
|---------|-------------|------------|---------|
| All milestones approved → escrow `Completed` | `true` | `false` | escrow `total_amount` |
| `resolve_dispute` distributes funds | `false` | `true` | party's received amount |
| Slash upheld by `finalize_slash` or `resolve_slash_dispute` | `false` | `false` | `0` (slash fields updated separately) |

The public `update_reputation` function is a thin wrapper that calls
`_update_reputation_internal` and is also available for admin use.

---

## Scoring Algorithm

```
_update_reputation_internal(address, completed, disputed, volume):

  record = load_reputation(address)   // or default zero record

  if completed:
    volume_bonus = min(volume / 1_000, 10)   // capped at +10
    record.total_score    += 10 + volume_bonus
    record.completed_escrows += 1
    record.total_volume   += volume

  if disputed:
    record.total_score    = saturating_sub(record.total_score, 5)
    record.disputed_escrows += 1

  record.last_updated = now
  save_reputation(record)
  emit_reputation_updated(address, record.total_score)
```

`saturating_sub` means the score never goes below 0.

**Dispute win recovery** — when `resolve_dispute` determines a winner,
`_update_reputation_internal` is called a second time for the winning
party with a `disputes_won` increment and a +3 score recovery:

```
  if disputes_won_increment:
    record.total_score  += 3
    record.disputes_won += 1
```

**Slash penalty** — when a slash is upheld, the slashed address receives
an additional score reduction proportional to the slash amount:

```
  slash_penalty = min(slash_amount / 1_000_000, 20)   // capped at −20
  record.total_score = saturating_sub(record.total_score, slash_penalty)
  record.slash_count    += 1
  record.total_slashed  += slash_amount
```

---

## emit_reputation_updated Event

```rust
pub fn emit_reputation_updated(env: &Env, address: &Address, new_score: u64)
```

Topic: `(symbol_short!("rep_upd"),)`
Data: `(address, new_score)`

Fired at the end of every `_update_reputation_internal` call.
`new_score` is the value of `total_score` after all updates have been
applied. The backend indexer listens for this event to keep the
`reputation_records` table in sync.

---

## Default Record for New Addresses

`get_reputation` never returns an error for an unknown address. If no
record exists in persistent storage, it returns a synthesized default:

```rust
ReputationRecord {
    address,
    total_score: 0,
    completed_escrows: 0,
    disputed_escrows: 0,
    disputes_won: 0,
    total_volume: 0,
    slash_count: 0,
    total_slashed: 0,
    last_updated: env.ledger().timestamp(),
}
```

This default is **not written to storage** — it is constructed in memory
on each call. The record is only persisted once `_update_reputation_internal`
is called for that address for the first time.

---

## Worked Examples

All amounts are in token base units (stroops, 7 decimal places).
1 USDC = 10 000 000 stroops.

### Example 1 — Clean completion

Alice completes an escrow worth 500 USDC (5 000 000 000 stroops).

```
completed = true, disputed = false, volume = 5_000_000_000

volume_bonus = min(5_000_000_000 / 1_000, 10) = 10   (capped)
score_delta  = 10 + 10 = +20

Result:
  total_score       = 0 + 20 = 20
  completed_escrows = 0 + 1  = 1
  total_volume      = 0 + 5_000_000_000
```

### Example 2 — Disputed escrow, Alice loses

Alice is on the losing side of a dispute.

```
completed = false, disputed = true, volume = 0

score_delta = -5

Result:
  total_score      = 20 - 5 = 15
  disputed_escrows = 0 + 1  = 1
```

### Example 3 — Dispute won

Bob wins the same dispute.

```
disputes_won_increment = true

score_delta = +3

Result:
  total_score  = 10 + 3 = 13   (Bob started at 10)
  disputes_won = 0 + 1  = 1
```

### Example 4 — Slash upheld (0.5 USDC slashed)

Alice is slashed 0.5 USDC (5 000 000 stroops).

```
slash_amount = 5_000_000
slash_penalty = min(5_000_000 / 1_000_000, 20) = 5

Result:
  total_score   = 15 - 5 = 10
  slash_count   = 0 + 1  = 1
  total_slashed = 0 + 5_000_000
```

### Example 5 — Slash reversed

No score change. `slash_count` and `total_slashed` are not incremented.

---

## get_reputation Function

```rust
pub fn get_reputation(
    env: Env,
    address: Address,
) -> Result<ReputationRecord, EscrowError>
```

Returns the stored `ReputationRecord` for `address`, or the default
zero-score record if none exists. Never returns an error for an unknown
address — callers can safely call this for any Stellar address.

The backend REST API exposes this via `GET /api/reputation/:address`
and applies the same default-zero fallback for addresses not yet in the
PostgreSQL `reputation_records` table.
