# Dispute Resolution Guide

This guide is for developers, integrators, and operators who need a clear,
accurate reference for the dispute lifecycle in `stellar-trust-escrow`.
It explains on-chain contract behavior, backend dispute support, and the
cross-system workflow for raising, reviewing, and resolving a dispute.

## Why this matters

Dispute resolution is a core safety and trust mechanism in a trustless
milestone escrow system. In this project, disputes:

- freeze funds on-chain until a resolution path is chosen
- preserve state and evidence in a verifiable audit trail
- connect to reputation changes that follow parties across engagements
- prevent unilateral fund movement once a dispute is active

## Dispute lifecycle

The high-level flow is:

1. `create_escrow` → `Active`
2. `raise_dispute` → `Disputed`
3. one of:
   - `resolve_dispute` → `Completed`
   - `claim_dispute_timeout` → `Completed`
   - `escalate_dispute_to_governance` → governance proposal

Once an escrow enters `Disputed`, no further milestone approvals,
rejections, or fund releases may happen until the dispute is resolved.

### Lifecycle diagram

```text
Client or Freelancer
    │
    │ raise_dispute
    ▼
+-----------------+
|   Disputed      |───┐
+-----------------+   │
    │                │
    │ resolve_dispute│
    │                ▼
    │            +-----------+
    │            | Completed |
    │            +-----------+
    │
    │ claim_dispute_timeout
    │
    ▼
+-----------------+
|  Timeout claim   |
+-----------------+
    │
    ▼
+-----------+
| Completed |
+-----------+
```

## Roles and permissions

### Client / Freelancer

- may call `raise_dispute`
- may submit evidence through the backend
- may call `claim_dispute_timeout` after a configured dispute timeout
- may call `escalate_dispute_to_governance` when the escrow is eligible

### Arbiter

- may call `resolve_dispute`
- must be the arbiter address stored in `EscrowMeta.arbiter`
- is the preferred resolver when an arbiter is assigned

### Admin

- may call `resolve_dispute` when no arbiter is set
- is a fallback resolver for disputed escrows without an arbiter

## On-chain contract operations

### `raise_dispute`

```rust
pub fn raise_dispute(
    env: Env,
    caller: Address,
    escrow_id: u64,
    milestone_id: Option<u32>,
) -> Result<(), EscrowError>
```

What it does:

- requires `caller.require_auth()`
- verifies the contract is not paused or frozen
- loads escrow metadata with rent
- verifies the caller is `meta.client` or `meta.freelancer`
- verifies the escrow status is `Active`
- updates `meta.status = EscrowStatus::Disputed`
- sets `dispute_started_ledger` and `dispute_start_ledger`
- moves the escrow index from `Active` to `Disputed`
- optionally marks a milestone `Pending` or `Submitted` as `Disputed`

When a `milestone_id` is provided and the milestone is in `Pending` or
`Submitted`, the milestone transitions to `Disputed` and its
`resolved_at` is set.

#### Example

```bash
soroban contract invoke \
  --id "$ESCROW_CONTRACT" \
  --source "$CLIENT_SECRET" \
  --network testnet \
  -- raise_dispute \
  --caller "$CLIENT_ADDRESS" \
  --escrow_id 42 \
  --milestone_id 1
```

### `resolve_dispute`

```rust
pub fn resolve_dispute(
    env: Env,
    caller: Address,
    escrow_id: u64,
    client_amount: i128,
    freelancer_amount: i128,
) -> Result<(), EscrowError>
```

What it does:

- requires `caller.require_auth()`
- verifies the contract is not paused or frozen
- loads escrow metadata with rent inside a reentrancy guard
- checks that `caller` is either:
  - the arbiter stored in `meta.arbiter`, or
  - the admin when no arbiter exists
- checks `meta.status == EscrowStatus::Disputed`
- verifies `client_amount + freelancer_amount == meta.remaining_balance`
- settles fees and transfers token amounts to client and freelancer
- sets `meta.remaining_balance = 0`
- sets `meta.status = EscrowStatus::Completed`
- clears `dispute_started_ledger`
- emits a dispute resolution event
- updates reputation for both parties

#### Example

```bash
soroban contract invoke \
  --id "$ESCROW_CONTRACT" \
  --source "$ARBITER_SECRET" \
  --network testnet \
  -- resolve_dispute \
  --caller "$ARBITER_ADDRESS" \
  --escrow_id 42 \
  --client_amount 1000000000 \
  --freelancer_amount 2000000000
```

