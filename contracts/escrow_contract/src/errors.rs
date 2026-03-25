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
    AlreadyInitialized = 1,
    NotInitialized = 2,

    // ── Authorization ─────────────────────────────────────────────────────────
    Unauthorized = 3,
    AdminOnly = 4,
    ClientOnly = 5,
    FreelancerOnly = 6,
    ArbiterOnly = 7,

    // ── Escrow State ──────────────────────────────────────────────────────────
    EscrowNotFound = 8,
    EscrowNotActive = 9,
    EscrowNotDisputed = 10,
    EscrowFinalized = 11,
    CannotCancelWithPendingFunds = 12,

    // ── Milestone ─────────────────────────────────────────────────────────────
    MilestoneNotFound = 13,
    InvalidMilestoneState = 14,
    MilestoneAmountExceedsEscrow = 15,
    TooManyMilestones = 16,
    InvalidMilestoneAmount = 17,

    // ── Funds ─────────────────────────────────────────────────────────────────
    TransferFailed = 18,
    InvalidEscrowAmount = 19,
    AmountMismatch = 20,
    /// The escrow is not in a valid state for this operation.
    InvalidEscrowState = 21,

    // ── Reputation ────────────────────────────────────────────────────────────
    ReputationNotFound = 22,

    // ── Dispute ───────────────────────────────────────────────────────────────
    DisputeAlreadyExists = 23,
    NoActiveDisputableMilestone = 24,

    // ── Deadline ──────────────────────────────────────────────────────────────
    InvalidDeadline = 25,
    DeadlineExpired = 26,

    // ── Time Lock ─────────────────────────────────────────────────────────────
    InvalidLockTime = 27,
    LockTimeNotExpired = 28,
    LockTimeExpired = 29,
    InvalidLockTimeExtension = 30,

    // ── Cancellation ──────────────────────────────────────────────────────────
    CancellationNotFound = 31,
    CancellationAlreadyExists = 32,
    CancellationAlreadyDisputed = 33,
    CancellationDisputePeriodActive = 34,
    CancellationDisputeDeadlineExpired = 35,
    CancellationDisputed = 36,

    // ── Slashing ─────────────────────────────────────────────────────────────
    SlashNotFound = 37,
    SlashAlreadyDisputed = 38,
    SlashDisputeDeadlineExpired = 39,
    InvalidSlashAmount = 40,
}
