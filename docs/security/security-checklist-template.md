# Smart Contract Security Checklist

> Copy this checklist into your pull request description and check off each item before requesting review.
> Every box must be checked or explicitly marked N/A with a brief justification.

---

## 1. Reentrancy

- [ ] All state mutations (storage writes, balance updates) occur **before** any cross-contract calls (`token_client.transfer()`, `invoke_contract()`).
- [ ] The checks-effects-interactions pattern is followed: validate inputs → update state → interact with external contracts.
- [ ] No function re-enters the same contract through a callback or nested cross-contract call without a reentrancy guard.
- [ ] `EscrowStatus` / `MilestoneStatus` is updated to a terminal or in-progress state before transferring tokens, preventing double-spend on re-entry.
- [ ] Any new cross-contract call site has been reviewed to confirm the callee cannot call back into this contract in a harmful way.

## 2. Integer Overflow

- [ ] All arithmetic on `i128`, `u32`, or other numeric types uses `checked_add`, `checked_sub`, or `checked_mul` (never bare `+`, `-`, `*` on user-supplied values).
- [ ] Overflow conditions propagate a typed `#[contracterror]` variant (e.g., `EscrowError::Overflow`) rather than panicking or silently wrapping.
- [ ] Accumulator fields (`total_amount`, `allocated_amount`, `remaining_balance`, `approved_count`) are updated with checked arithmetic at every write site.
- [ ] Division operations guard against divide-by-zero before executing.
- [ ] Cast operations between numeric types (e.g., `u32` → `i128`) are explicit and cannot truncate or sign-extend unexpectedly.

## 3. Access Control

- [ ] Every state-mutating function calls `require_auth()` on the appropriate signer (client, freelancer, or admin) before modifying storage.
- [ ] Admin-only operations call `require_admin()` or read `DataKey::Admin` from storage and verify the caller matches before proceeding.
- [ ] Role-based storage keys (`DataKey::Admin`, `DataKey::Client`, `DataKey::Freelancer`) are used consistently; no role is hard-coded as a literal address.
- [ ] Initialisation functions (`initialize`) guard against re-initialisation (e.g., check `DataKey::Admin` is not already set; return `EscrowError::AlreadyInitialized` if so).
- [ ] No function relies solely on `env.invoker()` without also calling `require_auth()` — the two are not equivalent in Soroban.
- [ ] Multi-party approval flows (e.g., milestone release requiring both client and freelancer) verify all required signatures before state changes.

## 4. Gas Griefing

- [ ] All loops over user-supplied or storage-backed collections are bounded by a compile-time or storage-enforced cap (e.g., `milestone_count` ≤ `MAX_MILESTONES`).
- [ ] The `milestone_count` cap is enforced at creation time and cannot be exceeded by subsequent calls.
- [ ] Storage keys do not include unbounded user-supplied strings; key components are fixed-length or hashed to a `BytesN<32>`.
- [ ] Storage key length limits are documented and enforced; no key exceeds the Soroban ledger entry size limit.
- [ ] Functions that iterate over milestones or approvals exit early or return an error if the collection exceeds the expected bound.
- [ ] No function allows a caller to force the contract to perform O(n) work where n is attacker-controlled without a corresponding fee or cap.

## 5. Input Validation

- [ ] Amount parameters are validated to be strictly greater than zero before any state change (`amount > 0`; return `EscrowError::InvalidAmount` otherwise).
- [ ] Description hash parameters are typed as `BytesN<32>` (enforced by the Soroban SDK type system) and not accepted as raw `Bytes` of arbitrary length.
- [ ] Deadline / expiry parameters are validated to be in the future relative to `env.ledger().timestamp()` at the time of the call.
- [ ] Milestone indices and IDs are bounds-checked against `milestone_count` before storage access.
- [ ] Token contract addresses are validated to be non-zero / non-default before being stored or invoked.
- [ ] All `BytesN<N>` and `Address` parameters are checked for the zero/default value where that would be semantically invalid.

## 6. State Management

- [ ] `EscrowStatus` transitions follow the defined acyclic graph: `Active` → `{Completed | Disputed | Cancelled | CancellationPending}`; no terminal state transitions to another state.
- [ ] `MilestoneStatus` transitions are guarded: `Pending` → `Submitted` → `Approved` → `Released`; rejected milestones may only transition to `Rejected` or `Disputed`.
- [ ] The `approved_count` invariant is maintained: `approved_count` equals the number of milestones with `MilestoneStatus::Approved` at all times.
- [ ] `remaining_balance` is always ≥ 0 after any operation; the contract returns an error rather than allowing a negative balance.
- [ ] `allocated_amount` never exceeds `total_amount`; milestone additions are rejected if they would cause an overflow.
- [ ] Concurrent or out-of-order operations (e.g., releasing a milestone that is not yet `Approved`) are rejected with the correct `EscrowError` variant.
- [ ] Storage reads and writes within a single function use consistent keys; no function reads a stale value after writing a new one to the same key.

---

## Sign-off

- GitHub handle: @___
- Date of review: YYYY-MM-DD
- Commit reviewed: `abc1234`
