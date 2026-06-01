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

pub mod arbitrators;
mod errors;
mod events;
pub mod incentives;
mod tests;
mod types;

pub use errors::GovError;
pub use types::{
    DataKey, FundPayload, GovConfig, ParameterPayload, Proposal, ProposalPayload, ProposalStatus,
    ProposalType, UpgradePayload, VeLock, Vote,
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

/// Returns the token balance or ve-token voting power of `address`.
fn voting_power(env: &Env, token: &Address, address: &Address) -> i128 {
    let base_balance = token::Client::new(env, token).balance(address);
    let ve_power = GovernanceContract::ve_voting_power(env, address);
    if ve_power > base_balance {
        ve_power
    } else {
        base_balance
    }
}

fn validate_parameter_payload(payload: &ParameterPayload) -> Result<(), GovError> {
    if payload.key == "proposal_threshold" {
        if payload.value < 0 {
            return Err(GovError::InvalidParameter);
        }
        return Ok(());
    }

    if payload.key == "voting_period" || payload.key == "voting_delay" || payload.key == "timelock_delay" {
        if payload.value <= 0 {
            return Err(GovError::InvalidParameter);
        }
        return Ok(());
    }

    if payload.key == "quorum_bps" || payload.key == "approval_threshold_bps" {
        if payload.value < 0 || payload.value > 10_000 {
            return Err(GovError::InvalidParameter);
        }
        return Ok(());
    }

    Err(GovError::InvalidParameter)
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

        // Validate payload matches type and control parameter updates
        match (&proposal_type, &payload) {
            (ProposalType::ParameterChange, ProposalPayload::Parameter(parameter)) => {
                validate_parameter_payload(parameter)?;
            }
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

        // Lock proposer fee deposit
        token::Client::new(&env, &config.token).transfer(
            &proposer,
            &env.current_contract_address(),
            &Self::PROPOSER_FEE,
        );
        let deposit_key = DataKey::ProposalDeposit(id);
        env.storage()
            .persistent()
            .set(&deposit_key, &Self::PROPOSER_FEE);
        Storage::bump_persistent(&env, &deposit_key);

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

        // Process fee deposit: refund if participation ≥ 15%, else slash to treasury
        let deposit_key = DataKey::ProposalDeposit(proposal_id);
        if let Some(deposit) = env
            .storage()
            .persistent()
            .get::<DataKey, i128>(&deposit_key)
        {
            if deposit > 0 {
                let total_votes = proposal.votes_for + proposal.votes_against;
                let fee_quorum = proposal
                    .total_supply_snapshot
                    .saturating_mul(Self::FEE_DEPOSIT_QUORUM_BPS as i128)
                    / 10_000;
                let token_client = token::Client::new(&env, &config.token);
                if total_votes >= fee_quorum {
                    token_client.transfer(
                        &env.current_contract_address(),
                        &proposal.proposer,
                        &deposit,
                    );
                    events::emit_deposit_refunded(&env, proposal_id, &proposal.proposer, deposit);
                } else {
                    let treasury: Address = env
                        .storage()
                        .instance()
                        .get(&DataKey::Treasury)
                        .unwrap_or_else(|| Storage::admin(&env).unwrap());
                    token_client.transfer(&env.current_contract_address(), &treasury, &deposit);
                    events::emit_deposit_slashed(&env, proposal_id, &treasury, deposit);
                }
                env.storage().persistent().remove(&deposit_key);
            }
        }

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
            ProposalPayload::Parameter(parameter) => {
                validate_parameter_payload(parameter)?;
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

        // Refund fee deposit to proposer on cancel
        let deposit_key = DataKey::ProposalDeposit(proposal_id);
        if let Some(deposit) = env
            .storage()
            .persistent()
            .get::<DataKey, i128>(&deposit_key)
        {
            if deposit > 0 {
                let config = Storage::config(&env)?;
                token::Client::new(&env, &config.token).transfer(
                    &env.current_contract_address(),
                    &proposal.proposer,
                    &deposit,
                );
                env.storage().persistent().remove(&deposit_key);
            }
        }

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

    /// Sets the treasury address for slashed fee deposits. Admin only.
    pub fn set_treasury(env: Env, caller: Address, treasury: Address) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();
        let admin = Storage::admin(&env)?;
        if caller != admin {
            return Err(GovError::AdminOnly);
        }
        env.storage().instance().set(&DataKey::Treasury, &treasury);
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

    // ── Fee deposit ───────────────────────────────────────────────────────────

    /// Tokens locked by the proposer on proposal creation.
    const PROPOSER_FEE: i128 = 500;

    /// Minimum participation rate for fee deposit refund (basis points; 1500 = 15%).
    const FEE_DEPOSIT_QUORUM_BPS: u32 = 1_500;

    // ── Incentives ────────────────────────────────────────────────────────────

    /// Admin deposits tokens into the platform incentives pool.
    ///
    /// Caller must have already transferred tokens to this contract.
    pub fn deposit_to_incentives_pool(
        env: Env,
        caller: Address,
        amount: i128,
    ) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();
        let admin = Storage::admin(&env)?;
        if caller != admin {
            return Err(GovError::AdminOnly);
        }
        incentives::deposit_to_pool(&env, amount).map_err(|_| GovError::InvalidParameter)
    }

    /// Returns the current balance of the platform incentives pool.
    pub fn get_incentives_pool_balance(env: Env) -> i128 {
        incentives::get_pool_balance(&env)
    }

    /// Apply a lock-extension bonus for `staker`.
    ///
    /// Transfers bonus tokens (from the pool) to the staker's locked voting weight.
    /// Only triggers when extension > 1 year; returns 0 otherwise.
    pub fn extend_lock_bonus(
        env: Env,
        staker: Address,
        current_lock_end: u64,
        new_lock_end: u64,
        locked_amount: i128,
    ) -> Result<i128, GovError> {
        Storage::require_initialized(&env)?;
        staker.require_auth();
        incentives::apply_lock_extension_bonus(
            &env,
            &staker,
            current_lock_end,
            new_lock_end,
            locked_amount,
        )
        .map_err(|_| GovError::InvalidParameter)
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
        let prev_stake: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::ArbitratorStake(caller.clone()))
            .unwrap_or(0);
        let new_stake = prev_stake + amount;
        env.storage()
            .persistent()
            .set(&DataKey::ArbitratorStake(caller.clone()), &new_stake);
        env.storage()
            .persistent()
            .set(&DataKey::Arbitrator(caller.clone()), &true);

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

        let stake: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::ArbitratorStake(caller.clone()))
            .unwrap_or(0);

        if stake <= 0 {
            return Err(GovError::NoStakeToWithdraw);
        }

        let now = env.ledger().timestamp();
        let cooldown_key = DataKey::WithdrawCooldown(caller.clone());

        match env
            .storage()
            .persistent()
            .get::<DataKey, u64>(&cooldown_key)
        {
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

        env.storage()
            .persistent()
            .remove(&DataKey::ArbitratorStake(caller.clone()));
        env.storage()
            .persistent()
            .remove(&DataKey::Arbitrator(caller.clone()));
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

        let stake: i128 = env
            .storage()
            .persistent()
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
            env.storage()
                .persistent()
                .remove(&DataKey::Arbitrator(arbitrator.clone()));
            env.storage()
                .persistent()
                .remove(&DataKey::ArbitratorStake(arbitrator.clone()));
        } else {
            env.storage()
                .persistent()
                .set(&DataKey::ArbitratorStake(arbitrator.clone()), &remaining);
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
        env.storage()
            .persistent()
            .get::<DataKey, bool>(&DataKey::Arbitrator(address))
            .unwrap_or(false)
    }

    /// Returns the current stake of `address`.
    pub fn get_stake(env: Env, address: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::ArbitratorStake(address))
            .unwrap_or(0)
    }

    // ── ve-token (Voting Escrow) ───────────────────────────────────────────────
    //
    // Users lock governance tokens for a configurable duration.
    // Voting power decays linearly:
    //
    //   voting_power = locked_amount * remaining_duration / MAX_LOCK_DURATION
    //
    // where remaining_duration = max(0, unlock_time - now).
    //
    // Constraints:
    //   MIN_LOCK_DURATION (1 week)  ≤ lock_duration ≤ MAX_LOCK_DURATION (4 years)
    //   Tokens cannot be withdrawn before unlock_time.
    //   Locks can be extended (more tokens or longer duration, never shorter).

    /// Minimum lock duration: 1 week in seconds.
    const MIN_LOCK_DURATION: u64 = 604_800;

    /// Maximum lock duration: 4 years in seconds (365.25 days × 4).
    const MAX_LOCK_DURATION: u64 = 126_230_400;

    /// Creates a new ve-token lock for `caller`.
    ///
    /// Transfers `amount` governance tokens from `caller` to this contract.
    /// The lock expires at `now + lock_duration`.
    ///
    /// # Arguments
    /// * `caller`        — must `require_auth()`. Tokens deducted from their balance.
    /// * `amount`        — tokens to lock. Must be > 0.
    /// * `lock_duration` — seconds to lock for. Must be in [MIN_LOCK_DURATION, MAX_LOCK_DURATION].
    pub fn create_lock(
        env: Env,
        caller: Address,
        amount: i128,
        lock_duration: u64,
    ) -> Result<VeLock, GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();

        if amount <= 0 {
            return Err(GovError::ZeroLockAmount);
        }
        if lock_duration < Self::MIN_LOCK_DURATION {
            return Err(GovError::LockDurationTooShort);
        }
        if lock_duration > Self::MAX_LOCK_DURATION {
            return Err(GovError::LockDurationTooLong);
        }

        let lock_key = DataKey::VeLock(caller.clone());
        if env.storage().persistent().has(&lock_key) {
            return Err(GovError::LockAlreadyExists);
        }

        let config = Storage::config(&env)?;
        token::Client::new(&env, &config.token).transfer(
            &caller,
            &env.current_contract_address(),
            &amount,
        );

        let now = env.ledger().timestamp();
        let lock = VeLock {
            amount,
            unlock_time: now + lock_duration,
            locked_at: now,
        };

        env.storage().persistent().set(&lock_key, &lock);
        Storage::bump_persistent(&env, &lock_key);

        env.events().publish(
            (soroban_sdk::symbol_short!("ve_lock"), caller.clone()),
            (amount, lock.unlock_time),
        );
        Ok(lock)
    }

    /// Increases the locked amount and/or extends the unlock time of an existing lock.
    ///
    /// Both `additional_amount` and `new_unlock_time` are optional (pass 0 / 0 to skip).
    /// The new unlock time must be ≥ the current unlock time and ≤ now + MAX_LOCK_DURATION.
    ///
    /// # Arguments
    /// * `caller`            — must `require_auth()`.
    /// * `additional_amount` — extra tokens to add to the lock (0 = no change).
    /// * `new_unlock_time`   — new expiry timestamp (0 = no change).
    pub fn extend_lock(
        env: Env,
        caller: Address,
        additional_amount: i128,
        new_unlock_time: u64,
    ) -> Result<VeLock, GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();

        let lock_key = DataKey::VeLock(caller.clone());
        let mut lock: VeLock = env
            .storage()
            .persistent()
            .get(&lock_key)
            .ok_or(GovError::NoLockFound)?;

        let now = env.ledger().timestamp();

        // Extend duration
        if new_unlock_time != 0 {
            if new_unlock_time < lock.unlock_time {
                return Err(GovError::NewUnlockTimeTooEarly);
            }
            let max_unlock = now + Self::MAX_LOCK_DURATION;
            if new_unlock_time > max_unlock {
                return Err(GovError::LockDurationTooLong);
            }
            lock.unlock_time = new_unlock_time;
        }

        // Add tokens
        if additional_amount > 0 {
            let config = Storage::config(&env)?;
            token::Client::new(&env, &config.token).transfer(
                &caller,
                &env.current_contract_address(),
                &additional_amount,
            );
            lock.amount += additional_amount;
        }

        lock.locked_at = now;
        env.storage().persistent().set(&lock_key, &lock);
        Storage::bump_persistent(&env, &lock_key);

        env.events().publish(
            (soroban_sdk::symbol_short!("ve_ext"), caller.clone()),
            (lock.amount, lock.unlock_time),
        );
        Ok(lock)
    }

    /// Withdraws locked tokens after the lock has expired.
    ///
    /// Removes the lock and returns all tokens to `caller`.
    ///
    /// # Arguments
    /// * `caller` — must `require_auth()`. Must have an expired lock.
    pub fn withdraw_lock(env: Env, caller: Address) -> Result<i128, GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();

        let lock_key = DataKey::VeLock(caller.clone());
        let lock: VeLock = env
            .storage()
            .persistent()
            .get(&lock_key)
            .ok_or(GovError::NoLockFound)?;

        let now = env.ledger().timestamp();
        if now < lock.unlock_time {
            return Err(GovError::LockNotExpired);
        }

        let config = Storage::config(&env)?;
        token::Client::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &caller,
            &lock.amount,
        );

        env.storage().persistent().remove(&lock_key);

        env.events().publish(
            (soroban_sdk::symbol_short!("ve_wdr"), caller.clone()),
            lock.amount,
        );
        Ok(lock.amount)
    }

    /// Returns the current time-weighted voting power of `address`.
    ///
    /// voting_power = locked_amount * remaining_duration / MAX_LOCK_DURATION
    ///
    /// Returns 0 if no lock exists or the lock has expired.
    pub fn ve_voting_power(env: Env, address: Address) -> i128 {
        let lock_key = DataKey::VeLock(address);
        let lock: VeLock = match env.storage().persistent().get(&lock_key) {
            Some(l) => l,
            None => return 0,
        };

        let now = env.ledger().timestamp();
        if now >= lock.unlock_time {
            return 0;
        }

        let remaining = lock.unlock_time - now;
        // Integer arithmetic: multiply first to preserve precision
        lock.amount * remaining as i128 / Self::MAX_LOCK_DURATION as i128
    }

    /// Returns the VeLock record for `address`, if one exists.
    pub fn get_lock(env: Env, address: Address) -> Option<VeLock> {
        env.storage().persistent().get(&DataKey::VeLock(address))
    }

    // ── Arbitrator selection pools (Issue #897) ───────────────────────────────

    /// Admin adds an arbitrator to the selection registry.
    ///
    /// The arbitrator must already be whitelisted (staked via `stake_arbitrator`).
    pub fn registry_add_arbitrator(
        env: Env,
        caller: Address,
        arbitrator: Address,
    ) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();
        let admin = Storage::admin(&env)?;
        if caller != admin {
            return Err(GovError::AdminOnly);
        }
        if !env
            .storage()
            .persistent()
            .get::<DataKey, bool>(&DataKey::Arbitrator(arbitrator.clone()))
            .unwrap_or(false)
        {
            return Err(GovError::NotArbitrator);
        }
        arbitrators::registry_add(&env, &arbitrator);
        Ok(())
    }

    /// Admin removes an arbitrator from the selection registry.
    pub fn registry_remove_arbitrator(
        env: Env,
        caller: Address,
        arbitrator: Address,
    ) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        caller.require_auth();
        let admin = Storage::admin(&env)?;
        if caller != admin {
            return Err(GovError::AdminOnly);
        }
        arbitrators::registry_remove(&env, &arbitrator);
        Ok(())
    }

    /// Select a three-member arbitrator panel for `dispute_id`.
    ///
    /// Uses ledger sequence XOR dispute_id as a pseudo-random seed.
    /// Prefers lowest-load arbitrators; no duplicate in the same panel.
    ///
    /// # Returns
    /// The created panel, or `Err(GovError::NotArbitrator)` if fewer than 3
    /// arbitrators are registered.
    pub fn select_dispute_panel(
        env: Env,
        dispute_id: u64,
    ) -> Result<arbitrators::ArbitratorPanel, GovError> {
        Storage::require_initialized(&env)?;
        arbitrators::select_panel(&env, dispute_id).ok_or(GovError::NotArbitrator)
    }

    /// Selected arbitrator accepts their assignment.
    pub fn accept_arbitration(
        env: Env,
        arbitrator: Address,
        dispute_id: u64,
    ) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        arbitrator.require_auth();
        arbitrators::accept_arbitration(&env, dispute_id, &arbitrator)
            .map_err(|_| GovError::Unauthorized)
    }

    /// Selected arbitrator declines their assignment (triggers auto-rotation).
    pub fn decline_arbitration(
        env: Env,
        arbitrator: Address,
        dispute_id: u64,
    ) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        arbitrator.require_auth();
        arbitrators::decline_arbitration(&env, dispute_id, &arbitrator)
            .map_err(|_| GovError::Unauthorized)
    }

    /// Rotate a timed-out slot (anyone can call after the 48-hour deadline).
    pub fn rotate_timed_out_slot(env: Env, dispute_id: u64, slot_idx: u32) -> Result<(), GovError> {
        Storage::require_initialized(&env)?;
        arbitrators::rotate_timed_out(&env, dispute_id, slot_idx)
            .map_err(|_| GovError::Unauthorized)
    }

    /// Returns the arbitrator panel for a dispute.
    pub fn get_dispute_panel(env: Env, dispute_id: u64) -> Option<arbitrators::ArbitratorPanel> {
        arbitrators::get_panel(&env, dispute_id)
    }

    /// Returns whether `address` is in the selection registry.
    pub fn is_in_registry(env: Env, address: Address) -> bool {
        arbitrators::registry_contains(&env, &address)
    }
}
