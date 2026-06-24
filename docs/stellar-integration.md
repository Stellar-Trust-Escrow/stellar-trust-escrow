# Stellar Integration Guide

A developer-focused reference for how this project connects to the Stellar blockchain and Soroban smart contract platform.

---

## Stellar concepts for Web2 developers

Stellar is a Layer-1 blockchain — a public, decentralised ledger with no central operator.

**Accounts** are Ed25519 keypairs. The public key is your on-chain identity and always starts with `G` (e.g. `GABC...XYZ`). There is no registration step; an account exists on the network as soon as it receives a minimum balance.

**Transactions** are atomic bundles of one or more operations (payment, contract call, etc.) assembled and _signed off-chain_, then broadcast to the network. If any operation in the bundle fails, the whole transaction is rejected — nothing is partially applied.

**Fees** are tiny compared to Ethereum. The base fee is 100 stroops (0.00001 XLM) per operation. There is no gas auction; fees are predictable.

**Soroban** is Stellar's smart contract platform. Contracts are written in Rust and compiled to WebAssembly, then deployed on-chain. This project's escrow logic lives in `contracts/escrow_contract/`.

### Contrast with traditional Web2

| Web2 assumption | Stellar reality |
|---|---|
| A server holds your money | Funds are locked in a contract on a public ledger — no company can freeze or redirect them |
| State changes can be rolled back by an admin | On-chain state transitions are irreversible once confirmed |
| Accounts are free to create | Every Stellar account requires a minimum balance (1 XLM base reserve) to exist on the network |
| You authenticate with a password | You prove ownership by signing a transaction with your private key |

---

## The role of Horizon API

Horizon is the REST API gateway for Stellar, maintained by the Stellar Development Foundation. It indexes the ledger and exposes endpoints for querying accounts, transactions, operations, and effects.

In this project, `STELLAR_HORIZON_URL` points to a Horizon instance. The backend uses it for:

- Account lookups (checking that a Stellar address exists before creating an escrow)
- Balance checks (confirming sufficient XLM / token balance)

**Horizon is NOT used for Soroban smart contract calls.** Contract invocations — `simulateTransaction`, `sendTransaction`, reading contract state — all go through the Soroban RPC endpoint.

---

## What is Soroban RPC

The Soroban RPC is a JSON-RPC endpoint that understands WebAssembly smart contracts. Key methods:

| Method | Purpose |
|---|---|
| `simulateTransaction` | Dry-run a contract call; returns footprint + fee estimate |
| `sendTransaction` | Broadcast a signed transaction to the network |
| `getTransaction` | Poll for the result of a submitted transaction |
| `getEvents` | Fetch contract events emitted in a ledger range |
| `getLatestLedger` | Return the current ledger sequence number |

`SOROBAN_RPC_URL` in `.env` configures which endpoint is used. The backend's `stellarClient.js` wraps `SorobanRpc.Server` from `@stellar/stellar-sdk` and adds multi-endpoint failover on top (see [Multi-endpoint failover](#multi-endpoint-failover-horizon_endpoints) below).

---

## Testnet vs Mainnet configuration

Testnet:

```env
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

Mainnet:

```env
STELLAR_NETWORK=mainnet
SOROBAN_RPC_URL=https://soroban-rpc.mainnet.stellar.gateway.fm
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
```

> **Warning — network passphrase.** The passphrase is embedded in every transaction signature. Signing a transaction with the testnet passphrase and submitting it to mainnet (or vice versa) makes the transaction cryptographically invalid on the target network. `stellarClient.js` auto-selects the correct passphrase based on `STELLAR_NETWORK === 'mainnet'` — never hard-code it elsewhere.

---

## Creating and funding a testnet account with Friendbot

```bash
# 1. Generate a keypair
soroban keys generate --global my-account --network testnet

# Show the public key
soroban keys address my-account

# 2. Fund via Friendbot (testnet only — gives 10,000 XLM)
curl "https://friendbot.stellar.org?addr=$(soroban keys address my-account)"

# 3. Verify the account exists
curl https://horizon-testnet.stellar.org/accounts/<YOUR_PUBLIC_KEY> | jq .balances
```

Friendbot is **testnet-only**. On mainnet you must acquire XLM through an exchange and send it to the new account address to activate it.

---

## Multi-endpoint failover (HORIZON_ENDPOINTS)

`HORIZON_ENDPOINTS` accepts a comma-separated list of Soroban RPC URLs:

```env
HORIZON_ENDPOINTS=https://soroban-testnet.stellar.org,https://rpc-futurenet.stellar.org
```

The client tries the primary endpoint first and falls back to backups on timeout or error. Failover behaviour:

- A node is deprioritised after **3 consecutive failures**
- It re-enters rotation after `NODE_RECOVERY_WINDOW_MS` (default: 5 minutes)
- Passive health checks run every `HEALTH_CHECK_INTERVAL_MS` (default: 60 seconds)

This keeps the backend resilient to individual RPC node outages without manual intervention.

---

## How the backend listens for on-chain events

`eventIndexer.js` polls `getContractEvents()` on an interval (`INDEXER_POLL_INTERVAL_MS`, default 5000 ms). It tracks progress with a `lastProcessedLedger` cursor stored in the `IndexerState` database table, so restarts resume exactly where they left off.

Each batch of events is processed inside a Prisma transaction. After the DB writes commit, webhook deliveries and WebSocket broadcasts are fired.

### Event → DB mapping

| Event | DB action |
|---|---|
| `esc_crt` | INSERT escrows |
| `mil_add` | INSERT milestones |
| `mil_sub` / `mil_apr` / `mil_rej` | UPDATE milestone.status |
| `funds_rel` | Decrement escrow.remaining_balance |
| `dis_rai` / `dis_res` | INSERT/UPDATE disputes |
| `rep_upd` | UPSERT reputation_records |

---

## Verify your Stellar connection

```bash
# Check Soroban RPC is reachable
curl -s https://soroban-testnet.stellar.org \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger","params":{}}' | jq .result.sequence

# Expected output: a ledger sequence number, e.g. 54321
# If you get a connection error, check SOROBAN_RPC_URL in your .env

# Check Horizon is reachable
curl -s https://horizon-testnet.stellar.org | jq .horizon_version

# Check your contract is deployed
soroban contract invoke \
  --network testnet \
  --id $CONTRACT_ADDRESS \
  -- get_admin
```
