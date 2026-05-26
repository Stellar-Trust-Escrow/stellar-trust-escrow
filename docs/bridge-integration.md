# Wormhole Bridge Integration Guide

This guide explains how to register cross-chain wrapped tokens with
`stellar-trust-escrow` and use them inside escrow agreements.

The bridge subsystem lives in `contracts/escrow_contract/src/bridge.rs`
and is exposed through four public contract functions in `lib.rs`.

---

## Table of Contents

1. [Overview](#overview)
2. [Core Types](#core-types)
3. [Constants](#constants)
4. [Contract Functions](#contract-functions)
5. [WormholeBridgeInterface Trait](#wormholebridgeinterface-trait)
6. [Using a Bridged Token in an Escrow](#using-a-bridged-token-in-an-escrow)
7. [Finalization Requirement](#finalization-requirement)
8. [BridgeError (Error Code 54)](#bridgeerror-error-code-54)
9. [End-to-End CLI Walkthrough](#end-to-end-cli-walkthrough)

---

## Overview

Wormhole and Allbridge allow tokens from EVM chains (Ethereum, BNB Chain,
Polygon, etc.) to be represented on Stellar as Stellar Asset Contract (SAC)
addresses. Before such a wrapped token can be used as the payment token in
an escrow, the contract must:

1. Know the Wormhole bridge contract address on Stellar (`set_wormhole_bridge`).
2. Have the wrapped token registered with its origin-chain metadata (`register_wrapped_token`).
3. Have received enough on-chain confirmations that the bridge transfer is
   considered final (`update_bridge_confirmation` → `is_finalized = true`).

Only after all three steps will `validate_escrow_token` and
`require_bridge_finalized` allow the token to be used in `create_escrow`.

---

## Core Types

### BridgeProtocol

```rust
pub enum BridgeProtocol {
    Wormhole,
    Allbridge,
}
```

| Variant | Description |
|---------|-------------|
| `Wormhole` | Token bridged via the Wormhole protocol. The contract calls `WormholeBridgeInterface::is_wrapped_asset` to verify the token on-chain before registration. |
| `Allbridge` | Token bridged via Allbridge Core. Verification is performed off-chain; the admin registers the token manually. |

### WrappedTokenInfo

```rust
pub struct WrappedTokenInfo {
    pub stellar_address: Address,
    pub origin_chain: u16,
    pub origin_address: BytesN<32>,
    pub bridge: BridgeProtocol,
    pub is_approved: bool,
}
```

| Field | Type | Description |
|-------|------|-------------|
| `stellar_address` | `Address` | The SAC address callers pass as `token` in `create_escrow`. |
| `origin_chain` | `u16` | Wormhole chain ID (2 = Ethereum, 4 = BSC, 5 = Polygon, 6 = Avalanche). |
| `origin_address` | `BytesN<32>` | 32-byte zero-padded EVM address of the original token contract. |
| `bridge` | `BridgeProtocol` | `Wormhole` or `Allbridge`. |
| `is_approved` | `bool` | Admin approval flag. Set to `true` by `register_wrapped_token`. Must be `true` before `validate_escrow_token` will accept the token. |

### BridgeConfirmation

```rust
pub struct BridgeConfirmation {
    pub token: Address,
    pub confirmations: u32,
    pub is_finalized: bool,
    pub last_updated: u64,
}
```

| Field | Description |
|-------|-------------|
| `token` | The SAC address this record belongs to. |
| `confirmations` | Number of source-chain block confirmations observed so far. |
| `is_finalized` | `true` when `confirmations >= MIN_BRIDGE_CONFIRMATIONS`. Set automatically by `update_bridge_confirmation`. |
| `last_updated` | Ledger timestamp of the last `update_bridge_confirmation` call. |

---

## Constants

| Constant | Value | File | Meaning |
|----------|-------|------|---------|
| `MIN_BRIDGE_CONFIRMATIONS` | `15` | `bridge.rs` | Minimum source-chain block confirmations required before a bridged token is considered final and safe to use in an escrow. |

15 confirmations provides strong probabilistic finality on Ethereum
(approximately 3 minutes at 12 s/block) and is even safer on faster
chains such as BSC or Polygon.

---

## Contract Functions

### set_wormhole_bridge

```rust
pub fn set_wormhole_bridge(
    env: Env,
    caller: Address,   // must be contract admin
    bridge: Address,   // Wormhole token bridge SAC address on Stellar
) -> Result<(), EscrowError>
```

Stores the Wormhole bridge contract address in instance storage.
This address is used by `WormholeBridgeInterface::is_wrapped_asset`
to verify that a given SAC is genuinely a Wormhole-wrapped token.

**Must be called once before any `register_wrapped_token` call that
uses `BridgeProtocol::Wormhole`.**

Authorization: `caller` must be the contract admin and must sign the
transaction (`require_auth()`).

---

### register_wrapped_token

```rust
pub fn register_wrapped_token(
    env: Env,
    caller: Address,
    stellar_address: Address,
    origin_chain: u16,
    origin_address: BytesN<32>,
    bridge: BridgeProtocol,
) -> Result<(), EscrowError>
```

Registers a wrapped token and sets `is_approved = true`. For
`BridgeProtocol::Wormhole`, the function calls
`WormholeBridgeInterface::is_wrapped_asset` on the stored bridge address
to verify the token on-chain before storing it. If the bridge returns
`false`, the call reverts with `BridgeError` (54).

After registration the token is known to the contract but **not yet
usable in escrows** — a `BridgeConfirmation` with `is_finalized = true`
is still required.

Authorization: admin only.

---

### update_bridge_confirmation

```rust
pub fn update_bridge_confirmation(
    env: Env,
    caller: Address,
    token: Address,
    confirmations: u32,
) -> Result<(), EscrowError>
```

Updates (or creates) the `BridgeConfirmation` record for `token`.
If `confirmations >= MIN_BRIDGE_CONFIRMATIONS` the record's
`is_finalized` field is set to `true`.

This function is called by an off-chain relayer or admin script that
monitors the source chain and submits confirmation counts as blocks
accumulate.

Authorization: admin only.

---

### get_bridge_confirmation

```rust
pub fn get_bridge_confirmation(
    env: Env,
    token: Address,
) -> Result<BridgeConfirmation, EscrowError>
```

Read-only view. Returns the current `BridgeConfirmation` for `token`,
or `BridgeError` (54) if no record exists yet.

---

## WormholeBridgeInterface Trait

```rust
pub trait WormholeBridgeInterface {
    fn is_wrapped_asset(env: &Env, bridge: &Address, token: &Address) -> bool;
}
```

This trait is called internally by `register_wrapped_token` when
`bridge == BridgeProtocol::Wormhole`. It invokes the Wormhole token
bridge contract at the stored `bridge` address and asks whether `token`
is a genuine wrapped asset.

You do not call this trait directly. If the Wormhole bridge contract
returns `false`, `register_wrapped_token` returns `BridgeError` (54)
and the token is not stored.

For `BridgeProtocol::Allbridge`, this check is skipped — the admin is
trusted to supply correct metadata.

---

## Using a Bridged Token in an Escrow

Once a token is registered and finalized, pass its `stellar_address` as
the `token` argument to `create_escrow`:

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --source $CLIENT_SECRET \
  --network testnet \
  -- create_escrow \
  --client $CLIENT_ADDRESS \
  --freelancer $FREELANCER_ADDRESS \
  --token $WRAPPED_USDC_SAC \
  --total_amount 1000000000 \
  --brief_hash "$(echo -n 'QmYourIpfsHash' | xxd -p -c 32)" \
  --arbiter null \
  --deadline null \
  --lock_time null
```

Internally, `create_escrow` calls `validate_escrow_token` which:

1. Checks whether `token` is registered in `WrappedTokenInfo`.
2. If registered, calls `require_bridge_finalized` which reads the
   `BridgeConfirmation` and panics with `BridgeError` (54) if
   `is_finalized == false`.
3. If the token is not registered at all, it is treated as a native
   Stellar asset and no bridge checks are performed.

---

## Finalization Requirement

```
is_finalized = (confirmations >= MIN_BRIDGE_CONFIRMATIONS)
             = (confirmations >= 15)
```

`require_bridge_finalized` is called by `validate_escrow_token` before
any escrow creation involving a registered wrapped token. If the
confirmation count has not yet reached 15, the call reverts with
`BridgeError` (54).

**Why 15?** On Ethereum, 15 blocks (approximately 3 minutes) provides
strong probabilistic finality. On faster chains (BSC, Polygon) 15 blocks
is even safer. The constant can be updated via a contract upgrade if
network conditions change.

Workflow:

```
Bridge transfer submitted on source chain
        |
        v
Off-chain relayer monitors source chain
        |
        v
update_bridge_confirmation(token, N) called for each new block
        |
        v
When N >= 15: is_finalized = true
        |
        v
create_escrow with this token now succeeds
```

---

## BridgeError (Error Code 54)

`BridgeError` is returned as `EscrowError` code **54**.

| Cause | Resolution |
|-------|-----------|
| `get_bridge_confirmation` called for an unregistered token | Call `register_wrapped_token` first, then `update_bridge_confirmation`. |
| `create_escrow` called before `is_finalized = true` | Wait for the relayer to submit enough confirmations, or call `update_bridge_confirmation` manually with the current count. |
| `register_wrapped_token` with `BridgeProtocol::Wormhole` but `is_wrapped_asset` returns `false` | Verify `stellar_address` is the correct SAC for the Wormhole-wrapped token. Check that `set_wormhole_bridge` was called with the correct bridge address. |
| `set_wormhole_bridge` not called before `register_wrapped_token` | Call `set_wormhole_bridge` with the Wormhole token bridge SAC address first. |

---

## End-to-End CLI Walkthrough

The following example registers Wormhole-wrapped USDC (origin: Ethereum)
and uses it in an escrow on Stellar testnet.

**Step 1 — Set the Wormhole bridge address**

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --source $ADMIN_SECRET \
  --network testnet \
  -- set_wormhole_bridge \
  --caller $ADMIN_ADDRESS \
  --bridge $WORMHOLE_BRIDGE_SAC
```

**Step 2 — Register the wrapped token**

```bash
# Ethereum USDC: chain ID 2
# Address 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 zero-padded to 32 bytes:
ORIGIN_ADDR="000000000000000000000000A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"

soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --source $ADMIN_SECRET \
  --network testnet \
  -- register_wrapped_token \
  --caller $ADMIN_ADDRESS \
  --stellar_address $WRAPPED_USDC_SAC \
  --origin_chain 2 \
  --origin_address "$ORIGIN_ADDR" \
  --bridge Wormhole
```

**Step 3 — Submit confirmation count (run by relayer after each source block)**

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --source $ADMIN_SECRET \
  --network testnet \
  -- update_bridge_confirmation \
  --caller $ADMIN_ADDRESS \
  --token $WRAPPED_USDC_SAC \
  --confirmations 15
```

**Step 4 — Verify finalization**

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --network testnet \
  -- get_bridge_confirmation \
  --token $WRAPPED_USDC_SAC
# Expected: { "token": "...", "confirmations": 15, "is_finalized": true, ... }
```

**Step 5 — Create an escrow using the wrapped token**

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --source $CLIENT_SECRET \
  --network testnet \
  -- create_escrow \
  --client $CLIENT_ADDRESS \
  --freelancer $FREELANCER_ADDRESS \
  --token $WRAPPED_USDC_SAC \
  --total_amount 1000000000 \
  --brief_hash "$BRIEF_HASH" \
  --arbiter null \
  --deadline null \
  --lock_time null
```

---

## Common Wormhole Chain IDs

| Chain | Wormhole ID |
|-------|-------------|
| Ethereum | 2 |
| BNB Smart Chain | 4 |
| Polygon | 5 |
| Avalanche | 6 |
| Fantom | 10 |
| Celo | 14 |
| Arbitrum | 23 |
| Optimism | 24 |
| Base | 30 |

Full list: https://docs.wormhole.com/wormhole/reference/constants
