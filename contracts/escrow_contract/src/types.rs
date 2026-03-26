//! # Data Types
//!
//! All shared structs, enums, and storage keys for the escrow contract.

use soroban_sdk::{contracttype, Address, BytesN, String};

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

/// The lifecycle state of an escrow agreement.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    /// Escrow has been created and funds are locked. Work can begin.
    Active,
    /// All milestones approved, all funds released. Escrow is complete.
    Completed,
    /// A dispute has been raised. Funds are frozen pending resolution.
    Disputed,
    /// Escrow was cancelled before completion. Funds returned to client.
    Cancelled,
    /// Cancellation requested - pending dispute resolution or deadline.
    CancellationPending,
}

/// The lifecycle state of an individual milestone.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MilestoneStatus {
    /// Milestone defined but work not yet started/submitted.
    Pending,
    /// Freelancer has submitted work for this milestone.
    Submitted,
    /// Client has approved the milestone. Funds have been released.
    Approved,
    /// Client rejected the submission. Freelancer should resubmit.
    Rejected,
    /// A dispute has been raised on this milestone. Funds are frozen.
    Disputed,
}

/// Supported recurring payment intervals.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RecurringInterval {
    Daily,
    Weekly,
    Monthly,
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTS
// ─────────────────────────────────────────────────────────────────────────────

/// A single milestone within an escrow agreement.
///
/// Each milestone represents a discrete deliverable with a defined
/// payment amount. Funds for a milestone are released only after
/// the client approves the submission.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    /// Sequential ID within this escrow (starts at 0).
    pub id: u32,

    /// Short human-readable title (stored on-chain for indexing).
    /// Longer descriptions should be stored off-chain (IPFS) with a hash.
    pub title: String,

    /// IPFS content hash of the full milestone description/requirements.
    /// TODO (contributor): implement IPFS hash validation helper
    pub description_hash: BytesN<32>,

    /// Token amount allocated to this milestone (in stroops / base units).
    pub amount: i128,

    /// Current state of this milestone.
    pub status: MilestoneStatus,

    /// Ledger timestamp when the freelancer submitted work.
    /// `None` if not yet submitted.
    pub submitted_at: Option<u64>,

    /// Ledger timestamp when the client approved or rejected.
    pub resolved_at: Option<u64>,
}

/// Configuration for a recurring/subscription escrow.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecurringPaymentConfig {
    /// Payment interval cadence.
    pub interval: RecurringInterval,

    /// Amount released each time a payment becomes due.
    pub payment_amount: i128,

    /// Timestamp of the first scheduled payment.
    pub start_time: u64,

    /// Timestamp when the next payment becomes due.
    pub next_payment_at: u64,

    /// Optional schedule end date.
    pub end_date: Option<u64>,

    /// Total number of scheduled payments for this escrow.
    pub total_payments: u32,

    /// Remaining scheduled payments not yet released.
    pub payments_remaining: u32,

    /// Number of payments already processed.
    pub processed_payments: u32,

    /// Whether scheduled releases are currently paused.
    pub paused: bool,

    /// Whether the recurring schedule has been cancelled.
    pub cancelled: bool,

    /// Optional timestamp when the schedule was paused.
    pub paused_at: Option<u64>,

    /// Optional timestamp of the most recent processed payment.
    pub last_payment_at: Option<u64>,
}

/// The main escrow agreement.
///
/// One escrow can contain multiple milestones. Funds for all milestones
/// are locked upfront when the escrow is created.
#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowState {
    /// Unique identifier for this escrow (auto-incremented).
    pub escrow_id: u64,

    /// Address of the client who created and funded the escrow.
    pub client: Address,

    /// Address of the freelancer who will deliver the work.
    pub freelancer: Address,

    /// The Stellar Asset Contract address for the payment token.
    /// Typically USDC or XLM wrapped in a SAC.
    pub token: Address,

    /// Sum of all milestone amounts. Must equal the deposited token amount.
    pub total_amount: i128,

    /// Amount not yet released to the freelancer.
    pub remaining_balance: i128,

    /// Current escrow status.
    pub status: EscrowStatus,

    /// Ordered list of milestones.
    /// TODO (contributor): consider using a map keyed by milestone_id for O(1) lookup
    pub milestones: soroban_sdk::Vec<Milestone>,

    /// Optional: address of a trusted arbiter for dispute resolution.
    /// If None, disputes require both parties to agree on resolution.
    /// TODO (contributor): implement arbiter selection and staking
    pub arbiter: Option<Address>,

    /// Ledger timestamp of escrow creation.
    pub created_at: u64,

    /// Optional deadline for the entire escrow (ledger timestamp).
    /// TODO (contributor): implement auto-cancel on deadline
    pub deadline: Option<u64>,

    /// Optional lock time (ledger timestamp) - funds locked until this time.
    /// When set, funds cannot be released until this timestamp has passed.
    /// Useful for vesting schedules, deferred payments, or future-dated agreements.
    pub lock_time: Option<u64>,

    /// Optional extension deadline for the lock time.
    /// Can be used to extend the lock_time if needed.
    pub lock_time_extension: Option<u64>,

    /// IPFS hash of the full project brief / agreement document.
    pub brief_hash: BytesN<32>,
}

