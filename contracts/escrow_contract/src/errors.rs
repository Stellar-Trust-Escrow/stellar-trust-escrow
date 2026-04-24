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
    /// Contract `initialize` was called more than once.
    AlreadyInitialized = 1,
    /// A function that requires initialization was called before `initialize`.
    NotInitialized = 2,

    // ── Authorization ─────────────────────────────────────────────────────────
    /// Caller is not authorized for this operation (not client, freelancer, or a buyer signer).
    Unauthorized = 3,
    /// Operation requires the contract admin address.
    AdminOnly = 4,
    /// Operation requires the escrow client address.
    ClientOnly = 5,
    /// Operation requires the escrow freelancer address.
    FreelancerOnly = 6,

    // ── Escrow State ──────────────────────────────────────────────────────────
    // Note: discriminants 7 is reserved / unused.
    /// No escrow exists for the given `escrow_id`.
    EscrowNotFound = 8,
    /// Operation requires the escrow to be in `Active` status.
    EscrowNotActive = 9,
    /// Operation requires the escrow to be in `Disputed` status.
    EscrowNotDisputed = 10,
    // Note: discriminant 11 is reserved / unused.
    /// Escrow cannot be cancelled while milestone funds are pending release.
    CannotCancelWithPendingFunds = 12,

    // ── Milestone ─────────────────────────────────────────────────────────────
    /// No milestone exists for the given `milestone_id` within this escrow.
    MilestoneNotFound = 13,
    /// The milestone is not in the required state for this operation.
    InvalidMilestoneState = 14,
    /// The sum of milestone amounts would exceed the escrow's `total_amount`.
    MilestoneAmountExceedsEscrow = 15,
    /// Adding this milestone would exceed the maximum allowed milestone count.
    TooManyMilestones = 16,
    /// Milestone amount is zero or negative.
    InvalidMilestoneAmount = 17,

    // ── Funds ─────────────────────────────────────────────────────────────────
    /// Token transfer via the SAC client failed.
    TransferFailed = 18,
    /// Escrow `total_amount` is zero or negative.
    InvalidEscrowAmount = 19,
    /// Deposited amount does not match the sum of milestone amounts.
    AmountMismatch = 20,
    /// Escrow is in an unexpected state for this funds operation.
    InvalidEscrowState = 21,

    // ── Dispute ───────────────────────────────────────────────────────────────
    // Note: discriminant 22 is reserved / unused.
    // Note: discriminant 24 is reserved / unused.
    /// A dispute already exists for this escrow; only one active dispute is allowed.
    DisputeAlreadyExists = 23,

    // ── Deadline ──────────────────────────────────────────────────────────────
    /// Provided deadline is in the past or otherwise invalid.
    InvalidDeadline = 25,
    /// The escrow deadline has already passed.
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
    /// No cancellation request exists for this escrow.
    CancellationNotFound = 32,
    /// A cancellation request already exists for this escrow.
    CancellationAlreadyExists = 33,
    /// The cancellation request has already been disputed.
    CancellationAlreadyDisputed = 34,
    /// The dispute window for this cancellation is still open.
    CancellationDisputePeriodActive = 35,
    /// The dispute deadline for this cancellation has passed.
    CancellationDisputeDeadlineExpired = 36,
    /// Cancellation is blocked because a dispute was raised against it.
    CancellationDisputed = 37,

    // ── Slashing ─────────────────────────────────────────────────────────────
    /// No slash record exists for this escrow.
    SlashNotFound = 38,
    /// The slash has already been disputed.
    SlashAlreadyDisputed = 39,
    /// The dispute deadline for this slash has passed.
    SlashDisputeDeadlineExpired = 40,
    /// Slash amount is zero or negative.
    InvalidSlashAmount = 41,

    // ── Storage Migration ───────────────────────────────────────────────────────
    /// An error occurred during a storage schema migration.
    StorageMigrationFailed = 42,

    // ── Recurring Payments ───────────────────────────────────────────────────
    /// No recurring payment config exists for the given `escrow_id`.
    RecurringConfigNotFound = 43,
    /// Recurring schedule parameters are invalid (e.g. `start_time` in the past, no termination condition).
    InvalidRecurringSchedule = 44,
    /// No payment is currently due (`now < next_payment_at` or `payments_remaining == 0`).
    NoRecurringPaymentDue = 45,
    /// The recurring schedule is paused; call `resume_recurring_schedule` first.
    RecurringSchedulePaused = 46,
    /// The recurring schedule has been cancelled; no further payments can be processed.
    RecurringScheduleCancelled = 47,

    // ── Oracle ───────────────────────────────────────────────────────────────
    /// No oracle address has been configured on the contract.
    OracleNotConfigured = 48,
    /// The oracle price feed has not been updated within the acceptable staleness window.
    OraclePriceStale = 49,
    /// The oracle returned a zero or negative price.
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

    // ── Input Validation ─────────────────────────────────────────────────────
    /// A string argument exceeds MAX_STRING_LEN or is empty.
    StringTooLong = 55,
}
