use soroban_sdk::{contractclient, contracttype, symbol_short, Address, Env, Symbol, Vec};

use crate::types::DataKey;
use crate::EscrowError;

/// Maximum age (in seconds) before a price is considered stale.
pub const PRICE_STALENESS_THRESHOLD: u64 = 10_800; // 3 hours

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

/// USD/XLM price feed returned by DIA/Band-compatible oracle adapters.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PriceFeed {
    /// USD price of 1 XLM in micro-USD (6 decimal places, e.g. 1_200_000 = $1.20).
    pub price_micro_usd: i128,
    /// Unix timestamp of the feed update.
    pub timestamp: u64,
}

/// USD-denominated milestone shape for dynamic XLM valuation.
#[contracttype]
#[derive(Clone, Debug)]
pub struct UsdMilestone {
    pub id: u32,
    /// Target payout in micro-USD (e.g. 500_000_000 = $500.00).
    pub amount_micro_usd: i128,
    pub completed: bool,
}

/// Oracle configuration settings.
#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct OracleConfig {
    pub stale_threshold_seconds: u64,
}

pub struct OracleConsumer;

#[allow(dead_code)]
impl OracleConsumer {
    /// Fetch and validate the USD/XLM price feed from an external oracle contract.
    ///
    /// Returns Result<PriceFeed, EscrowError> with:
    /// - Err(EscrowError::OracleStaleFeed) if the feed is older than the configured threshold
    /// - Err(EscrowError::OracleInvalidPrice) if the price is non-positive
    /// - Ok(PriceFeed) if the feed is fresh and valid
    pub fn get_validated_feed(env: &Env, oracle_id: &Address) -> Result<PriceFeed, EscrowError> {
        let feed: PriceFeed =
            env.invoke_contract(oracle_id, &symbol_short!("get_price"), Vec::new(env));

        let now = env.ledger().timestamp();
        if now.saturating_sub(feed.timestamp) > PRICE_STALENESS_THRESHOLD {
            return Err(EscrowError::OracleStaleFeed);
        }
        if feed.price_micro_usd <= 0 {
            return Err(EscrowError::OracleInvalidPrice);
        }

        Ok(feed)
    }

    /// Convert a USD milestone amount to XLM stroops using the oracle price.
    ///
    /// Emits `oracle_conversion` with `(amount_micro_usd, price_micro_usd,
    /// xlm_stroops, feed_timestamp)`.
    pub fn usd_to_xlm_stroops(
        env: &Env,
        oracle_id: &Address,
        amount_micro_usd: i128,
    ) -> Result<i128, EscrowError> {
        let feed = Self::get_validated_feed(env, oracle_id)?;
        let xlm_stroops = amount_micro_usd
            .checked_mul(10_000_000)
            .and_then(|amount| amount.checked_div(feed.price_micro_usd))
            .ok_or(EscrowError::OraclePriceConversionFailed)?;

        env.events().publish(
            (Symbol::new(env, "oracle_conversion"),),
            (
                amount_micro_usd,
                feed.price_micro_usd,
                xlm_stroops,
                feed.timestamp,
            ),
        );

        Ok(xlm_stroops)
    }
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
        .ok_or(EscrowError::E54)
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

#[allow(dead_code)]
pub fn set_oracle_stale_threshold(env: &Env, threshold_seconds: u64) -> Result<(), EscrowError> {
    if threshold_seconds == 0 || threshold_seconds > 86_400 {
        return Err(EscrowError::E19);
    }
    env.storage()
        .instance()
        .set(&DataKey::OracleStaleThreshold, &threshold_seconds);
    Ok(())
}

fn get_oracle_stale_threshold(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::OracleStaleThreshold)
        .unwrap_or(PRICE_STALENESS_THRESHOLD)
}

// ── Price fetching ────────────────────────────────────────────────────────────

/// Fetch the USD price for `asset` from the primary oracle.
/// Falls back to the fallback oracle if the primary returns stale/missing data.
/// Returns price with `PRICE_DECIMALS` decimal places.
pub fn get_price_usd(env: &Env, asset: &Address) -> Result<i128, EscrowError> {
    let oracle_addr = get_oracle(env)?;
    let now = env.ledger().timestamp();
    let threshold = get_oracle_stale_threshold(env);

    if let Some(data) = OracleClient::new(env, &oracle_addr).lastprice(asset) {
        if is_fresh(&data, now, threshold) {
            if data.price <= 0 {
                return Err(EscrowError::OracleInvalidPrice);
            }
            return Ok(data.price);
        }
    }

    // Primary stale or missing — try fallback
    if let Some(fallback_addr) = get_fallback_oracle(env) {
        if let Some(data) = OracleClient::new(env, &fallback_addr).lastprice(asset) {
            if is_fresh(&data, now, threshold) {
                if data.price <= 0 {
                    return Err(EscrowError::OracleInvalidPrice);
                }
                return Ok(data.price);
            }
            return Err(EscrowError::OracleStaleFeed);
        }
    }

    Err(EscrowError::OracleStaleFeed)
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
        .ok_or(EscrowError::OraclePriceConversionFailed)
}

#[inline]
fn is_fresh(data: &PriceData, now: u64, threshold: u64) -> bool {
    now.saturating_sub(data.timestamp) <= threshold
}
