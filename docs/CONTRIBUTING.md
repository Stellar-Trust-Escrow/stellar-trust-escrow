# 🤝 Contributing to StellarTrustEscrow

Thank you for your interest in contributing! This guide provides a **15-minute path from clone to first PR**. Whether you're fixing a typo or implementing a smart contract feature, we welcome all contributions.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [15-Minute Quickstart](#15-minute-quickstart)
- [Development Workflow](#development-workflow)
- [Testing All Layers](#testing-all-layers)
- [Code Style & Linting](#code-style--linting)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Finding Issues](#finding-issues)
- [Development on Multiple OS](#development-on-multiple-os)
- [Troubleshooting](#troubleshooting)

## Prerequisites {#prerequisites}

| Tool | Version | Install Command | Notes |
|------|---------|-----------------|-------|
| [Docker](https://docker.com) | Latest | Platform-specific | Recommended for local dev (1 command to run everything) |
| [Node.js](https://nodejs.org) | >= 18 | `nvm install 18` or installer | Use nvm for version management |
| [Rust](https://rustup.rs) | >= 1.74 | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` | Add WASM target: `rustup target add wasm32-unknown-unknown` |
| [Soroban CLI](https://soroban.stellar.org/docs/getting-started/quickstart) | >= 21.0 | `cargo install --locked --force soroban-cli` | Stellar smart contracts |
| [PostgreSQL](https://postgresql.org) | >= 14 | `brew install postgresql` (macOS) \| Docker | Local DB |
| [Git](https://git-scm.com) | Latest | Platform-specific | Fork & clone ready |
| [Freighter Wallet](https://freighter.app) | Latest | Browser extension | Test wallet connections |

**💡 Pro Tip:** Docker covers Node/Rust/Postgres/Soroban in one command. Install Docker first for fastest setup.

## 15-Minute Quickstart {#15-minute-quickstart}

```bash
# 1. Clone (30s)
git clone https://github.com/Stellar-Trust-Escrow/stellar-trust-escrow.git
cd stellar-trust-escrow

# 2. Start everything with Docker (2min)
docker compose up -d  # postgres:5432, backend:4000, frontend:3000

# 3. Backend setup in new terminal (1min)
cd backend
cp .env.example .env  # Edit DATABASE_URL=postgresql://user:password@localhost:5432/stellar_escrow
npx prisma migrate dev --name init
npx prisma generate

# 4. Build contracts (1min)  
cd ../../contracts/escrow_contract
cargo build --release --target wasm32-unknown-unknown

# 5. Frontend in new terminal (30s)
cd ../../frontend
cp .env.example .env.local  # Edit NEXT_PUBLIC_API_URL=http://localhost:4000

# 6. Visit app! 🎉
open http://localhost:3000
```

**Total: ~5 minutes.** You're running the full stack!

## Development Workflow {#development-workflow}

```bash
# Fork on GitHub → clone YOUR fork
git clone https://github.com/YOUR_USERNAME/stellar-trust-escrow

# Create feature branch
git checkout -b docs/improve-onboarding-guide

# Make changes + test
npm test  # All layers
npm run lint && npm run format

# Commit & push
git add .
git commit -m "docs: add Docker quickstart section"
git push origin docs/improve-onboarding-guide
```

## Testing All Layers {#testing-all-layers}

Run from project root. All commands work with `docker compose up -d`.

### Smart Contracts (Rust/Soroban)
```bash
cd contracts/escrow_contract
cargo test          # Unit tests
cargo test --release --target wasm32-unknown-unknown  # WASM tests
```

### Backend (Node.js/Jest)
```bash
cd backend
npm test                    # All tests
npm run test:chaos          # Chaos/resilience tests
npx prisma migrate:status   # DB migrations
```

### Frontend (Next.js/Jest+Playwright)
```bash
cd frontend
npm run test:unit           # React components
npm run test:integration    # Pages/routing
npm run test:a11y           # Accessibility
npm run test:e2e            # End-to-end (Playwright)
npm run test:e2e:ui         # E2E with UI mode
npm run test:coverage       # Coverage report
```

### Full Stack
```bash
npm test  # Root workspace runs backend + frontend
```

**85%+ coverage required for new features.**

## Code Style & Linting {#code-style--linting}

**Pre-commit hooks auto-run** (Husky + lint-staged):

- **Rust**: `cargo fmt && cargo clippy -- -D warnings`
- **JS/TS**: `eslint --fix && prettier --write`
- **Contracts**: `solhint \"contracts/**/*.sol\"` (Solidity extensions)

Manual:
```bash
npm run lint      # ESLint all files
npm run format    # Prettier format
npm run lint:fix  # Auto-fix lint issues
```

Configs: [eslint.config.js](eslint.config.js), [.prettierrc](.prettierrc)

**Rules summary:**
- Single quotes, trailing commas, 100-char lines
- No unused vars (except `_`)
- JSDoc for public functions/components
- `async/await` over promises
- Functional React components + hooks

## Commit Messages {#commit-messages}

[Conventional Commits](https://conventionalcommits.org):

```
feat(backend): add milestone approval endpoint
fix(frontend): wallet connection error handling
docs(readme): update Docker instructions
test(contract): add dispute resolution tests
refactor(services): extract IPFS utils
chore(deps): bump prisma to 5.0.0
```

**Scopes:** `contract|backend|frontend|api|db|docs|test|scripts`

## Pull Request Process {#pull-request-process}

1. **Small & focused**: 1 feature/fix per PR
2. **PR Template** auto-loads → fill checklist
3. **Link issue**: `Closes #123`
4. **CI passes**: Tests/lint/Docker build
5. **1 approval** → auto-merge (or squash & merge)

**PR Checklist:**
- [ ] Tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Docker builds (`docker compose up --build`)
- [ ] No breaking changes (or documented)
- [ ] Updated docs if needed

Example [PR template](.github/pull_request_template.md).

## Finding Issues {#finding-issues}

GitHub labels guide you:

| Label | Description | Est. Time |
|-------|-------------|-----------|
| `good-first-issue` | Perfect for newcomers | 30min–2h |
| `documentation` | Fix typos/add guides | 15–60min |
| `test` | Add unit/integration tests | 1–3h |
| `frontend` | UI/UX improvements | 2–8h |

[Good first issues](https://github.com/Stellar-Trust-Escrow/stellar-trust-escrow/issues?q=is%3Aopen+is%3Aissue+label%3A%22good-first-issue%22)

**Claim issues**: Comment `/claim` or `I'd like to work on this`.

## Development on Multiple OS {#development-on-multiple-os}

| OS | Notes |
|----|-------|
| **Linux/macOS** | Native support, fastest |
| **Windows** | Use WSL2 + Docker Desktop. Run `wsl --install` if needed |
| **macOS (M1/M2)** | Docker works natively. Rosetta not needed |

Tested on Ubuntu 22.04, macOS Ventura, Windows 11 WSL2.

## Troubleshooting {#troubleshooting}

| Issue | Solution |
|-------|----------|
| Docker ports busy | `docker compose down -v && docker compose up -d` |
| Prisma migrate fails | `docker compose exec postgres psql -U user stellar_escrow` |
| Cargo WASM fail | `rustup target add wasm32-unknown-unknown` |
| Tests timeout | `docker compose logs backend` |
| Frontend API 404 | Check `NEXT_PUBLIC_API_URL=http://localhost:4000` |

**Questions?** [@Stellar-Trust-Escrow Discussions](https://github.com/Stellar-Trust-Escrow/stellar-trust-escrow/discussions) or comment on issues.

---

**Happy contributing! 🚀**

