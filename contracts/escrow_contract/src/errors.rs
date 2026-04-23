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

    // ── Escrow State ──────────────────────────────────────────────────────────
    EscrowNotFound = 8,
    EscrowNotActive = 9,
    EscrowNotDisputed = 10,
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

    // ── Dispute ───────────────────────────────────────────────────────────────
    DisputeAlreadyExists = 23,

    // ── Deadline ──────────────────────────────────────────────────────────────
    InvalidDeadline = 25,
    DeadlineExpired = 26,

    // ── Time Lock ─────────────────────────────────────────────────────────────
    /// The specified lock time is in the past.
    InvalidLockTime = 27,
    /// Funds are still locked until the lock time expires.
    LockTimeNotExpired = 28,
    /// The lock time has expired.
    LockTimeExpired = 29,
    /// Cannot extend lock time to the past.
    InvalidLockTimeExtension = 30,
    /// The contract is currently paused.
    ContractPaused = 31,

    // ── Cancellation ──────────────────────────────────────────────────────────
    CancellationNotFound = 32,
    CancellationAlreadyExists = 33,
    CancellationAlreadyDisputed = 34,
    CancellationDisputePeriodActive = 35,
    CancellationDisputeDeadlineExpired = 36,
    CancellationDisputed = 37,

    // ── Slashing ─────────────────────────────────────────────────────────────
    SlashNotFound = 38,
    SlashAlreadyDisputed = 39,
    SlashDisputeDeadlineExpired = 40,
    InvalidSlashAmount = 41,

    // ── Storage Migration ───────────────────────────────────────────────────────
    StorageMigrationFailed = 42,

    // ── Recurring Payments ───────────────────────────────────────────────────
    RecurringConfigNotFound = 43,
    InvalidRecurringSchedule = 44,
    NoRecurringPaymentDue = 45,
    RecurringSchedulePaused = 46,
    RecurringScheduleCancelled = 47,

    // ── Oracle ───────────────────────────────────────────────────────────────
    OracleNotConfigured = 48,
    OraclePriceStale = 49,
    OracleInvalidPrice = 50,

    // ── Timelock ─────────────────────────────────────────────────────────────
    /// The specified timelock duration is invalid.
    InvalidTimelockDuration = 51,
    /// The timelock is already active.
    TimelockAlreadyActive = 52,
    /// The timelock has not yet expired.
    TimelockNotExpired = 53,

    // ── Bridge / Cross-Chain ─────────────────────────────────────────────────
    /// Wrapped token not approved, transfer not found, or bridge not yet finalized.
    BridgeError = 54,

    // ── Arbiter ──────────────────────────────────────────────────────────────
    /// Arbiter cannot be client or freelancer.
    BadArbiter = 7,
}
