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

mod errors;
mod events;
mod types;
mod gas_profiling;

pub use errors::InsuranceError;
pub use types::{Claim, ClaimStatus, DataKey, FundInfo, FundStats};

use soroban_sdk::{contract, contractimpl, token, Address, Env, String};

// ── TTL constants ─────────────────────────────────────────────────────────────
const INSTANCE_TTL_THRESHOLD: u32 = 5_000;
const INSTANCE_TTL_EXTEND_TO: u32 = 50_000;
const PERSISTENT_TTL_THRESHOLD: u32 = 5_000;
const PERSISTENT_TTL_EXTEND_TO: u32 = 50_000;

/// Default claim expiry window in ledgers (~7 days at 5 s/ledger).
const DEFAULT_CLAIM_EXPIRY_LEDGERS: u64 = 120_960;

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
        env.storage()
            .persistent()
            .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);
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
    /// Once `quorum` votes are cast the claim is automatically finalised:
    /// - If `votes_for >= quorum` → `Approved`
    /// - Otherwise → `Rejected`
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
            if claim.votes_for >= quorum {
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

        token.transfer(&env.current_contract_address(), &claim.claimant, &amount);

        claim.status = ClaimStatus::Paid;
        Storage::save_claim(&env, &claim);

        let mut stats = Storage::load_stats(&env);
        stats.total_paid_out += amount;
        stats.paid_claims += 1;
        Storage::save_stats(&env, &stats);

        events::emit_payout(&env, claim_id, &claim.claimant, amount);
        Ok(())
    }

    // ── Governance management ─────────────────────────────────────────────────

    /// Admin registers a new governor.
    pub fn add_governor(env: Env, caller: Address, governor: Address) -> Result<(), InsuranceError> {
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
        env.storage()
            .instance()
            .set(&DataKey::Quorum, &new_quorum);
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
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Env, String};

    struct Setup {
        env: Env,
        admin: Address,
        token_id: Address,
        #[allow(dead_code)]
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

        Setup { env, admin, token_id, contract_id, client }
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
        let result = s.client.try_initialize(
            &s.admin, &s.token_id, &10_i128, &10_000_i128, &2_u32,
        );
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
}
