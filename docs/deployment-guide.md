# Deployment Guide

This document describes the CI/CD pipeline for deploying Soroban smart contracts
to Stellar testnet and mainnet.

## Overview

The pipeline automates building, optimizing, installing, deploying, and verifying
Soroban contracts. It consists of two GitHub Actions workflows:

| Workflow | Trigger | Environment | Approval Gate |
|----------|---------|-------------|---------------|
| `deploy-testnet.yml` | Push to `develop` | Testnet | None (automated) |
| `deploy-mainnet.yml` | `workflow_dispatch` | Mainnet | 2-of-3 maintainer approval |

## Contracts Deployed

The pipeline deploys three Soroban contracts in sequence:

| Logical Name | Package Name | WASM Output |
|-------------|--------------|-------------|
| `escrow` | `escrow_contract` | `escrow_contract.wasm` |
| `insurance` | `stellar-trust-insurance-contract` | `stellar_trust_insurance_contract.wasm` |
| `governance` | `stellar-trust-governance` | `stellar_trust_governance.wasm` |

## Testnet Deployment

### Trigger

Any push to the `develop` branch automatically triggers the testnet deployment.

### Pipeline Steps

1. **Checkout** — Pulls the latest code from `develop`.
2. **Install Rust & Soroban CLI** — Sets up the Wasm compilation toolchain.
3. **Build** — Compiles all three contracts with `--release --target wasm32-unknown-unknown`.
4. **Optimize** — Runs `soroban contract optimize` on each WASM blob to reduce size.
5. **Deploy** — For each contract (sequentially):
   - `soroban contract install` — Uploads the WASM to Stellar testnet.
   - `soroban contract deploy` — Creates a new contract instance.
   - Invokes `version()` to capture the deployed version.
6. **Verify** — Calls `version()` on each deployed address to confirm the contract is live.
7. **Write Manifest** — Writes addresses and WASM hashes to `deployments/testnet.json`.
8. **Commit Manifest** — Commits the updated manifest with `[skip ci]` in the message
   to prevent re-triggering the workflow.
9. **Summary** — Posts a deployment summary table as a GitHub Actions step summary.

### Failure Behaviour

- Contracts deploy **sequentially** (not in parallel).
- If **any single contract fails** to install or deploy, the pipeline stops immediately.
- The failing contract name and error are emitted as a GitHub Actions annotation.
- Subsequent contracts are **not deployed**.

## Mainnet Deployment

### Trigger

Mainnet deployments are **manual only** via `workflow_dispatch` in the GitHub UI.

### Approval Gate

The `mainnet` GitHub Environment is configured with **required reviewers**:

- **Reviewers:** 3 designated maintainers
- **Required approvals:** 2

This means at least 2 of the 3 maintainers must approve the deployment before
it can proceed. The deployment will be queued until the approval threshold is met.

### Confirmation

Before execution, the workflow requires typing `deploy` in the `confirm` input field
as a safety check against accidental triggers.

### Pipeline Steps

Identical to testnet deployment, except:

- Uses mainnet RPC URL and network passphrase
- Signs with the mainnet deploy secret key
- Writes to `deployments/mainnet.json`
- Post-deploy verification can be skipped via the `skip_verify` input (emergency use only)

## Deployment Manifest

After each successful deployment, a versioned manifest is written to the
`deployments/` directory:

### `deployments/testnet.json`

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "network": "testnet",
  "commit": "abc1234",
  "contracts": {
    "escrow": {
      "address": "C...",
      "wasmHash": "abc...",
      "version": 2
    },
    "insurance": {
      "address": "C...",
      "wasmHash": "def...",
      "version": 1
    },
    "governance": {
      "address": "C...",
      "wasmHash": "ghi...",
      "version": 1
    }
  }
}
```

### `deployments/mainnet.json`

Same structure with `"network": "mainnet"`.

## Secrets Configuration

The following secrets must be configured in the GitHub repository:

| Secret | Description | Used By |
|--------|-------------|---------|
| `TESTNET_DEPLOY_SECRET` | Stellar account secret key for testnet deploys | Testnet workflow |
| `MAINNET_DEPLOY_SECRET` | Stellar account secret key for mainnet deploys | Mainnet workflow |
| `SOROBAN_RPC_TESTNET_URL` | Soroban RPC URL for Stellar testnet | Testnet workflow |
| `SOROBAN_RPC_MAINNET_URL` | Soroban RPC URL for Stellar mainnet | Mainnet workflow |

### Setting up secrets

1. Go to **Settings → Secrets and variables → Actions** in the GitHub repository.
2. Click **New repository secret** for each secret above.
3. Generate a Stellar keypair for each environment:
   ```bash
   # For testnet
   soroban keys generate testnet-deployer --network testnet
   soroban keys fund testnet-deployer --network testnet

   # For mainnet (fund manually with real XLM)
   soroban keys generate mainnet-deployer --network mainnet
   ```
4. Export the secret key and add it to GitHub Secrets:
   ```bash
   soroban keys show testnet-deployer
   # Copy the secret key (S...) to TESTNET_DEPLOY_SECRET
   ```

## Setting up the Mainnet Environment

1. Go to **Settings → Environments** in the GitHub repository.
2. Click **New environment** and name it `mainnet`.
3. Under **Required reviewers**, add 3 maintainer GitHub usernames.
4. Set **Required reviewers count** to `2`.

## Manual Deployment

### Testnet (via CI)

Push to `develop` — deployment is automatic.

### Mainnet (via CI)

1. Go to **Actions → Deploy to Mainnet → Run workflow**.
2. Select the branch (usually `main` or `master`).
3. Type `deploy` in the confirm field.
4. Wait for 2 of the 3 designated maintainers to approve.
5. The workflow runs automatically once approved.

## Local Deployment

For testing or emergency deployments, you can use the reusable scripts directly:

```bash
# Build and deploy a single contract
bash scripts/deploy-contract.sh escrow \
  target/wasm32-unknown-unknown/release/escrow_contract.wasm \
  --secret "$SECRET_KEY" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "Test SDF Network ; September 2015" \
  --optimize

# Verify a deployed contract
bash scripts/verify-deployment.sh escrow "C..." \
  --rpc-url "$RPC_URL" \
  --network-passphrase "Test SDF Network ; September 2015"
```

### Prerequisites

- Rust with `wasm32-unknown-unknown` target
- Soroban CLI (`cargo install soroban-cli --features opt`)
- A funded Stellar account

## Rollback

To roll back a deployment:

1. **If the manifest was committed:** Revert the manifest commit:
   ```bash
   git revert <manifest-commit-hash>
   git push
   ```

2. **If the contract needs a previous version:** Rebuild from the previous commit
   and initiate a new deployment.

3. **For on-chain upgrades:** Use the contract's `upgrade()` entry point (if available)
   with the previous WASM hash.

> **Note:** Deploying a contract creates a new address. For upgrades that preserve
> state, use the contract's built-in upgrade mechanism rather than a fresh deploy.