### `claim_dispute_timeout`

```rust
pub fn claim_dispute_timeout(
    env: Env,
    caller: Address,
    escrow_id: u64,
) -> Result<(), EscrowError>
```

What it does:

- requires `caller.require_auth()`
- verifies the contract is not paused or frozen
- checks that `caller` is the client or freelancer
- verifies the escrow is still in `Disputed` status
- verifies the dispute timeout ledger has elapsed
- splits `meta.remaining_balance` 50/50 between client and freelancer
- marks the escrow `Completed`
- emits a dispute timeout event

This is a safety mechanism for cases where an arbiter does not resolve
the dispute in time.

### `escalate_dispute_to_governance`

```rust
pub fn escalate_dispute_to_governance(
    env: Env,
    caller: Address,
    escrow_id: u64,
) -> Result<u64, EscrowError>
```

What it does:

- requires `caller.require_auth()`
- verifies the contract is not paused
- checks that `caller` is the client or freelancer
- verifies `meta.status == EscrowStatus::Disputed`
- verifies the escrow meets the high-value threshold
- creates a governance proposal for community resolution

This path is intended for high-value disputes that should be decided by
DAO governance rather than a single arbiter.

## Backend dispute support

The backend provides dispute discovery, evidence management, and
automated recommendation support.
All dispute endpoints require authenticated access.

### Supported dispute routes

- `GET /api/disputes`
  - list disputes with filtering by `status`, `raisedBy`, `dateFrom`, `dateTo`, `sortBy`, and `sortOrder`
- `GET /api/disputes/:escrowId`
  - fetch dispute details, escrow metadata, evidence records, and appeals
- `POST /api/disputes/:id/evidence`
  - upload files or text evidence
  - evidence is stored on IPFS and returned with `fileUrl`/`thumbnailUrl`
- `GET /api/disputes/:id/evidence`
  - list evidence items for a dispute
- `POST /api/disputes/:id/resolve/auto`
  - request automated resolution via backend business rules
- `GET /api/disputes/:id/resolve/recommendation`
  - fetch the backend’s resolution recommendation
- `POST /api/disputes/:id/appeals`
  - open an appeal against a dispute decision
- `PATCH /api/disputes/appeals/:appealId`
  - update appeal status or metadata

### Evidence workflow

Evidence files are uploaded through the dispute backend and stored on
IPFS with virus scanning and thumbnail generation. A dispute may include:

- screenshots
- contract briefs or milestone descriptions
- timestamped deliverables
- chat logs or acceptance confirmations
- text summaries of the issue

The backend returns evidence URLs for safe viewing in the UI.

#### Example upload

```bash
curl -X POST "https://localhost:4000/api/disputes/42/evidence" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@dispute-screenshot.png" \
  -F "description=Client rejected milestone without explanation"
```

## Common contract error codes

| Code | Name                                       | Meaning                                                         |
| ---- | ------------------------------------------ | --------------------------------------------------------------- |
| 3    | `Unauthorized`                             | Caller is not the client, freelancer, or arbiter where required |
| 9    | `EscrowNotActive` / `DisputeAlreadyExists` | `raise_dispute` on a non-active or already disputed escrow      |
| 10   | `EscrowNotDisputed`                        | `resolve_dispute` called when escrow is not disputed            |
| 20   | `AmountMismatch`                           | `client_amount + freelancer_amount != remaining_balance`        |
| 23   | `DisputeTimeoutNotReached`                 | `claim_dispute_timeout` called before the timeout elapsed       |
| 19   | `InvalidEscrowAmount` / `Threshold`        | `escalate_dispute_to_governance` on a low-value escrow          |

## Best practices

- Choose an arbiter before escrow creation when possible.
- Store evidence off-chain on IPFS and reference hashes in the contract or
  backend for auditability.
- Use `milestone_id` with `raise_dispute` when a dispute is tied to a
  specific milestone.
- Monitor `Disputed` escrows and trigger `claim_dispute_timeout` if the
  arbiter does not resolve the dispute before the deadline.
- Prefer `resolve_dispute` over `claim_dispute_timeout` for a fair outcome.

## See also

- [`docs/arbiter-guide.md`](./arbiter-guide.md) — arbiter authorization and
  dispute resolution responsibilities
- [`docs/milestone-state-machine.md`](./milestone-state-machine.md) — how
  disputes interact with milestone state transitions
- [`docs/reputation-scoring.md`](./reputation-scoring.md) — how dispute
  outcomes affect on-chain reputation
