# Indexer Event Schema

This document is the canonical reference for every event emitted by the
StellarTrustEscrow smart contracts. Backend indexers must use this schema to
decode raw Soroban XDR event data and keep the off-chain database in sync.

---

## Important: `symbol_short!` 9-character limit

Soroban's `symbol_short!` macro accepts **at most 9 characters**. All topic
strings in this document respect that limit. If a topic string ever exceeds 9
characters the contract will fail to compile.

---

## How to decode Soroban events

Soroban contract events are surfaced through the Horizon API inside
`TransactionMeta` XDR. The recommended decoding flow is:

1. **Poll Horizon** for transactions involving your contract:
   ```
   GET https://horizon-testnet.stellar.org/accounts/{CONTRACT_ID}/transactions?order=asc&cursor={last_cursor}
   ```
2. **Fetch transaction meta** from the `result_meta_xdr` field of each
   transaction response.
3. **Decode the XDR** using the `@stellar/stellar-base` SDK:
   ```js
   import { xdr } from '@stellar/stellar-base';
   const meta = xdr.TransactionMeta.fromXDR(result_meta_xdr, 'base64');
   const events = meta.v3().sorobanMeta().events();
   ```
4. **Filter by contract ID** — each event carries a `contractId` field.
5. **Read topics and data** — `event.body().v0().topics()` is an array of
   `ScVal`; `event.body().v0().data()` is a single `ScVal` (often a tuple).
6. **Match the first topic** (a `ScVal` of type `symbol`) against the strings
   in the tables below to identify the event type.
7. **Deserialize the data tuple** according to the types listed in the
   _Data tuple_ column.

> **Tip:** Use `soroban-client` or `@stellar/stellar-sdk` helpers such as
> `scValToNative()` to convert `ScVal` objects to JavaScript primitives.

---

## `escrow_contract` events

Source: `contracts/escrow_contract/src/events.rs`

### Escrow lifecycle

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Escrow created | `esc_crt` | `(symbol, u64 escrow_id)` | `(Address client, Address freelancer, i128 amount)` | `emit_escrow_created` | A new escrow is initialised and funds are locked |
| Escrow completed | `esc_done` | `(symbol, u64 escrow_id)` | `()` | `emit_escrow_completed` | All milestones are approved and the escrow is fully settled |
| Escrow cancelled | `esc_can` | `(symbol, u64 escrow_id)` | `i128 returned_amount` | `emit_escrow_cancelled` | An escrow is cancelled and remaining funds are returned to the client |

### Milestones

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Milestone added | `mil_add` | `(symbol, u64 escrow_id)` | `(u32 milestone_id, i128 amount)` | `emit_milestone_added` | A new milestone is appended to an escrow |
| Milestone submitted | `mil_sub` | `(symbol, u64 escrow_id)` | `(u32 milestone_id, Address freelancer)` | `emit_milestone_submitted` | A freelancer marks a milestone as submitted |
| Milestone approved | `mil_apr` | `(symbol, u64 escrow_id)` | `(u32 milestone_id, i128 amount)` | `emit_milestone_approved` | A client approves a milestone submission |
| Milestone rejected | `mil_rej` | `(symbol, u64 escrow_id)` | `(u32 milestone_id, Address client)` | `emit_milestone_rejected` | A client rejects a milestone, returning it to Pending |
| Milestone disputed | `mil_dis` | `(symbol, u64 escrow_id)` | `(u32 milestone_id, Address raised_by)` | `emit_milestone_disputed` | A dispute is raised on a specific milestone |

### Multisig

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Multisig approval recorded | `msig_apr` | `(symbol, u64 escrow_id)` | `(u32 milestone_id, Address signer, u32 accrued_weight, u32 threshold)` | `emit_multisig_approval_recorded` | A weighted signer votes; the escrow may still be below the approval threshold |

### Funds

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Funds released | `funds_rel` | `(symbol, u64 escrow_id)` | `(Address to, i128 amount)` | `emit_funds_released` | Funds are transferred to the freelancer after milestone approval |

### Recurring payments

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Recurring schedule created | `rec_crt` | `(symbol, u64 escrow_id)` | `(i128 payment_amount, u32 total_payments, u64 next_payment_at)` | `emit_recurring_schedule_created` | A recurring payment schedule is configured |
| Recurring payments processed | `rec_pay` | `(symbol, u64 escrow_id)` | `(u32 processed_count, i128 total_released, Option<u64> next_payment_at)` | `emit_recurring_payments_processed` | One or more scheduled payments are executed |
| Recurring schedule paused | `rec_pau` | `(symbol, u64 escrow_id)` | `Address paused_by` | `emit_recurring_schedule_paused` | A recurring schedule is paused |
| Recurring schedule resumed | `rec_res` | `(symbol, u64 escrow_id)` | `(Address resumed_by, u64 next_payment_at)` | `emit_recurring_schedule_resumed` | A paused recurring schedule is resumed |
| Recurring schedule cancelled | `rec_can` | `(symbol, u64 escrow_id)` | `(Address cancelled_by, i128 refunded_amount)` | `emit_recurring_schedule_cancelled` | A recurring schedule is cancelled and remaining funds refunded |

### Disputes

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Dispute raised | `dis_rai` | `(symbol, u64 escrow_id)` | `Address raised_by` | `emit_dispute_raised` | A party raises a dispute on an escrow |
| Dispute resolved | `dis_res` | `(symbol, u64 escrow_id)` | `(i128 client_amount, i128 freelancer_amount)` | `emit_dispute_resolved` | An arbiter resolves the dispute and distributes funds |

