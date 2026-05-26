# Oracle Integration Guide

This guide explains how to integrate a price oracle with
`stellar-trust-escrow` for on-chain currency conversion in escrow
agreements.

Source: `contracts/escrow_contract/src/oracle.rs`
Contract functions: `set_oracle` and `set_fallback_oracle` in `lib.rs`

---

## Table of Contents

1. [Overview](#overview)
2. [Constants](#constants)
3. [OracleInterface Trait](#oracleinterface-trait)
4. [PriceData Struct](#pricedata-struct)
5. [Primary and Fallback Oracles](#primary-and-fallback-oracles)
6. [Registering Oracles](#registering-oracles)
7. [get_price_usd](#get_price_usd)
8. [convert_amount](#convert_amount)
9. [Staleness Check](#staleness-check)
10. [Fallback Behavior](#fallback-behavior)
11. [Deploying a Compatible Oracle](#deploying-a-compatible-oracle)
12. [Error Reference](#error-reference)
13. [CLI Examples](#cli-examples)

---

## Overview

The oracle subsystem provides USD price data for any Stellar Asset Contract
(SAC) address. It is used by `convert_amount` to calculate equivalent token
amounts across different assets — for example, to express an escrow value
in USDC when the payment token is XLM.

The contract supports a **primary oracle** and an optional **fallback
oracle**. If the primary oracle's price is stale, the contract
automatically tries the fallback. If both are stale, the call reverts.

The oracle interface is compatible with SEP-40, Band Protocol, and DIA
oracles deployed on Stellar.

---

## Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `PRICE_STALENESS_THRESHOLD` | `3_600` seconds | Maximum age of a price before it is considered stale. Prices older than 1 hour are rejected. |
| `PRICE_DECIMALS` | `7` | Number of decimal places in price values. A price of `10_000_000` represents $1.00. |

---

## OracleInterface Trait

Any oracle contract registered with `set_oracle` or `set_fallback_oracle`
must implement this interface:

```rust
pub trait OracleInterface {
    fn lastprice(env: &Env, asset: Address) -> Option<PriceData>;
}
```

| Method | Description |
|--------|-------------|
| `lastprice(env, asset)` | Returns the most recent price for `asset` as `Some(PriceData)`, or `None` if the asset is not supported. |

The contract calls `lastprice` via a cross-contract call to the registered
oracle address. The oracle must be a deployed Soroban contract that exports
this function.

---

## PriceData Struct

```rust
pub struct PriceData {
    pub price: i128,      // USD price with PRICE_DECIMALS decimal places
    pub timestamp: u64,   // ledger timestamp when the price was recorded
}
```

| Field | Description |
|-------|-------------|
| `price` | USD price of the asset. Divide by `10^PRICE_DECIMALS` (i.e. `10^7`) to get the human-readable price. A value of `10_000_000` = $1.00. |
| `timestamp` | Ledger timestamp when the oracle last updated this price. Used for the staleness check. |

Example: XLM at $0.12 → `price = 1_200_000` (0.12 × 10^7).

---

## Primary and Fallback Oracles

The contract stores two oracle addresses in instance storage:

| Key | Description |
|-----|-------------|
| `DataKey::OracleAddress` | Primary oracle. Queried first. |
| `DataKey::FallbackOracleAddress` | Fallback oracle. Queried only if primary is stale or returns `None`. |

Both are optional. If neither is set, `get_price_usd` returns
`OracleNotConfigured` (48).

---

## Registering Oracles

### set_oracle

```rust
pub fn set_oracle(
    env: Env,
    caller: Address,   // must be contract admin
    oracle: Address,   // address of the primary oracle contract
) -> Result<(), EscrowError>
```

Stores the primary oracle address. Admin only. Can be updated at any time.

### set_fallback_oracle

```rust
pub fn set_fallback_oracle(
    env: Env,
    caller: Address,   // must be contract admin
    oracle: Address,   // address of the fallback oracle contract
) -> Result<(), EscrowError>
```

Stores the fallback oracle address. Admin only. Optional — the contract
works without a fallback, but primary staleness will cause errors.

---

## get_price_usd

```rust
pub fn get_price_usd(env: &Env, asset: &Address) -> Result<i128, EscrowError>
```

Internal function (also exposed as a public contract method). Returns the
USD price of `asset` with `PRICE_DECIMALS` decimal places.

Logic:

1. Load primary oracle address from storage. If absent → `OracleNotConfigured` (48).
2. Call `oracle.lastprice(asset)`.
3. If `None` or stale → try fallback oracle (step 4). If no fallback → `OraclePriceStale` (49).
4. Call `fallback.lastprice(asset)`.
5. If `None` or stale → `OraclePriceStale` (49).
6. If price ≤ 0 → `OracleInvalidPrice` (50).
7. Return `price`.

---

## convert_amount

```rust
pub fn convert_amount(
    env: Env,
    amount: i128,
    from_asset: Address,
    to_asset: Address,
) -> Result<i128, EscrowError>
```

Converts `amount` units of `from_asset` into equivalent units of
`to_asset` using live oracle prices.

Formula:

```
from_price = get_price_usd(from_asset)   // USD per from_asset unit
to_price   = get_price_usd(to_asset)     // USD per to_asset unit

result = amount * from_price / to_price
```

Both prices are fetched with the primary/fallback failover logic.
If either asset's price is unavailable or stale, the call reverts.

Example: Convert 100 XLM to USDC equivalent.
- XLM price: $0.12 → `from_price = 1_200_000`
- USDC price: $1.00 → `to_price = 10_000_000`
- `result = 100 * 1_200_000 / 10_000_000 = 12` USDC units

---

## Staleness Check

```rust
pub fn is_fresh(env: &Env, price_data: &PriceData) -> bool {
    let now = env.ledger().timestamp();
    now - price_data.timestamp <= PRICE_STALENESS_THRESHOLD
}
```

A price is considered fresh if:

```
now - price_data.timestamp <= 3_600 seconds (1 hour)
```

If the primary oracle's price fails this check, the fallback is tried.
If the fallback also fails, `OraclePriceStale` (49) is returned.

**Implication for oracle operators:** Your oracle contract must update
prices at least once per hour for any asset used in escrows. For volatile
assets, more frequent updates are recommended.

---

## Fallback Behavior

```
get_price_usd(asset):

  primary = load DataKey::OracleAddress
  if primary is None:
    return OracleNotConfigured (48)

  data = primary.lastprice(asset)
  if data is Some and is_fresh(data):
    if data.price <= 0: return OracleInvalidPrice (50)
    return data.price

  // Primary stale or returned None — try fallback
  fallback = load DataKey::FallbackOracleAddress
  if fallback is None:
    return OraclePriceStale (49)

  data = fallback.lastprice(asset)
  if data is Some and is_fresh(data):
    if data.price <= 0: return OracleInvalidPrice (50)
    return data.price

  return OraclePriceStale (49)
```

---

## Deploying a Compatible Oracle

To deploy an oracle compatible with this interface, implement a Soroban
contract that exports `lastprice`:

```rust
#[contract]
pub struct MyOracle;

#[contractimpl]
impl MyOracle {
    /// Returns the latest USD price for `asset`.
    /// Returns None if the asset is not supported.
    pub fn lastprice(env: Env, asset: Address) -> Option<PriceData> {
        // Load price from your storage
        let key = asset.clone();
        env.storage().persistent().get(&key)
    }

    /// Admin function to update a price.
    pub fn update_price(env: Env, asset: Address, price: i128) {
        let data = PriceData {
            price,
            timestamp: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&asset, &data);
    }
}
```

The `PriceData` struct must match the one in `oracle.rs` exactly (same
field names, types, and `#[contracttype]` annotation) for cross-contract
deserialization to succeed.

**Compatible oracle protocols:**

- **SEP-40** — Stellar Ecosystem Proposal for standardized price feeds.
  Any SEP-40 compliant oracle can be used directly.
- **Band Protocol** — Deploy Band's Stellar oracle adapter and register
  its address.
- **DIA** — Use DIA's Stellar price feed contract address.
- **Custom** — Implement the `lastprice` interface yourself (shown above).

---

## Error Reference

| Code | Name | Cause | Resolution |
|------|------|-------|-----------|
| 48 | `OracleNotConfigured` | `set_oracle` has not been called. | Call `set_oracle` with a valid oracle address. |
| 49 | `OraclePriceStale` | Both primary and fallback prices are older than `PRICE_STALENESS_THRESHOLD`. | Ensure your oracle updates prices at least every hour. Check oracle contract health. |
| 50 | `OracleInvalidPrice` | Oracle returned a price ≤ 0. | Check oracle contract logic. Prices must be positive integers. |

---

## CLI Examples

### Register a primary oracle

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --source $ADMIN_SECRET \
  --network testnet \
  -- set_oracle \
  --caller $ADMIN_ADDRESS \
  --oracle $ORACLE_CONTRACT_ADDRESS
```

### Register a fallback oracle

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --source $ADMIN_SECRET \
  --network testnet \
  -- set_fallback_oracle \
  --caller $ADMIN_ADDRESS \
  --oracle $FALLBACK_ORACLE_ADDRESS
```

### Query the current USD price of an asset

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --network testnet \
  -- get_price \
  --asset $XLM_SAC_ADDRESS
# Returns: 1200000  (= $0.12 with 7 decimal places)
```

### Convert 100 XLM to USDC equivalent

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --network testnet \
  -- convert_amount \
  --amount 1000000000 \
  --from_asset $XLM_SAC_ADDRESS \
  --to_asset $USDC_SAC_ADDRESS
# Returns: 12000000  (= 1.2 USDC with 7 decimal places)
```
