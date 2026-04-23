# ADR 005: IPFS for Off-chain Metadata Storage

**Status**: accepted

## Context
Escrow/milestone descriptions too large for on-chain. Need decentralized, tamper-proof storage.

## Decision
IPFS CID hashes stored on-chain (BytesN<32>). Frontend resolves via gateway/public pinning.

## Consequences
* **Good**: Decentralized, cheap storage.
* **Neutral**: Gateway dependency.
* **Bad**: Resolution latency.

## Tradeoffs
| IPFS | Centralized S3 |
|------|----------------|
| Decentralized | Faster/more reliable |
| Tamper-proof | Custodial |

**References**:
* Contract: `metadata_hash: BytesN<32>`

**Signed**: architecture-team 2024

