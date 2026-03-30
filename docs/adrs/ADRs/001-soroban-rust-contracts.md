# ADR 001: Use Soroban/Rust Smart Contracts on Stellar Network

**Status**: accepted

## Context
Escrow platform needs secure, auditable smart contracts for fund locking/release. Stellar network chosen for native asset support (XLM, USDC), low fees, fast finality. Alternatives: EVM chains (Solidity).

## Decision
Build core escrow logic in single Soroban contract using Rust WASM. EscrowState with milestones, reputation. Client/freelancer sign tx via Freighter → Stellar → events indexed off-chain.

## Consequences
* **Good**: Native Stellar assets, 5s finality, ~0.00001 XLM fees. Built-in DEX/oracles.
* **Neutral**: Rust learning curve, but strong type safety.
* **Bad**: Smaller dev ecosystem vs Ethereum.

## Tradeoffs
| Soroban/Rust | Solidity/EVM |
|--------------|--------------|
| Stellar-native assets | Multi-chain tokens easy |
| Predictable gas (ledger slots) | Gas auctions, MEV |
| 5s finality | 12s+ |
| Low fees | High |
| Smaller tooling | Mature (Hardhat, Foundry) |

**References**:
* [ARCHITECTURE.md#smart-contract-layer](ARCHITECTURE.md)
* [escrow_contract/](../contracts/escrow_contract/)

**Signed**: architecture-team 2024

