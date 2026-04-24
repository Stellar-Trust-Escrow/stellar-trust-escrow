use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum GovError {
    // Initialization
    AlreadyInitialized = 1,
    NotInitialized = 2,

    // Authorization
    Unauthorized = 3,
    AdminOnly = 4,

    // Proposals
    ProposalNotFound = 5,
    ProposalNotActive = 6,
    ProposalNotPassed = 7,
    ProposalAlreadyExecuted = 8,
    ProposalExpired = 9,
    TimelockNotElapsed = 10,
    InvalidProposalType = 11,
    EmptyDescription = 12,

    // Voting
    AlreadyVoted = 13,
    VotingClosed = 14,
    VotingNotStarted = 15,
    InsufficientVotingPower = 16,

    // Quorum / threshold
    QuorumNotReached = 17,
    ThresholdNotReached = 18,

    // Parameters
    InvalidParameter = 19,
    InvalidDuration = 20,
}
