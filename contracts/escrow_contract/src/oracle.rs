use soroban_sdk::{contractclient, contracttype, Address, Env};

use crate::types::DataKey;
use crate::EscrowError;

/// Maximum age (in seconds) before a price is considered stale.
pub const PRICE_STALENESS_THRESHOLD: u64 = 3_600; // 1 hour

/// Price with 7 decimal places of precision (Stellar convention).
#[allow(dead_code)]
pub const PRICE_DECIMALS: u32 = 7;

/// A price entry returned by the oracle.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PriceData {
    /// Price in USD with `PRICE_DECIMALS` decimal places.
    pub price: i128,
    /// Ledger timestamp when this price was last updated.
    pub timestamp: u64,
}

/// Minimal interface for an external price oracle contract.
/// Compatible with the SEP-40 / Band Protocol / DIA oracle pattern on Stellar.
#[allow(dead_code)]
#[contractclient(name = "OracleClient")]
pub trait OracleInterface {
    /// Returns the latest price for `asset` denominated in USD.
    /// Price has `PRICE_DECIMALS` decimal places.
    fn lastprice(env: Env, asset: Address) -> Option<PriceData>;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

pub fn set_oracle(env: &Env, oracle: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::OracleAddress, oracle);
}

pub fn get_oracle(env: &Env) -> Result<Address, EscrowError> {
    env.storage()
        .instance()
        .get(&DataKey::OracleAddress)
        .ok_or(EscrowError::OracleNotConfigured)
}

pub fn set_fallback_oracle(env: &Env, oracle: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::FallbackOracleAddress, oracle);
}

pub fn get_fallback_oracle(env: &Env) -> Option<Address> {
    env.storage()
        .instance()
        .get(&DataKey::FallbackOracleAddress)
}

// ── Price fetching ────────────────────────────────────────────────────────────

/// Fetch the USD price for `asset` from the primary oracle.
/// Falls back to the fallback oracle if the primary returns stale/missing data.
/// Returns price with `PRICE_DECIMALS` decimal places.
pub fn get_price_usd(env: &Env, asset: &Address) -> Result<i128, EscrowError> {
    let oracle_addr = get_oracle(env)?;
    let now = env.ledger().timestamp();

    if let Some(data) = OracleClient::new(env, &oracle_addr).lastprice(&asset.clone()) {
        if is_fresh(&data, now) {
            return Ok(data.price);
        }
    }

    // Primary stale or missing — try fallback
    if let Some(fallback_addr) = get_fallback_oracle(env) {
        if let Some(data) = OracleClient::new(env, &fallback_addr).lastprice(&asset.clone()) {
            if is_fresh(&data, now) {
                return Ok(data.price);
            }
            return Err(EscrowError::OraclePriceStale);
        }
    }

    Err(EscrowError::OraclePriceStale)
}

/// Convert `amount` of `from_asset` to `to_asset` using oracle prices.
/// Both prices are fetched in USD and the ratio is applied.
pub fn convert_amount(
    env: &Env,
    amount: i128,
    from_asset: &Address,
    to_asset: &Address,
) -> Result<i128, EscrowError> {
    let from_price = get_price_usd(env, from_asset)?;
    let to_price = get_price_usd(env, to_asset)?;

    if to_price == 0 {
        return Err(EscrowError::OracleInvalidPrice);
    }

    // amount * from_price / to_price  (prices share the same decimal base)
    amount
        .checked_mul(from_price)
        .and_then(|v| v.checked_div(to_price))
        .ok_or(EscrowError::OracleInvalidPrice)
}

#[inline]
fn is_fresh(data: &PriceData, now: u64) -> bool {
    now.saturating_sub(data.timestamp) <= PRICE_STALENESS_THRESHOLD
}
