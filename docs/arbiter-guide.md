# Arbiter Role Guide

This guide explains the arbiter role in `stellar-trust-escrow`: how an
arbiter is selected, what they can and cannot do, the authorization
requirements for dispute resolution, and best practices for choosing a
trusted arbiter address.

Relevant source locations:

- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal`,
  `raise_dispute`, `resolve_dispute`
- `contracts/escrow_contract/src/types.rs` — `EscrowState.arbiter`,
  `EscrowStatus`
- `contracts/escrow_contract/src/errors.rs` — `EscrowError`

---

## Table of Contents

1. [What Is an Arbiter?](#what-is-an-arbiter)
2. [Assigning an Arbiter](#assigning-an-arbiter)
3. [Raising a Dispute](#raising-a-dispute)
4. [Resolving a Dispute](#resolving-a-dispute)
   - [Authorization](#authorization)
   - [Amount Constraint](#amount-constraint)
   - [State Prerequisite](#state-prerequisite)
5. [What the Arbiter Cannot Do](#what-the-arbiter-cannot-do)
6. [Error Reference](#error-reference)
7. [Best Practices](#best-practices)

---

## What Is an Arbiter?

An arbiter is an optional trusted third party whose Stellar address is
stored in `EscrowMeta.arbiter` at escrow creation time. When a dispute
is raised, the arbiter is the only address (besides the contract admin)
authorized to call `resolve_dispute` and distribute the frozen funds.

If no arbiter is set (`arbiter = None`), the contract admin acts as the
fallback resolver.

---

## Assigning an Arbiter

The arbiter is set during `create_escrow` via the `arbiter` parameter:

```rust
pub fn create_escrow(
    env: Env,
    client: Address,
    freelancer: Address,
    token: Address,
    total_amount: i128,
    brief_hash: BytesN<32>,
    arbiter: Option<Address>,   // <-- set here
    deadline: Option<u64>,
    lock_time: Option<u64>,
) -> Result<u64, EscrowError>
```

Pass `Some(arbiter_address)` to assign an arbiter, or `None` to leave
the admin as the fallback resolver.

**The arbiter address cannot be changed after escrow creation.** If you
need a different arbiter, the escrow must be cancelled and recreated.

CLI example with an arbiter:

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --source $CLIENT_SECRET \
  --network testnet \
  -- create_escrow \
  --client $CLIENT_ADDRESS \
  --freelancer $FREELANCER_ADDRESS \
  --token $TOKEN_ADDRESS \
  --total_amount 5000000000 \
  --brief_hash "$BRIEF_HASH" \
  --arbiter "$ARBITER_ADDRESS" \
  --deadline null \
  --lock_time null
```

---

## Raising a Dispute

Either the client or the freelancer can raise a dispute while the escrow
is `Active`:

```rust
pub fn raise_dispute(
    env: Env,
    caller: Address,          // must be client or freelancer
    escrow_id: u64,
    milestone_id: Option<u32>, // optional: mark a specific milestone as Disputed
) -> Result<(), EscrowError>
```

What happens:

1. `caller.require_auth()` — the caller must sign the transaction.
2. The contract verifies `caller == meta.client || caller == meta.freelancer`.
   Any other address receives `EscrowError::Unauthorized` (3).
3. `meta.status` must be `Active`. If it is already `Disputed`,
   `DisputeAlreadyExists` (23) is returned.
4. `meta.status` is set to `Disputed` and saved.
5. If `milestone_id` is provided and that milestone is `Pending` or
   `Submitted`, its status is also set to `Disputed`.
6. A `dis_rai` event is emitted.

Once the escrow is `Disputed`, no further milestone approvals, rejections,
or fund releases can occur until the dispute is resolved.

CLI example:

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --source $CLIENT_SECRET \
  --network testnet \
  -- raise_dispute \
  --caller $CLIENT_ADDRESS \
  --escrow_id 42 \
  --milestone_id 1
