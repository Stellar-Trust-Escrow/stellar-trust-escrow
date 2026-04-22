use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ExtError {
    AlreadyInitialized = 1, NotInitialized = 2, AdminOnly = 3, Unauthorized = 4,
    BatchTooLarge = 10, BatchEmpty = 11, BatchItemInvalid = 12,
    InvalidFeeBps = 20, FeeTooHigh = 21, InvalidRecipient = 22, NoFeesAccumulated = 23,
    DisputeNotFound = 30, DisputeAlreadyExists = 31, VotingWindowClosed = 32,
    VotingWindowOpen = 33, AlreadyVoted = 34, InsufficientStake = 35,
    InvalidVoteWeight = 36, QuorumNotReached = 37,
    UpgradeDelayNotElapsed = 40, NoPendingUpgrade = 41, UpgradeAlreadyPending = 42,
    // ── Init ──────────────────────────────────────────────────────────────────
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AdminOnly = 3,
    Unauthorized = 4,

    // ── Batch creation ────────────────────────────────────────────────────────
    BatchTooLarge = 10,
    BatchEmpty = 11,
    BatchItemInvalid = 12,

    // ── Protocol fees ─────────────────────────────────────────────────────────
    InvalidFeeBps = 20,
    /// fee_bps > 200 (2 %)
    FeeTooHigh = 21,
    InvalidRecipient = 22,
    NoFeesAccumulated = 23,

    // ── Dispute arbitration ───────────────────────────────────────────────────
    DisputeNotFound = 30,
    DisputeAlreadyExists = 31,
    VotingWindowClosed = 32,
    VotingWindowOpen = 33,
    AlreadyVoted = 34,
    InsufficientStake = 35,
    InvalidVoteWeight = 36,
    QuorumNotReached = 37,

    // ── Proxy / upgrade ───────────────────────────────────────────────────────
    UpgradeDelayNotElapsed = 40,
    NoPendingUpgrade = 41,
    UpgradeAlreadyPending = 42,
    InvalidWasmHash = 43,
}
