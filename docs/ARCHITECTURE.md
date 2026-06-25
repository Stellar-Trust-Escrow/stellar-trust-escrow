# Architecture

This document describes how the system's components interact, what each one owns, and where the boundaries between them lie. It is the reference for anyone making cross-cutting changes.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Reference](#component-reference)
   - [Next.js Frontend](#nextjs-frontend)
   - [Node.js Backend (Express)](#nodejs-backend-express)
   - [Soroban Smart Contracts (Rust)](#soroban-smart-contracts-rust)
   - [PostgreSQL (via Prisma)](#postgresql-via-prisma)
   - [Redis](#redis)
   - [Stellar Network / Soroban RPC](#stellar-network--soroban-rpc)
   - [IPFS / Pinata](#ipfs--pinata)
3. [Data Flow: Escrow Lifecycle](#data-flow-escrow-lifecycle)
   - [1. Escrow Creation](#1-escrow-creation)
   - [2. Milestone Submission](#2-milestone-submission)
   - [3. Milestone Approval and Fund Release](#3-milestone-approval-and-fund-release)
   - [4. Dispute Path](#4-dispute-path)
4. [Event Indexing Pipeline](#event-indexing-pipeline)
5. [External Dependencies](#external-dependencies)
6. [Component Interaction Map](#component-interaction-map)
7. [Key Boundaries and Rules](#key-boundaries-and-rules)

---

## System Overview

The platform is split across four layers: browser clients (web + mobile), a REST/WebSocket API, a PostgreSQL-backed data store, and a Soroban smart contract on the Stellar blockchain. Funds never touch the API layer — they are locked and released exclusively by the contract. The backend's job is to index on-chain events, serve off-chain metadata, and handle non-fund concerns: authentication, evidence storage, reputation caching, webhooks, and search.

```
┌─────────────────────────────────────────────────────────────────┐
│  Client Layer                                                   │
│  Next.js 14 (web)                Expo / React Native (mobile)  │
│  Freighter wallet signing        Biometric auth + SQLite cache │
└────────────────┬────────────────────────────┬───────────────────┘
                 │ HTTPS + JWT                │ HTTPS + JWT
                 │ WebSocket (escrow / chat)  │
┌────────────────▼────────────────────────────▼───────────────────┐
│  API Layer  — Express.js, Node 18+                             │
│                                                                 │
│  Auth · Escrow · Dispute · Reputation · Search · Webhooks      │
│  Admin · Compliance · KYC · Payments · Notifications           │
│  Audit log · Tenant scoping · Rate limiting · MFA              │
│                                                                 │
│  Workers: EscrowIndexer (ledger sync) · BullMQ queues          │
│  WebSocket pool (real-time escrow + dispute chat)              │
└──────┬────────────────────────────────────────┬─────────────────┘
       │                                        │
┌──────▼───────────┐             ┌──────────────▼──────────────────┐
│  Data Layer      │             │  Blockchain Layer               │
│                  │             │                                 │
│  PostgreSQL      │             │  Soroban RPC  ←→  EscrowContract│
│  (Prisma ORM)    │             │               ←→  GovernanceContract│
│                  │             │               ←→  InsuranceContract│
│  Redis           │             │               ←→  EscrowExtensions│
│  (cache, queues, │             │                                 │
│   Redlock)       │             │  Stellar Horizon (tx broadcast) │
│                  │             │                                 │
│  IPFS / Pinata   │             │  Oracle (price feeds)          │
│  (evidence files)│             │                                 │
└──────────────────┘             └─────────────────────────────────┘
```

---

## Component Reference

### Next.js Frontend

**Location:** `frontend/`

**Purpose:** Browser-based dashboard for clients, contractors, and arbiters to interact with escrows.

**What it does:**
- Displays escrow lists, milestone status, dispute history, and reputation scores by querying the backend REST API.
- For write operations (create escrow, approve milestone, raise dispute), it constructs a Stellar transaction, uses the Freighter browser extension for signing, and then submits the signed XDR to the backend's broadcast endpoint (`POST /api/escrows/broadcast`). The signed transaction goes to the Soroban RPC directly from there — the frontend never holds funds or private keys on the server.
- Real-time updates arrive over a WebSocket connection to the backend.

**Key files:**
- `frontend/lib/stellar.js` — Soroban RPC transaction simulation and construction helpers.
- `frontend/lib/api/client.js` — Axios HTTP client with JWT auth and retry logic.
- `frontend/lib/chatCrypto.js` — Client-side AES-256-GCM encryption for dispute chat messages.

**External calls:** Backend API only. Does not call Soroban RPC or IPFS directly.

---

### Node.js Backend (Express)

**Location:** `backend/`

**Purpose:** The API gateway and coordination layer. Handles everything that is off-chain: authentication, caching, search, webhooks, compliance, and serving indexed blockchain data.

**What it does:**
- Exposes REST endpoints for all client operations.
- Runs the `EscrowIndexer` worker (`backend/workers/escrowIndexer.js`), which polls the Soroban RPC for new contract events, then writes them to PostgreSQL. This keeps the DB in sync without the clients needing to query the chain directly.
- Relays signed transaction XDRs from the frontend to the Soroban RPC via `StellarClient` (`backend/services/stellarClient.js`), which adds failover across multiple RPC endpoints.
- Manages evidence files: encrypts them (AES-256-GCM) and uploads to IPFS via Pinata before storing the CID in PostgreSQL.
- Delivers webhooks via BullMQ queues with exponential backoff.
- Enforces tenant isolation on every database query via `tenantId`.

**Key subsystems:**

| Subsystem | Location | Role |
|---|---|---|
| Auth (JWT + MFA) | `api/routes/authRoutes.js`, `services/mfaService.js` | Issue and verify access/refresh tokens; TOTP and WebAuthn second factor |
| Escrow indexer | `workers/escrowIndexer.js` | Ledger-by-ledger event sync from Soroban RPC to PostgreSQL |
| Stellar client | `services/stellarClient.js` | Soroban RPC wrapper with primary + backup endpoint failover |
| IPFS service | `services/ipfsService.js` | AES-256-GCM encryption, Pinata upload, decryption-key store |
| Search | `services/searchService.js` | Elasticsearch with `ILIKE` Prisma fallback |
| Webhooks | `queues/webhookQueue.js`, `services/webhookService.js` | Delivery with HMAC-SHA256 signing and retry |
| WebSocket | `api/websocket/handlers.js`, `api/sockets/chatSocket.js` | Real-time escrow events and end-to-end encrypted dispute chat |
| Compliance | `services/complianceService.js` | Scheduled audit reports (JSON / CSV / PDF) |

---

### Soroban Smart Contracts (Rust)

**Location:** `contracts/`

**Purpose:** The on-chain source of truth. Funds are held and released exclusively here. No backend code can move funds.

**Contracts:**

| Contract | Location | Purpose |
|---|---|---|
| `EscrowContract` | `contracts/escrow_contract/` | Core escrow state machine: fund locking, milestone approvals, disputes, reputation, cancellations, recurring payments, rent model, oracle price conditions |
| `GovernanceContract` | `contracts/governance/` | Token-weighted governance (proposals, voting), ve-token locking, arbitrator staking and panel selection |
| `InsuranceContract` | `contracts/insurance_contract/` | Community insurance pool: contributions, claim submission, governor voting, yield distribution, slash proposals |
| `EscrowExtensions` | `contracts/escrow_extensions/` | Optional add-ons: batch escrow creation, fee distribution, multi-vote dispute resolution, upgrade timelock |

**EscrowContract state machine:**

```
Active
  ├─→ (all milestones approved)  → Completed
  ├─→ (raise_dispute)            → Disputed
  │       └─→ (resolve_dispute / oracle_resolve / claim_dispute_timeout) → Completed
  ├─→ (request_cancellation + mutual consent / execute_cancellation)     → Cancelled
  └─→ (rent expired)             → expired (cleaned up)
```

**Milestone status flags** (bitfield `u32` in `types.rs`):

```
MS_PENDING   = 0x01
MS_SUBMITTED = 0x02
MS_APPROVED  = 0x04
MS_RELEASED  = 0x08
MS_REJECTED  = 0x10
MS_DISPUTED  = 0x20
```

**Storage model:** Escrow state and milestones are stored in Soroban persistent storage. A rent model (`RENT_PER_ENTRY_PER_PERIOD`) charges per active storage entry per day to fund contract TTL extension. Escrows that exhaust their rent reserve expire and are cleaned up by `collect_rent`.

**Access control summary:**

| Function | Who can call |
|---|---|
| `create_escrow` | Anyone |
| `submit_milestone` | Freelancer only |
| `approve_milestone` / `reject_milestone` | Client only (or multisig threshold) |
| `raise_dispute` | Client or freelancer |
| `resolve_dispute` | Arbiter only |
| `oracle_resolve_dispute` | Trusted oracle key |
| `escalate_dispute_to_governance` | Either party after grace period |
| `cancel_escrow` | Both parties (mutual) |
| `pause` / `unpause` | Admin only |
| `upgrade` | Admin only |

---

### PostgreSQL (via Prisma)

**Location:** `backend/database/schema.prisma`, `backend/database/migrations/`

**Purpose:** Indexed mirror of on-chain state plus all off-chain data (user accounts, evidence, webhooks, audit logs, chat messages).

**Core tables and what owns them:**

| Table | Populated by | Purpose |
|---|---|---|
| `escrows` | `EscrowIndexer` | Mirror of on-chain escrow state |
| `milestones` | `EscrowIndexer` | Per-milestone status and metadata |
| `contract_events` | `EscrowIndexer` | Raw event log, deduplicated by `(txHash, eventIndex)` |
| `indexer_state` | `EscrowIndexer` | Last processed ledger for crash recovery |
| `reputation_records` | `EscrowIndexer` | Aggregated reputation per address |
| `reputation_events` | `EscrowIndexer` | Append-only delta log for rebuilding aggregates |
| `disputes` | `EscrowIndexer` | Dispute status and resolution details |
| `dispute_evidence` | Dispute controller | IPFS CIDs, file hashes, Merkle roots |
| `users` | Auth controller | Email/password accounts with wallet address linkage |
| `mfa_methods` / `mfa_attempts` | MFA service | TOTP and WebAuthn credentials |
| `webhook_subscriptions` / `webhook_deliveries` | Webhook service | Delivery history and retry state |
| `audit_logs` | Audit middleware | Append-only event trail |
| `admin_audit_logs` | Admin controller | Admin-action accountability |
| `chat_room_keys` / `chat_messages` | Chat socket | Encrypted dispute chat |
| `tenants` | Admin | Multi-tenant configuration |

**The PostgreSQL layer is a read cache, not the source of truth.** If the DB is lost, all escrow and reputation state can be re-derived by replaying the contract event log from genesis. Evidence files are durable on IPFS.

---

### Redis

**Location:** `backend/lib/cache.js`, used throughout services

**Purpose:** Three distinct uses with different data lifetimes.

| Use | TTL | Details |
|---|---|---|
| HTTP response cache | Seconds to minutes | Tenant-scoped cache keyed by route + params. Invalidated on escrow status change. Falls back to in-memory if Redis is unavailable. |
| Rate limiting | Sliding window | Per-user sliding-window counters using atomic Redis operations (avoids the race condition that naive in-process counters have). |
| Distributed lock (Redlock) | 30 s TTL | Prevents two `EscrowIndexer` instances from processing the same ledger batch. Lock key: `indexer:ledger:<from>-<to>`. Crashed nodes release automatically via TTL. |
| BullMQ job queues | Until processed | Webhook delivery, email dispatch, and on-chain event processing jobs. |

Redis is optional: the API starts with an in-memory fallback when `REDIS_URL` is unset. Rate limits and Redlock require Redis; in-memory mode is only suitable for single-instance development.

---

### Stellar Network / Soroban RPC

**Purpose:** The execution environment for smart contracts.

**How the backend uses it:**

1. **Transaction submission** — The frontend builds and signs a Stellar XDR transaction. The backend receives it at `POST /api/escrows/broadcast` and forwards it to the Soroban RPC via `StellarClient.submitTransaction()`. The client polls `getTransaction(hash)` until the transaction is `SUCCESS` or `FAILED`.

2. **Event polling** — `EscrowIndexer` calls `getEvents({ startLedger, filters: [{ contractIds: [CONTRACT_ID] }] })` in batches of `INDEXER_BATCH_SIZE` ledgers. The last processed ledger is checkpointed to `indexer_state` so the indexer can resume after restarts.

3. **Failover** — `StellarClient` maintains a list of RPC endpoints (`HORIZON_ENDPOINTS`). It retries failed requests across endpoints in order. After 3 consecutive failures an endpoint is deprioritized for `NODE_RECOVERY_WINDOW_MS` (default 5 min) before being retried.

**What Stellar Horizon provides vs. Soroban RPC:**

| Operation | Interface |
|---|---|
| Submit signed transaction | Soroban RPC (`sendTransaction`) |
| Poll transaction status | Soroban RPC (`getTransaction`) |
| Read contract events | Soroban RPC (`getEvents`) |
| Read latest ledger | Soroban RPC (`getLatestLedger`) |
| Account balances, payments | Stellar Horizon REST API |

---

### IPFS / Pinata

**Purpose:** Durable, content-addressed storage for dispute evidence files and escrow brief hashes.

**How it works:**

1. A party uploads a file via `POST /api/disputes/:escrowId/evidence`.
2. The backend encrypts the buffer with AES-256-GCM (unique key per file) before sending it to Pinata's pinning API.
3. The returned CID and the decryption key (encrypted per-party) are stored in `dispute_evidence`.
4. When a party fetches evidence, the backend checks their role against the stored `authorisedAddresses` list before returning the decryption key. Decryption happens client-side.
5. File integrity is verified via a stored SHA-256 hash of the plaintext content.

File constraints (configurable via env):
- Max size: 10 MB (`MAX_FILE_SIZE`)
- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, `text/plain`, `video/mp4`

The `briefHash` field on an escrow references an IPFS CID for the project brief. This CID is stored on-chain as part of `create_escrow` so the brief is immutably linked to the contract.

---

## Data Flow: Escrow Lifecycle

### 1. Escrow Creation

```
Client browser
  │
  ├─ 1a. Build transaction: create_escrow(freelancer, token, amount, milestones[])
  ├─ 1b. simulateTransaction() → get fee + auth entries  [Soroban RPC]
  ├─ 1c. Sign with Freighter wallet
  │
  └─ POST /api/escrows/broadcast  {signedXdr}
        │
        Backend
          ├─ Validate XDR, check tenant, apply rate limit
          ├─ StellarClient.submitTransaction(signedXdr)  →  Soroban RPC
          │     └─ Poll getTransaction(hash) until settled
          └─ Return { hash, status }

  ──────  async, seconds later  ──────

  EscrowIndexer (background worker)
    ├─ Polls getEvents() from Soroban RPC
    ├─ Receives event: esc_crt { escrow_id, client, freelancer, amount, ... }
    ├─ Writes row to `escrows` table
    ├─ Writes rows to `milestones` table
    ├─ Writes row to `contract_events` table
    ├─ Advances indexer_state.last_processed_ledger
    └─ Triggers webhook delivery for subscribers to escrow.created
```

---

### 2. Milestone Submission

```
Contractor browser
  │
  ├─ 2a. Upload deliverable files
  │       POST /api/disputes/:id/evidence  (or a dedicated endpoint)
  │       Backend: encrypt → Pinata → store CID in dispute_evidence
  │
  ├─ 2b. Build transaction: submit_milestone(escrow_id, milestone_index, ipfs_hash)
  ├─ 2c. Sign with Freighter
  └─ POST /api/escrows/broadcast  {signedXdr}
        │
        Soroban RPC executes: sets milestone status → MS_SUBMITTED, stores IPFS hash on-chain
        Contract emits: mil_sub event

  EscrowIndexer: receives mil_sub → updates milestone.status = Submitted in PostgreSQL
```

---

### 3. Milestone Approval and Fund Release

```
Client browser
  │
  ├─ Build transaction: approve_milestone(escrow_id, milestone_index)
  │   (or batch_approve_milestones for multiple)
  ├─ Sign with Freighter
  └─ POST /api/escrows/broadcast  {signedXdr}
        │
        Soroban RPC executes:
          ├─ Transfers milestone.amount tokens to freelancer address
          ├─ Sets milestone status → MS_APPROVED | MS_RELEASED
          ├─ Emits: mil_apr { escrow_id, milestone_id, amount }
          ├─ Emits: funds_rel { escrow_id, to, amount }
          └─ If last milestone: emits esc_done, writes ReputationEvent for both parties

  EscrowIndexer:
    ├─ mil_apr → update milestone.status, set resolvedAt
    ├─ funds_rel → update escrow.remaining_balance
    ├─ esc_done → update escrow.status = Completed
    └─ rep_upd → upsert reputation_records, append reputation_events row
```

---

### 4. Dispute Path

```
Either party
  │
  ├─ Build transaction: raise_dispute(escrow_id, reason)
  └─ POST /api/escrows/broadcast
        │
        Contract: transitions escrow → Disputed, emits dis_rai

  Either party uploads evidence:
    POST /api/disputes/:escrowId/evidence
      └─ Backend: AES-256-GCM encrypt → Pinata → store {cid, fileHash, merkleRoot}

  ── Resolution paths ──────────────────────────────────────────────

  Path A — Arbiter resolves manually:
    resolve_dispute(escrow_id, client_amt, freelancer_amt)
      └─ Contract splits funds, emits dis_res + rep_upd for both parties

  Path B — Oracle resolves (price condition met):
    oracle_resolve_dispute(escrow_id, payload, signature)
      └─ Contract verifies Ed25519 signature against trusted oracle key
      └─ Releases funds per payload, emits dis_res

  Path C — Governance escalation (after grace period):
    escalate_dispute_to_governance(escrow_id)
      └─ GovernanceContract.select_dispute_panel() → assigns 3-arbitrator panel
      └─ Panel votes → majority outcome executed on EscrowContract

  Path D — Timeout claim (arbiter inactive):
    claim_dispute_timeout(escrow_id)
      └─ Contract refunds client if no resolution within timeout window

  EscrowIndexer (all paths):
    ├─ dis_res → update dispute.resolvedAt, clientAmount, freelancerAmount, resolvedBy
    ├─ rep_upd → upsert reputation_records
    └─ Trigger webhooks for dispute.resolved
```

---

## Event Indexing Pipeline

The backend never queries the chain for escrow state on-demand. All on-chain data is pushed into PostgreSQL by a background indexer, and the API reads from there.

```
Soroban RPC
  │
  │  getEvents(startLedger, contractId)
  │
  ▼
EscrowIndexer  (backend/workers/escrowIndexer.js)
  │
  ├─ Acquire Redlock lease on ledger range (prevents duplicate processing in multi-node deployments)
  ├─ Fetch events in BATCH_SIZE ledger chunks
  ├─ For each event, dispatch to typed handler:
  │     handleEscrowCreated → INSERT escrow
  │     handleMilestoneAdded / Submitted / Approved → UPDATE milestone
  │     handleFundsReleased → UPDATE escrow.remaining_balance
  │     handleDisputeRaised / Resolved → INSERT/UPDATE dispute
  │     handleEscrowCancelled / Completed → UPDATE escrow.status
  │     handleReputationUpdated → UPSERT reputation_records
  ├─ All DB writes happen in a transaction; cursor only advances on commit
  ├─ Release Redlock lease
  │
  └─ Wait POLL_INTERVAL_MS (default 5 s), repeat
```

Crash recovery: on restart, `indexer_state.last_processed_ledger` is read from PostgreSQL and indexing resumes from that ledger. No events are skipped and none are double-processed (the `UNIQUE` constraint on `contract_events(txHash, eventIndex)` prevents duplicates on replay).

---

## External Dependencies

| Dependency | Used by | Purpose | Failure mode |
|---|---|---|---|
| Soroban RPC (testnet / mainnet) | Backend `StellarClient`, `EscrowIndexer` | Transaction submission, event polling, ledger queries | Failover across `HORIZON_ENDPOINTS`; indexer backs off with exponential delay |
| Stellar Horizon | `StellarClient` (SDK) | Account balance and payment queries | Failover; non-critical for escrow lifecycle |
| Pinata / IPFS | `ipfsService` | Encrypted evidence file storage | Upload returns error; file is not persisted; evidence submission fails cleanly |
| Elasticsearch | `searchService` | Full-text escrow search | Falls back to Prisma `ILIKE` queries automatically |
| Redis | Cache, rate limiter, BullMQ, Redlock | See [Redis section](#redis) | Falls back to in-memory for cache and rate limits; webhook queue pauses until Redis recovers |
| SMTP / email provider | `emailService` via BullMQ | Transactional notifications | Jobs retry with backoff; failures go to dead-letter queue |
| Stripe | Payment service | Fiat-to-crypto payment flow | Payment endpoint returns error; escrow is not created |
| Sumsub | KYC service | Identity verification webhook callbacks | KYC status remains `Pending`; manual review required |
| Oracle (price feed) | `EscrowContract` | Price-indexed milestone conditions | Falls back to `fallback_oracle`; if neither responds, price-conditional release does not execute |
| Sentry | Frontend + Backend | Error tracking | Non-fatal; errors are logged locally if Sentry is unreachable |

---

## Component Interaction Map

Who may call what:

```
Frontend        → Backend REST API     (HTTPS + JWT)
Frontend        → Backend WebSocket    (JWT upgrade)
Frontend        → [never] Soroban RPC  (transaction construction only, no direct calls)
Frontend        → [never] PostgreSQL

Backend API     → PostgreSQL           (Prisma ORM, always tenant-scoped)
Backend API     → Redis                (cache, rate limits, queues)
Backend API     → StellarClient        (submit signed XDR, health checks)
Backend API     → IPFS / Pinata        (evidence upload)
Backend API     → Elasticsearch        (search queries)
Backend API     → Stripe / Sumsub      (payment and KYC webhooks)

EscrowIndexer   → Soroban RPC          (getEvents, getLatestLedger)
EscrowIndexer   → PostgreSQL           (write indexed state)
EscrowIndexer   → Redis                (Redlock distributed lock)

StellarClient   → Soroban RPC          (sendTransaction, getTransaction, getEvents)

EscrowContract  → Token contract       (SAC transfer calls on fund release)
EscrowContract  → Oracle contract      (get_price for price-indexed milestones)
EscrowContract  → GovernanceContract   (escalate_dispute_to_governance)
GovernanceContract → EscrowContract    (resolve dispute after panel vote)
```

---

## Key Boundaries and Rules

**Funds move only through the contract.** No backend code calls token transfers or holds private keys. The backend relays pre-signed XDRs.

**PostgreSQL mirrors the chain; it does not lead it.** Never use the DB as the source of truth for fund balances or escrow status. Always trust the contract state for anything financial.

**Tenant isolation is enforced at every DB query.** Every Prisma query that touches `escrows`, `milestones`, `disputes`, `reputation_records`, etc. must include a `tenantId` where clause. The middleware (`api/middleware/tenant.js`) injects `req.tenantId` from the JWT claim.

**Evidence files are encrypted before leaving the server.** The plaintext never reaches Pinata. Decryption keys are stored in-process and gated by role check. In production, the key store should be moved to a secrets manager (Vault, AWS Secrets Manager).

**The indexer is the only writer for chain-derived tables.** Controllers must not write to `escrows`, `milestones`, `contract_events`, `reputation_records`, or `reputation_events` directly. These tables are owned by the indexer to prevent inconsistency with on-chain state.

**WebSocket connections are authenticated.** The upgrade request is verified against the JWT before a connection is accepted (`assertWebSocketUpgradeAllowed`). Dispute chat namespaces additionally check that the connecting address is a party to that dispute.

**Contract upgrades require admin auth and respect a timelock** (via `EscrowExtensions.queue_upgrade` → `execute_upgrade` after `UPGRADE_DELAY_SECONDS`). Emergency pause is available at any time via `pause(admin)` and blocks all state-mutating contract functions.