### Cancellation flow

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Cancellation requested | `can_req` | `(symbol, u64 escrow_id)` | `(Address requester, String reason, u64 dispute_deadline)` | `emit_cancellation_requested` | A cancellation is requested; dispute window opens |
| Cancellation executed | `can_exe` | `(symbol, u64 escrow_id)` | `(i128 client_amount, i128 slash_amount)` | `emit_cancellation_executed` | Cancellation is executed after the dispute period expires |

### Slashing

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Slash applied | `slsh_app` | `(symbol, u64 escrow_id)` | `(Address slashed_user, Address recipient, i128 amount, String reason)` | `emit_slash_applied` | A slash penalty is applied to a user |
| Slash disputed | `slsh_dis` | `(symbol, u64 escrow_id)` | `(Address disputer, i128 amount)` | `emit_slash_disputed` | A slashed user disputes the penalty |
| Slash dispute resolved | `slsh_res` | `(symbol, u64 escrow_id)` | `(bool upheld, i128 amount)` | `emit_slash_dispute_resolved` | The slash dispute is adjudicated |

### Reputation

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Reputation updated | `rep_upd` | `(symbol,)` | `(Address address, u64 new_score)` | `emit_reputation_updated` | A user's on-chain reputation score changes |

### Time locks

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Time lock started | `tl_start` | `(symbol, u64 escrow_id)` | `(u64 duration_ledger, u64 start_ledger)` | `emit_timelock_started` | A time lock is started on an escrow |
| Time lock released | `tl_rel` | `(symbol, u64 escrow_id)` | `u64 released_ledger` | `emit_timelock_released` | A time lock expires and the escrow is unlocked |
| Lock time expired | `lock_exp` | `(symbol, u64 escrow_id)` | `u64 lock_time` | `emit_lock_time_expired` | A time lock timestamp is reached |
| Lock time extended | `lock_ext` | `(symbol, u64 escrow_id)` | `(u64 old_lock_time, u64 new_lock_time, Address extended_by)` | `emit_lock_time_extended` | A time lock is extended |

### Contract pause

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Contract paused | `paused` | `(symbol,)` | `Address admin` | `emit_contract_paused` | An admin pauses the contract |
| Contract unpaused | `unpaused` | `(symbol,)` | `Address admin` | `emit_contract_unpaused` | An admin unpauses the contract |

---

## `escrow_extensions` events

Source: `contracts/escrow_extensions/src/events.rs`

### Batch operations

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Batch escrow created | `bat_crt` | `(symbol, u64 escrow_id)` | `(Address client, Address freelancer, i128 amount)` | `emit_batch_escrow_created` | One escrow is created as part of a batch operation |
| Batch completed | `bat_done` | `(symbol,)` | `(u32 count, i128 total_amount)` | `emit_batch_completed` | The entire batch operation finishes |

### Protocol fees

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Fee collected | `fee_col` | `(symbol, u64 escrow_id)` | `(Address token, i128 amount)` | `emit_fee_collected` | A protocol fee is deducted on milestone release |
| Fee distributed | `fee_dis` | `(symbol,)` | `(Address token, i128 total_distributed)` | `emit_fee_distributed` | Accumulated fees are distributed to recipients |
| Fee emergency withdrawn | `fee_emg` | `(symbol,)` | `(Address token, i128 amount, Address to)` | `emit_fee_emergency_withdrawn` | An admin performs an emergency fee withdrawal |

### On-chain arbitration

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Dispute opened | `arb_opn` | `(symbol, u64 escrow_id)` | `u64 voting_closes_at` | `emit_dispute_opened` | An on-chain arbitration vote is opened |
| Vote cast | `arb_vot` | `(symbol, u64 escrow_id)` | `(Address voter, u64 stake, bool for_client)` | `emit_vote_cast` | A voter casts a stake-weighted vote |
| Dispute resolved | `arb_res` | `(symbol, u64 escrow_id)` | `bool client_wins` | `emit_dispute_resolved` | The arbitration vote concludes and a winner is determined |
| Voter slashed | `arb_slh` | `(symbol, u64 escrow_id)` | `(Address voter, u64 stake)` | `emit_voter_slashed` | A voter on the losing side (>90% minority) is slashed |

### Contract upgrades

| Event | `symbol_short!` | Topic tuple | Data tuple | Emitting function | When emitted |
|---|---|---|---|---|---|
| Upgrade queued | `upg_que` | `(symbol,)` | `(BytesN<32> new_wasm_hash, u64 executable_after)` | `emit_upgrade_queued` | A time-locked upgrade is queued |
| Upgrade executed | `upg_exe` | `(symbol,)` | `BytesN<32> new_wasm_hash` | `emit_upgrade_executed` | A queued upgrade is applied |
| Upgrade cancelled | `upg_can` | `(symbol,)` | `()` | `emit_upgrade_cancelled` | A pending upgrade is cancelled before execution |

---

## Type reference

| Soroban type | XDR `ScVal` kind | JS native (via `scValToNative`) |
|---|---|---|
| `u32` | `ScvU32` | `number` |
| `u64` | `ScvU64` | `BigInt` |
| `i128` | `ScvI128` | `BigInt` |
| `bool` | `ScvBool` | `boolean` |
| `Address` | `ScvAddress` | `string` (strkey) |
| `String` | `ScvString` | `string` |
| `BytesN<32>` | `ScvBytes` | `Buffer` (32 bytes) |
| `Option<T>` | `ScvVoid` (None) or `T` (Some) | `null` or native `T` |
| tuple `(A, B, …)` | `ScvVec` | `Array` |
| `()` | `ScvVoid` | `null` |
