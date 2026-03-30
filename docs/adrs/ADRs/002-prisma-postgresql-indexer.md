# ADR 002: Prisma ORM + PostgreSQL with Off-chain Indexer

**Status**: accepted

## Context
Fast reads needed for UI (escrows, reputation). Direct RPC queries too slow/expensive. Need normalized data for search/pagination.

## Decision
PostgreSQL as primary store. Prisma ORM for schema/migrations. Dedicated indexer service polls Stellar events (EscrowCreated etc.), writes to DB. API queries DB.

## Consequences
* **Good**: Millisecond queries, full-text search, pagination. Prisma type-safety.
* **Neutral**: Eventual consistency (~5s lag).
* **Bad**: Dual-write complexity (contract + DB).

## Tradeoffs
| Off-chain Indexer | On-chain Queries |
|-------------------|------------------|
| Sub-100ms reads | 1-5s+ latency |
| Complex (indexer service) | Simple (no DB) |
| SQL analytics | No complex queries |
| Cost: DB | Cost: RPC calls |

**References**:
* [escrowIndexer.js](../backend/services/escrowIndexer.js)
* [schema.prisma](../backend/database/schema.prisma)

**Signed**: architecture-team 2024

