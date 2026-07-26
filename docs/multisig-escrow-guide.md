# Multisig Escrow Guide

This guide explains how to configure a multisig milestone-approval escrow, how weighted voting works, and how the contract events signal partial vs. final approval.

---

## Overview

By default, only the `client` address can approve milestones. A weighted policy is attached at creation through the `multisig_config` argument of `create_escrow`. The contract stores that policy in a namespaced persistent entry and requires its quorum before a milestone is approved or funds are released.

Escrows at or above `HIGH_VALUE_THRESHOLD` must enable multisig. Their policy must require at least two distinct signatures: the threshold must be greater than every individual approver's weight. Lower-value escrows may keep the legacy client-only behavior.

---

## Key Types

### `MultisigConfig`

```rust
pub struct MultisigConfig {
    pub approvers: Vec<Address>,  // ordered list of eligible signers
    pub weights:   Vec<u32>,      // weight[i] corresponds to approvers[i]
    pub threshold: u32,           // minimum cumulative weight to approve
}
```

| Field       | Meaning                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `approvers` | Addresses allowed to cast an approval vote. Must be the same length as `weights`.                |
| `weights`   | Voting power of each approver. Weights are summed as votes arrive; order must match `approvers`. |
| `threshold` | The cumulative weight that must be reached for the milestone to transition to `Approved`.        |

Empty `approvers` and `weights` with a zero threshold disable multisig for lower-value escrows. Approvers must be unique, weights must be positive, and the threshold cannot exceed the total weight.

### `ApprovalRecord`

```rust
pub struct ApprovalRecord {
    pub signer:      Address,
    pub approved_at: u64,     // ledger timestamp of the vote
}
```

Each call to `approve_milestone` by a valid signer appends one `ApprovalRecord` to `Milestone.approvals`. The record is permanent and auditable on-chain.

### Approval authorisation

For a configured escrow, only addresses in `MultisigConfig.approvers` may call `approve_milestone`. The same addresses are exposed through `EscrowState.buyer_signers` for backward-compatible clients:

```rust
if multisig_weight(&config, &caller).is_none() {
    return Err(EscrowError::E3);
}
```

The legacy `create_escrow_with_buyer_signers` entry point remains available for lower-value escrows, but it cannot be used to bypass the high-value policy.

---

## Weighted Voting in `approve_milestone`

`approve_milestone` processes each vote as follows:

1. Verify the caller is a member of `MultisigConfig.approvers`. Returns `EscrowError::E3` (3) otherwise.
2. Verify the milestone is in `MS_SUBMITTED` state.
3. Reject an existing vote from the same caller with `DuplicateMultisigApproval` (72).
4. Look up the caller's weight and append an `ApprovalRecord` to `Milestone.approvals`.
5. Sum all recorded weights for this milestone.
6. **If `accrued_weight < threshold`** — emit `msig_apr` (`emit_multisig_approval_recorded`) and return. The milestone stays in `MS_SUBMITTED`.
7. **If `accrued_weight >= threshold`** — transition the milestone to `MS_APPROVED`, release funds, emit `mil_apr` (`emit_milestone_approved`), and check for escrow completion.

---

## Event Distinction: `msig_apr` vs `mil_apr`

| Event                             | Symbol     | When it fires                                                   | Payload                                             |
| --------------------------------- | ---------- | --------------------------------------------------------------- | --------------------------------------------------- |
| `emit_multisig_approval_recorded` | `msig_apr` | Every vote, including votes that do **not** yet reach threshold | `(milestone_id, signer, accrued_weight, threshold)` |
| `emit_milestone_approved`         | `mil_apr`  | Only when threshold is reached and funds are released           | `(milestone_id, amount)`                            |

A `msig_apr` event without a subsequent `mil_apr` means the milestone is still awaiting more signers. Indexers should treat `msig_apr` as informational and only update milestone state on `mil_apr`.

---

## Worked Example: 2-of-3 Multisig

Three stakeholders share approval authority. Alice carries the most weight; Bob and Carol together can also reach threshold.

| Signer | Weight |
| ------ | ------ |
| Alice  | 3      |
| Bob    | 2      |
| Carol  | 2      |

`threshold = 4`

**Scenario A — Alice approves alone:**

- Alice votes → `accrued_weight = 3` → below threshold → `msig_apr` emitted.

Wait, 3 < 4, so one more vote is needed.

- Bob votes → `accrued_weight = 5` → threshold reached → `mil_apr` emitted, funds released.

**Scenario B — Bob and Carol approve without Alice:**

- Bob votes → `accrued_weight = 2` → `msig_apr`.
- Carol votes → `accrued_weight = 4` → threshold reached → `mil_apr`, funds released.

---

## Soroban CLI Invocation

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <CLIENT_SECRET_KEY> \
  --network testnet \
  -- \
  create_escrow \
  --client  GCLIENT... \
  --freelancer GFREELANCER... \
  --token GTOKEN... \
  --total_amount 1000000000 \
  --brief_hash <32-byte-hex> \
  --arbiter null \
  --deadline null \
  --lock_time null \
  --timelock null \
  --multisig_config '{"approvers":["GALICE...","GBOB...","GCAROL..."],"weights":[3,2,2],"threshold":4}'
```

---

## Error Reference

| Code | Name                               | When it occurs                                             |
| ---- | ---------------------------------- | ---------------------------------------------------------- |
| 3    | `Unauthorized`                     | Caller is not a configured approver                        |
| 9    | `EscrowNotActive`                  | Escrow is not in `Active` state                            |
| 14   | `InvalidMilestoneState`            | Milestone is not in `MS_SUBMITTED` state                   |
| 70   | `InvalidMultisigConfig`            | Policy structure, weights, or threshold are invalid        |
| 71   | `HighValueMultisigRequired`        | High-value policy can be completed by fewer than two votes |
| 72   | `DuplicateMultisigApproval`        | An approver has already voted on the milestone             |
| 73   | `MultisigBatchApprovalUnsupported` | Batch approval attempted on a weighted escrow              |
