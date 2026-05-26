# Governance Contract Usage Guide

This guide explains how to use the `GovernanceContract` to create proposals,
vote, and execute on-chain governance decisions.

Source: `contracts/governance/src/lib.rs`, `contracts/governance/src/types.rs`

---

## Table of Contents

1. [Overview](#overview)
2. [GovConfig Parameters](#govconfig-parameters)
3. [Proposal Lifecycle](#proposal-lifecycle)
4. [ProposalType and ProposalPayload](#proposaltype-and-proposalpayload)
5. [Voting Power](#voting-power)
6. [Quorum and Approval Threshold](#quorum-and-approval-threshold)
7. [ProposalStatus Transitions](#proposalstatus-transitions)
8. [Contract Functions](#contract-functions)
9. [CLI Examples](#cli-examples)
10. [Error Reference](#error-reference)
11. [Recommended Testnet Configuration](#recommended-testnet-configuration)

---

## Overview

The governance contract allows token holders to vote on protocol changes.
Any holder with enough tokens can create a proposal. After a configurable
delay, voting opens. Once the voting period ends, anyone can finalize the
proposal. If it passes quorum and the approval threshold, it enters a
timelock queue. After the timelock elapses, anyone can execute it.

---

## GovConfig Parameters

```rust
pub struct GovConfig {
    pub token: Address,
    pub proposal_threshold: i128,
    pub voting_period: u64,
    pub voting_delay: u64,
    pub timelock_delay: u64,
    pub quorum_bps: u32,
    pub approval_threshold_bps: u32,
}
```

| Parameter | Unit | Description |
|-----------|------|-------------|
| `token` | Address | The governance token. Voting power = token balance at vote time. |
| `proposal_threshold` | token base units | Minimum token balance required to create a proposal. |
| `voting_period` | seconds | How long the vote is open after `vote_start`. Must be > 0. |
| `voting_delay` | seconds | Delay between proposal creation and vote start. Allows token holders to prepare. |
| `timelock_delay` | seconds | Delay between a passed vote and execution. Gives time to react to malicious proposals. |
| `quorum_bps` | basis points | Minimum participation: `(votes_for + votes_against) >= total_supply_snapshot * quorum_bps / 10_000`. |
| `approval_threshold_bps` | basis points | Minimum approval: `votes_for >= total_votes * approval_threshold_bps / 10_000`. |

Basis points: 100 bps = 1%, 10_000 bps = 100%.

---

## Proposal Lifecycle

```
create_proposal
      |
      | voting_delay seconds
      v
  [vote_start]
      |
      | voting_period seconds  ← cast_vote called here
      v
  [vote_end]
      |
      v
finalize_proposal
      |
      +-- quorum + threshold met? --> status = Queued
      |                                    |
      +-- not met?               --> status = Defeated
                                           |
                                    timelock_delay seconds
                                           |
                                           v
                                   execute_proposal
                                           |
                                           v
                                   status = Executed
```

At any point before `Executed`, the proposer or admin can call
`cancel_proposal` → `status = Cancelled`.

---

## ProposalType and ProposalPayload

Each proposal type requires a matching payload variant. Mismatched
type/payload combinations are rejected with `InvalidProposalType` (11).

### ParameterChange + Parameter(ParameterPayload)

```rust
pub struct ParameterPayload {
    pub key: String,    // parameter name, e.g. "platform_fee_bps"
    pub value: i128,    // new value
}
```

Signals a protocol parameter change. No on-chain execution — the new
value is read from the proposal payload by off-chain systems and
applied by the admin. Use for fee changes, quorum updates, etc.

### ContractUpgrade + Upgrade(UpgradePayload)

```rust
pub struct UpgradePayload {
    pub target_contract: Address,
    pub new_wasm_hash: BytesN<32>,
}
```

Signals intent to upgrade a contract. Execution records the proposal
on-chain but does not call `upgrade` directly — the target contract's
admin must call `upgrade` using the hash from this proposal. This keeps
upgrade authority with the admin while requiring governance approval.

### FundAllocation + Fund(FundPayload)

```rust
pub struct FundPayload {
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
}
```

Transfers tokens from the governance contract's treasury to `recipient`
when executed. The governance contract must hold sufficient balance of
`token` before `execute_proposal` is called.

### TextProposal + Text

No payload fields. Signal-only — records a community decision on-chain
with no execution. Useful for ratifying policies, naming decisions, etc.

---

## Voting Power

```
voting_power(voter) = token.balance(voter)
```

Voting power is the voter's token balance **at the time `cast_vote` is
called**, not at proposal creation. There is no snapshot mechanism —
token transfers between proposal creation and vote casting affect power.

A snapshot of the **total supply** is taken at proposal creation time
(provided by the proposer as `supply_snapshot`) and used only for quorum
calculation. The contract does not verify this value on-chain; it is
verifiable off-chain against ledger state.

---

## Quorum and Approval Threshold

### Quorum

```
quorum_required = total_supply_snapshot * quorum_bps / 10_000
quorum_met      = (votes_for + votes_against) >= quorum_required
```

Example: `total_supply = 1_000_000`, `quorum_bps = 400` (4%)
→ `quorum_required = 40_000` tokens must participate.

### Approval Threshold

```
threshold_required = (votes_for + votes_against) * approval_threshold_bps / 10_000
threshold_met      = votes_for >= threshold_required
```

Example: `total_votes = 100_000`, `approval_threshold_bps = 5_100` (51%)
→ `threshold_required = 51_000` FOR votes needed.

A proposal passes only if **both** quorum and threshold are met.

### Worked Example

- Total supply snapshot: 1,000,000 tokens
- `quorum_bps = 400` → need 40,000 tokens to participate
- `approval_threshold_bps = 5100` → need 51% of participating votes to be FOR
- Votes FOR: 30,000 | Votes AGAINST: 15,000 | Total: 45,000

Quorum check: 45,000 >= 40,000 ✓
Threshold check: 30,000 >= 45,000 * 51% = 22,950 ✓
→ **Proposal passes**

---

## ProposalStatus Transitions

| From | To | Trigger | Who |
|------|----|---------|-----|
| *(none)* | `Active` | `create_proposal` | Proposer (≥ threshold) |
| `Active` | `Queued` | `finalize_proposal` (quorum + threshold met) | Anyone |
| `Active` | `Defeated` | `finalize_proposal` (quorum or threshold not met) | Anyone |
| `Queued` | `Executed` | `execute_proposal` (after timelock) | Anyone |
| `Active` | `Cancelled` | `cancel_proposal` | Proposer or Admin |
| `Queued` | `Cancelled` | `cancel_proposal` | Proposer or Admin |
| `Defeated` | `Cancelled` | `cancel_proposal` | Proposer or Admin |

`Executed` is terminal — cannot be cancelled.

Note: The `Passed` variant exists in the type definition but the current
implementation transitions directly from `Active` to `Queued` on success.

---

## Contract Functions

### initialize

```rust
pub fn initialize(
    env: Env,
    admin: Address,
    token: Address,
    proposal_threshold: i128,
    voting_delay: u64,
    voting_period: u64,
    timelock_delay: u64,
    quorum_bps: u32,
    approval_threshold_bps: u32,
) -> Result<(), GovError>
```

One-time setup. `voting_period` must be > 0. `quorum_bps` and
`approval_threshold_bps` must be ≤ 10,000.

---

### create_proposal

```rust
pub fn create_proposal(
    env: Env,
    proposer: Address,
    title: String,
    description: String,
    proposal_type: ProposalType,
    payload: ProposalPayload,
    supply_snapshot: i128,
) -> Result<u64, GovError>
```

Returns the assigned `proposal_id`. Proposer must hold ≥
`proposal_threshold` tokens and must sign the transaction.

---

### cast_vote

```rust
pub fn cast_vote(
    env: Env,
    voter: Address,
    proposal_id: u64,
    support: bool,   // true = FOR, false = AGAINST
) -> Result<(), GovError>
```

Can only be called between `vote_start` and `vote_end`. Each address
votes exactly once. Voting power = current token balance.

---

### finalize_proposal

```rust
pub fn finalize_proposal(env: Env, proposal_id: u64) -> Result<ProposalStatus, GovError>
```

Callable by anyone after `vote_end`. Evaluates quorum and threshold.
Returns the new status (`Queued` or `Defeated`).

---

### execute_proposal

```rust
pub fn execute_proposal(env: Env, proposal_id: u64) -> Result<(), GovError>
```

Callable by anyone after `executable_at` (= `vote_end + timelock_delay`).
Executes the payload. For `FundAllocation`, transfers tokens. For others,
records execution on-chain.

---

### cancel_proposal

```rust
pub fn cancel_proposal(env: Env, caller: Address, proposal_id: u64) -> Result<(), GovError>
```

Proposer or admin only. Cannot cancel an `Executed` proposal.

---

### update_config

```rust
pub fn update_config(env: Env, caller: Address, new_config: GovConfig) -> Result<(), GovError>
```

Admin only. Updates all governance parameters atomically. Does not affect
in-flight proposals.

---

## CLI Examples

### Deploy and initialize

```bash
GOV_CONTRACT=$(soroban contract deploy \
  --source $ADMIN_SECRET \
  --network testnet \
  --wasm target/wasm32-unknown-unknown/release/stellar_trust_governance.wasm)

soroban contract invoke \
  --id $GOV_CONTRACT \
  --source $ADMIN_SECRET \
  --network testnet \
  -- initialize \
  --admin $ADMIN_ADDRESS \
  --token $GOV_TOKEN_ADDRESS \
  --proposal_threshold 1000000000 \
  --voting_delay 3600 \
  --voting_period 604800 \
  --timelock_delay 172800 \
  --quorum_bps 400 \
  --approval_threshold_bps 5100
```

### Create a TextProposal

```bash
SUPPLY=$(soroban contract invoke --id $GOV_TOKEN --network testnet -- total_supply)

soroban contract invoke \
  --id $GOV_CONTRACT \
  --source $PROPOSER_SECRET \
  --network testnet \
  -- create_proposal \
  --proposer $PROPOSER_ADDRESS \
  --title "Adopt community code of conduct" \
  --description "Ratify the code of conduct at ipfs://Qm..." \
  --proposal_type TextProposal \
  --payload '"Text"' \
  --supply_snapshot $SUPPLY
```

### Create a ParameterChange proposal

```bash
soroban contract invoke \
  --id $GOV_CONTRACT \
  --source $PROPOSER_SECRET \
  --network testnet \
  -- create_proposal \
  --proposer $PROPOSER_ADDRESS \
  --title "Reduce platform fee to 1%" \
  --description "Lower protocol fee from 1.5% to 1%" \
  --proposal_type ParameterChange \
  --payload '{"Parameter":{"key":"platform_fee_bps","value":100}}' \
  --supply_snapshot $SUPPLY
```

### Cast a vote

```bash
soroban contract invoke \
  --id $GOV_CONTRACT \
  --source $VOTER_SECRET \
  --network testnet \
  -- cast_vote \
  --voter $VOTER_ADDRESS \
  --proposal_id 0 \
  --support true
```

### Finalize after voting period

```bash
soroban contract invoke \
  --id $GOV_CONTRACT \
  --network testnet \
  -- finalize_proposal \
  --proposal_id 0
```

### Execute after timelock

```bash
soroban contract invoke \
  --id $GOV_CONTRACT \
  --network testnet \
  -- execute_proposal \
  --proposal_id 0
```

---

## Error Reference

| Code | Name | Meaning |
|------|------|---------|
| 1 | `AlreadyInitialized` | `initialize` called twice. |
| 2 | `NotInitialized` | Contract not initialized. |
| 3 | `Unauthorized` | `cancel_proposal` called by non-proposer, non-admin. |
| 4 | `AdminOnly` | `update_config` called by non-admin. |
| 5 | `ProposalNotFound` | No proposal with this ID. |
| 6 | `ProposalNotActive` | `cast_vote` or `finalize_proposal` on non-Active proposal. |
| 7 | `ProposalNotPassed` | `execute_proposal` on non-Queued proposal. |
| 8 | `ProposalAlreadyExecuted` | `cancel_proposal` on Executed proposal. |
| 10 | `TimelockNotElapsed` | `execute_proposal` called before `executable_at`. |
| 11 | `InvalidProposalType` | Payload type does not match `proposal_type`. |
| 13 | `AlreadyVoted` | Voter has already cast a vote on this proposal. |
| 14 | `VotingClosed` | `cast_vote` called after `vote_end`; or `finalize_proposal` called before `vote_end`. |
| 15 | `VotingNotStarted` | `cast_vote` called before `vote_start`. |
| 16 | `InsufficientVotingPower` | Proposer below threshold, or voter has zero balance. |
| 20 | `InvalidDuration` | `voting_period` is 0. |

---

## Recommended Testnet Configuration

| Parameter | Recommended value | Rationale |
|-----------|------------------|-----------|
| `voting_delay` | `3600` (1 hour) | Gives token holders time to prepare. |
| `voting_period` | `604800` (7 days) | Standard governance window. |
| `timelock_delay` | `172800` (2 days) | Time to react to malicious proposals. |
| `quorum_bps` | `400` (4%) | Low enough for early-stage participation. |
| `approval_threshold_bps` | `5100` (51%) | Simple majority. |
| `proposal_threshold` | 1% of total supply | Prevents spam while remaining accessible. |
