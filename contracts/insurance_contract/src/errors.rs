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

    // ── Staking ───────────────────────────────────────────────────────────────
    /// Reentrancy detected
    Reentrancy = 20,
    /// No active stake for this address
    NoStakeFound = 21,
    /// Unstake amount exceeds staked balance
    InsufficientStake = 22,
    /// Slash proposal not found
    SlashProposalNotFound = 23,
    /// Slash proposal is not in Approved state
    SlashProposalNotApproved = 24,
    /// slash_bps exceeds the configured maximum (40%)
    SlashExceedsCap = 25,
    /// slash_bps must be > 0
    InvalidSlashBps = 26,
    /// Nothing to yield-claim
    NoYieldAvailable = 27,
}
