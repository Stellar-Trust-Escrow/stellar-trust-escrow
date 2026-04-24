//! # Cross-Chain Bridge Integration
//!
//! Supports wrapped tokens bridged to Stellar via Wormhole or Allbridge.
//! Tracks bridge confirmations and provides canonical token representation.

#![allow(dead_code)]

use soroban_sdk::{contractclient, contracttype, symbol_short, Address, Env, String};

use crate::types::DataKey;
use crate::EscrowError;

// ── Bridge confirmation threshold ─────────────────────────────────────────────
/// Minimum confirmations required before a bridged deposit is considered final.
pub const MIN_BRIDGE_CONFIRMATIONS: u32 = 15;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Supported bridge protocols.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BridgeProtocol {
    Wormhole,
    Allbridge,
}

/// Canonical metadata for a cross-chain (wrapped) token.
#[contracttype]
#[derive(Clone, Debug)]
pub struct WrappedTokenInfo {
    /// The Stellar SAC address of the wrapped token.
    pub stellar_address: Address,
    /// The originating chain identifier (e.g. "ethereum", "solana").
    pub origin_chain: String,
    /// The original token address on the source chain (hex string).
    pub origin_address: String,
    /// Which bridge protocol wrapped this token.
    pub bridge: BridgeProtocol,
    /// Whether this token is approved for use in escrows.
    pub is_approved: bool,
}

/// Tracks the confirmation state of a cross-chain deposit.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BridgeConfirmation {
    /// Unique VAA / transfer ID from the bridge protocol.
    pub transfer_id: String,
    /// Bridge protocol used.
    pub bridge: BridgeProtocol,
    /// Number of confirmations received so far.
    pub confirmations: u32,
    /// Whether the transfer has reached `MIN_BRIDGE_CONFIRMATIONS`.
    pub is_finalized: bool,
    /// Ledger timestamp when this record was last updated.
    pub updated_at: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

/// Persistent storage key for wrapped token metadata.
/// Keyed by the Stellar SAC address of the wrapped token.
#[contracttype]
#[derive(Clone)]
pub enum BridgeDataKey {
    /// WrappedTokenInfo keyed by Stellar token address.
    WrappedToken(Address),
    /// BridgeConfirmation keyed by transfer_id string.
    BridgeConfirmation(String),
}

// ── Minimal bridge interface (Wormhole-compatible) ────────────────────────────

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

/// Record or update bridge confirmation state for a transfer.
pub fn record_bridge_confirmation(env: &Env, confirmation: &BridgeConfirmation) {
    let key = BridgeDataKey::BridgeConfirmation(confirmation.transfer_id.clone());
    env.storage().persistent().set(&key, confirmation);
    env.storage().persistent().extend_ttl(&key, 5_000, 50_000);
}

/// Retrieve bridge confirmation state for a transfer ID.
pub fn get_bridge_confirmation(env: &Env, transfer_id: &String) -> Option<BridgeConfirmation> {
    let key = BridgeDataKey::BridgeConfirmation(transfer_id.clone());
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
    // If the token is registered as a wrapped asset it must be approved.
    if let Some(info) = get_wrapped_token_info(env, token) {
        if !info.is_approved {
            return Err(EscrowError::BridgeError);
        }
    }
    // Native / unregistered Stellar tokens are always allowed.
    Ok(())
}

/// Validate that a bridge transfer is finalized (>= MIN_BRIDGE_CONFIRMATIONS).
pub fn require_bridge_finalized(env: &Env, transfer_id: &String) -> Result<(), EscrowError> {
    let conf = get_bridge_confirmation(env, transfer_id).ok_or(EscrowError::BridgeError)?;
    if !conf.is_finalized {
        return Err(EscrowError::BridgeError);
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
    transfer_id: &String,
    confirmations: u32,
    is_finalized: bool,
) {
    env.events().publish(
        (symbol_short!("brg_cnf"), transfer_id.clone()),
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
