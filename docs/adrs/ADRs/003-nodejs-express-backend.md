# ADR 003: Node.js Express Backend API

**Status**: accepted

## Context
Read-heavy API for frontend: list escrows, profiles, reputation. Write ops client-signed (no backend keys).

## Decision
Express.js server with middleware (rate-limit, metrics, caching). Services for business logic. BullMQ queues for emails/webhooks.

## Consequences
* **Good**: JS fullstack (shared w/ frontend), vast ecosystem (Prisma, Sentry), easy scaling.
* **Neutral**: Single-threaded (use clusters).
* **Bad**: Not as performant as Go/Rust for CPU.

## Tradeoffs
| Node.js/Express | Go/FastAPI |
|-----------------|------------|
| Fullstack JS | Types/performance |
| Huge npm | Smaller ecosystem |
| Async I/O perfect | Compiled binary |

**References**:
* [server.js](../backend/server.js)
* [ARCHITECTURE.md#backend-layer](ARCHITECTURE.md)

**Signed**: architecture-team 2024

