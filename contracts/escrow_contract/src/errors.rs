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
    // Note: discriminant 6 is reserved / unused.

    // ── Escrow State ──────────────────────────────────────────────────────────
    /// Reserved for future use.
    Reserved7 = 7,
    /// No escrow exists for the given `escrow_id`.
    EscrowNotFound = 8,
    /// Operation requires the escrow to be in `Active` status.
    EscrowNotActive = 9,
    /// Operation requires the escrow to be in `Disputed` status.
    EscrowNotDisputed = 10,
    /// Reserved for future use.
    Reserved11 = 11,
    /// Escrow cannot be cancelled while milestone funds are pending release.
    PendingFunds = 12,

    // ── Milestone ─────────────────────────────────────────────────────────────
    /// No milestone exists for the given `milestone_id` within this escrow.
    MilestoneNotFound = 13,
    /// The milestone is not in the required state for this operation.
    InvalidMilestoneState = 14,
    /// The sum of milestone amounts would exceed the escrow's `total_amount`.
    MilestoneAmountExceeds = 15,
    /// Adding this milestone would exceed the maximum allowed milestone count.
    TooManyMilestones = 16,
    /// Milestone amount is zero or negative.
    InvalidMilestoneAmount = 17,

    // ── Funds ─────────────────────────────────────────────────────────────────
    // Note: discriminant 18 is reserved / unused.
    /// Escrow `total_amount` is zero or negative.
    InvalidEscrowAmount = 19,
    /// Deposited amount does not match the sum of milestone amounts.
    AmountMismatch = 20,
    // ── Dispute ───────────────────────────────────────────────────────────────
    /// Reentrant outbound token flow was blocked by the contract guard.
    ReentrancyBlocked = 22,
    /// Dispute timeout has not yet elapsed for this escrow.
    DisputeTimeoutNotReached = 23,
    /// Reserved for future use.
    Reserved24 = 24,

    // ── Deadline ──────────────────────────────────────────────────────────────
    // Note: discriminant 25 is reserved / unused.
    /// The escrow deadline has already passed.
    DeadlineExpired = 26,

    // ── Time Lock ─────────────────────────────────────────────────────────────
    // Note: discriminant 27 is reserved / unused.
    /// Funds are still locked until the lock time expires.
    LockTimeNotExpired = 28,
    // Note: discriminant 29 is reserved / unused.
    /// Cannot extend lock time to the past.
    InvalidLockExtension = 30,
    /// The contract is currently paused.
    ContractPaused = 31,

    // ── Cancellation ──────────────────────────────────────────────────────────
    /// No cancellation request exists for this escrow.
    CancellationNotFound = 32,
    /// A cancellation request already exists for this escrow.
    CancelAlreadyExists = 33,
    /// The cancellation request has already been disputed.
    CancelAlreadyDisputed = 34,
    /// The dispute window for this cancellation is still open.
    CancelPeriodActive = 35,
    /// The dispute deadline for this cancellation has passed.
    CancelDeadlineExpired = 36,
    /// Cancellation is blocked because a dispute was raised against it.
    CancellationDisputed = 37,

    // ── Slashing ─────────────────────────────────────────────────────────────
    /// No slash record exists for this escrow.
    SlashNotFound = 38,
    /// The slash has already been disputed.
    SlashAlreadyDisputed = 39,
    /// The dispute deadline for this slash has passed.
    SlashDeadlineExpired = 40,
    /// A SlashRecord already exists for this escrow; duplicate slash rejected.
    SlashAlreadyApplied = 41,

    // ── Storage Migration ───────────────────────────────────────────────────────
    /// An error occurred during a storage schema migration.
    MigrationFailed = 42,

    // ── Recurring Payments ───────────────────────────────────────────────────
    /// No recurring payment config exists for the given `escrow_id`.
    RecurringNotFound = 43,
    /// Recurring schedule parameters are invalid (e.g. `start_time` in the past, no termination condition).
    InvalidRecurring = 44,
    /// No payment is currently due (`now < next_payment_at` or `payments_remaining == 0`).
    NoRecurringDue = 45,
    /// The recurring schedule is paused; call `resume_recurring_schedule` first.
    RecurringPaused = 46,
    /// The recurring schedule has been cancelled; no further payments can be processed.
    RecurringCancelled = 47,

    // ── Oracle ───────────────────────────────────────────────────────────────
    // Note: discriminants 48-50 are reserved / unused.

    // ── Timelock ─────────────────────────────────────────────────────────────
    /// The specified timelock duration is invalid.
    InvalidTimelock = 51,
    // Note: discriminant 52 is reserved / unused.
    /// The timelock has not yet expired.
    TimelockNotExpired = 53,

    // ── Bridge / Cross-Chain ─────────────────────────────────────────────────
    /// Wrapped token not approved, transfer not found, or bridge not yet finalized.
    BridgeError = 54,

    // ── Input Validation ─────────────────────────────────────────────────────
    /// A string argument exceeds MAX_STRING_LEN or is empty.
    StringTooLong = 55,
    // Note: discriminants 56-58 are reserved / unused.

    // ── Admin Transfer ───────────────────────────────────────────────────────
    // Note: discriminant 59 is reserved / unused.
}
