# Stellar Crowd Fund Escrow

> A decentralised, milestone-based crowd-funding escrow platform with an on-chain reputation system built on the Stellar blockchain using Soroban smart contracts.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Contributors Welcome](https://img.shields.io/badge/contributors-welcome-brightgreen)](CONTRIBUTING.md)
[![Built on Stellar](https://img.shields.io/badge/built%20on-Stellar-blueviolet)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Soroban-Smart%20Contracts-orange)](https://soroban.stellar.org)
[![Tests](https://img.shields.io/badge/tests-425%20passing-brightgreen)](#running-tests)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org)

---

## Overview

**Stellar Crowd Fund Escrow** enables clients and freelancers to create trustless, milestone-based payment agreements secured by Soroban smart contracts. Funds are locked on-chain and released milestone by milestone — no intermediaries, no central authority required.

Every completed milestone builds an immutable, on-chain **reputation score** for both parties, creating a verifiable track record that persists across all future engagements on the platform. The platform supports **multi-tenancy**, allowing organisations to run isolated escrow environments under a single deployment.

---

## Features

| Feature                           | Status      |
| --------------------------------- | ----------- |
| Milestone-based escrow contract   | In Progress |
| On-chain reputation system        | In Progress |
| Dispute resolution mechanism      | In Progress |
| REST API + event indexer          | In Progress |
| Next.js 14 dashboard              | In Progress |
| Wallet connection (Freighter)     | In Progress |
| Mobile app (Expo / React Native)  | In Progress |
| Multi-tenant architecture         | In Progress |
| Real-time chat (WebSocket)        | In Progress |
| Offline-first mobile support      | In Progress |
| Cursor-based pagination           | In Progress |
| Webhook delivery with retries     | In Progress |
| Biometric authentication (mobile) | In Progress |

---

## Architecture

```
+-------------------------------------------------------------+
|                      Client Devices                         |
|          Browser (Next.js 14)    Mobile (Expo/RN)           |
+------------------+----------------------+-------------------+
                   |  HTTPS / WS          | HTTPS / WS
+------------------v----------------------v-------------------+
|                   Express.js API (Node 18+)                 |
|  +------------+  +----------+  +----------+  +----------+  |
|  | Auth / JWT |  | Escrow   |  | Chat /WS |  | Admin    |  |
|  | MFA / Sig  |  | Routes   |  | Socket   |  | Routes   |  |
|  +------------+  +----------+  +----------+  +----------+  |
|  +------------+  +----------+  +----------+  +----------+  |
|  | Cache      |  | Prisma   |  | Redis    |  | BullMQ   |  |
|  | Middleware |  | ORM      |  | Cache    |  | Queues   |  |
|  +------------+  +----------+  +----------+  +----------+  |
+------------------+----------------------+-------------------+
                   |                      |
          +--------v------+    +----------v------+
          |  PostgreSQL   |    |  Stellar Network |
          |  (Prisma)     |    |  Soroban RPC     |
          +---------------+    +-----------------+
                                        |
                               +--------v--------+
                               |  Soroban Smart  |
                               |  Contracts      |
                               |  (Rust / Wasm)  |
                               +-----------------+
```

### Component Overview

| Layer           | Technology                  | Purpose                                           |
| --------------- | --------------------------- | ------------------------------------------------- |
| Smart Contracts | Rust + Soroban SDK          | Escrow logic, reputation, dispute resolution      |
| Backend API     | Node.js 18+ + Express       | REST endpoints, WebSocket server, event indexer   |
| Database        | PostgreSQL + Prisma         | Persistent storage, migrations, type-safe queries |
| Cache           | Redis + in-memory fallback  | HTTP response caching, sliding-window rate limits |
| Job Queues      | BullMQ + Redis              | Webhook delivery, email, scheduled jobs           |
| Frontend        | Next.js 14 + Tailwind CSS   | Web dashboard, Freighter wallet integration       |
| Mobile          | Expo + React Native         | iOS/Android app, offline support, biometrics      |
| Blockchain      | Stellar (Testnet / Mainnet) | On-chain escrow and reputation records            |
| Wallet          | Freighter Browser Extension | Transaction signing for web users                 |

---

## How It Works

```
Client                   Contract               Freelancer
  |                         |                       |
  |--- create_escrow() ---->|                       |
  |    (funds locked)       |                       |
  |                         |<-- submit_milestone()-|
  |                         |                       |
  |<-- milestone ready -----+                       |
  |                         |                       |
  |--- approve_milestone() ->|                      |
  |                         |--- release_funds() -->|
  |                         |    (partial payout)   |
  |                         |                       |
  |         [dispute raised by either party]        |
  |                         |                       |
  |--- raise_dispute() ---->|<--- raise_dispute() --|
  |                         |                       |
  |           [arbiter / DAO resolves]              |
  |                         |--- resolve_dispute() ->
  |                         |                       |
  +-- reputation updated ---+--- reputation updated-+
```

### Reputation System

Each escrow completion or dispute resolution writes a `ReputationEvent` to the chain. Events aggregate into a score that is publicly queryable and tamper-proof. Both clients and freelancers build reputation independently. The leaderboard is served from Elasticsearch with a Prisma fallback, capped at 50 results per page to bound query cost.

### Webhook System

Subscribers register HTTPS endpoints and a list of event types. Deliveries are queued via BullMQ with configurable exponential backoff (default: 5 attempts, base delay 5 s). Job IDs are deterministic per delivery so re-enqueueing after a worker crash is idempotent.

---

## Project Structure

```
stellar-crowd-fund-escrow/
├── contracts/
│   └── escrow_contract/           # Soroban smart contract (Rust)
│       ├── src/
│       │   ├── lib.rs             # Contract entry points
│       │   ├── escrow.rs          # Escrow state machine
│       │   ├── reputation.rs      # On-chain reputation logic
│       │   └── dispute.rs         # Dispute resolution
│       └── Cargo.toml
├── backend/
│   ├── api/
│   │   ├── controllers/           # Route handler logic
│   │   ├── middleware/            # Auth, cache, tenant, rate-limit, analytics
│   │   └── routes/                # Express route definitions
│   ├── lib/
│   │   ├── pagination.js          # Offset + cursor pagination helpers
│   │   ├── cache.js               # Redis / in-memory cache abstraction
│   │   └── prisma.js              # Prisma client singleton
│   ├── queues/                    # BullMQ job queues (webhook, email, events)
│   ├── services/                  # Business logic, event indexer, search
│   ├── database/
│   │   ├── schema.prisma          # Prisma data models
│   │   └── migrations/            # Database migration history
│   └── tests/                     # Jest test suites (39 suites, 425 tests)
├── frontend/
│   ├── app/                       # Next.js 14 App Router pages
│   ├── components/                # Reusable React components
│   └── lib/                       # Soroban client, Freighter helpers
├── mobile/
│   ├── app/                       # Expo Router pages
│   ├── components/                # React Native components
│   ├── services/                  # Biometrics, offline SQLite cache
│   ├── hooks/                     # Custom React hooks (with retry backoff)
│   └── lib/                       # API client, auth, storage
├── docs/                          # Architecture, SSH setup, guides
├── scripts/
│   ├── preflight.js               # Pre-deployment environment checker
│   ├── check-env.js               # Startup env validator (prestart hook)
│   ├── seed.js                    # DB seed with idempotency guard
│   └── deploy.sh                  # Deployment helper
├── .husky/                        # Git hooks (pre-push validation)
├── docker-compose.yml             # Local development services
└── package.json                   # Root workspace config
```

---

## Quick Start

### Prerequisites

| Tool        | Minimum Version            |
| ----------- | -------------------------- |
| Node.js     | 18.x                       |
| Rust        | 1.74                       |
| Soroban CLI | 21.0.0                     |
| PostgreSQL  | 14                         |
| Redis       | 7                          |
| Docker      | 24 (optional, for sandbox) |

You will also need the [Freighter wallet](https://www.freighter.app/) browser extension for transaction signing on the web.

### 1. Clone the repository

```bash
git clone https://github.com/DevCM-D/Stellar-Crowd-Fund-Escrow
cd Stellar-Crowd-Fund-Escrow
```

### 2. Install dependencies

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### 3. Run the pre-deployment preflight check

```bash
node scripts/preflight.js
```

This verifies Node.js version, required environment variables, and `DATABASE_URL` format before you start configuring anything.

### 4. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in all required secrets. See [Environment Variable Reference](#environment-variable-reference) below.

```bash
cp frontend/.env.example frontend/.env.local
```

Open `frontend/.env.local` and set the API URL, network, and contract address.

> **Security note**: Every secret must be unique and generated with a CSPRNG (`openssl rand -hex 64`). Never reuse secrets across environments.

### 5. Set up the database

```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
cd ..
```

### 6. Seed the database (optional)

```bash
# Preview what would be seeded without writing
node scripts/seed.js --dry-run

# Seed with fixture data
cd backend && node ../scripts/seed.js

# Re-seed (clears existing data first)
cd backend && node ../scripts/seed.js --force

# Generate extra escrows for load testing
cd backend && node ../scripts/seed.js --count 50
```

### 7. Build the smart contract

```bash
cd contracts/escrow_contract
cargo build --release --target wasm32-unknown-unknown
cd ../..
```

### 8. Start the development servers

```bash
# Terminal 1 — Backend API (port 4000)
cd backend && npm run dev

# Terminal 2 — Frontend (port 3000)
cd frontend && npm run dev

# Terminal 3 — Mobile (Expo)
cd mobile && npx expo start
```

Open `http://localhost:3000` to access the web dashboard.

---

## Local Soroban Sandbox (Docker)

For local development without a public testnet connection:

```bash
# Start the full local stack (Stellar node + services)
docker compose up -d

# Or use the helper script which also deploys contracts and funds a dev wallet
./scripts/start-sandbox.sh
```

The helper script:

- Starts a local Stellar Quickstart node in Soroban standalone mode
- Deploys all smart contracts to the local network
- Funds a development wallet
- Writes contract IDs and RPC settings into `frontend/.env.local`

**Verify the sandbox is running:**

```bash
docker ps --filter name=stellar-sandbox
curl -sf http://localhost:8000/soroban/rpc | jq .
```

**Rebuild and redeploy a contract after editing:**

```bash
./scripts/start-sandbox.sh
```

The script is idempotent — it rebuilds the Wasm, redeploys to the existing sandbox, and refreshes contract IDs without a full network teardown.

**Teardown:**

```bash
docker compose down
```

---

## Running Tests

```bash
# All backend tests (39 suites, 425 tests)
cd backend && npm test

# Watch mode during development
cd backend && npm run test:watch

# With coverage report
cd backend && npm run test:coverage
```

The Husky pre-push hook runs all backend tests automatically before every push to any branch. Pushes are blocked if any test fails or the branch name is invalid.

---

## API Highlights

### Pagination

All list endpoints support **offset pagination** (default) and the library also exposes **cursor-based pagination** helpers for high-volume endpoints:

```
GET /api/escrows?page=2&limit=20          # offset
GET /api/escrows?cursor=<id>&limit=20     # cursor (O(1) seek, no skip cost)
```

### Health Checks

| Endpoint            | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `GET /health`       | Full dependency check (DB, Redis, Stellar)     |
| `GET /health/live`  | Liveness probe — always 200 while process runs |
| `GET /health/ready` | Readiness probe — 503 when DB is down          |

### Webhooks

```bash
# Register a webhook (HTTPS endpoints only)
POST /api/webhooks/subscribe
{
  "url": "https://yourserver.com/hook",
  "eventTypes": ["esc_crt", "funds_rel", "dispute_raised"]
}
```

Deliveries are signed with `X-Webhook-Signature` (HMAC-SHA256). Each subscription returns a secret for verification. Delivery attempts retry with exponential backoff; retry behaviour is configurable via environment variables.

---

## Environment Variable Reference

### Required

| Variable             | Description                                       |
| -------------------- | ------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string (`postgresql://...`) |
| `JWT_SECRET`         | Access token signing secret (64+ random bytes)    |
| `JWT_ACCESS_SECRET`  | Separate access token secret (64+ random bytes)   |
| `STELLAR_NETWORK`    | `testnet` or `mainnet`                            |
| `SOROBAN_RPC_URL`    | Soroban JSON-RPC endpoint URL                     |
| `CONTRACT_ID`        | Deployed escrow contract address                  |
| `NODE_ENV`           | `development`, `staging`, or `production`         |
| `JWT_REFRESH_SECRET` | Refresh token signing secret (64+ random bytes)   |

### Optional

| Variable                           | Default      | Description                                         |
| ---------------------------------- | ------------ | --------------------------------------------------- |
| `REDIS_URL`                        | —            | Redis connection string (falls back to in-memory)   |
| `PORT`                             | `4000`       | API server port                                     |
| `LOG_LEVEL`                        | `info`       | `debug`, `info`, `warn`, or `error`                 |
| `BATCH_ALLOWED_ROUTES`             | (see source) | Comma-separated route prefixes allowed in batch API |
| `MAX_BATCH_ITEM_BODY_BYTES`        | `65536`      | Max size per item in a batch request                |
| `WEBHOOK_MAX_RETRY_ATTEMPTS`       | `5`          | Max delivery retry attempts per webhook event       |
| `WEBHOOK_BACKOFF_BASE_MS`          | `5000`       | Base delay (ms) for exponential backoff             |
| `WEBHOOK_KEEP_FAILED_JOBS`         | `100`        | Number of failed jobs to retain in queue dashboard  |
| `HEALTH_STELLAR_TIMEOUT_MS`        | `5000`       | Timeout for Stellar RPC health check                |
| `ANALYTICS_FLUSH_INTERVAL_MS`      | `10000`      | How often analytics are flushed to time-series DB   |
| `EXPO_PUBLIC_OFFLINE_CACHE_TTL_MS` | `300000`     | Mobile SQLite cache TTL (5 minutes)                 |

---

## Smart Contract API

The core escrow contract exposes these entry points (defined in `contracts/escrow_contract/src/lib.rs`):

| Function            | Arguments                              | Description                                   |
| ------------------- | -------------------------------------- | --------------------------------------------- |
| `create_escrow`     | client, freelancer, amount, milestones | Lock funds and initialise escrow              |
| `submit_milestone`  | escrow_id, milestone_id                | Freelancer marks milestone ready for review   |
| `approve_milestone` | escrow_id, milestone_id                | Client approves and triggers partial release  |
| `raise_dispute`     | escrow_id, reason                      | Either party initiates dispute                |
| `resolve_dispute`   | escrow_id, winner                      | Arbiter resolves in favour of one party       |
| `cancel_escrow`     | escrow_id                              | Cancel and refund (requires mutual agreement) |
| `get_reputation`    | address                                | Query on-chain reputation score               |

All contract interactions require a simulation step (`simulateTransaction`) before submission. See `frontend/lib/soroban.ts` for client-side integration patterns.

---

## Security

This project enforces several defensive practices at the code and infrastructure level:

- **JWT secrets**: Required env vars with no hardcoded fallbacks — startup fails fast if unset
- **Input validation**: All API endpoints validate and sanitise inputs before hitting the DB; unknown enum values return 400 with the allowed list
- **Webhook SSRF protection**: Webhook endpoint URLs must use `https://` — plain HTTP and private-IP URLs are rejected
- **Rate limiting**: Write-heavy endpoints (webhook subscribe, auth) use per-user sliding-window rate limits
- **Multi-tenant isolation**: Cache keys, analytics metrics, and DB queries are all scoped by tenant slug
- **Audit logging**: Admin actions (rate-limit changes, user bans, dispute resolutions) emit structured log events with performer address
- **Pre-push hook**: All pushes run 425 backend tests; direct pushes to `main` require an authorised committer email

Report security vulnerabilities privately — do not open a public issue for security bugs.

- Security model: [`docs/SECURITY.md`](docs/SECURITY.md)
- Bug bounty policy: [`docs/BUG_BOUNTY.md`](docs/BUG_BOUNTY.md)
- Privacy policy: [`docs/PRIVACY.md`](docs/PRIVACY.md)

---

## Contributing

Contributions of all kinds are welcome. The project is designed to be beginner-friendly with clearly scoped, labelled issues.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature-name`
3. Make your changes and update or add tests where appropriate
4. Ensure all tests pass: `cd backend && npm test`
5. Push your branch and open a pull request against `develop`

See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete guide including code style, commit message format, and the review process.

Browse [open issues](https://github.com/DevCM-D/Stellar-Crowd-Fund-Escrow/issues) for ideas sorted by difficulty.

---

## License

MIT — see [LICENSE](LICENSE).
