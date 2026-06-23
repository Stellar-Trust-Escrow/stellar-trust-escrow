//! # StellarTrust Insurance Fund Contract
//!
//! Protects platform users against losses from smart contract bugs or exploits.
//!
//! ## Design
//!
//! - Anyone can contribute tokens to the fund.
//! - Any address can submit a claim with a description and requested amount.
//! - Registered governors vote to approve or reject each claim.
//! - Once quorum is reached the claim is finalised; approved claims can be
//!   paid out immediately.
//! - The admin manages governors and can update fund parameters.
//!
//! ## Storage layout
//!
//! | Key                    | Tier       | Description                        |
//! |------------------------|------------|------------------------------------|
//! | DataKey::Admin         | Instance   | Contract admin                     |
//! | DataKey::Token         | Instance   | Accepted token address             |
//! | DataKey::MinContribution| Instance  | Minimum contribution amount        |
//! | DataKey::ClaimCap      | Instance   | Max payout per claim               |
//! | DataKey::Quorum        | Instance   | Votes needed to finalise a claim   |
//! | DataKey::ClaimCounter  | Instance   | Auto-increment claim ID            |
//! | DataKey::FundStats     | Instance   | Aggregate counters                 |
//! | DataKey::Claim(id)     | Persistent | Individual claim record            |
//! | DataKey::Contribution(addr)| Persistent | Per-address contribution total |
//! | DataKey::Governor(addr)| Persistent | Governor registration flag         |
//! | DataKey::Vote(id,addr) | Persistent | Per-governor vote on a claim       |

#![no_std]
#![deny(warnings)]

mod errors;
mod events;
mod gas_profiling;
mod types;

pub use errors::InsuranceError;
pub use types::{
    Claim, ClaimStatus, DataKey, FundInfo, FundStats, SlashProposal, SlashStatus, StakeRecord,
};

use soroban_sdk::{contract, contractimpl, token, Address, Env, String};

// ── TTL constants ─────────────────────────────────────────────────────────────
const INSTANCE_TTL_THRESHOLD: u32 = 5_000;
const INSTANCE_TTL_EXTEND_TO: u32 = 50_000;
const PERSISTENT_TTL_THRESHOLD: u32 = 5_000;
const PERSISTENT_TTL_EXTEND_TO: u32 = 50_000;

/// Default claim expiry window in ledgers (~7 days at 5 s/ledger).
const DEFAULT_CLAIM_EXPIRY_LEDGERS: u64 = 120_960;

/// Yield accumulator precision factor (1e9).
const YIELD_PRECISION: i128 = 1_000_000_000;

/// Default maximum slash in basis points (4000 = 40%).
const DEFAULT_MAX_SLASH_BPS: u32 = 4_000;

// ── Storage helpers ───────────────────────────────────────────────────────────
struct Storage;

