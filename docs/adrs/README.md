# ADR Process (Architecture Decision Records)

## What are ADRs?

Architecture Decision Records are lightweight documents that capture important architectural decisions in the project. They use the [MADR format](https://adr.github.io/madr/) for clarity and consistency.

## Status Values
- **proposed**: Under discussion
- **accepted**: Decision approved and implemented
- **deprecated**: Superseded by newer decision 
- **superseded**: Replaced by another ADR (references replacement)

## Active ADRs

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001-soroban-rust-contracts](./ADRs/001-soroban-rust-contracts.md) | Use Soroban/Rust Smart Contracts | accepted | 2024 |
| [002-prisma-postgresql-indexer](./ADRs/002-prisma-postgresql-indexer.md) | Prisma + PostgreSQL with Off-chain Indexer | accepted | 2024 |
| [003-nodejs-express-backend](./ADRs/003-nodejs-express-backend.md) | Node.js Express Backend | accepted | 2024 |
| [004-nextjs-freighter-frontend](./ADRs/004-nextjs-freighter-frontend.md) | Next.js + Freighter Wallet Frontend | accepted | 2024 |
| [005-ipfs-metadata](./ADRs/005-ipfs-metadata.md) | IPFS for Off-chain Metadata | accepted | 2024 |

## Process
1. Copy `template.md` to `docs/adrs/ADRs/NNN-title.md` (increment NNN).
2. Fill template with Context, Decision, Consequences, Tradeoffs.
3. Create PR with label `adr`, assign reviewers.
4. Reference new ADR in PR description.
5. Merge PR → update status to 'accepted'.
6. Link from this README.

Superseded ADRs are retained for history but marked.

See [template.md](template.md) for format.

