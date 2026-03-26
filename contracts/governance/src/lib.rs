//! # StellarTrustEscrow — Governance Contract
//!
//! Decentralized governance allowing token holders to vote on protocol changes.
//!
//! ## Flow
//!
//! 1. Token holder with >= `proposal_threshold` tokens calls `create_proposal`.
//! 2. After `voting_delay` seconds, voting opens automatically.
//! 3. Token holders call `cast_vote` during the `voting_period`.
//! 4. After `vote_end`, anyone calls `finalize_proposal` to evaluate quorum + threshold.
//! 5. If passed, the proposal enters `Queued` state.
//! 6. After `timelock_delay` seconds, anyone calls `execute_proposal`.
//!
//! ## Voting Power
//!
//! Voting power = token balance at the time `cast_vote` is called.
//! A snapshot of total supply is taken at proposal creation for quorum calculation.
//!
//! ## Quorum
//!
//! `votes_for + votes_against >= total_supply_snapshot * quorum_bps / 10_000`
//!
//! ## Approval Threshold
//!
//! `votes_for >= (votes_for + votes_against) * approval_threshold_bps / 10_000`

#![no_std]

mod errors;
mod events;
mod types;
mod tests;

pub use errors::GovError;
pub use types::{
    DataKey, FundPayload, GovConfig, ParameterPayload, Proposal, ProposalPayload, ProposalStatus,
    ProposalType, UpgradePayload, Vote,
};

use soroban_sdk::{contract, contractimpl, token, Address, Env, String};

const INSTANCE_TTL_THRESHOLD: u32 = 5_000;
const INSTANCE_TTL_EXTEND_TO: u32 = 50_000;
const PERSISTENT_TTL_THRESHOLD: u32 = 5_000;
const PERSISTENT_TTL_EXTEND_TO: u32 = 50_000;

// ── Storage helpers ───────────────────────────────────────────────────────────

struct Storage;

impl Storage {
    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
    }

    fn bump_persistent<K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &K) {
        env.storage()
            .persistent()
            .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);
    }

    fn require_initialized(env: &Env) -> Result<(), GovError> {
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(GovError::NotInitialized);
        }
        Self::bump_instance(env);
        Ok(())
    }

    fn admin(env: &Env) -> Result<Address, GovError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(GovError::NotInitialized)
    }

    fn config(env: &Env) -> Result<GovConfig, GovError> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(GovError::NotInitialized)
    }

    fn next_proposal_id(env: &Env) -> u64 {
        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ProposalCounter)
            .unwrap_or(0u64);
        env.storage()
            .instance()
            .set(&DataKey::ProposalCounter, &(id + 1));
        id
    }

    fn load_proposal(env: &Env, id: u64) -> Result<Proposal, GovError> {
        let key = DataKey::Proposal(id);
        let p = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(GovError::ProposalNotFound)?;
        Self::bump_persistent(env, &key);
        Ok(p)
    }

    fn save_proposal(env: &Env, proposal: &Proposal) {
        let key = DataKey::Proposal(proposal.id);
        env.storage().persistent().set(&key, proposal);
        Self::bump_persistent(env, &key);
    }

    fn has_voted(env: &Env, proposal_id: u64, voter: &Address) -> bool {
        let key = DataKey::HasVoted(proposal_id, voter.clone());
        env.storage().persistent().has(&key)
    }

    fn mark_voted(env: &Env, proposal_id: u64, voter: &Address) {
        let key = DataKey::HasVoted(proposal_id, voter.clone());
        env.storage().persistent().set(&key, &true);
        Self::bump_persistent(env, &key);
    }
}

// ── Governance helpers ────────────────────────────────────────────────────────

/// Returns the token balance of `address` — used as voting power.
fn voting_power(env: &Env, token: &Address, address: &Address) -> i128 {
    token::Client::new(env, token).balance(address)
}

