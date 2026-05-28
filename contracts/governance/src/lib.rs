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
#![deny(warnings)]
#![allow(clippy::too_many_arguments)]

mod errors;
mod events;
mod tests;
mod types;

pub use errors::GovError;
pub use types::{
    DataKey, FundPayload, GovConfig, JuryPool, JuryPoolConfig, JuryResolution, JuryVote,
    ParameterPayload, Proposal, ProposalPayload, ProposalStatus, ProposalType, UpgradePayload,
    Vote,
};

use soroban_sdk::{contract, contractimpl, token, Address, Env, String};
use stellar_trust_shared::{
    bump_instance_ttl as shared_bump_instance_ttl,
    bump_persistent_ttl as shared_bump_persistent_ttl,
};

// ── Storage helpers ───────────────────────────────────────────────────────────

struct Storage;

impl Storage {
    /// Bump instance TTL using shared config constants from `stellar_trust_shared`.
    fn bump_instance(env: &Env) {
        shared_bump_instance_ttl(env);
    }

    /// Bump persistent TTL using shared config constants from `stellar_trust_shared`.
    fn bump_persistent<K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &K) {
        shared_bump_persistent_ttl(env, key);
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
    let quorum_required = proposal.total_supply_snapshot * config.quorum_bps as i128 / 10_000;
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

        if proposal.status == ProposalStatus::Cancelled {
            return Err(GovError::ProposalAlreadyCancelled);
        }

        proposal.status = ProposalStatus::Cancelled;
        Storage::save_proposal(&env, &proposal);
        events::emit_proposal_cancelled(&env, proposal_id, &caller);
        Ok(())
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// Updates governance configuration. Admin only.
    pub fn update_config(env: Env, caller: Address, new_config: GovConfig) -> Result<(), GovError> {
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

    // ── Arbitrator DAO ────────────────────────────────────────────────────────

    /// Minimum stake required to register as an arbitrator (in token base units).
    /// Configurable via the governance token's decimals; default 1000 units.
    const MIN_STAKE: i128 = 1_000;

    /// Cooldown period before a non-slashed stake can be withdrawn (7 days in seconds).
    const WITHDRAW_COOLDOWN: u64 = 604_800;

    /// Percentage of stake slashed on misconduct (10%).
    const SLASH_PERCENT: i128 = 10;

    /// Stake tokens to register as an arbitrator candidate.
    ///
    /// The caller transfers `amount` tokens to this contract.
    /// If `amount >= MIN_STAKE`, the caller is added to the arbitrator whitelist.
    ///
    /// # Arguments
    /// * `caller` — must `require_auth()`. Tokens deducted from their balance.
    /// * `amount` — tokens to stake. Must be >= MIN_STAKE.
    pub fn stake_arbitrator(env: Env, caller: Address, amount: i128) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();

        if amount < Self::MIN_STAKE {
            return Err(GovError::InsufficientStake);
        }

        let config = Storage::config(&env)?;
        token::Client::new(&env, &config.token).transfer(
            &caller,
            &env.current_contract_address(),
            &amount,
        );

        // Accumulate stake
        let prev_stake: i128 = env.storage().persistent()
            .get(&DataKey::ArbitratorStake(caller.clone()))
            .unwrap_or(0);
        let new_stake = prev_stake + amount;
        env.storage().persistent().set(&DataKey::ArbitratorStake(caller.clone()), &new_stake);
        env.storage().persistent().set(&DataKey::Arbitrator(caller.clone()), &true);

        Storage::bump_persistent(&env, &DataKey::ArbitratorStake(caller.clone()));
        Storage::bump_persistent(&env, &DataKey::Arbitrator(caller.clone()));

        env.events().publish(
            (soroban_sdk::symbol_short!("arb_stk"), caller.clone()),
            (amount, new_stake),
        );
        Ok(())
    }

    /// Withdraw stake after the cooldown period (only if not slashed below MIN_STAKE).
    ///
    /// Sets a cooldown on first call; tokens are returned on second call after cooldown.
    pub fn withdraw_stake(env: Env, caller: Address) -> Result<i128, GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();

        let stake: i128 = env.storage().persistent()
            .get(&DataKey::ArbitratorStake(caller.clone()))
            .unwrap_or(0);

        if stake <= 0 {
            return Err(GovError::NoStakeToWithdraw);
        }

        let now = env.ledger().timestamp();
        let cooldown_key = DataKey::WithdrawCooldown(caller.clone());

        match env.storage().persistent().get::<DataKey, u64>(&cooldown_key) {
            None => {
                // First call — start cooldown
                let expires = now + Self::WITHDRAW_COOLDOWN;
                env.storage().persistent().set(&cooldown_key, &expires);
                Storage::bump_persistent(&env, &cooldown_key);
                return Err(GovError::StakeCooldownActive);
            }
            Some(expires) if now < expires => {
                return Err(GovError::StakeCooldownActive);
            }
            _ => {}
        }

        // Cooldown elapsed — return stake and remove arbitrator
        let config = Storage::config(&env)?;
        token::Client::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &caller,
            &stake,
        );

        env.storage().persistent().remove(&DataKey::ArbitratorStake(caller.clone()));
        env.storage().persistent().remove(&DataKey::Arbitrator(caller.clone()));
        env.storage().persistent().remove(&cooldown_key);

        env.events().publish(
            (soroban_sdk::symbol_short!("arb_wdr"), caller.clone()),
            stake,
        );
        Ok(stake)
    }

    /// Governance-driven slash of a misbehaving arbitrator.
    ///
    /// Only callable by the contract admin (after a governance vote passes and
    /// the admin executes the resolution). Slashes SLASH_PERCENT of the
    /// arbitrator's stake and sends it to `recipient` (victim or treasury).
    ///
    /// # Arguments
    /// * `caller`      — must be admin.
    /// * `arbitrator`  — address to slash.
    /// * `recipient`   — receives the slashed tokens.
    /// * `reason`      — on-chain evidence string (IPFS hash or description).
    pub fn slash_arbitrator(
        env: Env,
        caller: Address,
        arbitrator: Address,
        recipient: Address,
        reason: soroban_sdk::String,
    ) -> Result<i128, GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();

        let admin = Storage::admin(&env)?;
        if caller != admin {
            return Err(GovError::AdminOnly);
        }

        let stake: i128 = env.storage().persistent()
            .get(&DataKey::ArbitratorStake(arbitrator.clone()))
            .unwrap_or(0);

        if stake <= 0 {
            return Err(GovError::NotArbitrator);
        }

        let slash_amount = stake * Self::SLASH_PERCENT / 100;
        if slash_amount > stake {
            return Err(GovError::SlashExceedsStake);
        }

        let remaining = stake - slash_amount;

        // Transfer slashed amount to recipient
        let config = Storage::config(&env)?;
        token::Client::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &recipient,
            &slash_amount,
        );

        // Update or remove stake
        if remaining < Self::MIN_STAKE {
            // Below minimum — remove from whitelist
            env.storage().persistent().remove(&DataKey::Arbitrator(arbitrator.clone()));
            env.storage().persistent().remove(&DataKey::ArbitratorStake(arbitrator.clone()));
        } else {
            env.storage().persistent().set(&DataKey::ArbitratorStake(arbitrator.clone()), &remaining);
            Storage::bump_persistent(&env, &DataKey::ArbitratorStake(arbitrator.clone()));
        }

        env.events().publish(
            (soroban_sdk::symbol_short!("arb_slh"), arbitrator.clone()),
            (slash_amount, remaining, reason),
        );
        Ok(slash_amount)
    }

    /// Returns whether `address` is a whitelisted arbitrator.
    pub fn is_arbitrator(env: Env, address: Address) -> bool {
        env.storage().persistent()
            .get::<DataKey, bool>(&DataKey::Arbitrator(address))
            .unwrap_or(false)
    }

    /// Returns the current stake of `address`.
    pub fn get_stake(env: Env, address: Address) -> i128 {
        env.storage().persistent()
            .get(&DataKey::ArbitratorStake(address))
            .unwrap_or(0)
    }

    // ── Jury Voting Pool ──────────────────────────────────────────────────────

    /// Default jury voting period: 7 days in seconds.
    const DEFAULT_JURY_VOTING_PERIOD: u64 = 604_800;

    /// Default minimum locked tokens to participate in jury voting.
    const DEFAULT_MIN_LOCKED_TOKENS: i128 = 100;

    /// Default quorum for jury pools: 5% of total locked tokens.
    const DEFAULT_JURY_QUORUM_BPS: u32 = 500;

    /// Initializes the jury pool configuration. Admin only.
    ///
    /// # Arguments
    /// * `caller`             — must be admin.
    /// * `voting_period`      — voting period duration in seconds.
    /// * `min_locked_tokens`  — minimum locked tokens to participate.
    /// * `quorum_bps`         — minimum % of locked tokens for quorum (basis points).
    pub fn initialize_jury_config(
        env: Env,
        caller: Address,
        voting_period: u64,
        min_locked_tokens: i128,
        quorum_bps: u32,
    ) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();

        let admin = Storage::admin(&env)?;
        if caller != admin {
            return Err(GovError::AdminOnly);
        }

        if voting_period == 0 {
            return Err(GovError::InvalidDuration);
        }
        if quorum_bps > 10_000 {
            return Err(GovError::InvalidParameter);
        }

        let config = types::JuryPoolConfig {
            voting_period,
            min_locked_tokens,
            quorum_bps,
        };

        env.storage().instance().set(&DataKey::JuryConfig, &config);
        env.storage()
            .instance()
            .set(&DataKey::JuryPoolCounter, &0u64);
        Storage::bump_instance(&env);
        Ok(())
    }

    /// Creates a new jury voting pool for a disputed milestone.
    ///
    /// Anyone can create a jury pool for a disputed milestone. The disputed
    /// amount is held by this contract until resolution.
    ///
    /// # Arguments
    /// * `escrow_id`        — the escrow containing the disputed milestone.
    /// * `milestone_id`     — the disputed milestone index.
    /// * `client`           — the client address.
    /// * `freelancer`       — the freelancer address.
    /// * `disputed_amount`  — the amount in dispute.
    /// * `token`            — the token address for the disputed funds.
    ///
    /// # Returns
    /// The assigned `pool_id`.
    pub fn create_jury_pool(
        env: Env,
        escrow_id: u64,
        milestone_id: u64,
        client: Address,
        freelancer: Address,
        disputed_amount: i128,
        token: Address,
    ) -> Result<u64, GovError> {
        Storage::require_initialized(&env)?;

        if disputed_amount <= 0 {
            return Err(GovError::InvalidParameter);
        }

        // Get or create default jury config
        let config: types::JuryPoolConfig = env
            .storage()
            .instance()
            .get(&DataKey::JuryConfig)
            .unwrap_or(types::JuryPoolConfig {
                voting_period: Self::DEFAULT_JURY_VOTING_PERIOD,
                min_locked_tokens: Self::DEFAULT_MIN_LOCKED_TOKENS,
                quorum_bps: Self::DEFAULT_JURY_QUORUM_BPS,
            });

        let now = env.ledger().timestamp();
        let voting_end = now + config.voting_period;

        let pool_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::JuryPoolCounter)
            .unwrap_or(0u64);
        env.storage()
            .instance()
            .set(&DataKey::JuryPoolCounter, &(pool_id + 1));

        let pool = types::JuryPool {
            pool_id,
            milestone_id,
            escrow_id,
            client: client.clone(),
            freelancer: freelancer.clone(),
            disputed_amount,
            token,
            voting_start: now,
            voting_end,
            weight_for_client: 0,
            weight_for_freelancer: 0,
            total_locked_tokens: 0,
            resolution: types::JuryResolution::Pending,
            resolved_at: None,
            created_at: now,
        };

        let key = DataKey::JuryPool(pool_id);
        env.storage().persistent().set(&key, &pool);
        Storage::bump_persistent(&env, &key);

        events::emit_jury_pool_created(&env, pool_id, escrow_id, milestone_id, voting_end);
        Ok(pool_id)
    }

    /// Casts a vote in a jury pool.
    ///
    /// Voting power is weighted by the amount of locked governance tokens.
    /// Tokens must be locked (staked) in the governance contract to participate.
    /// Each address can vote exactly once per pool.
    ///
    /// # Arguments
    /// * `voter`        — must `require_auth()`.
    /// * `pool_id`      — target jury pool.
    /// * `for_client`   — `true` = vote for client, `false` = vote for freelancer.
    pub fn cast_jury_vote(
        env: Env,
        voter: Address,
        pool_id: u64,
        for_client: bool,
    ) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        voter.require_auth();

        let key = DataKey::JuryPool(pool_id);
        let mut pool: types::JuryPool = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(GovError::JuryPoolNotFound)?;

        if pool.resolution != types::JuryResolution::Pending {
            return Err(GovError::JuryPoolAlreadyResolved);
        }

        let now = env.ledger().timestamp();

        if now < pool.voting_start {
            return Err(GovError::JuryVotingNotStarted);
        }
        if now > pool.voting_end {
            return Err(GovError::JuryVotingClosed);
        }

        // Check if already voted
        let voted_key = DataKey::JuryVoted(pool_id, voter.clone());
        if env.storage().persistent().has(&voted_key) {
            return Err(GovError::JuryAlreadyVoted);
        }

        // Get locked tokens (stake) as voting power
        let locked_tokens: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::ArbitratorStake(voter.clone()))
            .unwrap_or(0);

        let config: types::JuryPoolConfig = env
            .storage()
            .instance()
            .get(&DataKey::JuryConfig)
            .unwrap_or(types::JuryPoolConfig {
                voting_period: Self::DEFAULT_JURY_VOTING_PERIOD,
                min_locked_tokens: Self::DEFAULT_MIN_LOCKED_TOKENS,
                quorum_bps: Self::DEFAULT_JURY_QUORUM_BPS,
            });

        if locked_tokens < config.min_locked_tokens {
            return Err(GovError::JuryInsufficientLockedTokens);
        }

        // Update pool weights
        if for_client {
            pool.weight_for_client += locked_tokens;
        } else {
            pool.weight_for_freelancer += locked_tokens;
        }

        pool.total_locked_tokens += locked_tokens;

        // Mark as voted
        env.storage().persistent().set(&voted_key, &true);
        Storage::bump_persistent(&env, &voted_key);

        // Save updated pool
        env.storage().persistent().set(&key, &pool);
        Storage::bump_persistent(&env, &key);

        events::emit_jury_vote_cast(&env, pool_id, &voter, locked_tokens, for_client);
        Ok(())
    }

    /// Resolves a jury pool after the voting period ends.
    ///
    /// Resolution rules:
    /// - Quorum must be met (total locked tokens >= quorum threshold)
    /// - Client wins if `weight_for_client > weight_for_freelancer`
    /// - Freelancer wins otherwise (including ties)
    ///
    /// Anyone can call this after the voting period ends.
    ///
    /// # Arguments
    /// * `pool_id` — the jury pool to resolve.
    ///
    /// # Returns
    /// `true` if client wins, `false` if freelancer wins.
    pub fn resolve_jury_pool(env: Env, pool_id: u64) -> Result<bool, GovError> {
        Storage::require_initialized(&env)?;

        let key = DataKey::JuryPool(pool_id);
        let mut pool: types::JuryPool = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(GovError::JuryPoolNotFound)?;

        if pool.resolution != types::JuryResolution::Pending {
            // Already resolved — return cached result
            return Ok(pool.resolution == types::JuryResolution::ClientWins);
        }

        let now = env.ledger().timestamp();
        if now <= pool.voting_end {
            return Err(GovError::JuryVotingClosed);
        }

        // Check quorum
        let config: types::JuryPoolConfig = env
            .storage()
            .instance()
            .get(&DataKey::JuryConfig)
            .unwrap_or(types::JuryPoolConfig {
                voting_period: Self::DEFAULT_JURY_VOTING_PERIOD,
                min_locked_tokens: Self::DEFAULT_MIN_LOCKED_TOKENS,
                quorum_bps: Self::DEFAULT_JURY_QUORUM_BPS,
            });

        // For quorum, we need a minimum participation threshold
        // Since we don't track total possible locked tokens, we use a simple
        // absolute minimum based on the disputed amount
        let min_participation = pool.disputed_amount * config.quorum_bps as i128 / 10_000;
        if pool.total_locked_tokens < min_participation {
            return Err(GovError::JuryQuorumNotReached);
        }

        // Determine winner: client wins if they have strictly more weight
        let client_wins = pool.weight_for_client > pool.weight_for_freelancer;

        pool.resolution = if client_wins {
            types::JuryResolution::ClientWins
        } else {
            types::JuryResolution::FreelancerWins
        };
        pool.resolved_at = Some(now);

        env.storage().persistent().set(&key, &pool);
        Storage::bump_persistent(&env, &key);

        events::emit_jury_pool_resolved(
            &env,
            pool_id,
            client_wins,
            pool.weight_for_client,
            pool.weight_for_freelancer,
            pool.total_locked_tokens,
        );

        Ok(client_wins)
    }

    /// Distributes the disputed funds according to the jury pool resolution.
    ///
    /// Can only be called after the pool is resolved. Transfers the disputed
    /// amount to the winner (client or freelancer).
    ///
    /// Anyone can call this after resolution.
    ///
    /// # Arguments
    /// * `pool_id` — the resolved jury pool.
    pub fn distribute_jury_funds(env: Env, pool_id: u64) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;

        let key = DataKey::JuryPool(pool_id);
        let pool: types::JuryPool = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(GovError::JuryPoolNotFound)?;

        if pool.resolution == types::JuryResolution::Pending {
            return Err(GovError::JuryPoolNotResolved);
        }

        let recipient = match pool.resolution {
            types::JuryResolution::ClientWins => pool.client.clone(),
            types::JuryResolution::FreelancerWins => pool.freelancer.clone(),
            types::JuryResolution::Pending => return Err(GovError::JuryPoolNotResolved),
        };

        // Transfer disputed funds from governance contract to winner
        token::Client::new(&env, &pool.token).transfer(
            &env.current_contract_address(),
            &recipient,
            &pool.disputed_amount,
        );

        events::emit_jury_funds_distributed(&env, pool_id, &recipient, pool.disputed_amount);
        Ok(())
    }

    /// Returns a jury pool by ID.
    pub fn get_jury_pool(env: Env, pool_id: u64) -> Result<types::JuryPool, GovError> {
        Storage::require_initialized(&env)?;
        let key = DataKey::JuryPool(pool_id);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(GovError::JuryPoolNotFound)
    }

    /// Returns the jury pool configuration.
    pub fn get_jury_config(env: Env) -> types::JuryPoolConfig {
        env.storage()
            .instance()
            .get(&DataKey::JuryConfig)
            .unwrap_or(types::JuryPoolConfig {
                voting_period: Self::DEFAULT_JURY_VOTING_PERIOD,
                min_locked_tokens: Self::DEFAULT_MIN_LOCKED_TOKENS,
                quorum_bps: Self::DEFAULT_JURY_QUORUM_BPS,
            })
    }

    /// Returns the total number of jury pools created.
    pub fn jury_pool_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::JuryPoolCounter)
            .unwrap_or(0u64)
    }

    /// Returns whether `voter` has voted on `pool_id`.
    pub fn has_jury_voted(env: Env, pool_id: u64, voter: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::JuryVoted(pool_id, voter))
    }
}
