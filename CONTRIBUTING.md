# Contributing to StellarTrustEscrow

This guide is the fastest path from clone to first PR. It covers local setup, testing, linting, the review process, and how to find newcomer-friendly issues.

## Table of Contents

- [Prerequisites](#prerequisites)
- [15-Minute Quickstart](#15-minute-quickstart)
- [Development Workflow](#development-workflow)
- [Testing All Layers](#testing-all-layers)
- [Code Style and Linting](#code-style-and-linting)
- [Pull Request Process](#pull-request-process)
- [Finding a First Issue](#finding-a-first-issue)
- [OS Notes](#os-notes)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Install these before you start:

| Tool                                     | Version                           | Why it is needed                                      |
| ---------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| Node.js                                  | 20 LTS recommended, 18+ supported | Frontend, backend, linting, and Jest/Playwright tests |
| npm                                      | Bundled with Node.js              | Workspace installs and scripts                        |
| Rust                                     | 1.74+                             | Soroban smart contracts                               |
| `wasm32-unknown-unknown` target          | Latest                            | Contract builds                                       |
| Visual Studio Build Tools (Windows only) | Current                           | Required for native Rust linking on Windows           |
| Soroban CLI                              | 21+                               | Local contract workflows                              |
| Docker Desktop or Docker Engine          | Latest                            | Fast local Postgres and full-stack smoke tests        |
| PostgreSQL                               | 14+ if not using Docker           | Backend development and Prisma migrations             |
| Git                                      | Latest                            | Branching and pull requests                           |
| Playwright browsers                      | Current                           | Frontend end-to-end tests                             |

Recommended install commands:

```bash
rustup toolchain install stable
rustup target add wasm32-unknown-unknown
cargo install --locked --force soroban-cli
```

## Soroban Development Environment

This section covers everything specific to the Rust/Soroban layer. Skip it if you are only working on the frontend or backend.

### Rust toolchain and Soroban CLI

```bash
# Install stable Rust (1.74+ required)
rustup toolchain install stable
rustup default stable

# Add the WASM compilation target
rustup target add wasm32-unknown-unknown

# Install the Soroban CLI (pin to a known-good version)
cargo install --locked soroban-cli --version 21.0.0
```

Verify:

```bash
rustc --version        # rustc 1.74.0 or later
soroban --version      # soroban 21.x.x
```

### Configure a Stellar testnet identity

```bash
# Generate a new keypair and fund it from Friendbot
soroban keys generate --global contributor --network testnet
soroban keys fund contributor --network testnet
```

### Workspace structure

The Cargo workspace (`Cargo.toml` at the repository root) contains four contract crates:

| Crate                | Path                           | Purpose                        |
| -------------------- | ------------------------------ | ------------------------------ |
| `escrow_contract`    | `contracts/escrow_contract`    | Core milestone escrow logic    |
| `governance`         | `contracts/governance`         | On-chain governance and voting |
| `insurance_contract` | `contracts/insurance_contract` | Dispute insurance pool         |
| `escrow_extensions`  | `contracts/escrow_extensions`  | Optional escrow add-ons        |

All four share a single `[profile.release]` in the root `Cargo.toml`:

```toml
[profile.release]
opt-level        = "z"
overflow-checks  = true   # integer overflow panics instead of wrapping — critical for financial logic
debug            = 0
strip            = "symbols"
debug-assertions = false
panic            = "abort"
codegen-units    = 1
lto              = true
```

`overflow-checks = true` is intentional. Any arithmetic that would silently wrap in a standard release build will instead abort the contract, preventing fund-accounting bugs. Do not disable it.

### Running contract tests

Run tests for a single crate to keep feedback fast:

```bash
# Core escrow contract
cargo test -p escrow_contract

# Governance contract
cargo test -p governance

# Escrow extensions
cargo test -p escrow_extensions

# All crates at once
cargo test --workspace
```

Run a specific test by name:

```bash
cargo test -p escrow_contract test_approve_milestone_o1_completion_check
```

### Soroban test harness patterns

Soroban tests use an in-process mock environment rather than a live network. The patterns below appear throughout the test suite.

**`Env::default()`** — creates an isolated in-memory Soroban environment:

```rust
let env = Env::default();
```

**`mock_all_auths()`** — bypasses `require_auth()` checks so tests can call any function without real signatures:

```rust
env.mock_all_auths();
```

Call this once at the top of a test. Remove it if you are specifically testing authorisation failures.

**`Address::generate(&env)`** — generates a deterministic test address:

```rust
let client     = Address::generate(&env);
let freelancer = Address::generate(&env);
```

**`env.ledger().with_mut()`** — advances the ledger clock to simulate time passing:

```rust
// Jump forward 7 days
env.ledger().with_mut(|l| {
    l.timestamp += 7 * 24 * 60 * 60;
});
```

Use this to test deadline expiry, timelock release, and recurring payment scheduling.

A minimal test skeleton:

```rust
#[test]
fn test_example() {
    let env = Env::default();
    env.mock_all_auths();

    let client     = Address::generate(&env);
    let freelancer = Address::generate(&env);
    // ... register contract, call functions, assert state
}
```

## 15-Minute Quickstart

This path assumes Node, Rust, Docker, and Git are already installed.

### 1. Fork and clone

```bash
git clone https://github.com/YOUR_USERNAME/stellar-trust-escrow.git
cd stellar-trust-escrow
git remote add upstream https://github.com/barry01-hash/stellar-trust-escrow.git
```

### 2. Install workspace dependencies

```bash
npm ci
```

### 3. Start Postgres

Use Docker for the database even if you run the app locally:

```bash
docker compose up -d postgres
```

### 4. Configure local environment files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

PowerShell equivalent:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

Update these values in `backend/.env` for local development:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/stellar_escrow
DIRECT_URL=postgresql://user:password@localhost:5432/stellar_escrow
ALLOWED_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

`frontend/.env.local` usually only needs:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 5. Prepare the database

```bash
npm run db:generate -w backend
npm run db:migrate -w backend
```

### 6. Start backend and frontend

Run these in separate terminals:

```bash
npm run dev -w backend
```

```bash
npm run dev -w frontend
```

Open `http://localhost:3000`.

### 7. Optional: build the contracts locally

```bash
cargo build -p escrow_contract --target wasm32-unknown-unknown
cargo build -p insurance_contract --target wasm32-unknown-unknown
```

## Development Workflow

### Branch naming

Use a short descriptive branch name:

- `docs/contributor-onboarding`
- `feature/add-wallet-retry`
- `fix/backend-health-route`
- `test/improve-escrow-coverage`

### Typical flow

```bash
git checkout -b docs/contributor-onboarding
```

Make your change, then run the relevant checks from the sections below.

Commit using Conventional Commits:

```bash
git add .
git commit -m "docs: create contributor onboarding guide"
```

Push your branch:

```bash
git push -u origin docs/contributor-onboarding
```

## Testing All Layers

Run the checks that match the layer you touched. If your PR crosses multiple layers, run all of them.

### Smart contracts

Run the full workspace:

```bash
cargo test --workspace
```

Run a single crate for faster iteration:

```bash
cargo test -p escrow_contract
cargo test -p governance
cargo test -p escrow_extensions
cargo test -p insurance_contract
```

Run a specific test by name:

```bash
cargo test -p escrow_contract <test_name>
```

For deeper contract verification on macOS, Linux, or WSL:

```bash
bash scripts/test-contract.sh --gas --coverage
```

PRs that touch contract logic must include at least one new test. Use `Env::default()` and `mock_all_auths()` (see [Soroban test harness patterns](#soroban-test-harness-patterns) above). Time-sensitive behaviour must be covered with `env.ledger().with_mut()`.

### Backend

```bash
npm run test -w backend
```

Database-related backend changes should also include:

```bash
npm run db:migrate:status -w backend
```

### Frontend

```bash
npm run test:unit -w frontend
npm run test:integration -w frontend
npm run test:a11y -w frontend
```

Install Playwright browsers once before the first end-to-end run:

```bash
cd frontend
npx playwright install --with-deps chromium firefox
```

Then run:

```bash
npm run test:e2e -w frontend
```

### Helpful root shortcuts

```bash
npm run test
npm run test:all
```

`npm run test` covers frontend and backend. `npm run test:all` adds the Rust workspace tests and a frontend production build.

## Code Style and Linting

### JavaScript and TypeScript

```bash
npm run lint
npm run format
```

### Rust contracts

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```

### All lint checks

```bash
npm run lint:all
```

Notes:

- ESLint and Prettier cover the JS and TS codebase.
- Husky is installed, but you should still run the relevant checks yourself before pushing.
- Keep PRs focused. If you touch contracts and frontend together, explain why in the PR.

## Pull Request Process

1. Pick or claim an issue before starting substantial work.
2. Keep the branch scoped to one fix, feature, or documentation change.
3. Open a pull request against `main`.
4. Fill in the PR template completely.
5. Link the issue with `Closes #<issue-number>`.
6. Run the relevant tests and list the exact commands in the PR.
7. Wait for maintainer review and address feedback with follow-up commits.

Review expectations:

- Documentation-only changes should still be checked for command accuracy and broken links.
- Code changes should include tests or explain why test coverage was not added.
- UI changes should include screenshots or a short recording.
- Breaking changes must be called out explicitly in the PR body.

Minimum checklist before requesting review:

- [ ] Code compiles or the changed docs reference working commands
- [ ] Tests added or updated when behavior changed
- [ ] Linting and formatting pass
- [ ] Relevant docs were updated
- [ ] No breaking changes, or they are clearly documented

## Finding a First Issue

Use GitHub labels to find a good starting point:

| Label              | What it usually means                                    |
| ------------------ | -------------------------------------------------------- |
| `good-first-issue` | Beginner-friendly tasks with a clear path to completion  |
| `documentation`    | Docs cleanups, onboarding, examples, and guides          |
| `frontend`         | Next.js UI, accessibility, and interaction work          |
| `backend`          | API, services, Prisma, and operational tooling           |
| `smart-contract`   | Rust and Soroban work                                    |
| `testing`          | Unit, integration, accessibility, or end-to-end coverage |

Useful searches:

- Good first issues: `https://github.com/barry01-hash/stellar-trust-escrow/issues?q=is%3Aopen+is%3Aissue+label%3A%22good-first-issue%22`
- Documentation issues: `https://github.com/barry01-hash/stellar-trust-escrow/issues?q=is%3Aopen+is%3Aissue+label%3Adocumentation`
- Help wanted: `https://github.com/barry01-hash/stellar-trust-escrow/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22`

If you want an issue, leave a comment so maintainers know it is in progress.

## OS Notes

- Linux and macOS: native setup is straightforward.
- Windows: use PowerShell for npm and Docker commands. Install Visual Studio Build Tools for native Rust builds, or use WSL if you want Linux-style contract tooling and bash-based helper scripts like `scripts/test-contract.sh`.
- Docker Desktop works well for local Postgres on all three platforms.

## Troubleshooting

### `npm ci` fails early

Make sure you are on Node 18+ and rerun from the repository root.

### Prisma cannot connect

Confirm Docker Postgres is running:

```bash
docker compose ps postgres
```

Then verify `DATABASE_URL` and `DIRECT_URL` both point at the same local instance unless you intentionally use separate pooled and direct connections.

### Rust contract builds fail on Windows

Install Visual Studio Build Tools with the C++ workload, or run the Rust contract commands inside WSL.

### Frontend cannot reach the backend

Check that:

- backend is running on port `4000`
- `NEXT_PUBLIC_API_URL=http://localhost:4000`
- `ALLOWED_ORIGINS` includes `http://localhost:3000`

### Playwright tests fail before opening a browser

Install browsers first:

```bash
cd frontend
npx playwright install --with-deps chromium firefox
```

Questions are welcome in the issue tracker or pull request discussion. Small first contributions are absolutely fine.
