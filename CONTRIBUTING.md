# 🤝 Contributing to StellarTrustEscrow

Thank you for your interest! This project is designed to be contributor-friendly at all levels — from fixing typos to implementing full contract features.

---

## 📋 Table of Contents

- [Finding an Issue](#finding-an-issue)
- [Development Setup](#development-setup)
- [Workflow](#workflow)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Issue Labels](#issue-labels)

---

## Finding an Issue

Browse by difficulty:

| Label              | Description                                 | Time Estimate |
| ------------------ | ------------------------------------------- | ------------- |
| `good-first-issue` | No prior blockchain knowledge needed        | 1–3 hours     |
| `easy`             | Small, well-defined tasks                   | 2–5 hours     |
| `medium`           | Feature work, requires reading the codebase | 1–2 days      |
| `hard`             | Complex features, architecture decisions    | 2–5 days      |
| `smart-contract`   | Soroban / Rust work                         | Varies        |
| `backend`          | Node.js / Express / DB work                 | Varies        |
| `frontend`         | Next.js / React / Tailwind                  | Varies        |
| `documentation`    | Docs, comments, guides                      | 1–3 hours     |
| `testing`          | Write or improve tests                      | 2–4 hours     |
| `security`         | Security review / hardening                 | Varies        |

**New to the project?** Start with [`good-first-issue`](../../issues?q=label%3Agood-first-issue) or [`documentation`](../../issues?q=label%3Adocumentation).

**Before starting:** Comment on the issue to claim it and avoid duplicate work.

---

## Development Setup

### Requirements

- Node.js >= 18
- Rust >= 1.74 + `wasm32-unknown-unknown` target
- Soroban CLI >= 21.0.0
- PostgreSQL >= 14

### Setup

```bash
git clone https://github.com/your-org/stellar-trust-escrow
cd stellar-trust-escrow

# Backend
cd backend && npm install && cp .env.example .env
# Edit .env with your local database URL

# Frontend
cd ../frontend && npm install && cp .env.example .env.local

# Smart contract
cd ../contracts/escrow_contract
rustup target add wasm32-unknown-unknown
cargo build
```

---

## Workflow

### Architecture Decisions (ADRs)
For significant technical decisions:

1. Copy `docs/adrs/template.md` → `docs/adrs/ADRs/NNN-short-title.md`
2. Fill Context/Decision/Tradeoffs
3. Create PR labeled `adr`
4. Reference in description: \`ADR: docs/adrs/ADRs/NNN-short-title.md\`
5. Update status to \`accepted\` on merge
6. Add to \`docs/adrs/README.md\` table

See [ADRs](docs/adrs/) for process.

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/stellar-trust-escrow

# 2. Create a branch from main
git checkout -b feat/escrow-milestone-approval
# or: fix/reputation-score-bug
# or: docs/improve-architecture
# or: adr/001-use-soroban

# 3. Make your changes

# 4. Test your changes
cd contracts/escrow_contract && cargo test
cd backend && npm test
cd frontend && npm test

# 5. Commit (see commit style below)
git add .
git commit -m "feat(contract): implement approve_milestone logic"

# 6. Push and open a PR
git push origin feat/escrow-milestone-approval
```

---

## Code Style

### Rust (Smart Contracts)

- Run `cargo fmt` before committing
- Run `cargo clippy -- -D warnings` and fix all warnings
- All public functions must have `///` doc comments
- Use `#[contracterror]` for all error types — no `panic!` in contract code

### JavaScript / TypeScript (Backend & Frontend)

- ESLint config is provided — run `npm run lint` before committing
- Prettier is configured — run `npm run format`
- Use `async/await` over `.then()` chains
- All API routes must have JSDoc comments

### React (Frontend)

- Functional components only
- Props should be typed with JSDoc `@param` or TypeScript interfaces
- Keep components small — extract logic into hooks

---

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(contract): implement release_funds logic
fix(backend): handle null reputation score
docs(readme): add deployment instructions
test(api): add escrow controller unit tests
refactor(frontend): extract wallet hook
style(contract): run cargo fmt
```

Scope options: `contract`, `backend`, `frontend`, `api`, `db`, `docs`, `scripts`

---

## Pull Request Process

1. **Fill out the PR template** — describe what you changed and why
2. **Link the issue** — use `Closes #42` in the description
3. **Keep PRs focused** — one feature or fix per PR
4. **Tests required** — new features need test coverage
5. **CI must pass** — all checks green before review
6. **One approval** — a maintainer will review within 48 hours

### PR Checklist

- [ ] Branch is up to date with `main`
- [ ] Tests pass (`cargo test` / `npm test`)
- [ ] Linting passes (`cargo clippy` / `npm run lint`)
- [ ] New functions have doc comments
- [ ] PR description references the issue

---

## Questions?

Open a [Discussion](../../discussions) or comment directly on any issue. No question is too basic!
