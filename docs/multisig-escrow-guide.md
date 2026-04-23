# Multisig Escrow Guide

This guide explains how to configure a multisig milestone-approval escrow, how weighted voting works, and how the contract events signal partial vs. final approval.

---

## Overview

By default, only the `client` address can approve milestones. When you call `create_escrow_with_buyer_signers`, you supply a list of additional approvers (`buyer_signers`). The contract stores these addresses in `EscrowMeta.buyer_signers` and, when a `MultisigConfig` is attached, requires a weighted quorum before a milestone is considered approved.

---

## Key Types

### `MultisigConfig` (`types.rs` L133)

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

An empty `approvers` list disables multisig — only `client` may approve (legacy behaviour).

### `ApprovalRecord` (`types.rs` L120)

```rust
pub struct ApprovalRecord {
    pub signer:      Address,
    pub approved_at: u64,     // ledger timestamp of the vote
}
```

Each call to `approve_milestone` by a valid signer appends one `ApprovalRecord` to `Milestone.approvals`. The record is permanent and auditable on-chain.

### `EscrowMeta.buyer_signers`

`buyer_signers` is a `Vec<Address>` stored directly in `EscrowMeta`. It is the authorisation list checked in `approve_milestone`:

```rust
if caller != meta.client && !meta.buyer_signers.contains(&caller) {
    return Err(EscrowError::Unauthorized);  // error code 3
}
```

The `client` address is always appended to `buyer_signers` during escrow creation even if it was not explicitly included in the supplied list.

---

## Weighted Voting in `approve_milestone`

`approve_milestone` (`lib.rs` L1596) processes each vote as follows:

1. Verify the caller is `client` or a member of `buyer_signers`. Returns `EscrowError::Unauthorized` (3) otherwise.
2. Verify the milestone is in `MS_SUBMITTED` state.
3. Look up the caller's index in `MultisigConfig.approvers` and read their weight.
4. Append an `ApprovalRecord` to `Milestone.approvals`.
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
  create_escrow_with_buyer_signers \
  --client  GCLIENT... \
  --freelancer GFREELANCER... \
  --token GTOKEN... \
  --total_amount 1000000000 \
  --brief_hash <32-byte-hex> \
  --arbiter null \
  --deadline null \
  --lock_time null \
  --buyer_signers '["GALICE...", "GBOB...", "GCAROL..."]'
```

After creation, configure the `MultisigConfig` by calling `set_multisig_config` (or pass it as part of escrow initialisation if your version supports it) with:

```json
{
  "approvers": ["GALICE...", "GBOB...", "GCAROL..."],
  "weights": [3, 2, 2],
  "threshold": 4
}
```

---

## Error Reference

| Code | Name                    | When it occurs                                    |
| ---- | ----------------------- | ------------------------------------------------- |
| 3    | `Unauthorized`          | Caller is not `client` and not in `buyer_signers` |
| 9    | `EscrowNotActive`       | Escrow is not in `Active` state                   |
| 14   | `InvalidMilestoneState` | Milestone is not in `MS_SUBMITTED` state          |
