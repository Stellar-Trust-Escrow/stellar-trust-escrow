//! # Insurance Contract Types

use soroban_sdk::{contracttype, Address, String};

// ── Enums ─────────────────────────────────────────────────────────────────────

/// Lifecycle state of an insurance claim.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClaimStatus {
    /// Submitted, awaiting governor votes.
    Pending,
    /// Governors approved — payout queued.
    Approved,
    /// Governors rejected — no payout.
    Rejected,
    /// Payout has been executed.
    Paid,
    /// Claimant withdrew the claim before evaluation.
    Withdrawn,
}

// ── Structs ───────────────────────────────────────────────────────────────────

/// A single insurance claim.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Claim {
    pub id: u32,
    /// Address that submitted the claim and will receive the payout.
    pub claimant: Address,
    /// Human-readable description / IPFS hash of supporting evidence.
    pub description: String,
    /// Requested payout amount (in token base units).
    pub amount: i128,
    pub status: ClaimStatus,
    /// Ledger timestamp when the claim was submitted.
    pub submitted_at: u64,
    /// Ledger timestamp after which the claim expires if not evaluated.
    pub expires_at: u64,
    /// Votes in favour of approval.
    pub votes_for: u32,
    /// Votes against approval.
    pub votes_against: u32,
}

/// Snapshot of the fund's financial state — returned by `get_fund_info`.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FundInfo {
    /// Total tokens ever contributed.
    pub total_contributed: i128,
    /// Total tokens paid out to approved claims.
    pub total_paid_out: i128,
    /// Current spendable balance held by the contract.
    pub current_balance: i128,
    /// Number of claims submitted (all statuses).
    pub total_claims: u32,
    /// Number of claims paid out.
    pub paid_claims: u32,
    /// Number of registered governors.
    pub governor_count: u32,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    /// Contract admin address — instance storage.
    Admin,
    /// Accepted token address — instance storage.
    Token,
    /// Minimum contribution amount — instance storage.
    MinContribution,
    /// Maximum payout per claim — instance storage.
    ClaimCap,
    /// Number of governors required to approve/reject — instance storage.
    Quorum,
    /// Auto-incrementing claim counter — instance storage.
    ClaimCounter,
    /// Aggregate fund stats — instance storage.
    FundStats,
    /// Claim by ID — persistent storage.
    Claim(u32),
    /// Contribution total per contributor — persistent storage.
    Contribution(Address),
    /// Governor registration — persistent storage.
    Governor(Address),
    /// Vote record: (claim_id, governor) → bool (true = for) — persistent storage.
    Vote(u32, Address),
}

/// Mutable aggregate stats stored under DataKey::FundStats.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FundStats {
    pub total_contributed: i128,
    pub total_paid_out: i128,
    pub total_claims: u32,
    pub paid_claims: u32,
    pub governor_count: u32,
}
