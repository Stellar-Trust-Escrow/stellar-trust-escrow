use soroban_sdk::{contracttype, Address, String};

// ── Proposal types ────────────────────────────────────────────────────────────

/// The kind of action a proposal will execute if it passes.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalType {
    /// Change a named protocol parameter (e.g. platform fee, quorum %).
    ParameterChange,
    /// Upgrade a target contract to a new WASM hash.
    ContractUpgrade,
    /// Allocate funds from the governance treasury to an address.
    FundAllocation,
    /// Signal-only proposal with no on-chain execution.
    TextProposal,
}

/// Lifecycle state of a proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    /// Voting is open.
    Active,
    /// Voting period ended; quorum + threshold met. Awaiting timelock.
    Passed,
    /// Voting period ended; quorum or threshold not met.
    Defeated,
    /// Passed + timelock elapsed; ready to execute.
    Queued,
    /// Successfully executed.
    Executed,
    /// Cancelled by the proposer or admin before execution.
    Cancelled,
}

/// A single vote cast by an address.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Vote {
    pub voter: Address,
    pub support: bool,   // true = for, false = against
    pub power: i128,     // voting power at time of vote
    pub cast_at: u64,    // ledger timestamp
}

/// Execution payload for a ParameterChange proposal.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ParameterPayload {
    pub key: String,
    pub value: i128,
}

/// Execution payload for a ContractUpgrade proposal.
#[contracttype]
#[derive(Clone, Debug)]
pub struct UpgradePayload {
    pub target_contract: Address,
    pub new_wasm_hash: soroban_sdk::BytesN<32>,
}

/// Execution payload for a FundAllocation proposal.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FundPayload {
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
}

/// Union of all possible execution payloads.
#[contracttype]
#[derive(Clone, Debug)]
pub enum ProposalPayload {
    Parameter(ParameterPayload),
    Upgrade(UpgradePayload),
    Fund(FundPayload),
    Text,
}

/// A governance proposal.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Proposal {
    pub id: u64,
    pub proposal_type: ProposalType,
    pub proposer: Address,
    pub title: String,
    pub description: String,
    pub payload: ProposalPayload,
    pub status: ProposalStatus,

    /// Ledger timestamp when voting opens.
    pub vote_start: u64,
    /// Ledger timestamp when voting closes.
    pub vote_end: u64,
    /// Ledger timestamp after which the proposal can be executed (vote_end + timelock).
    pub executable_at: u64,

    /// Total voting power that voted FOR.
    pub votes_for: i128,
    /// Total voting power that voted AGAINST.
    pub votes_against: i128,

    /// Snapshot of total token supply at proposal creation (for quorum calc).
    pub total_supply_snapshot: i128,

    pub created_at: u64,
    pub executed_at: Option<u64>,
}

/// Governance configuration parameters.
#[contracttype]
#[derive(Clone, Debug)]
pub struct GovConfig {
    /// Governance token address (voting power = token balance).
    pub token: Address,

    /// Minimum tokens required to create a proposal.
    pub proposal_threshold: i128,

    /// Voting period duration in seconds.
    pub voting_period: u64,

    /// Delay between proposal creation and vote start (in seconds).
    pub voting_delay: u64,

    /// Timelock delay between a passed vote and execution (in seconds).
    pub timelock_delay: u64,

    /// Minimum % of total supply that must vote for quorum (basis points, e.g. 400 = 4%).
    pub quorum_bps: u32,

    /// Minimum % of votes that must be FOR to pass (basis points, e.g. 5100 = 51%).
    pub approval_threshold_bps: u32,
}

/// Storage keys.
#[contracttype]
pub enum DataKey {
    Admin,
    Config,
    ProposalCounter,
    Proposal(u64),
    /// Whether `voter` has voted on proposal `id`: (proposal_id, voter)
    HasVoted(u64, Address),
}
