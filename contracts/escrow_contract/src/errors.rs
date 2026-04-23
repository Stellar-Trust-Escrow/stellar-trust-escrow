//! # Contract Errors
//!
//! All possible error conditions returned by the escrow contract.
//! Every public function returns `Result<T, EscrowError>`.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    // ── Initialization ────────────────────────────────────────────────────────
    /// Contract has already been initialized.
    AlreadyInitialized = 1,
    /// Contract has not been initialized yet.
    NotInitialized = 2,

    // ── Authorization ─────────────────────────────────────────────────────────
    /// Caller is not authorized to perform this action.
    Unauthorized = 3,
    /// Only the contract admin can perform this action.
    AdminOnly = 4,
    /// Only the client of this escrow can perform this action.
    ClientOnly = 5,
    /// Only the freelancer of this escrow can perform this action.
    FreelancerOnly = 6,
    /// Only the designated arbiter can perform this action.
    ArbiterOnly = 7,

    // ── Escrow State ──────────────────────────────────────────────────────────
    /// The escrow ID does not exist.
    EscrowNotFound = 8,
    /// The escrow is not in the Active state required for this operation.
    EscrowNotActive = 9,
    /// The escrow is not in a Disputed state.
    EscrowNotDisputed = 10,
    /// The escrow has already been completed or cancelled.
    EscrowFinalized = 11,
    /// Cannot cancel escrow with unreleased approved milestones.
    CannotCancelWithPendingFunds = 12,

    // ── Milestone ─────────────────────────────────────────────────────────────
    /// The milestone ID does not exist in this escrow.
    MilestoneNotFound = 13,
    /// The milestone is not in the correct state for this operation.
    InvalidMilestoneState = 14,
    /// Total milestone amounts exceed the escrow's total amount.
    MilestoneAmountExceedsEscrow = 15,
    /// Cannot add more milestones; maximum limit reached.
    /// TODO (contributor): define and enforce max milestone count
    TooManyMilestones = 16,
    /// Milestone amount must be greater than zero.
    InvalidMilestoneAmount = 17,

    // ── Funds ─────────────────────────────────────────────────────────────────
    /// Token transfer failed.
    TransferFailed = 18,
    /// Escrow amount must be greater than zero.
    InvalidEscrowAmount = 19,
    /// The deposited amount does not match the sum of milestone amounts.
    /// TODO (contributor): decide whether to enforce strict matching
    AmountMismatch = 20,

    // ── Reputation ────────────────────────────────────────────────────────────
    /// Reputation record not found for this address.
    ReputationNotFound = 21,

    // ── Dispute ───────────────────────────────────────────────────────────────
    /// A dispute has already been raised on this escrow.
    DisputeAlreadyExists = 22,
    /// Cannot raise a dispute on an escrow with no active milestones.
    NoActiveDisputableMilestone = 23,

    // ── Deadline ──────────────────────────────────────────────────────────────
    /// The specified deadline is in the past.
    InvalidDeadline = 24,
    /// The escrow deadline has passed.
    /// TODO (contributor): implement deadline enforcement
    DeadlineExpired = 25,

    // ── Admin ─────────────────────────────────────────────────────────────────
    /// Timelock for admin change has not expired yet.
    TimelockNotExpired = 53,

    // ── Oracle ────────────────────────────────────────────────────────────────
    /// Oracle returned an invalid price (zero or negative).
    OracleInvalidPrice = 50,
    /// Oracle price data is stale (timestamp too old).
    OracleStalePrice = 51,
}
