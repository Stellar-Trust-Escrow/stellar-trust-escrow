#![allow(unused)]

use soroban_sdk::{contracttype, Address, Env, Symbol, symbol_short};

// Storage key prefixes
const ORACLE_KEY: Symbol = symbol_short!("ORACLE");
const ORACLE_AUTH_KEY: Symbol = symbol_short!("ORC_AUTH");
const ESCROW_REL_KEY: Symbol = symbol_short!("ESC_REL");

/// Defines a price band condition that must be met for a conditional escrow release.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PriceCondition {
    /// The asset symbol whose price is being monitored (e.g., `symbol_short!("XLM")`).
    pub asset: Symbol,
    /// Minimum price (inclusive) that must be satisfied.
    pub min_price: i128,
    /// Maximum price (inclusive) that must be satisfied.
    pub max_price: i128,
    /// Number of ledgers after which the recorded price is considered stale.
    pub staleness_threshold_ledgers: u32,
}

/// A price entry recorded by an authorized oracle source.
#[contracttype]
#[derive(Clone, Debug)]
pub struct OracleEntry {
    /// Price of the asset in the platform's quote currency (smallest unit).
    pub price: i128,
    /// Ledger sequence number at which the price was submitted.
    pub timestamp_ledger: u32,
    /// The oracle source address that submitted this price.
    pub source: Address,
}

/// Submits a new price from an authorized oracle source.
///
/// Only addresses registered as authorized oracle sources may submit prices.
/// The price replaces the previous entry for the given asset.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `source` - Address of the oracle submitting the price.
/// * `asset` - Symbol identifying the asset being priced.
/// * `price` - New price in smallest-unit terms (must be positive).
pub fn submit_price(env: &Env, source: Address, asset: Symbol, price: i128) {
    source.require_auth();

    if price <= 0 {
        panic!("price must be positive");
    }

    // Verify the source is an authorized oracle
    let auth_key = (ORACLE_AUTH_KEY, source.clone());
    let is_authorized: bool = env
        .storage()
        .persistent()
        .get(&auth_key)
        .unwrap_or(false);
    if !is_authorized {
        panic!("oracle source is not authorized");
    }

    let current_ledger = env.ledger().sequence();
    let entry = OracleEntry {
        price,
        timestamp_ledger: current_ledger,
        source: source.clone(),
    };

    let oracle_key = (ORACLE_KEY, asset.clone());
    env.storage().persistent().set(&oracle_key, &entry);

    env.events().publish(
        (symbol_short!("oracle"), symbol_short!("price_sub")),
        (asset, price, current_ledger, source),
    );
}

/// Returns the latest oracle price entry for an asset.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `asset` - Symbol identifying the asset to query.
///
/// # Returns
/// The most recent `OracleEntry` for the asset.
///
/// # Panics
/// Panics if no price has ever been submitted for the asset.
pub fn get_latest_price(env: &Env, asset: Symbol) -> OracleEntry {
    let oracle_key = (ORACLE_KEY, asset);
    env.storage()
        .persistent()
        .get(&oracle_key)
        .expect("no price found for asset")
}

/// Returns true if the latest price for an asset exceeds the staleness threshold.
///
/// Staleness is defined as: `current_ledger - entry.timestamp_ledger > staleness_threshold_ledgers`
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `asset` - Symbol identifying the asset.
/// * `current_ledger` - Current ledger sequence number.
///
/// # Returns
/// `true` if the price is stale or absent, `false` if fresh.
pub fn is_stale(env: &Env, asset: Symbol, current_ledger: u32) -> bool {
    let oracle_key = (ORACLE_KEY, asset.clone());
    let entry: Option<OracleEntry> = env.storage().persistent().get(&oracle_key);

    match entry {
        None => true, // No price on record — treat as stale
        Some(e) => {
            // Fetch the condition's staleness threshold from storage if available,
            // otherwise use a conservative default of 17280 ledgers (~24h)
            let age = current_ledger.saturating_sub(e.timestamp_ledger);
            // We compare against a default threshold here; callers with a specific
            // PriceCondition should use check_price_condition instead.
            age > 17_280
        }
    }
}