```

---

## Resolving a Dispute

```rust
pub fn resolve_dispute(
    env: Env,
    caller: Address,
    escrow_id: u64,
    client_amount: i128,
    freelancer_amount: i128,
) -> Result<(), EscrowError>
```

### Authorization

`caller` must be either:

- The arbiter stored in `EscrowMeta.arbiter`, **or**
- The contract admin (if no arbiter was set).

The function calls `caller.require_auth()` — the arbiter must sign the
transaction with their private key. Passing any other address returns
`EscrowError::ArbiterOnly` (7).

### Amount Constraint

```
client_amount + freelancer_amount == escrow.remaining_balance
```

The two amounts must sum exactly to `remaining_balance`. If they do not,
`EscrowError::AmountMismatch` (20) is returned. This ensures no funds
are lost or created during resolution.

Examples for an escrow with `remaining_balance = 3_000_000_000` (300 USDC):

| Scenario | `client_amount` | `freelancer_amount` |
|----------|-----------------|---------------------|
| Full refund to client | 3 000 000 000 | 0 |
| Full payment to freelancer | 0 | 3 000 000 000 |
| 50/50 split | 1 500 000 000 | 1 500 000 000 |
| 70% freelancer | 900 000 000 | 2 100 000 000 |

### State Prerequisite

`meta.status` must be `EscrowStatus::Disputed` before `resolve_dispute`
can be called. If the escrow is still `Active` or already `Completed`,
`EscrowError::EscrowNotDisputed` (10) is returned.

Typical flow:

```
raise_dispute(escrow_id)          → status = Disputed
        |
        v
[arbiter reviews evidence off-chain]
        |
        v
resolve_dispute(escrow_id, client_amount, freelancer_amount)
        |
        v
Funds transferred; status = Completed
dis_res event emitted
rep_upd events emitted for both parties
```

CLI example:

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --source $ARBITER_SECRET \
  --network testnet \
  -- resolve_dispute \
  --caller $ARBITER_ADDRESS \
  --escrow_id 42 \
  --client_amount 1000000000 \
  --freelancer_amount 2000000000
```

---

## What the Arbiter Cannot Do

The arbiter's authority is intentionally narrow. The following actions
are **not** available to the arbiter:

| Action | Who can do it |
|--------|--------------|
| Approve a milestone | Client only |
| Reject a milestone | Client only |
| Submit a milestone | Freelancer only |
| Cancel an escrow | Client only (via `cancel_escrow`) |
| Add a milestone | Client only |
| Upgrade the contract | Admin only |
| Change the arbiter address | Nobody — immutable after creation |
| Raise a dispute | Client or freelancer only |
| Resolve a dispute on a non-disputed escrow | Nobody — `EscrowNotDisputed` (10) |

The arbiter cannot unilaterally move funds unless a dispute has been
raised first. They also cannot resolve a dispute with amounts that do
not sum to `remaining_balance`.

---

## Error Reference

| Code | Name | When it occurs |
|------|------|----------------|
| 3 | `Unauthorized` | `raise_dispute` called by an address that is neither client nor freelancer. |
| 7 | `ArbiterOnly` | `resolve_dispute` called by an address that is neither the arbiter nor the admin. |
| 9 | `EscrowNotActive` | `raise_dispute` called on an escrow that is not `Active`. |
| 10 | `EscrowNotDisputed` | `resolve_dispute` called on an escrow that is not `Disputed`. |
| 20 | `AmountMismatch` | `client_amount + freelancer_amount != remaining_balance`. |
| 23 | `DisputeAlreadyExists` | `raise_dispute` called on an escrow already in `Disputed` state. |

---

## Best Practices

**Choose a neutral, independent arbiter.** The arbiter should have no
financial stake in the outcome. Good candidates include:

- A mutually agreed-upon escrow service provider.
- A DAO multisig controlled by community members.
- A professional dispute resolution service with a published Stellar address.

**Use a multisig arbiter for high-value escrows.** Stellar supports
multisig accounts. Setting the arbiter to a 2-of-3 multisig address
means no single party can unilaterally resolve the dispute.

**Document the arbiter's process off-chain.** The contract does not
enforce how the arbiter reaches their decision. Include the arbiter's
dispute resolution process in the project brief (stored as `brief_hash`).

**Verify the arbiter address before creating the escrow.** Once set,
the arbiter address cannot be changed. Double-check the address is
correct and that the arbiter has agreed to serve in this role.

**If no arbiter is set, the admin resolves disputes.** For production
escrows, always set an explicit arbiter. Relying on the contract admin
as the fallback resolver introduces centralization risk.
