use soroban_sdk::{contracttype, Address, String};

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
    /// The bridged token used in the escrow.
    pub token: Address,
    /// Bridge protocol used.
    pub bridge: BridgeProtocol,
    /// Number of confirmations received so far.
    pub confirmations: u32,
    /// Whether the transfer has reached `MIN_BRIDGE_CONFIRMATIONS`.
    pub is_finalized: bool,
    /// Ledger timestamp when this record was last updated.
    pub updated_at: u64,
}

/// Persistent storage key for wrapped token metadata.
/// Keyed by the Stellar SAC address of the wrapped token.
#[contracttype]
#[derive(Clone)]
pub enum BridgeDataKey {
    /// WrappedTokenInfo keyed by Stellar token address.
    WrappedToken(Address),
    /// BridgeConfirmation keyed by bridged token address.
    BridgeConfirmation(Address),
}