/// Checks whether the latest oracle price satisfies a `PriceCondition`.
///
/// Returns `true` only when:
/// 1. A price exists for the asset.
/// 2. The price is within `[min_price, max_price]`.
/// 3. The price is not stale (age <= `staleness_threshold_ledgers`).
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `condition` - The price band and freshness requirement to evaluate.
/// * `current_ledger` - Current ledger sequence number.
///
/// # Returns
/// `true` if the condition is fully satisfied, `false` otherwise.
pub fn check_price_condition(env: &Env, condition: PriceCondition, current_ledger: u32) -> bool {
    let oracle_key = (ORACLE_KEY, condition.asset.clone());
    let entry: Option<OracleEntry> = env.storage().persistent().get(&oracle_key);

    let entry = match entry {
        None => return false,
        Some(e) => e,
    };

    // Check freshness
    let age = current_ledger.saturating_sub(entry.timestamp_ledger);
    if age > condition.staleness_threshold_ledgers {
        return false;
    }

    // Check price is within the allowed band
    entry.price >= condition.min_price && entry.price <= condition.max_price
}

/// Conditionally releases an escrow if its price condition is satisfied.
///
/// If the oracle price meets the condition (in-band and fresh), the escrow is
/// marked as released in storage and an event is emitted. If the price is stale,
/// the function flags the escrow for arbiter intervention instead.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - Identifier of the escrow to potentially release.
/// * `condition` - The price condition that triggers release.
/// * `current_ledger` - Current ledger sequence number.
///
/// # Returns
/// `true` if the escrow was released, `false` if condition was not met or price is stale.
pub fn trigger_release_if_met(
    env: &Env,
    escrow_id: u64,
    condition: PriceCondition,
    current_ledger: u32,
) -> bool {
    let oracle_key = (ORACLE_KEY, condition.asset.clone());
    let entry: Option<OracleEntry> = env.storage().persistent().get(&oracle_key);

    let entry = match entry {
        None => {
            // No price on record — escalate to arbiter
            flag_for_arbiter(env, escrow_id, "no_price");
            return false;
        }
        Some(e) => e,
    };

    // Check staleness
    let age = current_ledger.saturating_sub(entry.timestamp_ledger);
    if age > condition.staleness_threshold_ledgers {
        // Stale price — cannot release automatically, fall back to arbiter
        flag_for_arbiter(env, escrow_id, "stale_price");
        return false;
    }

    // Check price band
    if entry.price < condition.min_price || entry.price > condition.max_price {
        // Price not in band — condition not met
        env.events().publish(
            (symbol_short!("oracle"), symbol_short!("cond_fail")),
            (escrow_id, entry.price, condition.min_price, condition.max_price),
        );
        return false;
    }

    // Condition satisfied — mark escrow as released
    let release_key = (ESCROW_REL_KEY, escrow_id);
    env.storage().persistent().set(&release_key, &true);

    env.events().publish(
        (symbol_short!("oracle"), symbol_short!("released")),
        (escrow_id, entry.price, current_ledger),
    );

    true
}

/// Marks an escrow as requiring arbiter intervention due to an oracle issue.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow that cannot be automatically released.
/// * `reason` - Short reason code (e.g., "stale_price", "no_price").
fn flag_for_arbiter(env: &Env, escrow_id: u64, reason: &str) {
    env.events().publish(
        (symbol_short!("oracle"), symbol_short!("arb_flag")),
        (escrow_id,),
    );
}

/// Returns whether an escrow has been released by oracle condition.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow to check.
///
/// # Returns
/// `true` if `trigger_release_if_met` previously released the escrow.
pub fn is_escrow_released(env: &Env, escrow_id: u64) -> bool {
    let release_key = (ESCROW_REL_KEY, escrow_id);
    env.storage()
        .persistent()
        .get(&release_key)
        .unwrap_or(false)
}

/// Registers an address as an authorized oracle price source.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `source` - Address to authorize as an oracle.
pub fn authorize_oracle(env: &Env, source: Address) {
    let auth_key = (ORACLE_AUTH_KEY, source);
    env.storage().persistent().set(&auth_key, &true);
}

/// Removes an address from the authorized oracle set.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `source` - Address to deauthorize.
pub fn deauthorize_oracle(env: &Env, source: Address) {
    let auth_key = (ORACLE_AUTH_KEY, source);
    env.storage().persistent().set(&auth_key, &false);
}
