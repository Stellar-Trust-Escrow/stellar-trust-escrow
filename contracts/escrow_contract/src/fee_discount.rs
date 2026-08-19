#![allow(unused)]

use soroban_sdk::{contracttype, Address, Env, Symbol, Vec, symbol_short};

// Storage key prefixes
const FEE_TIERS_KEY: Symbol = symbol_short!("FEE_TIERS");
const VOLUME_KEY: Symbol = symbol_short!("VOLUME");
const FEE_ADMIN_KEY: Symbol = symbol_short!("FEE_ADMIN");

/// A single fee tier definition.
///
/// When a user's cumulative volume reaches `min_volume`, they receive
/// a discount of `discount_bps` basis points off the platform fee.
/// 10000 bps == 100%, so 500 bps == 5%.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FeeTier {
    /// Minimum cumulative volume (in token's smallest unit) to qualify for this tier.
    pub min_volume: i128,
    /// Discount in basis points (1 bps = 0.01%).
    pub discount_bps: u32,
}

/// Sets the ordered list of fee tiers for the platform.
///
/// Tiers should be provided in ascending order of `min_volume`. The admin must
/// authorize this call. Tiers are stored persistently and replace any prior configuration.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `admin` - Address of the fee admin (must match stored admin).
/// * `tiers` - Ordered list of `FeeTier` entries from lowest to highest volume threshold.
pub fn set_fee_tiers(env: &Env, admin: Address, tiers: Vec<FeeTier>) {
    admin.require_auth();

    // Verify caller is the stored fee admin
    let stored_admin: Address = env
        .storage()
        .persistent()
        .get(&FEE_ADMIN_KEY)
        .expect("fee admin not configured");
    if stored_admin != admin {
        panic!("caller is not the fee admin");
    }

    // Validate discount_bps never exceeds 10000 (100%)
    for i in 0..tiers.len() {
        let tier = tiers.get(i).unwrap();
        if tier.discount_bps > 10_000 {
            panic!("discount_bps cannot exceed 10000");
        }
    }

    env.storage().persistent().set(&FEE_TIERS_KEY, &tiers);

    env.events().publish(
        (symbol_short!("fee"), symbol_short!("tiers_set")),
        tiers.len(),
    );
}

/// Records additional escrow volume for an address.
///
/// Called whenever an escrow is funded or a milestone is released. Accumulates
/// the total historical volume for an address used to determine their fee tier.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `address` - The address whose volume to update.
/// * `amount` - The amount to add to cumulative volume.
pub fn record_volume(env: &Env, address: Address, amount: i128) {
    if amount <= 0 {
        panic!("volume amount must be positive");
    }

    let storage = env.storage().persistent();
    let volume_key = (VOLUME_KEY, address.clone());
    let current: i128 = storage.get(&volume_key).unwrap_or(0i128);
    let updated = current.checked_add(amount).expect("volume overflow");
    storage.set(&volume_key, &updated);

    env.events().publish(
        (symbol_short!("fee"), symbol_short!("vol_rec")),
        (address, amount, updated),
    );
}

/// Returns the cumulative volume recorded for an address.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `address` - The address to query.
///
/// # Returns
/// Total cumulative volume in token's smallest unit; 0 if no volume recorded.
pub fn get_cumulative_volume(env: &Env, address: Address) -> i128 {
    let volume_key = (VOLUME_KEY, address);
    env.storage().persistent().get(&volume_key).unwrap_or(0i128)
}

/// Calculates the applicable fee discount in basis points for an address.
///
/// Iterates through configured tiers and returns the discount for the highest
/// tier the address qualifies for. Returns 0 if no tier is met.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `address` - The address to evaluate.
///
/// # Returns
/// Discount in basis points (0-10000).
pub fn calculate_discount(env: &Env, address: Address) -> u32 {
    let volume = get_cumulative_volume(env, address);
    if volume == 0 {
        return 0;
    }

    let tiers: Vec<FeeTier> = env
        .storage()
        .persistent()
        .get(&FEE_TIERS_KEY)
        .unwrap_or(Vec::new(env));

    let mut best_discount: u32 = 0;

    for i in 0..tiers.len() {
        let tier = tiers.get(i).unwrap();
        if volume >= tier.min_volume && tier.discount_bps > best_discount {
            best_discount = tier.discount_bps;
        }
    }

    best_discount
}

/// Applies a discount in basis points to a base fee, returning the discounted fee.
///
/// Pure function — no storage or environment access needed.
/// Formula: `discounted_fee = base_fee * (10000 - discount_bps) / 10000`
///
/// # Arguments
/// * `base_fee` - The original fee amount before discount.
/// * `discount_bps` - Discount to apply in basis points (0-10000).
///
/// # Returns
/// The fee amount after applying the discount.
pub fn apply_discount(base_fee: i128, discount_bps: u32) -> i128 {
    if discount_bps >= 10_000 {
        return 0;
    }
    let multiplier = (10_000u32 - discount_bps) as i128;
    base_fee
        .checked_mul(multiplier)
        .expect("fee multiplication overflow")
        .checked_div(10_000)
        .expect("fee division error")
}

/// Returns the effective fee for an address after applying their volume-tier discount.
///
/// Combines `calculate_discount` and `apply_discount` into a single call for
/// convenience at payment time.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `address` - The payer whose discount tier to look up.
/// * `base_fee` - The platform fee before any discount.
///
/// # Returns
/// The fee amount the address must actually pay.
pub fn get_effective_fee(env: &Env, address: Address, base_fee: i128) -> i128 {
    let discount_bps = calculate_discount(env, address);
    apply_discount(base_fee, discount_bps)
}

/// Returns the currently configured fee tiers.
///
/// # Arguments
/// * `env` - Soroban environment reference.
///
/// # Returns
/// Vec of `FeeTier` entries; empty if no tiers have been configured.
pub fn get_fee_tiers(env: &Env) -> Vec<FeeTier> {
    env.storage()
        .persistent()
        .get(&FEE_TIERS_KEY)
        .unwrap_or(Vec::new(env))
}

/// Initializes the fee admin address. Should be called during contract setup.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `admin` - Address that will have permission to update fee tiers.
pub fn set_fee_admin(env: &Env, admin: Address) {
    env.storage().persistent().set(&FEE_ADMIN_KEY, &admin);
}