/// On-chain reputation record for a user address.
///
/// Built up over time as escrows complete or are disputed.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ReputationRecord {
    /// The user this record belongs to.
    pub address: Address,

    /// Total reputation points accumulated.
    /// Formula: TODO (contributor) — define scoring algorithm.
    pub total_score: u64,

    /// Number of escrows completed successfully.
    pub completed_escrows: u32,

    /// Number of escrows that ended in a dispute.
    pub disputed_escrows: u32,

    /// Number of disputes won (resolved in this party's favour).
    pub disputes_won: u32,

    /// Total value transacted through escrows (in base token units).
    pub total_volume: i128,

    /// Number of times this user has been slashed.
    pub slash_count: u32,

    /// Total amount slashed from this user (in base token units).
    pub total_slashed: i128,

    /// Ledger timestamp of the last reputation update.
    pub last_updated: u64,
}

/// A cancellation request for an escrow.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CancellationRequest {
    /// The escrow ID this request belongs to.
    pub escrow_id: u64,

    /// Address of the party requesting cancellation.
    pub requester: Address,

    /// Reason for cancellation.
    pub reason: String,

    /// When the cancellation was requested (ledger timestamp).
    pub requested_at: u64,

    /// Deadline for disputes (ledger timestamp).
    pub dispute_deadline: u64,

    /// Whether this cancellation has been disputed.
    pub disputed: bool,
}

/// A slash record for tracking penalties.
#[contracttype]
#[derive(Clone, Debug)]
pub struct SlashRecord {
    /// The escrow ID this slash belongs to.
    pub escrow_id: u64,

    /// Address of the user being slashed.
    pub slashed_user: Address,

    /// Address of the user receiving the slash.
    pub recipient: Address,

    /// Amount being slashed.
    pub amount: i128,

    /// Reason for the slash.
    pub reason: String,

    /// When the slash was applied (ledger timestamp).
    pub slashed_at: u64,

    /// Whether this slash has been disputed.
    pub disputed: bool,
}

// ─────────────────────────────────────────────────────────────────────────────
// META-TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────

/// Meta-transaction data structure.
///
/// Allows users to sign transaction intents off-chain and have them
/// executed by a relayer without the user paying transaction fees.
#[contracttype]
#[derive(Clone, Debug)]
pub struct MetaTransaction {
    /// The address of the user who signed this transaction
    pub signer: Address,

    /// Unique nonce to prevent replay attacks
    pub nonce: u64,

    /// Maximum timestamp when this meta-tx is valid (Unix timestamp)
    pub deadline: u64,

    /// The function name to call (e.g., "create_escrow")
    pub function_name: String,

    /// Serialized function arguments as JSON
    pub function_args: String,

    /// Ed25519 signature of the transaction data
    pub signature: BytesN<64>,
}

/// Fee delegation information for meta-transactions.
///
/// Specifies how fees should be paid when executing meta-transactions.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FeeDelegation {
    /// Address that will pay the transaction fees
    pub fee_payer: Address,

    /// Maximum fee amount the fee_payer is willing to pay
    pub max_fee: i128,

    /// Token contract address for fee payment (typically XLM)
    pub fee_token: Address,
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE KEYS
// ─────────────────────────────────────────────────────────────────────────────

/// Contract storage keys.
///
/// All persistent state lives under one of these keys.
#[contracttype]
pub enum DataKey {
    /// Global escrow counter — value: u64
    EscrowCounter,
    /// Escrow state by ID — key: u64, value: EscrowState
    Escrow(u64),
    /// Reputation record by address — key: Address, value: ReputationRecord
    Reputation(Address),
    /// Contract admin address — value: Address
    Admin,
    /// Contract pause state — value: bool
    Paused,
    /// Cancellation request by escrow ID — key: u64, value: CancellationRequest
    CancellationRequest(u64),
    /// Slash record by escrow ID — key: u64, value: SlashRecord
    SlashRecord(u64),
    /// Recurring payment config by escrow ID — key: u64, value: RecurringPaymentConfig
    RecurringConfig(u64),
}