/// Checks whether a proposal has reached quorum and approval threshold.
fn evaluate(proposal: &Proposal, config: &GovConfig) -> bool {
    let total_votes = proposal.votes_for + proposal.votes_against;

    // Quorum: enough participation?
    let quorum_required =
        proposal.total_supply_snapshot * config.quorum_bps as i128 / 10_000;
    if total_votes < quorum_required {
        return false;
    }

    // Approval threshold: enough FOR votes?
    if total_votes == 0 {
        return false;
    }
    let threshold_required = total_votes * config.approval_threshold_bps as i128 / 10_000;
    proposal.votes_for >= threshold_required
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {
    // ── Initialization ────────────────────────────────────────────────────────

    /// Initializes the governance contract.
    ///
    /// # Arguments
    /// * `admin`                   - Admin address (can update config, cancel proposals).
    /// * `token`                   - Governance token address (voting power source).
    /// * `proposal_threshold`      - Min tokens to create a proposal.
    /// * `voting_delay`            - Seconds between creation and vote start.
    /// * `voting_period`           - Seconds the vote is open.
    /// * `timelock_delay`          - Seconds between pass and execution.
    /// * `quorum_bps`              - Quorum in basis points (e.g. 400 = 4%).
    /// * `approval_threshold_bps`  - Approval threshold in bps (e.g. 5100 = 51%).
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        proposal_threshold: i128,
        voting_delay: u64,
        voting_period: u64,
        timelock_delay: u64,
        quorum_bps: u32,
        approval_threshold_bps: u32,
    ) -> Result<(), GovError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(GovError::AlreadyInitialized);
        }

        if voting_period == 0 {
            return Err(GovError::InvalidDuration);
        }
        if quorum_bps > 10_000 || approval_threshold_bps > 10_000 {
            return Err(GovError::InvalidParameter);
        }

        let config = GovConfig {
            token,
            proposal_threshold,
            voting_period,
            voting_delay,
            timelock_delay,
            quorum_bps,
            approval_threshold_bps,
        };

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage()
            .instance()
            .set(&DataKey::ProposalCounter, &0u64);
        Storage::bump_instance(&env);
        Ok(())
    }

    // ── Proposal creation ─────────────────────────────────────────────────────

    /// Creates a new governance proposal.
    ///
    /// The caller must hold >= `proposal_threshold` tokens.
    ///
    /// # Arguments
    /// * `proposer`         - Must `require_auth()`. Must meet threshold.
    /// * `title`            - Short title (stored on-chain).
    /// * `description`      - Full description (use IPFS hash for long text).
    /// * `proposal_type`    - The kind of action.
    /// * `payload`          - Execution data matching the proposal type.
    /// * `supply_snapshot`  - Total token supply at proposal creation time.
    ///                        Used for quorum calculation. Provided by proposer;
    ///                        verifiable off-chain against ledger state.
    ///
    /// # Returns
    /// The assigned `proposal_id`.
    pub fn create_proposal(
        env: Env,
        proposer: Address,
        title: String,
        description: String,
        proposal_type: ProposalType,
        payload: ProposalPayload,
        supply_snapshot: i128,
    ) -> Result<u64, GovError> {
        Storage::require_initialized(&env)?;
        proposer.require_auth();

        let config = Storage::config(&env)?;

        // Validate proposer has enough voting power
        let power = voting_power(&env, &config.token, &proposer);
        if power < config.proposal_threshold {
            return Err(GovError::InsufficientVotingPower);
        }

        // Validate payload matches type
        match (&proposal_type, &payload) {
            (ProposalType::ParameterChange, ProposalPayload::Parameter(_)) => {}
            (ProposalType::ContractUpgrade, ProposalPayload::Upgrade(_)) => {}
            (ProposalType::FundAllocation, ProposalPayload::Fund(_)) => {}
            (ProposalType::TextProposal, ProposalPayload::Text) => {}
            _ => return Err(GovError::InvalidProposalType),
        }

        let now = env.ledger().timestamp();
        let vote_start = now + config.voting_delay;
        let vote_end = vote_start + config.voting_period;
        let executable_at = vote_end + config.timelock_delay;

        if supply_snapshot < 0 {
            return Err(GovError::InvalidParameter);
        }

        let id = Storage::next_proposal_id(&env);

        let proposal = Proposal {
            id,
            proposal_type,
            proposer: proposer.clone(),
            title,
            description,
            payload,
            status: ProposalStatus::Active,
            vote_start,
            vote_end,
            executable_at,
            votes_for: 0,
            votes_against: 0,
            total_supply_snapshot: supply_snapshot,
            created_at: now,
            executed_at: None,
        };

        Storage::save_proposal(&env, &proposal);
        events::emit_proposal_created(&env, id, &proposer);
        Ok(id)
    }

    // ── Voting ────────────────────────────────────────────────────────────────

    /// Casts a vote on an active proposal.
    ///
    /// Voting power = token balance at time of vote.
    /// Each address can vote exactly once per proposal.
    ///
    /// # Arguments
    /// * `voter`       - Must `require_auth()`.
    /// * `proposal_id` - Target proposal.
    /// * `support`     - `true` = vote FOR, `false` = vote AGAINST.
    pub fn cast_vote(
        env: Env,
        voter: Address,
        proposal_id: u64,
        support: bool,
    ) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        voter.require_auth();

        let mut proposal = Storage::load_proposal(&env, proposal_id)?;

        if proposal.status != ProposalStatus::Active {
            return Err(GovError::ProposalNotActive);
        }

        let now = env.ledger().timestamp();

        if now < proposal.vote_start {
            return Err(GovError::VotingNotStarted);
        }
        if now > proposal.vote_end {
            return Err(GovError::VotingClosed);
        }

        if Storage::has_voted(&env, proposal_id, &voter) {
            return Err(GovError::AlreadyVoted);
        }

        let config = Storage::config(&env)?;
        let power = voting_power(&env, &config.token, &voter);
        if power <= 0 {
            return Err(GovError::InsufficientVotingPower);
        }

        if support {
            proposal.votes_for += power;
        } else {
            proposal.votes_against += power;
        }

        Storage::mark_voted(&env, proposal_id, &voter);
        Storage::save_proposal(&env, &proposal);
        events::emit_vote_cast(&env, proposal_id, &voter, support, power);
        Ok(())
    }

    // ── Finalization ──────────────────────────────────────────────────────────

    /// Finalizes a proposal after the voting period ends.
    ///
    /// Evaluates quorum and approval threshold. Transitions to `Passed`/`Queued`
    /// or `Defeated`. Anyone can call this.
    ///
    /// # Arguments
    /// * `proposal_id` - The proposal to finalize.
    pub fn finalize_proposal(env: Env, proposal_id: u64) -> Result<ProposalStatus, GovError> {
        Storage::require_initialized(&env)?;

        let mut proposal = Storage::load_proposal(&env, proposal_id)?;

        if proposal.status != ProposalStatus::Active {
            return Err(GovError::ProposalNotActive);
        }

        let now = env.ledger().timestamp();
        if now <= proposal.vote_end {
            return Err(GovError::VotingClosed); // voting still open
        }

        let config = Storage::config(&env)?;

        if evaluate(&proposal, &config) {
            // Timelock: if delay is 0, go straight to Queued (executable now)
            proposal.status = ProposalStatus::Queued;
            events::emit_proposal_queued(&env, proposal_id, proposal.executable_at);
        } else {
            proposal.status = ProposalStatus::Defeated;
            events::emit_proposal_defeated(&env, proposal_id);
        }

        Storage::save_proposal(&env, &proposal);
        Ok(proposal.status)
    }

    // ── Execution ─────────────────────────────────────────────────────────────

    /// Executes a queued proposal after the timelock has elapsed.
    ///
    /// Anyone can call this once the timelock has passed.
    /// `TextProposal` and `ParameterChange` are recorded on-chain only.
    /// `FundAllocation` transfers tokens from the governance contract.
    /// `ContractUpgrade` is recorded; actual upgrade must be triggered separately
    /// by the target contract's admin (governance signals intent).
    ///
    /// # Arguments
    /// * `proposal_id` - The queued proposal to execute.
    pub fn execute_proposal(env: Env, proposal_id: u64) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;

        let mut proposal = Storage::load_proposal(&env, proposal_id)?;

        if proposal.status != ProposalStatus::Queued {
            return Err(GovError::ProposalNotPassed);
        }

        let now = env.ledger().timestamp();
        if now < proposal.executable_at {
            return Err(GovError::TimelockNotElapsed);
        }

        // Execute payload
        match &proposal.payload {
            ProposalPayload::Fund(p) => {
                // Transfer from governance contract treasury to recipient
                token::Client::new(&env, &p.token).transfer(
                    &env.current_contract_address(),
                    &p.recipient,
                    &p.amount,
                );
            }
            ProposalPayload::Parameter(_) => {
                // Parameter changes are read by off-chain systems via events.
                // On-chain consumers can query get_proposal and read the payload.
            }
            ProposalPayload::Upgrade(_) => {
                // Upgrade proposals signal intent. The target contract's admin
                // must call upgrade() using the hash from this proposal.
                // This keeps upgrade authority with the contract admin while
                // requiring governance approval first.
            }
            ProposalPayload::Text => {
                // Signal only — no execution needed.
            }
        }

        proposal.status = ProposalStatus::Executed;
        proposal.executed_at = Some(now);
        Storage::save_proposal(&env, &proposal);
        events::emit_proposal_executed(&env, proposal_id);
        Ok(())
    }

    // ── Cancellation ─────────────────────────────────────────────────────────

    /// Cancels a proposal. Only the proposer or admin can cancel.
    /// Cannot cancel an already executed proposal.
    ///
    /// # Arguments
    /// * `caller`      - Must be proposer or admin.
    /// * `proposal_id` - The proposal to cancel.
    pub fn cancel_proposal(env: Env, caller: Address, proposal_id: u64) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();

        let admin = Storage::admin(&env)?;
        let mut proposal = Storage::load_proposal(&env, proposal_id)?;

        if caller != proposal.proposer && caller != admin {
            return Err(GovError::Unauthorized);
        }

        if proposal.status == ProposalStatus::Executed {
            return Err(GovError::ProposalAlreadyExecuted);
        }

        proposal.status = ProposalStatus::Cancelled;
        Storage::save_proposal(&env, &proposal);
        events::emit_proposal_cancelled(&env, proposal_id, &caller);
        Ok(())
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// Updates governance configuration. Admin only.
    pub fn update_config(
        env: Env,
        caller: Address,
        new_config: GovConfig,
    ) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();

        let admin = Storage::admin(&env)?;
        if caller != admin {
            return Err(GovError::AdminOnly);
        }

        if new_config.voting_period == 0 {
            return Err(GovError::InvalidDuration);
        }
        if new_config.quorum_bps > 10_000 || new_config.approval_threshold_bps > 10_000 {
            return Err(GovError::InvalidParameter);
        }

        env.storage().instance().set(&DataKey::Config, &new_config);
        Storage::bump_instance(&env);
        Ok(())
    }

    // ── View functions ────────────────────────────────────────────────────────

    /// Returns a proposal by ID.
    pub fn get_proposal(env: Env, proposal_id: u64) -> Result<Proposal, GovError> {
        Storage::require_initialized(&env)?;
        Storage::load_proposal(&env, proposal_id)
    }

    /// Returns the current governance configuration.
    pub fn get_config(env: Env) -> Result<GovConfig, GovError> {
        Storage::require_initialized(&env)?;
        Storage::config(&env)
    }

    /// Returns the total number of proposals created.
    pub fn proposal_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ProposalCounter)
            .unwrap_or(0u64)
    }

    /// Returns whether `voter` has voted on `proposal_id`.
    pub fn has_voted(env: Env, proposal_id: u64, voter: Address) -> bool {
        Storage::has_voted(&env, proposal_id, &voter)
    }

    /// Returns the voting power (token balance) of `address`.
    pub fn voting_power(env: Env, address: Address) -> Result<i128, GovError> {
        Storage::require_initialized(&env)?;
        let config = Storage::config(&env)?;
        Ok(voting_power(&env, &config.token, &address))
    }
}