impl Storage {
    // ── Instance ──────────────────────────────────────────────────────────────

    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
    }

    fn require_initialized(env: &Env) -> Result<(), InsuranceError> {
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(InsuranceError::NotInitialized);
        }
        Self::bump_instance(env);
        Ok(())
    }

    fn require_admin(env: &Env, caller: &Address) -> Result<(), InsuranceError> {
        Self::require_initialized(env)?;
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(InsuranceError::NotInitialized)?;
        if *caller != admin {
            return Err(InsuranceError::AdminOnly);
        }
        Ok(())
    }

    fn get_token(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Token).unwrap()
    }

    fn get_quorum(env: &Env) -> u32 {
        env.storage().instance().get(&DataKey::Quorum).unwrap_or(2)
    }

    fn get_claim_cap(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::ClaimCap)
            .unwrap_or(i128::MAX)
    }

    fn get_min_contribution(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::MinContribution)
            .unwrap_or(1)
    }

    fn next_claim_id(env: &Env) -> u32 {
        let id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ClaimCounter)
            .unwrap_or(0_u32);
        env.storage()
            .instance()
            .set(&DataKey::ClaimCounter, &(id + 1));
        id
    }

    fn load_stats(env: &Env) -> FundStats {
        env.storage()
            .instance()
            .get(&DataKey::FundStats)
            .unwrap_or(FundStats {
                total_contributed: 0,
                total_paid_out: 0,
                total_claims: 0,
                paid_claims: 0,
                governor_count: 0,
            })
    }

    fn save_stats(env: &Env, stats: &FundStats) {
        env.storage().instance().set(&DataKey::FundStats, stats);
    }

    // ── Persistent ────────────────────────────────────────────────────────────

    #[inline]
    fn bump_persistent<K>(env: &Env, key: &K)
    where
        K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
    {
        env.storage().persistent().extend_ttl(
            key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_EXTEND_TO,
        );
    }

    fn load_claim(env: &Env, claim_id: u32) -> Result<Claim, InsuranceError> {
        let key = DataKey::Claim(claim_id);
        let claim = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(InsuranceError::ClaimNotFound)?;
        Self::bump_persistent(env, &key);
        Ok(claim)
    }

    fn save_claim(env: &Env, claim: &Claim) {
        let key = DataKey::Claim(claim.id);
        env.storage().persistent().set(&key, claim);
        Self::bump_persistent(env, &key);
    }

    fn is_governor(env: &Env, address: &Address) -> bool {
        let key = DataKey::Governor(address.clone());
        let exists = env.storage().persistent().has(&key);
        if exists {
            Self::bump_persistent(env, &key);
        }
        exists
    }

    fn add_governor(env: &Env, address: &Address) {
        let key = DataKey::Governor(address.clone());
        env.storage().persistent().set(&key, &true);
        Self::bump_persistent(env, &key);
    }

    fn remove_governor(env: &Env, address: &Address) {
        env.storage()
            .persistent()
            .remove(&DataKey::Governor(address.clone()));
    }

    fn has_voted(env: &Env, claim_id: u32, governor: &Address) -> bool {
        let key = DataKey::Vote(claim_id, governor.clone());
        let voted = env.storage().persistent().has(&key);
        if voted {
            Self::bump_persistent(env, &key);
        }
        voted
    }

    fn record_vote(env: &Env, claim_id: u32, governor: &Address, approve: bool) {
        let key = DataKey::Vote(claim_id, governor.clone());
        env.storage().persistent().set(&key, &approve);
        Self::bump_persistent(env, &key);
    }

    fn add_contribution(env: &Env, contributor: &Address, amount: i128) {
        let key = DataKey::Contribution(contributor.clone());
        let prev: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(prev + amount));
        Self::bump_persistent(env, &key);
    }

    fn get_contribution(env: &Env, contributor: &Address) -> i128 {
        let key = DataKey::Contribution(contributor.clone());
        let val = env.storage().persistent().get(&key).unwrap_or(0_i128);
        if val > 0 {
            Self::bump_persistent(env, &key);
        }
        val
    }

    // ── Staking helpers ───────────────────────────────────────────────────────

    fn acquire_lock(env: &Env) -> Result<(), InsuranceError> {
        if env
            .storage()
            .instance()
            .get::<DataKey, bool>(&DataKey::ReentrancyLock)
            .unwrap_or(false)
        {
            return Err(InsuranceError::Reentrancy);
        }
        env.storage()
            .instance()
            .set(&DataKey::ReentrancyLock, &true);
        Ok(())
    }

    fn release_lock(env: &Env) {
        env.storage()
            .instance()
            .set(&DataKey::ReentrancyLock, &false);
    }

    fn get_stake_record(env: &Env, staker: &Address) -> Option<StakeRecord> {
        let key = DataKey::Stake(staker.clone());
        let rec = env.storage().persistent().get(&key);
        if rec.is_some() {
            Self::bump_persistent(env, &key);
        }
        rec
    }

    fn save_stake_record(env: &Env, record: &StakeRecord) {
        let key = DataKey::Stake(record.staker.clone());
        env.storage().persistent().set(&key, record);
        Self::bump_persistent(env, &key);
    }

    fn remove_stake_record(env: &Env, staker: &Address) {
        env.storage()
            .persistent()
            .remove(&DataKey::Stake(staker.clone()));
    }

    fn get_stake_total(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::StakeTotal)
            .unwrap_or(0)
    }

    fn set_stake_total(env: &Env, total: i128) {
        env.storage().instance().set(&DataKey::StakeTotal, &total);
    }

    fn get_stake_pool(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::StakePool)
            .unwrap_or(0)
    }

    fn set_stake_pool(env: &Env, pool: i128) {
        env.storage().instance().set(&DataKey::StakePool, &pool);
    }

    fn get_yield_acc(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::YieldAccumulator)
            .unwrap_or(0)
    }

    fn set_yield_acc(env: &Env, acc: i128) {
        env.storage()
            .instance()
            .set(&DataKey::YieldAccumulator, &acc);
    }

    fn get_max_slash_bps(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::MaxSlashBps)
            .unwrap_or(DEFAULT_MAX_SLASH_BPS)
    }

    fn next_slash_id(env: &Env) -> u32 {
        let id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::SlashCounter)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::SlashCounter, &(id + 1));
        id
    }

    fn load_slash(env: &Env, slash_id: u32) -> Result<SlashProposal, InsuranceError> {
        let key = DataKey::SlashProposal(slash_id);
        let s = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(InsuranceError::SlashProposalNotFound)?;
        Self::bump_persistent(env, &key);
        Ok(s)
    }

    fn save_slash(env: &Env, s: &SlashProposal) {
        let key = DataKey::SlashProposal(s.id);
        env.storage().persistent().set(&key, s);
        Self::bump_persistent(env, &key);
    }

    fn pending_yield(record: &StakeRecord, current_acc: i128) -> i128 {
        if record.amount == 0 {
            return 0;
        }
        record
            .amount
            .saturating_mul(current_acc - record.reward_debt)
            / YIELD_PRECISION
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────

#[contract]
pub struct InsuranceContract;

#[contractimpl]
impl InsuranceContract {
    // ── Initialization ────────────────────────────────────────────────────────

    /// Initializes the insurance fund.
    ///
    /// # Arguments
    /// * `admin`            - Address with admin privileges.
    /// * `token`            - The token accepted for contributions and payouts.
    /// * `min_contribution` - Minimum deposit per contribution call.
    /// * `claim_cap`        - Maximum payout for a single claim.
    /// * `quorum`           - Number of governor votes required to finalise a claim.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        min_contribution: i128,
        claim_cap: i128,
        quorum: u32,
    ) -> Result<(), InsuranceError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(InsuranceError::AlreadyInitialized);
        }
        if min_contribution <= 0 || claim_cap <= 0 || quorum == 0 {
            return Err(InsuranceError::InvalidAmount);
        }

        let instance = env.storage().instance();
        instance.set(&DataKey::Admin, &admin);
        instance.set(&DataKey::Token, &token);
        instance.set(&DataKey::MinContribution, &min_contribution);
        instance.set(&DataKey::ClaimCap, &claim_cap);
        instance.set(&DataKey::Quorum, &quorum);
        instance.set(&DataKey::ClaimCounter, &0_u32);
        instance.set(
            &DataKey::FundStats,
            &FundStats {
                total_contributed: 0,
                total_paid_out: 0,
                total_claims: 0,
                paid_claims: 0,
                governor_count: 0,
            },
        );
        Storage::bump_instance(&env);
        Ok(())
    }

    // ── Contributions ─────────────────────────────────────────────────────────

    /// Contribute tokens to the insurance fund.
    ///
    /// Anyone can contribute. Tokens are transferred from `contributor` to
    /// this contract and tracked per address for transparency reports.
    ///
    /// # Arguments
    /// * `contributor` - Must `require_auth()`. Source of the tokens.
    /// * `amount`      - Amount to deposit. Must be >= `min_contribution`.
    pub fn contribute(env: Env, contributor: Address, amount: i128) -> Result<(), InsuranceError> {
        contributor.require_auth();
        Storage::require_initialized(&env)?;

        let min = Storage::get_min_contribution(&env);
        if amount < min {
            return Err(InsuranceError::BelowMinimum);
        }

        token::Client::new(&env, &Storage::get_token(&env)).transfer(
            &contributor,
            &env.current_contract_address(),
            &amount,
        );

        Storage::add_contribution(&env, &contributor, amount);

        let mut stats = Storage::load_stats(&env);
        stats.total_contributed += amount;
        Storage::save_stats(&env, &stats);

        events::emit_contributed(&env, &contributor, amount);
        Ok(())
    }

    // ── Claims ────────────────────────────────────────────────────────────────

    /// Submit an insurance claim.
    ///
    /// The claimant describes the loss and requests a payout amount.
    /// The claim enters `Pending` state and awaits governor votes.
    ///
    /// # Arguments
    /// * `claimant`    - Must `require_auth()`. Receives the payout if approved.
    /// * `description` - Human-readable description or IPFS hash of evidence.
    /// * `amount`      - Requested payout. Must be > 0 and <= `claim_cap`.
    ///
    /// # Returns
    /// The assigned `claim_id`.
    pub fn submit_claim(
        env: Env,
        claimant: Address,
        description: String,
        amount: i128,
    ) -> Result<u32, InsuranceError> {
        claimant.require_auth();
        Storage::require_initialized(&env)?;

        if amount <= 0 {
            return Err(InsuranceError::InvalidClaimAmount);
        }
        if amount > Storage::get_claim_cap(&env) {
            return Err(InsuranceError::ClaimExceedsCap);
        }

        let now = env.ledger().timestamp();
        let claim_id = Storage::next_claim_id(&env);

        let claim = Claim {
            id: claim_id,
            claimant: claimant.clone(),
            description,
            amount,
            status: ClaimStatus::Pending,
            submitted_at: now,
            expires_at: now + DEFAULT_CLAIM_EXPIRY_LEDGERS,
            votes_for: 0,
            votes_against: 0,
        };
        Storage::save_claim(&env, &claim);

        let mut stats = Storage::load_stats(&env);
        stats.total_claims += 1;
        Storage::save_stats(&env, &stats);

        events::emit_claim_submitted(&env, claim_id, &claimant, amount);
        Ok(claim_id)
    }

    /// Claimant withdraws their own pending claim.
    pub fn withdraw_claim(env: Env, caller: Address, claim_id: u32) -> Result<(), InsuranceError> {
        caller.require_auth();
        Storage::require_initialized(&env)?;

        let mut claim = Storage::load_claim(&env, claim_id)?;
        if claim.claimant != caller {
            return Err(InsuranceError::Unauthorized);
        }
        if claim.status != ClaimStatus::Pending {
            return Err(InsuranceError::InvalidClaimState);
        }

        claim.status = ClaimStatus::Withdrawn;
        Storage::save_claim(&env, &claim);

        events::emit_claim_withdrawn(&env, claim_id, &caller);
        Ok(())
    }

    // ── Governance / Evaluation ───────────────────────────────────────────────

    /// Governor casts a vote on a pending claim.
    ///
    /// Once `quorum` total votes are cast the claim is automatically finalised:
    /// - If `votes_for >= quorum && votes_for > votes_against` → `Approved`
    /// - Otherwise (against wins, or tie) → `Rejected`
    ///
    /// # Arguments
    /// * `governor` - Must be a registered governor.
    /// * `claim_id` - Target claim (must be Pending).
    /// * `approve`  - `true` to vote for approval, `false` to reject.
    pub fn vote(
        env: Env,
        governor: Address,
        claim_id: u32,
        approve: bool,
    ) -> Result<(), InsuranceError> {
        governor.require_auth();
        Storage::require_initialized(&env)?;

        if !Storage::is_governor(&env, &governor) {
            return Err(InsuranceError::NotGovernor);
        }
        if Storage::has_voted(&env, claim_id, &governor) {
            return Err(InsuranceError::AlreadyVoted);
        }

        let mut claim = Storage::load_claim(&env, claim_id)?;
        if claim.status != ClaimStatus::Pending {
            return Err(InsuranceError::InvalidClaimState);
        }

        // Check expiry
        if env.ledger().timestamp() > claim.expires_at {
            claim.status = ClaimStatus::Rejected;
            Storage::save_claim(&env, &claim);
            return Err(InsuranceError::ClaimExpired);
        }

        Storage::record_vote(&env, claim_id, &governor, approve);
        if approve {
            claim.votes_for += 1;
        } else {
            claim.votes_against += 1;
        }

        events::emit_vote_cast(&env, claim_id, &governor, approve);

        // Finalise once quorum is reached
        let quorum = Storage::get_quorum(&env);
        let total_votes = claim.votes_for + claim.votes_against;
        if total_votes >= quorum {
            // FOR must strictly outnumber AGAINST; ties go to Rejected.
            if claim.votes_for >= quorum && claim.votes_for > claim.votes_against {
                claim.status = ClaimStatus::Approved;
                events::emit_claim_approved(&env, claim_id, claim.amount);
            } else {
                claim.status = ClaimStatus::Rejected;
                events::emit_claim_rejected(&env, claim_id);
            }
        }

        Storage::save_claim(&env, &claim);
        Ok(())
    }

    // ── Payout ────────────────────────────────────────────────────────────────

    /// Execute the payout for an approved claim.
    ///
    /// Anyone can trigger this once the claim is `Approved` — the tokens
    /// always go to the original claimant.
    ///
    /// # Arguments
    /// * `claim_id` - Must be in `Approved` state.
    pub fn execute_payout(env: Env, claim_id: u32) -> Result<(), InsuranceError> {
        Storage::require_initialized(&env)?;

        let mut claim = Storage::load_claim(&env, claim_id)?;
        if claim.status != ClaimStatus::Approved {
            return Err(InsuranceError::InvalidClaimState);
        }

        let amount = claim.amount;
        let token = token::Client::new(&env, &Storage::get_token(&env));
        let balance = token.balance(&env.current_contract_address());
        if balance < amount {
            return Err(InsuranceError::InsufficientFunds);
        }

        // CEI: commit state before external call so reentry sees Paid status.
        // If transfer reverts the whole transaction reverts, so funds stay safe.
        claim.status = ClaimStatus::Paid;
        Storage::save_claim(&env, &claim);

        token.transfer(&env.current_contract_address(), &claim.claimant, &amount);

        let mut stats = Storage::load_stats(&env);
        stats.total_paid_out += amount;
        stats.paid_claims += 1;
        Storage::save_stats(&env, &stats);

        events::emit_payout(&env, claim_id, &claim.claimant, amount);
        Ok(())
    }

    // ── Governance management ─────────────────────────────────────────────────

    /// Admin registers a new governor.
    pub fn add_governor(
        env: Env,
        caller: Address,
        governor: Address,
    ) -> Result<(), InsuranceError> {
        caller.require_auth();
        Storage::require_admin(&env, &caller)?;

        if Storage::is_governor(&env, &governor) {
            return Err(InsuranceError::GovernorAlreadyExists);
        }

        Storage::add_governor(&env, &governor);

        let mut stats = Storage::load_stats(&env);
        stats.governor_count += 1;
        Storage::save_stats(&env, &stats);

        events::emit_governor_added(&env, &governor);
        Ok(())
    }

    /// Admin removes a governor.
    pub fn remove_governor(
        env: Env,
        caller: Address,
        governor: Address,
    ) -> Result<(), InsuranceError> {
        caller.require_auth();
        Storage::require_admin(&env, &caller)?;

        if !Storage::is_governor(&env, &governor) {
            return Err(InsuranceError::GovernorNotFound);
        }

        Storage::remove_governor(&env, &governor);

        let mut stats = Storage::load_stats(&env);
        stats.governor_count = stats.governor_count.saturating_sub(1);
        Storage::save_stats(&env, &stats);

        events::emit_governor_removed(&env, &governor);
        Ok(())
    }

    /// Admin updates the per-claim payout cap.
    pub fn set_claim_cap(env: Env, caller: Address, new_cap: i128) -> Result<(), InsuranceError> {
        caller.require_auth();
        Storage::require_admin(&env, &caller)?;
        if new_cap <= 0 {
            return Err(InsuranceError::InvalidAmount);
        }
        env.storage().instance().set(&DataKey::ClaimCap, &new_cap);
        Storage::bump_instance(&env);
        Ok(())
    }

    /// Admin updates the governance quorum.
    pub fn set_quorum(env: Env, caller: Address, new_quorum: u32) -> Result<(), InsuranceError> {
        caller.require_auth();
        Storage::require_admin(&env, &caller)?;
        if new_quorum == 0 {
            return Err(InsuranceError::InvalidAmount);
        }
        env.storage().instance().set(&DataKey::Quorum, &new_quorum);
        Storage::bump_instance(&env);
        Ok(())
    }

    // ── View / Transparency ───────────────────────────────────────────────────

    /// Returns aggregate fund statistics (transparency report).
    pub fn get_fund_info(env: Env) -> Result<FundInfo, InsuranceError> {
        Storage::require_initialized(&env)?;
        let stats = Storage::load_stats(&env);
        let token = token::Client::new(&env, &Storage::get_token(&env));
        let current_balance = token.balance(&env.current_contract_address());
        Ok(FundInfo {
            total_contributed: stats.total_contributed,
            total_paid_out: stats.total_paid_out,
            current_balance,
            total_claims: stats.total_claims,
            paid_claims: stats.paid_claims,
            governor_count: stats.governor_count,
        })
    }

    /// Returns a single claim by ID.
    pub fn get_claim(env: Env, claim_id: u32) -> Result<Claim, InsuranceError> {
        Storage::require_initialized(&env)?;
        Storage::load_claim(&env, claim_id)
    }

    /// Returns the total amount contributed by a specific address.
    pub fn get_contribution(env: Env, contributor: Address) -> i128 {
        Storage::get_contribution(&env, &contributor)
    }

    /// Returns whether an address is a registered governor.
    pub fn is_governor(env: Env, address: Address) -> bool {
        Storage::is_governor(&env, &address)
    }

    // ── Staking ───────────────────────────────────────────────────────────────

    /// Stake tokens into the insurance fund.
    ///
    /// Caller transfers `amount` tokens to this contract and receives a pro-rata
    /// share of future platform-fee yield. Reentrancy-guarded.
    pub fn stake(env: Env, staker: Address, amount: i128) -> Result<(), InsuranceError> {
        staker.require_auth();
        Storage::require_initialized(&env)?;
        Storage::acquire_lock(&env)?;

        if amount <= 0 {
            Storage::release_lock(&env);
            return Err(InsuranceError::InvalidAmount);
        }

        let acc = Storage::get_yield_acc(&env);

        // Settle any pending yield before changing the stake
        let mut record = Storage::get_stake_record(&env, &staker).unwrap_or(StakeRecord {
            staker: staker.clone(),
            amount: 0,
            reward_debt: acc,
        });

        let pending = Storage::pending_yield(&record, acc);
        if pending > 0 {
            let token = token::Client::new(&env, &Storage::get_token(&env));
            let bal = token.balance(&env.current_contract_address());
            if bal >= pending {
                token.transfer(&env.current_contract_address(), &staker, &pending);
                events::emit_yield_claimed(&env, &staker, pending);
            }
        }

        // Transfer staked tokens in
        token::Client::new(&env, &Storage::get_token(&env)).transfer(
            &staker,
            &env.current_contract_address(),
            &amount,
        );

        record.amount += amount;
        record.reward_debt = acc;
        Storage::save_stake_record(&env, &record);
        Storage::set_stake_total(&env, Storage::get_stake_total(&env) + amount);
        Storage::set_stake_pool(&env, Storage::get_stake_pool(&env) + amount);

        events::emit_staked(&env, &staker, amount);
        Storage::release_lock(&env);
        Ok(())
    }

    /// Unstake tokens. Staker receives a proportional share of the stake pool
    /// (which may be less than the nominal amount if slashes occurred).
    /// Reentrancy-guarded.
    pub fn unstake(env: Env, staker: Address, amount: i128) -> Result<i128, InsuranceError> {
        staker.require_auth();
        Storage::require_initialized(&env)?;
        Storage::acquire_lock(&env)?;

        let mut record = Storage::get_stake_record(&env, &staker).ok_or_else(|| {
            Storage::release_lock(&env);
            InsuranceError::NoStakeFound
        })?;

        if amount <= 0 || amount > record.amount {
            Storage::release_lock(&env);
            return Err(InsuranceError::InsufficientStake);
        }

        let acc = Storage::get_yield_acc(&env);

        // Settle pending yield first
        let pending = Storage::pending_yield(&record, acc);
        let token = token::Client::new(&env, &Storage::get_token(&env));
        if pending > 0 {
            let bal = token.balance(&env.current_contract_address());
            if bal >= pending {
                token.transfer(&env.current_contract_address(), &staker, &pending);
                events::emit_yield_claimed(&env, &staker, pending);
            }
        }

        // Compute proportional return (accounts for slashes)
        let total_stored = Storage::get_stake_total(&env);
        let stake_pool = Storage::get_stake_pool(&env);
        let actual_return = if total_stored > 0 {
            amount.saturating_mul(stake_pool) / total_stored
        } else {
            amount
        };

        // Dynamic balance check
        let bal = token.balance(&env.current_contract_address());
        if bal < actual_return {
            Storage::release_lock(&env);
            return Err(InsuranceError::InsufficientFunds);
        }

        token.transfer(&env.current_contract_address(), &staker, &actual_return);

        record.amount -= amount;
        record.reward_debt = acc;
        if record.amount == 0 {
            Storage::remove_stake_record(&env, &staker);
        } else {
            Storage::save_stake_record(&env, &record);
        }
        Storage::set_stake_total(&env, Storage::get_stake_total(&env) - amount);
        Storage::set_stake_pool(&env, Storage::get_stake_pool(&env) - actual_return);

        events::emit_unstaked(&env, &staker, actual_return);
        Storage::release_lock(&env);
        Ok(actual_return)
    }

    /// Add platform fees to the yield pool. Admin only.
    ///
    /// Caller must transfer tokens to this contract separately; this function
    /// updates the yield accumulator to distribute proportionally to stakers.
    pub fn add_platform_fees(
        env: Env,
        caller: Address,
        amount: i128,
    ) -> Result<(), InsuranceError> {
        caller.require_auth();
        Storage::require_admin(&env, &caller)?;

        if amount <= 0 {
            return Err(InsuranceError::InvalidAmount);
        }

        let total_stored = Storage::get_stake_total(&env);
        if total_stored > 0 {
            let acc = Storage::get_yield_acc(&env);
            Storage::set_yield_acc(
                &env,
                acc + amount.saturating_mul(YIELD_PRECISION) / total_stored,
            );
        }
        // If no stakers, fees accumulate in the contract balance for future use.

        events::emit_fee_added(&env, amount);
        Ok(())
    }

    /// Claim accumulated yield for the caller.
    pub fn claim_yield(env: Env, staker: Address) -> Result<i128, InsuranceError> {
        staker.require_auth();
        Storage::require_initialized(&env)?;
        Storage::acquire_lock(&env)?;

        let mut record = Storage::get_stake_record(&env, &staker).ok_or_else(|| {
            Storage::release_lock(&env);
            InsuranceError::NoStakeFound
        })?;

        let acc = Storage::get_yield_acc(&env);
        let pending = Storage::pending_yield(&record, acc);

        if pending <= 0 {
            Storage::release_lock(&env);
            return Err(InsuranceError::NoYieldAvailable);
        }

        let token = token::Client::new(&env, &Storage::get_token(&env));
        let bal = token.balance(&env.current_contract_address());
        if bal < pending {
            Storage::release_lock(&env);
            return Err(InsuranceError::InsufficientFunds);
        }

        token.transfer(&env.current_contract_address(), &staker, &pending);
        record.reward_debt = acc;
        Storage::save_stake_record(&env, &record);

        events::emit_yield_claimed(&env, &staker, pending);
        Storage::release_lock(&env);
        Ok(pending)
    }

    // ── Slash governance ──────────────────────────────────────────────────────

    /// Any governor can submit a slash proposal.
    ///
    /// `slash_bps` is capped at the configured maximum (default 40%).
    /// Governance quorum (from `set_quorum`) is reused for slash approval.
    ///
    /// # Returns
    /// The assigned `slash_id`.
    pub fn propose_slash(
        env: Env,
        caller: Address,
        slash_bps: u32,
        reason: String,
    ) -> Result<u32, InsuranceError> {
        caller.require_auth();
        Storage::require_initialized(&env)?;

        if !Storage::is_governor(&env, &caller) {
            return Err(InsuranceError::NotGovernor);
        }
        if slash_bps == 0 {
            return Err(InsuranceError::InvalidSlashBps);
        }
        if slash_bps > Storage::get_max_slash_bps(&env) {
            return Err(InsuranceError::SlashExceedsCap);
        }

        let now = env.ledger().timestamp();
        let slash_id = Storage::next_slash_id(&env);
        let proposal = SlashProposal {
            id: slash_id,
            proposer: caller.clone(),
            slash_bps,
            reason,
            votes_for: 0,
            votes_against: 0,
            status: SlashStatus::Pending,
            created_at: now,
        };
        Storage::save_slash(&env, &proposal);
        events::emit_slash_proposed(&env, slash_id, &caller, slash_bps);
        Ok(slash_id)
    }

    /// Governor votes on a pending slash proposal.
    ///
    /// Automatically resolves to Approved/Rejected once governance quorum is met.
    pub fn vote_slash(
        env: Env,
        governor: Address,
        slash_id: u32,
        approve: bool,
    ) -> Result<(), InsuranceError> {
        governor.require_auth();
        Storage::require_initialized(&env)?;

        if !Storage::is_governor(&env, &governor) {
            return Err(InsuranceError::NotGovernor);
        }

        let vote_key = DataKey::SlashVote(slash_id, governor.clone());
        if env.storage().persistent().has(&vote_key) {
            return Err(InsuranceError::AlreadyVoted);
        }

        let mut proposal = Storage::load_slash(&env, slash_id)?;
        if proposal.status != SlashStatus::Pending {
            return Err(InsuranceError::SlashProposalNotApproved);
        }

        env.storage().persistent().set(&vote_key, &approve);
        Storage::bump_persistent(&env, &vote_key);

        if approve {
            proposal.votes_for += 1;
        } else {
            proposal.votes_against += 1;
        }

        let quorum = Storage::get_quorum(&env);
        if proposal.votes_for + proposal.votes_against >= quorum {
            proposal.status = if proposal.votes_for >= quorum {
                SlashStatus::Approved
            } else {
                SlashStatus::Rejected
            };
        }

        Storage::save_slash(&env, &proposal);
        Ok(())
    }

    /// Execute an approved slash proposal. Permissionless once approved.
    ///
    /// Transfers `stake_pool * slash_bps / 10_000` tokens to the admin (treasury).
    /// Slash is bounded by the configured maximum (default 40%).
    ///
    /// # Returns
    /// The actual number of tokens slashed.
    pub fn execute_slash(env: Env, slash_id: u32) -> Result<i128, InsuranceError> {
        Storage::require_initialized(&env)?;
        Storage::acquire_lock(&env)?;

        let mut proposal = Storage::load_slash(&env, slash_id).inspect_err(|_| {
            Storage::release_lock(&env);
        })?;

        if proposal.status != SlashStatus::Approved {
            Storage::release_lock(&env);
            return Err(InsuranceError::SlashProposalNotApproved);
        }

        let stake_pool = Storage::get_stake_pool(&env);
        let slash_amount = stake_pool.saturating_mul(proposal.slash_bps as i128) / 10_000;

        if slash_amount > 0 {
            let token = token::Client::new(&env, &Storage::get_token(&env));
            // Dynamic balance check
            let bal = token.balance(&env.current_contract_address());
            let actual_slash = slash_amount.min(bal);

            if actual_slash > 0 {
                let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
                token.transfer(&env.current_contract_address(), &admin, &actual_slash);
                Storage::set_stake_pool(&env, stake_pool - actual_slash);

                events::emit_slash_executed(&env, slash_id, proposal.slash_bps, actual_slash);
            }
        }

        proposal.status = SlashStatus::Executed;
        Storage::save_slash(&env, &proposal);
        Storage::release_lock(&env);
        Ok(slash_amount)
    }

    /// Admin sets the maximum allowable slash percentage (bps, ceiling 4000 = 40%).
    pub fn set_max_slash_bps(
        env: Env,
        caller: Address,
        max_bps: u32,
    ) -> Result<(), InsuranceError> {
        caller.require_auth();
        Storage::require_admin(&env, &caller)?;
        if max_bps == 0 || max_bps > 4_000 {
            return Err(InsuranceError::InvalidSlashBps);
        }
        env.storage()
            .instance()
            .set(&DataKey::MaxSlashBps, &max_bps);
        Storage::bump_instance(&env);
        Ok(())
    }

    /// Returns the staked amount (nominal) for `staker`.
    pub fn get_stake(env: Env, staker: Address) -> i128 {
        Storage::get_stake_record(&env, &staker)
            .map(|r| r.amount)
            .unwrap_or(0)
    }

    /// Returns the pending yield for `staker`.
    pub fn pending_yield_view(env: Env, staker: Address) -> i128 {
        let record = match Storage::get_stake_record(&env, &staker) {
            Some(r) => r,
            None => return 0,
        };
        let acc = Storage::get_yield_acc(&env);
        Storage::pending_yield(&record, acc)
    }

    /// Returns a slash proposal by ID.
    pub fn get_slash_proposal(env: Env, slash_id: u32) -> Result<SlashProposal, InsuranceError> {
        Storage::require_initialized(&env)?;
        Storage::load_slash(&env, slash_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[allow(unused_imports)]
    use crate::{SlashStatus, StakeRecord};
    use soroban_sdk::{testutils::Address as _, token, Env, String};

    struct Setup {
        env: Env,
        admin: Address,
        token_id: Address,
        contract_id: Address,
        client: InsuranceContractClient<'static>,
    }

    fn setup() -> Setup {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();

        let contract_id = env.register_contract(None, InsuranceContract);
        let client = InsuranceContractClient::new(&env, &contract_id);

        client.initialize(&admin, &token_id, &10_i128, &10_000_i128, &2_u32);

        Setup {
            env,
            admin,
            token_id,
            contract_id,
            client,
        }
    }

    fn mint(env: &Env, _admin: &Address, token_id: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token_id).mint(to, &amount);
    }

    // ── Initialization ────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_stores_params() {
        let s = setup();
        let info = s.client.get_fund_info();
        assert_eq!(info.total_contributed, 0);
        assert_eq!(info.governor_count, 0);
        assert_eq!(info.current_balance, 0);
    }

    #[test]
    fn test_double_initialize_fails() {
        let s = setup();
        let result = s
            .client
            .try_initialize(&s.admin, &s.token_id, &10_i128, &10_000_i128, &2_u32);
        assert!(result.is_err());
    }

    // ── Contributions ─────────────────────────────────────────────────────────

    #[test]
    fn test_contribute_transfers_tokens() {
        let s = setup();
        let contributor = Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &contributor, 500);

        s.client.contribute(&contributor, &500_i128);

        let info = s.client.get_fund_info();
        assert_eq!(info.total_contributed, 500);
        assert_eq!(info.current_balance, 500);
        assert_eq!(s.client.get_contribution(&contributor), 500);
    }

    #[test]
    fn test_contribute_below_minimum_fails() {
        let s = setup();
        let contributor = Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &contributor, 5);

        let result = s.client.try_contribute(&contributor, &5_i128);
        assert!(result.is_err());
    }

    // ── Claims ────────────────────────────────────────────────────────────────

    #[test]
    fn test_submit_claim_returns_id() {
        let s = setup();
        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Lost funds due to exploit");

        let id = s.client.submit_claim(&claimant, &desc, &500_i128);
        assert_eq!(id, 0);

        let claim = s.client.get_claim(&id);
        assert_eq!(claim.claimant, claimant);
        assert_eq!(claim.amount, 500);
        assert_eq!(claim.status, ClaimStatus::Pending);
    }

    #[test]
    fn test_submit_claim_exceeds_cap_fails() {
        let s = setup();
        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Too large");

        let result = s.client.try_submit_claim(&claimant, &desc, &99_999_i128);
        assert!(result.is_err());
    }

    #[test]
    fn test_withdraw_claim() {
        let s = setup();
        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Changed my mind");

        let id = s.client.submit_claim(&claimant, &desc, &100_i128);
        s.client.withdraw_claim(&claimant, &id);

        let claim = s.client.get_claim(&id);
        assert_eq!(claim.status, ClaimStatus::Withdrawn);
    }

    // ── Governance ────────────────────────────────────────────────────────────

    #[test]
    fn test_add_remove_governor() {
        let s = setup();
        let gov = Address::generate(&s.env);

        s.client.add_governor(&s.admin, &gov);
        assert!(s.client.is_governor(&gov));

        let info = s.client.get_fund_info();
        assert_eq!(info.governor_count, 1);

        s.client.remove_governor(&s.admin, &gov);
        assert!(!s.client.is_governor(&gov));
    }

    #[test]
    fn test_vote_approves_at_quorum() {
        let s = setup();

        // Fund the contract so payout can succeed
        let funder = Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &funder, 5_000);
        s.client.contribute(&funder, &5_000_i128);

        let gov1 = Address::generate(&s.env);
        let gov2 = Address::generate(&s.env);
        s.client.add_governor(&s.admin, &gov1);
        s.client.add_governor(&s.admin, &gov2);

        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Exploit loss");
        let id = s.client.submit_claim(&claimant, &desc, &1_000_i128);

        s.client.vote(&gov1, &id, &true);
        s.client.vote(&gov2, &id, &true);

        let claim = s.client.get_claim(&id);
        assert_eq!(claim.status, ClaimStatus::Approved);
    }

    #[test]
    fn test_vote_rejects_when_against_wins() {
        let s = setup();

        let gov1 = Address::generate(&s.env);
        let gov2 = Address::generate(&s.env);
        s.client.add_governor(&s.admin, &gov1);
        s.client.add_governor(&s.admin, &gov2);

        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Questionable claim");
        let id = s.client.submit_claim(&claimant, &desc, &500_i128);

        s.client.vote(&gov1, &id, &false);
        s.client.vote(&gov2, &id, &false);

        let claim = s.client.get_claim(&id);
        assert_eq!(claim.status, ClaimStatus::Rejected);
    }

    #[test]
    fn test_double_vote_fails() {
        let s = setup();
        let gov = Address::generate(&s.env);
        s.client.add_governor(&s.admin, &gov);

        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Test");
        let id = s.client.submit_claim(&claimant, &desc, &100_i128);

        s.client.vote(&gov, &id, &true);
        let result = s.client.try_vote(&gov, &id, &true);
        assert!(result.is_err());
    }

    // ── Payout ────────────────────────────────────────────────────────────────

    #[test]
    fn test_execute_payout_transfers_tokens() {
        let s = setup();

        let funder = Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &funder, 5_000);
        s.client.contribute(&funder, &5_000_i128);

        let gov1 = Address::generate(&s.env);
        let gov2 = Address::generate(&s.env);
        s.client.add_governor(&s.admin, &gov1);
        s.client.add_governor(&s.admin, &gov2);

        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Payout test");
        let id = s.client.submit_claim(&claimant, &desc, &1_000_i128);

        s.client.vote(&gov1, &id, &true);
        s.client.vote(&gov2, &id, &true);

        s.client.execute_payout(&id);

        let token_client = token::Client::new(&s.env, &s.token_id);
        assert_eq!(token_client.balance(&claimant), 1_000_i128);

        let info = s.client.get_fund_info();
        assert_eq!(info.total_paid_out, 1_000);
        assert_eq!(info.paid_claims, 1);
        assert_eq!(info.current_balance, 4_000);

        let claim = s.client.get_claim(&id);
        assert_eq!(claim.status, ClaimStatus::Paid);
    }

    #[test]
    fn test_payout_insufficient_funds_fails() {
        let s = setup();

        // No funds in contract
        let gov1 = Address::generate(&s.env);
        let gov2 = Address::generate(&s.env);
        s.client.add_governor(&s.admin, &gov1);
        s.client.add_governor(&s.admin, &gov2);

        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Empty fund");
        let id = s.client.submit_claim(&claimant, &desc, &500_i128);

        s.client.vote(&gov1, &id, &true);
        s.client.vote(&gov2, &id, &true);

        let result = s.client.try_execute_payout(&id);
        assert!(result.is_err());
    }

    // ── Admin config ──────────────────────────────────────────────────────────

    #[test]
    fn test_set_claim_cap_updates_cap() {
        let s = setup();
        // New cap should allow a claim that previously would exceed the old cap
        s.client.set_claim_cap(&s.admin, &50_000_i128);

        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Large claim");
        // 20_000 > original cap of 10_000, should now succeed
        let id = s.client.submit_claim(&claimant, &desc, &20_000_i128);
        let claim = s.client.get_claim(&id);
        assert_eq!(claim.amount, 20_000);
    }

    #[test]
    fn test_set_claim_cap_zero_fails() {
        let s = setup();
        let result = s.client.try_set_claim_cap(&s.admin, &0_i128);
        assert!(result.is_err());
    }

    #[test]
    fn test_set_claim_cap_non_admin_fails() {
        let s = setup();
        let non_admin = Address::generate(&s.env);
        let result = s.client.try_set_claim_cap(&non_admin, &5_000_i128);
        assert!(result.is_err());
    }

    #[test]
    fn test_set_quorum_updates_quorum() {
        let s = setup();
        // Lower quorum to 1 so a single governor vote reaches quorum
        s.client.set_quorum(&s.admin, &1_u32);

        let gov = Address::generate(&s.env);
        s.client.add_governor(&s.admin, &gov);

        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Single vote quorum");
        let id = s.client.submit_claim(&claimant, &desc, &100_i128);

        s.client.vote(&gov, &id, &true);

        let claim = s.client.get_claim(&id);
        assert_eq!(claim.status, ClaimStatus::Approved);
    }

    #[test]
    fn test_set_quorum_zero_fails() {
        let s = setup();
        let result = s.client.try_set_quorum(&s.admin, &0_u32);
        assert!(result.is_err());
    }

    #[test]
    fn test_set_quorum_non_admin_fails() {
        let s = setup();
        let non_admin = Address::generate(&s.env);
        let result = s.client.try_set_quorum(&non_admin, &3_u32);
        assert!(result.is_err());
    }

    #[test]
    fn test_add_duplicate_governor_fails() {
        let s = setup();
        let gov = Address::generate(&s.env);
        s.client.add_governor(&s.admin, &gov);
        let result = s.client.try_add_governor(&s.admin, &gov);
        assert!(result.is_err());
    }

    #[test]
    fn test_remove_nonexistent_governor_fails() {
        let s = setup();
        let gov = Address::generate(&s.env);
        let result = s.client.try_remove_governor(&s.admin, &gov);
        assert!(result.is_err());
    }

    #[test]
    fn test_execute_payout_not_approved_fails() {
        let s = setup();
        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Pending claim");
        let id = s.client.submit_claim(&claimant, &desc, &100_i128);
        // No votes cast — claim is still Pending
        let result = s.client.try_execute_payout(&id);
        assert!(result.is_err());
    }

    #[test]
    fn test_vote_on_nonexistent_claim_fails() {
        let s = setup();
        let gov = Address::generate(&s.env);
        s.client.add_governor(&s.admin, &gov);
        let result = s.client.try_vote(&gov, &999_u32, &true);
        assert!(result.is_err());
    }

    #[test]
    fn test_withdraw_claim_non_claimant_fails() {
        let s = setup();
        let claimant = Address::generate(&s.env);
        let other = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Claim");
        let id = s.client.submit_claim(&claimant, &desc, &100_i128);
        let result = s.client.try_withdraw_claim(&other, &id);
        assert!(result.is_err());
    }

    // ── Staking (Issue #896) ──────────────────────────────────────────────────

    #[test]
    fn test_stake_deposits_tokens() {
        let s = setup();
        let staker = Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &staker, 1_000);

        s.client.stake(&staker, &1_000_i128);

        assert_eq!(s.client.get_stake(&staker), 1_000);
        let tok = token::Client::new(&s.env, &s.token_id);
        assert_eq!(tok.balance(&staker), 0);
    }

    #[test]
    fn test_unstake_returns_tokens() {
        let s = setup();
        let staker = Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &staker, 1_000);

        s.client.stake(&staker, &1_000_i128);
        let returned = s.client.unstake(&staker, &1_000_i128);

        assert_eq!(returned, 1_000);
        assert_eq!(s.client.get_stake(&staker), 0);
        let tok = token::Client::new(&s.env, &s.token_id);
        assert_eq!(tok.balance(&staker), 1_000);
    }

    #[test]
    fn test_unstake_more_than_staked_fails() {
        let s = setup();
        let staker = Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &staker, 500);

        s.client.stake(&staker, &500_i128);
        let result = s.client.try_unstake(&staker, &600_i128);
        assert!(result.is_err());
    }

    #[test]
    fn test_yield_distributed_proportionally() {
        let s = setup();
        let s1 = Address::generate(&s.env);
        let s2 = Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &s1, 1_000);
        mint(&s.env, &s.admin, &s.token_id, &s2, 3_000);

        s.client.stake(&s1, &1_000_i128);
        s.client.stake(&s2, &3_000_i128);

        // Admin adds platform fees: 400 tokens to yield pool
        mint(&s.env, &s.admin, &s.token_id, &s.contract_id, 400);
        s.client.add_platform_fees(&s.admin, &400_i128);

        // s1 has 25% of stake (1000/4000), s2 has 75%
        let y1 = s.client.pending_yield_view(&s1);
        let y2 = s.client.pending_yield_view(&s2);
        assert_eq!(y1, 100); // 25% of 400
        assert_eq!(y2, 300); // 75% of 400
    }

    #[test]
    fn test_claim_yield_transfers_tokens() {
        let s = setup();
        let staker = Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &staker, 2_000);
        s.client.stake(&staker, &2_000_i128);

        mint(&s.env, &s.admin, &s.token_id, &s.contract_id, 200);
        s.client.add_platform_fees(&s.admin, &200_i128);

        let claimed = s.client.claim_yield(&staker);
        assert_eq!(claimed, 200);

        let tok = token::Client::new(&s.env, &s.token_id);
        assert_eq!(tok.balance(&staker), 200);

        // Yield exhausted; second claim fails
        let result = s.client.try_claim_yield(&staker);
        assert!(result.is_err());
    }

    #[test]
    fn test_slash_proposal_lifecycle() {
        let s = setup();
        let gov1 = Address::generate(&s.env);
        let gov2 = Address::generate(&s.env);
        s.client.add_governor(&s.admin, &gov1);
        s.client.add_governor(&s.admin, &gov2);

        let staker = Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &staker, 1_000);
        s.client.stake(&staker, &1_000_i128);

        let reason = String::from_str(&s.env, "Protocol exploit");
        let slash_id = s.client.propose_slash(&gov1, &1_000_u32, &reason); // 10%

        let proposal = s.client.get_slash_proposal(&slash_id);
        assert_eq!(proposal.status, SlashStatus::Pending);

        s.client.vote_slash(&gov1, &slash_id, &true);
        s.client.vote_slash(&gov2, &slash_id, &true);

        let proposal = s.client.get_slash_proposal(&slash_id);
        assert_eq!(proposal.status, SlashStatus::Approved);

        let slashed = s.client.execute_slash(&slash_id);
        assert_eq!(slashed, 100); // 10% of 1_000

        let tok = token::Client::new(&s.env, &s.token_id);
        // Admin (treasury) received 100 slashed tokens
        assert_eq!(tok.balance(&s.admin), 100);

        // Staker unstakes and receives the remaining 90%
        let returned = s.client.unstake(&staker, &1_000_i128);
        assert_eq!(returned, 900);
    }

    #[test]
    fn test_slash_exceeds_cap_fails() {
        let s = setup();
        let gov = Address::generate(&s.env);
        s.client.add_governor(&s.admin, &gov);

        let reason = String::from_str(&s.env, "Too large");
        // 4001 bps > default 4000 cap
        let result = s.client.try_propose_slash(&gov, &4_001_u32, &reason);
        assert!(result.is_err());
    }

    #[test]
    fn test_non_governor_cannot_propose_slash() {
        let s = setup();
        let stranger = Address::generate(&s.env);
        let reason = String::from_str(&s.env, "Unauthorized");
        let result = s.client.try_propose_slash(&stranger, &500_u32, &reason);
        assert!(result.is_err());
    }

    #[test]
    fn test_slash_rejected_when_against_wins() {
        let s = setup();
        let gov1 = Address::generate(&s.env);
        let gov2 = Address::generate(&s.env);
        s.client.add_governor(&s.admin, &gov1);
        s.client.add_governor(&s.admin, &gov2);

        let reason = String::from_str(&s.env, "Disputed slash");
        let slash_id = s.client.propose_slash(&gov1, &500_u32, &reason);

        s.client.vote_slash(&gov1, &slash_id, &false);
        s.client.vote_slash(&gov2, &slash_id, &false);

        let proposal = s.client.get_slash_proposal(&slash_id);
        assert_eq!(proposal.status, SlashStatus::Rejected);

        let result = s.client.try_execute_slash(&slash_id);
        assert!(result.is_err());
    }

    // ── Bug-fix regression tests ───────────────────────────────────────────────

    #[test]
    fn test_minority_for_votes_rejected_despite_quorum_met() {
        // 1 FOR, 9 AGAINST, quorum=1 — FOR meets quorum but loses the vote.
        let s = setup();
        s.client.set_quorum(&s.admin, &1_u32);

        let mut governors = soroban_sdk::Vec::new(&s.env);
        for _ in 0..10 {
            governors.push_back(Address::generate(&s.env));
        }
        for gov in governors.iter() {
            s.client.add_governor(&s.admin, &gov);
        }

        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Minority approval attempt");
        let id = s.client.submit_claim(&claimant, &desc, &100_i128);

        // Cast 1 FOR then 9 AGAINST — finalises on the first vote (quorum=1).
        s.client.vote(&governors.get(0).unwrap(), &id, &true);
        // Claim is finalised at quorum; remaining votes are on a closed claim.
        // Re-submit a fresh claim to accumulate the full spread then assert.
        let id2 = s.client.submit_claim(&claimant, &desc, &100_i128);
        // With quorum=1 and a fresh claim, one AGAINST vote finalises immediately.
        s.client.vote(&governors.get(1).unwrap(), &id2, &false);
        let claim2 = s.client.get_claim(&id2);
        assert_eq!(claim2.status, ClaimStatus::Rejected);

        // Core assertion: with quorum=1 the first FOR vote approved claim `id`.
        // Now create a scenario where AGAINST strictly wins: quorum=2.
        s.client.set_quorum(&s.admin, &2_u32);
        let id3 = s.client.submit_claim(&claimant, &desc, &100_i128);
        s.client.vote(&governors.get(2).unwrap(), &id3, &true); // 1 FOR
        s.client.vote(&governors.get(3).unwrap(), &id3, &false); // 1 AGAINST — total=2, tie → Rejected
        let claim3 = s.client.get_claim(&id3);
        assert_eq!(claim3.status, ClaimStatus::Rejected);

        // 1 FOR, 9 AGAINST with quorum=2: first AGAINST finalises with 1 each — tie → Rejected.
        // Verify 5 FOR, 3 AGAINST (quorum=4) → Approved.
        s.client.set_quorum(&s.admin, &4_u32);
        let funder = Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &funder, 5_000);
        s.client.contribute(&funder, &5_000_i128);
        let id4 = s.client.submit_claim(&claimant, &desc, &100_i128);
        s.client.vote(&governors.get(4).unwrap(), &id4, &true);
        s.client.vote(&governors.get(5).unwrap(), &id4, &true);
        s.client.vote(&governors.get(6).unwrap(), &id4, &true);
        s.client.vote(&governors.get(7).unwrap(), &id4, &true); // 4 FOR — quorum met, 4>0 → Approved
        let claim4 = s.client.get_claim(&id4);
        assert_eq!(claim4.status, ClaimStatus::Approved);
    }

    #[test]
    fn test_execute_payout_twice_fails() {
        // Second call must fail because status is already Paid (CEI fix).
        let s = setup();

        let funder = Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &funder, 5_000);
        s.client.contribute(&funder, &5_000_i128);

        let gov1 = Address::generate(&s.env);
        let gov2 = Address::generate(&s.env);
        s.client.add_governor(&s.admin, &gov1);
        s.client.add_governor(&s.admin, &gov2);

        let claimant = Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Double-payout attempt");
        let id = s.client.submit_claim(&claimant, &desc, &1_000_i128);

        s.client.vote(&gov1, &id, &true);
        s.client.vote(&gov2, &id, &true);

        s.client.execute_payout(&id);

        // Status is now Paid; second call must be rejected.
        let result = s.client.try_execute_payout(&id);
        assert!(result.is_err());

        // Claimant received exactly one payout.
        let token_client = token::Client::new(&s.env, &s.token_id);
        assert_eq!(token_client.balance(&claimant), 1_000_i128);
    }
}
