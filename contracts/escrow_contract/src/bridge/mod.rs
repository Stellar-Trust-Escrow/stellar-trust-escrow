//! # Cross-Chain Bridge Integration
//!
//! Supports wrapped tokens bridged to Stellar via Wormhole or Allbridge.
//! Tracks bridge confirmations and provides canonical token representation.

#![allow(dead_code)]

use soroban_sdk::{contractclient, symbol_short, Address, Env, String};

use crate::types::DataKey;
use crate::EscrowError;

mod types;
pub use types::*;

// ── Bridge confirmation threshold ─────────────────────────────────────────────
/// Minimum confirmations required before a bridged deposit is considered final.
pub const MIN_BRIDGE_CONFIRMATIONS: u32 = 15;

/// Minimal interface for querying a Wormhole token bridge contract on Stellar.
/// Only the `is_wrapped_asset` query is needed for on-chain validation.
#[allow(dead_code)]
#[contractclient(name = "WormholeBridgeClient")]
pub trait WormholeBridgeInterface {
    /// Returns true if `token` is a Wormhole-wrapped asset.
    fn is_wrapped_asset(env: Env, token: Address) -> bool;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

/// Register a wrapped token's canonical metadata. Admin only (caller must be
/// validated by the contract before calling this).
pub fn register_wrapped_token(env: &Env, info: &WrappedTokenInfo) {
    let key = BridgeDataKey::WrappedToken(info.stellar_address.clone());
    env.storage().persistent().set(&key, info);
    env.storage().persistent().extend_ttl(&key, 5_000, 50_000);
}

/// Retrieve canonical metadata for a wrapped token, if registered.
pub fn get_wrapped_token_info(env: &Env, token: &Address) -> Option<WrappedTokenInfo> {
    let key = BridgeDataKey::WrappedToken(token.clone());
    let info: Option<WrappedTokenInfo> = env.storage().persistent().get(&key);
    if info.is_some() {
        env.storage().persistent().extend_ttl(&key, 5_000, 50_000);
    }
    info
}

/// Returns true if `token` is a registered and approved wrapped asset.
pub fn is_approved_wrapped_token(env: &Env, token: &Address) -> bool {
    get_wrapped_token_info(env, token)
        .map(|i| i.is_approved)
        .unwrap_or(false)
}

/// Record or update bridge confirmation state for a bridged token.
pub fn record_bridge_confirmation(env: &Env, confirmation: &BridgeConfirmation) {
    let key = BridgeDataKey::BridgeConfirmation(confirmation.token.clone());
    env.storage().persistent().set(&key, confirmation);
    env.storage().persistent().extend_ttl(&key, 5_000, 50_000);
}

/// Retrieve bridge confirmation state for a wrapped token.
pub fn get_bridge_confirmation(env: &Env, token: &Address) -> Option<BridgeConfirmation> {
    let key = BridgeDataKey::BridgeConfirmation(token.clone());
    let conf: Option<BridgeConfirmation> = env.storage().persistent().get(&key);
    if conf.is_some() {
        env.storage().persistent().extend_ttl(&key, 5_000, 50_000);
    }
    conf
}

// ── Validation ────────────────────────────────────────────────────────────────

/// Validate that `token` is usable in an escrow: either a native Stellar asset
/// (not registered as wrapped) or an approved wrapped token.
pub fn validate_escrow_token(env: &Env, token: &Address) -> Result<(), EscrowError> {
    // If the token is registered as a wrapped asset it must be approved and finalized.
    if let Some(info) = get_wrapped_token_info(env, token) {
        if !info.is_approved {
            return Err(EscrowError::E54);
        }
        require_bridge_finalized(env, token)?;
    }
    // Native / unregistered Stellar tokens are always allowed.
    Ok(())
}

/// Validate that a bridge transfer is finalized (>= MIN_BRIDGE_CONFIRMATIONS).
pub fn require_bridge_finalized(env: &Env, token: &Address) -> Result<(), EscrowError> {
    let conf = get_bridge_confirmation(env, token).ok_or(EscrowError::E54)?;
    if !conf.is_finalized {
        return Err(EscrowError::E54);
    }
    Ok(())
}

// ── Events ────────────────────────────────────────────────────────────────────

pub fn emit_wrapped_token_registered(env: &Env, token: &Address, origin_chain: &String) {
    env.events().publish(
        (symbol_short!("brg_reg"), token.clone()),
        origin_chain.clone(),
    );
}

pub fn emit_bridge_confirmation_updated(
    env: &Env,
    token: &Address,
    confirmations: u32,
    is_finalized: bool,
) {
    env.events().publish(
        (symbol_short!("brg_cnf"), token.clone()),
        (confirmations, is_finalized),
    );
}

// ── Wormhole bridge address storage ──────────────────────────────────────────

pub fn set_wormhole_bridge(env: &Env, bridge: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::WormholeBridge, bridge);
}

pub fn get_wormhole_bridge(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::WormholeBridge)
}
