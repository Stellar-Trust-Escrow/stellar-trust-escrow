# Soroban Testnet Deployment Guide

This guide walks through deploying all four `stellar-trust-escrow` contracts
to the Stellar testnet using the Soroban CLI.

Contracts covered:
- `escrow_contract` — core milestone escrow
- `escrow_extensions` — batch creation, fees, arbitration, upgrades
- `governance` — on-chain proposal voting
- `insurance_contract` — insurance fund

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Fund a Testnet Account](#fund-a-testnet-account)
4. [Build WASM Artifacts](#build-wasm-artifacts)
5. [Deploy Each Contract](#deploy-each-contract)
   - [escrow_contract](#escrow_contract)
   - [escrow_extensions](#escrow_extensions)
   - [governance](#governance)
   - [insurance_contract](#insurance_contract)
6. [Verify Deployment](#verify-deployment)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

**Soroban CLI** (includes `stellar` binary):

```bash
cargo install --locked stellar-cli --features opt
# Verify:
stellar --version
```

**Rust + wasm32 target:**

```bash
rustup target add wasm32-unknown-unknown
```

**Workspace:** clone the repo and `cd` into the root.

---

## Environment Variables

Set these before running any CLI commands:

```bash
# Stellar testnet RPC endpoint
export SOROBAN_RPC_URL="https://soroban-testnet.stellar.org"

# Testnet network passphrase (do not change)
export SOROBAN_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# Your deployer secret key (G... public key, S... secret key)
export STELLAR_SECRET_KEY="SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# Derive the public key for use in --source arguments
export ADMIN_ADDRESS=$(stellar keys address "$STELLAR_SECRET_KEY")
```

Alternatively, add a named network to the CLI config:

```bash
stellar network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

Then use `--network testnet` instead of the full `--rpc-url` flag.

---

## Fund a Testnet Account

Testnet accounts need XLM to pay transaction fees. Use Friendbot:

```bash
curl "https://friendbot.stellar.org?addr=$ADMIN_ADDRESS"
# Expected response: { "hash": "...", ... }
```

Verify the balance:

```bash
stellar account show "$ADMIN_ADDRESS" --network testnet
# Look for: "balance": "10000.0000000 XLM"
```

---

## Build WASM Artifacts

The workspace `Cargo.toml` uses `[profile.release]` with `opt-level = "z"`
and `lto = true` for minimal WASM size. Build all contracts:

```bash
stellar contract build
# Outputs to: target/wasm32-unknown-unknown/release/*.wasm
```

To build a single contract:

```bash
stellar contract build --package stellar-trust-escrow-contract
stellar contract build --package stellar-trust-escrow-extensions
stellar contract build --package stellar-trust-governance
stellar contract build --package stellar-trust-insurance-contract
```

---

## Deploy Each Contract

Each deployment is two steps: **upload** the WASM (stores the bytecode
on-chain and returns a hash), then **deploy** a contract instance from
that hash.

### escrow_contract

**Upload:**

```bash
ESCROW_WASM_HASH=$(stellar contract upload \
  --source "$STELLAR_SECRET_KEY" \
  --network testnet \
  --wasm target/wasm32-unknown-unknown/release/stellar_trust_escrow_contract.wasm)
echo "Escrow WASM hash: $ESCROW_WASM_HASH"
```

**Deploy:**

```bash
ESCROW_CONTRACT=$(stellar contract deploy \
  --source "$STELLAR_SECRET_KEY" \
  --network testnet \
  --wasm-hash "$ESCROW_WASM_HASH")
echo "Escrow contract ID: $ESCROW_CONTRACT"
```

**Initialize:**

```bash
stellar contract invoke \
  --id "$ESCROW_CONTRACT" \
  --source "$STELLAR_SECRET_KEY" \
  --network testnet \
  -- initialize \
  --admin "$ADMIN_ADDRESS"
```

---

### escrow_extensions

**Upload and deploy:**

```bash
EXT_WASM_HASH=$(stellar contract upload \
  --source "$STELLAR_SECRET_KEY" \
  --network testnet \
  --wasm target/wasm32-unknown-unknown/release/stellar_trust_escrow_extensions.wasm)

EXT_CONTRACT=$(stellar contract deploy \
  --source "$STELLAR_SECRET_KEY" \
  --network testnet \
  --wasm-hash "$EXT_WASM_HASH")
echo "Extensions contract ID: $EXT_CONTRACT"
```

**Initialize** (fee_bps = 100 = 1%):

```bash
stellar contract invoke \
  --id "$EXT_CONTRACT" \
  --source "$STELLAR_SECRET_KEY" \
  --network testnet \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --fee_bps 100
```

---

### governance

**Upload and deploy:**

```bash
GOV_WASM_HASH=$(stellar contract upload \
  --source "$STELLAR_SECRET_KEY" \
  --network testnet \
  --wasm target/wasm32-unknown-unknown/release/stellar_trust_governance.wasm)

GOV_CONTRACT=$(stellar contract deploy \
  --source "$STELLAR_SECRET_KEY" \
  --network testnet \
  --wasm-hash "$GOV_WASM_HASH")
echo "Governance contract ID: $GOV_CONTRACT"
```

**Initialize** (replace `$GOV_TOKEN` with your governance token SAC address):

```bash
stellar contract invoke \
  --id "$GOV_CONTRACT" \
  --source "$STELLAR_SECRET_KEY" \
  --network testnet \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --token "$GOV_TOKEN" \
  --proposal_threshold 1000000000 \
  --voting_delay 3600 \
  --voting_period 604800 \
  --timelock_delay 172800 \
  --quorum_bps 400 \
  --approval_threshold_bps 5100
```

---

### insurance_contract

**Upload and deploy:**

```bash
INS_WASM_HASH=$(stellar contract upload \
  --source "$STELLAR_SECRET_KEY" \
  --network testnet \
  --wasm target/wasm32-unknown-unknown/release/stellar_trust_insurance_contract.wasm)

INS_CONTRACT=$(stellar contract deploy \
  --source "$STELLAR_SECRET_KEY" \
  --network testnet \
  --wasm-hash "$INS_WASM_HASH")
echo "Insurance contract ID: $INS_CONTRACT"
```

**Initialize** (replace `$PAYMENT_TOKEN` with the accepted token SAC):

```bash
stellar contract invoke \
  --id "$INS_CONTRACT" \
  --source "$STELLAR_SECRET_KEY" \
  --network testnet \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --token "$PAYMENT_TOKEN" \
  --min_contribution 10 \
  --claim_cap 10000 \
  --quorum 2
```

---

## Verify Deployment

### escrow_contract

```bash
# Should return 0 on a fresh deployment
stellar contract invoke \
  --id "$ESCROW_CONTRACT" \
  --network testnet \
  -- escrow_count

# Should return false (not paused)
stellar contract invoke \
  --id "$ESCROW_CONTRACT" \
  --network testnet \
  -- is_paused
```

### escrow_extensions

```bash
# Should return 0
stellar contract invoke \
  --id "$EXT_CONTRACT" \
  --network testnet \
  -- batch_escrow_count

# Should return 100 (the fee_bps set during initialize)
stellar contract invoke \
  --id "$EXT_CONTRACT" \
  --network testnet \
  -- get_fee_bps
```

### governance

```bash
# Should return 0
stellar contract invoke \
  --id "$GOV_CONTRACT" \
  --network testnet \
  -- proposal_count
```

### insurance_contract

```bash
# Should return { total_contributed: 0, current_balance: 0, ... }
stellar contract invoke \
  --id "$INS_CONTRACT" \
  --network testnet \
  -- get_fund_info
```

---

## Troubleshooting

### `WasmHashNotFound`

The WASM hash passed to `deploy` does not exist on-chain.

**Fix:** Re-run the `upload` step and use the returned hash. Hashes are
network-specific — a hash uploaded to testnet cannot be used on mainnet.

### `InsufficientBalance` / `tx_insufficient_balance`

Your account does not have enough XLM to pay fees.

**Fix:** Fund via Friendbot (testnet only):
```bash
curl "https://friendbot.stellar.org?addr=$ADMIN_ADDRESS"
```

### `AlreadyInitialized` (error 1)

`initialize` was called twice on the same contract instance.

**Fix:** Deploy a new contract instance (new `stellar contract deploy`).
Each deployed instance has its own storage.

### `Auth` / `InvalidSignature`

The `--source` key does not match the `--caller` / `--admin` argument,
or the transaction was not signed.

**Fix:** Ensure `$STELLAR_SECRET_KEY` corresponds to `$ADMIN_ADDRESS`.
The CLI signs automatically when `--source` is a secret key.

### `HostError: Error(Contract, #8)` — `EscrowNotFound`

Calling a function on an escrow ID that does not exist.

**Fix:** Verify the escrow ID with `escrow_count` and use a valid ID.

### Contract ID not found / `simulate` fails

The contract ID is wrong or the contract was deployed to a different network.

**Fix:** Confirm `--network testnet` is set and the contract ID was
captured from the correct `stellar contract deploy` output.

### WASM too large

Soroban has a WASM size limit. The `[profile.release]` settings in
`Cargo.toml` (`opt-level = "z"`, `lto = true`, `strip = "symbols"`)
minimize size. If you hit the limit, ensure you are building with
`--release` and not `--debug`.

```bash
# Check WASM size
wc -c target/wasm32-unknown-unknown/release/stellar_trust_escrow_contract.wasm
```
