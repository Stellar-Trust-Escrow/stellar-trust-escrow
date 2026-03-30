# ADR 004: Next.js Frontend + Freighter Wallet

**Status**: accepted

## Context
Web app for escrow creation/management. Needs SSR for SEO/explorer, wallet integration for tx signing.

## Decision
Next.js 14 App Router. Tailwind UI. Freighter as Stellar wallet (sign+submit tx). Components for escrows/milestones.

## Consequences
* **Good**: SSR/SSG for perf/SEO, React ecosystem.
* **Neutral**: Bundle size (tree-shake).
* **Bad**: Client-side wallet limits non-custodial.

## Tradeoffs
| Next.js + Freighter | Pure React + Albedo |
|---------------------|---------------------|
| SSR/SEO | Custom wallet UX |
| Mature React | Stellar-specific |

**References**:
* [ARCHITECTURE.md#frontend-layer](ARCHITECTURE.md)

**Signed**: architecture-team 2024

