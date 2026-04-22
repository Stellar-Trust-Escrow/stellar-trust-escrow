use soroban_sdk::{contracttype, Address, BytesN, Vec};

#[contracttype] #[derive(Clone, Debug)]
pub struct BatchEscrowParams {
    pub freelancer: Address, pub token: Address, pub total_amount: i128,
    pub brief_hash: BytesN<32>, pub arbiter: Option<Address>, pub deadline: Option<u64>,
}

#[contracttype] #[derive(Clone, Debug)]
pub struct FeeRecipient { pub address: Address, pub share_bps: u32 }

#[contracttype] #[derive(Clone, Debug)]
pub struct FeeBalance { pub token: Address, pub amount: i128 }

#[contracttype] #[derive(Clone, Debug)]
pub struct Vote {
    pub voter: Address, pub stake: u64, pub for_client: bool, pub cast_at: u64,
}

#[contracttype] #[derive(Clone, Debug)]
pub struct ArbitrationDispute {
    pub escrow_id: u64, pub voting_opens_at: u64, pub voting_closes_at: u64,
    pub weight_for_client: u64, pub weight_for_freelancer: u64, pub total_stake: u64,
    pub votes: Vec<Vote>, pub resolved: bool, pub client_wins: Option<bool>,
}

#[contracttype] #[derive(Clone, Debug)]
pub struct PendingUpgrade {
    pub new_wasm_hash: BytesN<32>, pub queued_at: u64,
    pub executable_after: u64, pub queued_by: Address,
}

#[contracttype]
pub enum DataKey {
    Admin, FeeBps, FeeRecipients, FeeBalance(Address),
    Dispute(u64), PendingUpgrade, StorageVersion,
// ── Batch creation ────────────────────────────────────────────────────────────

/// Parameters for a single escrow in a batch creation call.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BatchEscrowParams {
    pub freelancer: Address,
    pub token: Address,
    pub total_amount: i128,
    pub brief_hash: BytesN<32>,
    pub arbiter: Option<Address>,
    pub deadline: Option<u64>,
}

// ── Protocol fees ─────────────────────────────────────────────────────────────

/// A single fee recipient with their share in basis points.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FeeRecipient {
    pub address: Address,
    /// Share of the fee in basis points (must sum to 10_000 across all recipients).
    pub share_bps: u32,
}

/// Accumulated fee balance per token.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FeeBalance {
    pub token: Address,
    pub amount: i128,
}

// ── Dispute arbitration ───────────────────────────────────────────────────────

/// A single vote cast by a reputation holder.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Vote {
    pub voter: Address,
    /// Reputation stake committed to this vote.
    pub stake: u64,
    /// true = favour client, false = favour freelancer.
    pub for_client: bool,
    pub cast_at: u64,
}

/// On-chain arbitration state for a disputed escrow.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ArbitrationDispute {
    pub escrow_id: u64,
    /// Ledger timestamp when voting opens.
    pub voting_opens_at: u64,
    /// Ledger timestamp when voting closes (7-day window).
    pub voting_closes_at: u64,
    /// Quadratic-weighted votes for client.
    pub weight_for_client: u64,
    /// Quadratic-weighted votes for freelancer.
    pub weight_for_freelancer: u64,
    /// Total raw stake committed (for slashing calculation).
    pub total_stake: u64,
    /// All individual votes.
    pub votes: Vec<Vote>,
    /// Whether the dispute has been resolved.
    pub resolved: bool,
    /// Resolution: true = client wins, false = freelancer wins.
    pub client_wins: Option<bool>,
}

// ── Proxy / upgrade ───────────────────────────────────────────────────────────

/// A pending upgrade queued with a 24-hour delay.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PendingUpgrade {
    pub new_wasm_hash: BytesN<32>,
    /// Ledger timestamp when the upgrade was queued.
    pub queued_at: u64,
    /// Earliest ledger timestamp when the upgrade can be executed.
    pub executable_after: u64,
    pub queued_by: Address,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    /// Protocol fee in basis points (0–200).
    FeeBps,
    /// Fee recipients list.
    FeeRecipients,
    /// Accumulated fee balance per token: token Address → i128.
    FeeBalance(Address),
    /// Arbitration dispute by escrow ID.
    Dispute(u64),
    /// Pending upgrade.
    PendingUpgrade,
    /// Storage version for migration.
    StorageVersion,
}
