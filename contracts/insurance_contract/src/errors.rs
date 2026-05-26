//! # Insurance Contract Errors

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum InsuranceError {
    // ── Initialization ────────────────────────────────────────────────────────
    AlreadyInitialized = 1,
    NotInitialized = 2,

    // ── Authorization ─────────────────────────────────────────────────────────
    AdminOnly = 3,
    Unauthorized = 4,
    /// Caller is not a registered governor
    NotGovernor = 5,

    // ── Contributions ─────────────────────────────────────────────────────────
    InvalidAmount = 6,
    /// Contribution below minimum threshold
    BelowMinimum = 7,

    // ── Claims ────────────────────────────────────────────────────────────────
    ClaimNotFound = 8,
    /// Claim is not in the expected state for this operation
    InvalidClaimState = 9,
    /// Requested payout exceeds fund balance
    InsufficientFunds = 10,
    /// Claimant has an open claim already
    ClaimAlreadyOpen = 11,
    /// Claim amount exceeds the per-claim cap
    ClaimExceedsCap = 12,
    /// Claim amount must be > 0
    InvalidClaimAmount = 13,

    // ── Governance ────────────────────────────────────────────────────────────
    /// Governor already registered
    GovernorAlreadyExists = 14,
    /// Governor not found
    GovernorNotFound = 15,
    /// Vote already cast by this governor on this claim
    AlreadyVoted = 16,
    /// Quorum not yet reached
    QuorumNotReached = 17,

    // ── Deadline ─────────────────────────────────────────────────────────────
    InvalidDeadline = 18,
    ClaimExpired = 19,
}
