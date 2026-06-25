# Stellar Crowd Fund Escrow .....

**Trustless crowd-funded work agreements on the Stellar blockchain.**

A platform where communities pool funds, contractors deliver work in verifiable milestones, and every outcome — completion or dispute — builds a tamper-proof on-chain reputation that follows both parties forever.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built on Stellar](https://img.shields.io/badge/Built%20on-Stellar-7B2FBE?logo=stellar)](https://stellar.org)
[![Soroban Contracts](https://img.shields.io/badge/Smart%20Contracts-Soroban%20%2F%20Rust-orange)](https://soroban.stellar.org)
[![Backend Tests](https://img.shields.io/badge/backend%20tests-425%20passing-brightgreen)](#testing)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-blue)](CONTRIBUTING.md)

---

## The Problem This Solves

Traditional freelance platforms hold funds in centralised escrow accounts — meaning you trust a company, not a contract. If the platform shuts down, gets hacked, or makes a unilateral decision, your money can be frozen or lost. Dispute resolution is opaque, outcomes are non-transferable, and there is no persistent track record that travels with you when you move to another platform.

**Stellar Crowd Fund Escrow replaces the intermediary with code.**

- Funds are locked in a Soroban smart contract, not on a company server
- Milestone approval is on-chain — no one can override or delay it
- Reputation scores are contract-level state, not a database entry that can be deleted
- Anyone can audit the contract logic before trusting it with funds

---

## Who This Is For

| Role                          | How they use this platform                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Clients / Funders**         | Lock USDC (or any Stellar asset) into a milestone contract; approve work incrementally; raise disputes with evidence if delivery fails |
| **Contractors / Freelancers** | Accept work under clear on-chain terms; submit milestones for review; build a verifiable reputation across all engagements             |
| **DAOs / Communities**        | Pool contributor funds into a single escrow; gate milestone approval to a multi-sig or governance vote                                 |
| **Arbiters**                  | Resolve disputes with on-chain authority and an auditable decision trail                                                               |
| **Developers**                | Self-host a tenant, integrate via REST API, or extend the Soroban contract                                                             |

---

## Core Concepts

### Escrow Lifecycle

An escrow moves through these states on-chain:

```
Active → (all milestones approved) → Completed
Active → (either party raises dispute) → Disputed → (arbiter resolves) → Completed
Active → (mutual consent) → Cancelled
```

Each state transition is a signed Stellar transaction — auditable by anyone, reversible by no one.

### Milestone-Based Release

Funds are never released all at once. Each escrow is subdivided into milestones, each with its own amount and description hash (stored on IPFS). When the contractor submits a milestone and the client approves it, only that milestone's funds are released. The remainder stays locked until the next milestone is approved.

This gives both parties checkpoints — clients can stop at any milestone if work is unsatisfactory, contractors are protected from non-payment once a milestone is approved.

### On-Chain Reputation

Every escrow completion, dispute win, and dispute loss emits a `ReputationEvent` to the contract. Events accumulate into a score that is:

- **Public** — readable by any Stellar wallet or dApp
- **Immutable** — no one can delete or alter past events
- **Portable** — your score exists at your Stellar address, not on our servers
- **Composable** — other contracts and dApps can query it directly

---

## Architecture

The platform has four layers that work together:

```
┌─────────────────────────────────────────────────────────────────┐
│  Client Layer                                                   │
│  ┌──────────────────────────┐  ┌──────────────────────────┐    │
│  │  Web Dashboard           │  │  Mobile App              │    │
│  │  Next.js 14 + Tailwind   │  │  Expo / React Native     │    │
│  │  Freighter wallet        │  │  Biometric auth          │    │
│  │  Soroban transaction UI  │  │  Offline SQLite cache    │    │
│  └────────────┬─────────────┘  └────────────┬─────────────┘    │
└───────────────┼──────────────────────────────┼──────────────────┘
                │ HTTPS + JWT                  │ HTTPS + JWT
┌───────────────▼──────────────────────────────▼──────────────────┐
│  API Layer  (Express.js, Node 18+)                              │
│                                                                 │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │ Auth      │  │ Escrow    │  │ Dispute   │  │ Admin     │   │
│  │ MFA + JWT │  │ Milestone │  │ Evidence  │  │ Audit log │   │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘   │
│                                                                 │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │ Tenant    │  │ Search    │  │ Webhooks  │  │ Analytics │   │
│  │ Scoping   │  │ (ES + PG) │  │ BullMQ    │  │ Per-route │   │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘   │
└───────────┬───────────────────────────┬─────────────────────────┘
            │                           │
┌───────────▼──────────┐  ┌────────────▼──────────────────────────┐
│  Data Layer           │  │  Blockchain Layer                     │
│  PostgreSQL (Prisma)  │  │  Stellar Network (Testnet / Mainnet)  │
│  Redis (cache+queues) │  │  Soroban RPC                         │
│  IPFS (evidence)      │  │  Soroban Smart Contracts (Rust/Wasm) │
└──────────────────────┘  └───────────────────────────────────────┘
```

### Technology Decisions

| Decision               | What we chose                   | Why                                                                                           |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| Smart contract runtime | Soroban (Rust → Wasm)           | Stellar's native contract platform; deterministic, auditable, no EVM gas surprises            |
| API framework          | Express.js                      | Minimal surface area; easy to audit middleware chain                                          |
| ORM                    | Prisma                          | Type-safe DB access; migration history lives in the repo                                      |
| Cache                  | Redis + in-memory fallback      | Sliding-window rate limits need atomic operations; in-memory fallback keeps dev setup simple  |
| Job queue              | BullMQ                          | Reliable webhook retry with exponential backoff; dead-letter visibility in Redis dashboard    |
| Search                 | Elasticsearch + Prisma fallback | Full-text escrow search at scale; falls back gracefully if ES is unavailable                  |
| Mobile offline         | SQLite (expo-sqlite)            | Works without network; stale rows are evicted by TTL to prevent serving outdated escrow state |
| Pagination             | Offset (default) + cursor       | Offset for convenience; cursor for high-volume endpoints where skip cost matters              |

---

## Fund Flow — Step by Step

```
1. CLIENT deposits funds
   └─ create_escrow(freelancer, amount, milestones[])
      └─ Stellar transaction locks funds in contract

2. CONTRACTOR delivers work
   └─ submit_milestone(escrow_id, milestone_index)
      └─ IPFS hash of deliverable stored on-chain

3. CLIENT reviews and approves
   └─ approve_milestone(escrow_id, milestone_index)
      └─ Soroban releases that milestone's funds to contractor

4. Repeat for each milestone until completion
   └─ Final approval → escrow status = Completed
      └─ ReputationEvent written for both parties

── OR ──

3b. Dispute raised
    └─ raise_dispute(escrow_id, reason)
       └─ Either party can submit IPFS evidence files

4b. Arbiter resolves
    └─ resolve_dispute(escrow_id, client_amount, freelancer_amount)
       └─ Split funds according to resolution
       └─ ReputationEvent reflects outcome for both parties
```

---

## Project Structure

```
Stellar-Crowd-Fund-Escrow/
│
├── contracts/                         # Soroban smart contracts (Rust)
│   └── escrow_contract/
│       ├── src/
│       │   ├── lib.rs                 # Contract entry points & access control
│       │   ├── escrow.rs              # Escrow state machine & fund logic
│       │   ├── reputation.rs          # On-chain reputation event accumulation
│       │   └── dispute.rs             # Dispute initiation & resolution
│       └── Cargo.toml
│
├── backend/                           # Node 18+ REST API
│   ├── api/
│   │   ├── controllers/               # Request handling per domain
│   │   │   ├── escrowController.js    # Escrow list / get / broadcast
│   │   │   ├── disputeController.js   # Dispute list / evidence / appeals
│   │   │   ├── reputationController.js # Leaderboard + address lookup
│   │   │   ├── searchController.js    # Full-text escrow search
│   │   │   ├── adminController.js     # User management + audit trail
│   │   │   ├── webhookController.js   # Webhook subscriptions + deliveries
│   │   │   └── batchController.js     # Multi-request batching (allowlisted)
│   │   ├── middleware/
│   │   │   ├── auth.js                # JWT verification + MFA
│   │   │   ├── cache.js               # Tenant-scoped HTTP response cache
│   │   │   ├── rateLimiter.js         # Sliding-window per-user rate limits
│   │   │   ├── requestLogger.js       # Structured JSON logs + correlation ID
│   │   │   ├── analytics.js           # Per-route latency + status metrics
│   │   │   └── validation.js          # Shared express-validator rule sets
│   │   └── routes/                    # Express router definitions
│   │
│   ├── lib/
│   │   ├── pagination.js              # Offset pagination + cursor pagination
│   │   ├── cache.js                   # Redis / in-memory cache abstraction
│   │   └── prisma.js                  # Prisma client singleton
│   │
│   ├── queues/                        # BullMQ job queues
│   │   ├── webhookQueue.js            # Webhook delivery with retry backoff
│   │   ├── emailQueue.js              # Transactional email dispatch
│   │   └── eventQueue.js              # On-chain event processing
│   │
│   ├── services/                      # Domain business logic
│   │   ├── webhookService.js          # Subscription management + signing
│   │   ├── searchService.js           # Elasticsearch + Prisma search
│   │   ├── emailService.js            # Email queue + delivery tracking
│   │   └── ipfsService.js             # Evidence upload + hash verification
│   │
│   ├── database/
│   │   ├── schema.prisma              # All data models + composite indexes
│   │   └── migrations/                # Tracked migration history
│   │
│   └── tests/                         # Jest — 39 suites, 425 tests
│
├── frontend/                          # Next.js 14 web dashboard
│   ├── app/                           # App Router pages
│   ├── components/                    # Reusable React components
│   └── lib/
│       ├── soroban.ts                 # Stellar SDK + contract bindings
│       └── freighter.ts               # Freighter wallet integration
│
├── mobile/                            # Expo / React Native app
│   ├── app/                           # Expo Router pages
│   ├── hooks/
│   │   └── useEscrows.ts              # Escrow queries with offline fallback
│   ├── services/
│   │   ├── biometrics.ts              # Face ID / fingerprint auth
│   │   └── offlineCache.ts            # SQLite offline storage with TTL eviction
│   └── lib/
│       ├── api.ts                     # Axios client + JWT + 401 auto-clear
│       └── storage.ts                 # MMKV key-value store
│
├── scripts/
│   ├── preflight.js                   # Pre-deploy env + node version check
│   ├── check-env.js                   # Startup validator (runs on prestart)
│   ├── seed.js                        # DB seed — idempotent, supports --dry-run
│   ├── deploy.sh                      # Deployment helper
│   └── start-sandbox.sh               # Local Stellar Quickstart + contract deploy
│
├── docs/                              # Architecture, security, contributing guides
├── .husky/pre-push                    # Enforces tests + branch naming before push
├── docker-compose.yml                 # PostgreSQL + Redis + local Stellar node
└── package.json                       # npm workspaces root
```

---

## Getting Started

### What you need

| Dependency  | Minimum | Notes                                         |
| ----------- | ------- | --------------------------------------------- |
| Node.js     | 18.x    | Required. Use `nvm` to manage versions        |
| Rust        | 1.74    | Only needed if modifying contracts            |
| Soroban CLI | 21.0.0  | Only needed for contract deployment           |
| PostgreSQL  | 14      | Can be replaced with Docker service           |
| Redis       | 7       | Falls back to in-memory if unavailable        |
| Docker      | 24      | Optional — used for local Stellar sandbox     |
| Freighter   | any     | Browser extension for web transaction signing |

### Step 1 — Clone

```bash
git clone https://github.com/DevCM-D/Stellar-Crowd-Fund-Escrow.git
cd Stellar-Crowd-Fund-Escrow
```

### Step 2 — Run preflight

```bash
node scripts/preflight.js
```

This checks your Node version, validates required environment variables, and confirms your `DATABASE_URL` format before you get into setup. It exits with a clear error message — not a cryptic runtime crash — if anything is wrong.

### Step 3 — Install dependencies

```bash
npm install                  # root workspace (husky, linting tools)
cd backend && npm install    # API dependencies
cd ../frontend && npm install
```

### Step 4 — Configure environment

```bash
cp backend/.env.example backend/.env
```

Fill in `backend/.env`. The minimum viable set for local development:

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/stellar_escrow"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="generate-with-openssl-rand-hex-64"
JWT_ACCESS_SECRET="generate-with-openssl-rand-hex-64"
JWT_REFRESH_SECRET="generate-with-openssl-rand-hex-64"
STELLAR_NETWORK="testnet"
SOROBAN_RPC_URL="https://soroban-testnet.stellar.org"
CONTRACT_ID="your-deployed-contract-address"
NODE_ENV="development"
```

Generate secrets with: `openssl rand -hex 64`

Never reuse secrets between environments. Never commit `.env` files.

```bash
cp frontend/.env.example frontend/.env.local
```

### Step 5 — Set up the database

```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
```

Optional — seed with sample data:

```bash
node ../scripts/seed.js --dry-run   # preview without writing
node ../scripts/seed.js             # write fixture data
node ../scripts/seed.js --count 20  # write fixtures + 20 generated escrows
```

### Step 6 — Start services

```bash
# Terminal 1 — API (http://localhost:4000)
cd backend && npm run dev

# Terminal 2 — Web dashboard (http://localhost:3000)
cd frontend && npm run dev

# Terminal 3 — Mobile
cd mobile && npx expo start
```

### Step 6b — Use Docker for the data layer (alternative)

```bash
docker compose up -d          # starts PostgreSQL + Redis
cd backend && npm run dev     # starts API against Docker services
```

---

## Local Stellar Sandbox

To develop against a local Stellar node instead of testnet:

```bash
./scripts/start-sandbox.sh
```

This script:

1. Starts a Stellar Quickstart container in Soroban standalone mode
2. Compiles the Rust contract to Wasm
3. Deploys it to the local network
4. Funds a dev wallet with testnet XLM
5. Writes the contract ID and RPC URL into `frontend/.env.local`

The script is idempotent — running it again rebuilds and redeploys without tearing down the node.

```bash
# Verify
curl -sf http://localhost:8000/soroban/rpc | jq .result.protocolVersion

# Teardown
docker compose down
```

---

## Testing

```bash
cd backend

npm test                  # run all 39 test suites (425 tests)
npm run test:watch        # watch mode — re-runs on file save
npm run test:coverage     # coverage report in /coverage
```

The pre-push Git hook runs the full test suite automatically on every push. If any test fails, the push is aborted. Branch names are also validated against the pattern:

```
main | develop | live
feat/<name> | fix/<name> | refactor/<name>
hotfix/<name> | release/<name> | docs/<name>
chore/<name> | test/<name>
```

---

## API Reference

The complete route-by-route reference, including authentication, examples, status codes, and error shapes, is in [`docs/api/`](docs/api/README.md).

### Authentication

All protected endpoints require a `Bearer` token in the `Authorization` header. Tokens are obtained by signing a nonce with your Stellar private key — no username/password.

```
POST /api/auth/nonce        → get a challenge nonce for your address
POST /api/auth/verify       → sign nonce, receive access + refresh tokens
POST /api/auth/refresh      → rotate access token using refresh token
POST /api/auth/logout       → revoke refresh token
```

### Escrow Endpoints

```
GET  /api/escrows                     list with filters (status, client, dateRange)
GET  /api/escrows/:id                 single escrow + milestones
GET  /api/escrows/:id/milestones      paginated milestones
POST /api/escrows/broadcast           submit a signed Stellar XDR transaction
```

Status filter accepts a comma-separated list: `?status=Active,Disputed`

### Pagination

All list endpoints accept:

| Parameter | Description                       | Default | Max |
| --------- | --------------------------------- | ------- | --- |
| `page`    | Page number (offset mode)         | 1       | —   |
| `limit`   | Results per page                  | 20      | 100 |
| `cursor`  | Last-seen record ID (cursor mode) | —       | —   |

Cursor mode is more efficient for deep pages — it seeks directly to the cursor row instead of scanning and skipping.

### Dispute Endpoints

```
GET  /api/disputes                    list disputes (sortBy: raisedAt, resolvedAt, id)
GET  /api/disputes/:escrowId          dispute detail + evidence + appeals
POST /api/disputes/:escrowId/evidence upload evidence file (IPFS-backed)
```

Date filter: `?dateFrom=2025-01-01&dateTo=2025-12-31`

### Reputation Endpoints

```
GET /api/reputation/:address          score for a single Stellar address
GET /api/reputation/leaderboard       top addresses by score (max 50 per page)
GET /api/reputation/search?q=G...     address prefix search
```

### Search

```
GET /api/search?q=<term>&status=Active&minAmount=1000
GET /api/search/suggest?q=<prefix>
```

`q` is capped at 200 characters and sanitised of control characters before reaching Elasticsearch.

### Webhooks

```
POST /api/webhooks/subscribe          register an HTTPS endpoint + event types
GET  /api/webhooks                    list your subscriptions
DELETE /api/webhooks/:id              remove a subscription
GET  /api/webhooks/:id/deliveries     delivery history + retry status
```

Webhook URLs must use `https://`. Maximum 20 event types per subscription. Subscribe endpoint is rate-limited to 10 requests per 10 minutes per address.

Each delivery includes:

- `X-Webhook-Signature` — HMAC-SHA256 of the payload body, signed with your subscription secret
- `X-Webhook-Delivery-Id` — unique delivery ID for idempotency checks
- `X-Webhook-Event-Type` — the event that triggered this delivery

### Health Probes

```
GET /health           full dependency status (DB, Redis, Stellar RPC, email queue)
GET /health/live      liveness probe — always 200 while the process is running
GET /health/ready     readiness probe — 503 when the database is unavailable
```

---

## Environment Variables

### Required

| Variable             | Description                                               |
| -------------------- | --------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string (`postgresql://...`)         |
| `JWT_SECRET`         | JWT signing secret — generate with `openssl rand -hex 64` |
| `JWT_ACCESS_SECRET`  | Access token secret (separate from refresh)               |
| `JWT_REFRESH_SECRET` | Refresh token secret                                      |
| `STELLAR_NETWORK`    | `testnet` or `mainnet`                                    |
| `SOROBAN_RPC_URL`    | Soroban JSON-RPC endpoint                                 |
| `CONTRACT_ID`        | Deployed escrow contract address                          |
| `NODE_ENV`           | `development`, `staging`, or `production`                 |

### Optional

| Variable                           | Default                 | Description                                               |
| ---------------------------------- | ----------------------- | --------------------------------------------------------- |
| `REDIS_URL`                        | —                       | Redis connection string; falls back to in-memory if unset |
| `PORT`                             | `4000`                  | API server port                                           |
| `LOG_LEVEL`                        | `info`                  | `debug` / `info` / `warn` / `error`                       |
| `WEBHOOK_MAX_RETRY_ATTEMPTS`       | `5`                     | Max delivery attempts before a job goes to dead-letter    |
| `WEBHOOK_BACKOFF_BASE_MS`          | `5000`                  | Base delay for exponential backoff (ms)                   |
| `WEBHOOK_KEEP_FAILED_JOBS`         | `100`                   | Failed jobs to retain in BullMQ dashboard                 |
| `BATCH_ALLOWED_ROUTES`             | (built-in list)         | Comma-separated route prefixes allowed in batch requests  |
| `MAX_BATCH_ITEM_BODY_BYTES`        | `65536`                 | Per-item body size cap in batch endpoint                  |
| `HEALTH_STELLAR_TIMEOUT_MS`        | `5000`                  | Soroban RPC timeout during health check                   |
| `ANALYTICS_FLUSH_INTERVAL_MS`      | `10000`                 | How often in-memory analytics flush to time-series DB     |
| `EXPO_PUBLIC_API_URL`              | `http://localhost:4000` | Mobile app backend URL                                    |
| `EXPO_PUBLIC_OFFLINE_CACHE_TTL_MS` | `300000`                | SQLite offline cache TTL (5 min)                          |

---

## Smart Contract Reference

Source: `contracts/escrow_contract/src/lib.rs`

| Function            | Parameters                                    | Who can call          | Effect                                                   |
| ------------------- | --------------------------------------------- | --------------------- | -------------------------------------------------------- |
| `create_escrow`     | client, freelancer, token, amount, milestones | Anyone                | Locks funds; creates escrow in `Active` state            |
| `submit_milestone`  | escrow_id, milestone_index, ipfs_hash         | Freelancer only       | Records deliverable hash; flags milestone as `Submitted` |
| `approve_milestone` | escrow_id, milestone_index                    | Client only           | Releases that milestone's funds; emits `ReputationEvent` |
| `raise_dispute`     | escrow_id, reason                             | Client or freelancer  | Transitions escrow to `Disputed` state                   |
| `resolve_dispute`   | escrow_id, client_amt, freelancer_amt         | Arbiter only          | Splits remaining funds; closes dispute                   |
| `cancel_escrow`     | escrow_id                                     | Both parties (mutual) | Refunds client; transitions to `Cancelled`               |
| `get_reputation`    | address                                       | Anyone                | Returns aggregate reputation score for address           |

All write calls require a Stellar transaction simulation step (`simulateTransaction`) before submission. See `frontend/lib/soroban.ts` for reference patterns.

---

## Security Practices

This codebase applies defence-in-depth at every layer:

**Input boundary**

- All query parameters and body fields are validated with express-validator before reaching controllers
- Unknown enum values (escrow status, sort fields) return 400 with the allowed list rather than passing through to Prisma
- Search query strings are capped at 200 characters and stripped of ASCII control characters

**Authentication**

- JWT secrets are required environment variables with no hardcoded fallbacks — the process exits with a clear error if unset
- MFA uses a separate signing secret from the main JWT
- The mobile API client clears the stored token on any 401 response to prevent silent retry loops

**Webhooks**

- Subscriber endpoints must use `https://` — plain HTTP and private-IP URLs are rejected to prevent SSRF
- The subscribe endpoint is rate-limited per address to prevent resource exhaustion

**Multi-tenancy**

- Cache keys, analytics metrics, and all DB queries are scoped by `tenantId`/`tenantSlug`
- A cross-tenant data leak would require bypassing the Prisma `where` clause on every query

**Admin operations**

- Rate-limit overrides, user bans, and dispute resolutions all emit structured `admin_action` log events with the performer's address and timestamp
- Changing a rate limit logs the previous value alongside the new one for forensic comparison

**Pre-push enforcement**

- Every push runs 425 backend tests; a failing test blocks the push
- Direct pushes to `main` require the committer email to be on the authorised list
- Force-pushes and branch deletions on `main` are blocked by the hook

---

## Roadmap

### Phase 1 — Core Infrastructure (current)

- [x] Soroban escrow contract skeleton
- [x] Express API with auth, caching, rate limiting
- [x] PostgreSQL schema + Prisma migrations
- [x] Next.js dashboard scaffold
- [x] Expo mobile app with offline support
- [x] Webhook delivery system
- [x] 39-suite test harness

### Phase 2 — Contract Completion

- [ ] Full milestone state machine on-chain
- [ ] Multi-sig arbiter resolution
- [ ] Dispute evidence Merkle proof on-chain
- [ ] Reputation aggregation contract

### Phase 3 — Community Features

- [ ] DAO-gated milestone approval (multi-sig client)
- [ ] Public escrow discovery feed
- [ ] Contributor leaderboard (on-chain data)
- [ ] Push notifications for milestone events

### Phase 4 — Production Hardening

- [ ] Mainnet contract audit
- [ ] Formal verification of fund-release logic
- [ ] GDPR data export / deletion flow
- [ ] Multi-region deployment guide

---

## Contributing

The project actively welcomes contributors at every experience level. Issues are labelled by difficulty and domain.

**Before you start:**

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) for code style, commit format, and the PR process
2. Check [open issues](https://github.com/DevCM-D/Stellar-Crowd-Fund-Escrow/issues) — filter by `good first issue` for beginner-friendly tasks

**Branch naming:**

```
feat/short-description          new functionality
fix/short-description           bug fix
refactor/short-description      code improvement without behaviour change
docs/short-description          documentation only
test/short-description          tests only
chore/short-description         tooling, dependencies, config
```

**Commit format:**

```
type(scope): short summary

Longer explanation of WHY if the diff doesn't make it obvious.
```

Types: `feat`, `fix`, `perf`, `security`, `refactor`, `test`, `docs`, `chore`

**Pull requests:**

- Target `develop`, not `main`
- All 425 tests must pass (the pre-push hook enforces this)
- New features need a test
- One logical change per PR

---

## Known Limitations

Being honest about where things stand:

- The Soroban contract is a skeleton — fund release logic is not yet production-ready
- Elasticsearch is optional; without it, search falls back to Prisma `ILIKE` queries which are slower on large datasets
- The mobile offline cache stores at most a few hundred escrows before SQLite performance degrades — pagination and eviction mitigate this but do not eliminate it
- Multi-sig / DAO-gated milestone approval is on the roadmap, not yet implemented

---

## Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

### [Unreleased]

#### Added
- Changelog section added to README for GitHub diff tracking
- Roadmap phases 2–4 documented

#### Planned
- Full milestone state machine on-chain (Phase 2)
- Multi-sig arbiter resolution (Phase 2)
- DAO-gated milestone approval (Phase 3)

### [0.1.0] — 2026-06-24

#### Added
- Soroban escrow contract skeleton (`contracts/escrow_contract/`)
- Express.js REST API with JWT auth, MFA, rate limiting, and tenant scoping
- PostgreSQL schema via Prisma with tracked migrations
- Redis cache with in-memory fallback
- BullMQ webhook delivery system with exponential backoff
- Elasticsearch full-text search with Prisma `ILIKE` fallback
- Next.js 14 web dashboard with Freighter wallet integration
- Expo / React Native mobile app with biometric auth and offline SQLite cache
- 39 Jest test suites (425 tests)
- Pre-push Git hook enforcing tests and branch naming conventions
- `scripts/preflight.js` for pre-deploy environment validation
- Docker Compose setup for PostgreSQL + Redis + local Stellar node
- `scripts/start-sandbox.sh` for local Soroban contract deployment

---

## License

MIT — see [LICENSE](LICENSE) for the full text.

---

_Built with Rust, Node.js, and the Stellar ecosystem. Contributions welcome._
