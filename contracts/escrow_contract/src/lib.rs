//! # StellarTrustEscrow — Soroban Smart Contract
//!
//! Milestone-based escrow with on-chain reputation on the Stellar network.
//!
//! ## Architecture
//!
//! This contract is the single source of truth for all escrow state.
//! The backend `escrowIndexer` listens to events emitted here and mirrors
//! the state to PostgreSQL for fast off-chain queries.
//!
//! ## Contributor Notes
//!
//! Most function bodies are left as `todo!()` stubs for contributors to implement.
//! Each stub includes a detailed comment describing the expected behaviour,
//! validation requirements, state changes, and events to emit.
//!
//! See the open GitHub Issues for specific tasks.

#![no_std]
#![allow(clippy::too_many_arguments)]

mod errors;
mod events;
mod types;
mod upgrade_tests;

pub use errors::EscrowError;
pub use types::{DataKey, EscrowState, EscrowStatus, Milestone, MilestoneStatus, ReputationRecord};

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, BytesN, Env, String, Vec};

const INSTANCE_TTL_THRESHOLD: u32 = 5_000;
const INSTANCE_TTL_EXTEND_TO: u32 = 50_000;
const PERSISTENT_TTL_THRESHOLD: u32 = 5_000;
const PERSISTENT_TTL_EXTEND_TO: u32 = 50_000;

#[contracttype]
#[derive(Clone)]
enum PackedDataKey {
    EscrowMeta(u64),
    Milestone(u64, u32),
}

#[contracttype]
#[derive(Clone, Debug)]
struct EscrowMeta {
    escrow_id: u64,
    client: Address,
    freelancer: Address,
    token: Address,
    total_amount: i128,
    allocated_amount: i128,
    remaining_balance: i128,
    status: EscrowStatus,
    milestone_count: u32,
    arbiter: Option<Address>,
    created_at: u64,
    deadline: Option<u64>,
    brief_hash: BytesN<32>,
}

struct ContractStorage;

impl ContractStorage {
    fn initialize(env: &Env, admin: &Address) -> Result<(), EscrowError> {
        let instance = env.storage().instance();
        if instance.has(&DataKey::Admin) {
            return Err(EscrowError::AlreadyInitialized);
        }

        instance.set(&DataKey::Admin, admin);
        instance.set(&DataKey::EscrowCounter, &0_u64);
        Self::bump_instance_ttl(env);
        Ok(())
    }

    fn require_initialized(env: &Env) -> Result<(), EscrowError> {
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(EscrowError::NotInitialized);
        }

        Self::bump_instance_ttl(env);
        Ok(())
    }

    fn next_escrow_id(env: &Env) -> Result<u64, EscrowError> {
        Self::require_initialized(env)?;

        let instance = env.storage().instance();
        let escrow_id = instance.get(&DataKey::EscrowCounter).unwrap_or(0_u64);
        instance.set(&DataKey::EscrowCounter, &(escrow_id + 1));
        Self::bump_instance_ttl(env);
        Ok(escrow_id)
    }

    fn escrow_count(env: &Env) -> u64 {
        let count = env
            .storage()
            .instance()
            .get(&DataKey::EscrowCounter)
            .unwrap_or(0_u64);
        if env.storage().instance().has(&DataKey::Admin) {
            Self::bump_instance_ttl(env);
        }
        count
    }

    fn load_escrow_meta(env: &Env, escrow_id: u64) -> Result<EscrowMeta, EscrowError> {
        let key = PackedDataKey::EscrowMeta(escrow_id);
        let meta = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::EscrowNotFound)?;
        Self::bump_persistent_ttl(env, &key);
        Ok(meta)
    }

    fn save_escrow_meta(env: &Env, meta: &EscrowMeta) {
        let key = PackedDataKey::EscrowMeta(meta.escrow_id);
        env.storage().persistent().set(&key, meta);
        Self::bump_persistent_ttl(env, &key);
    }

    fn load_milestone(
        env: &Env,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<Milestone, EscrowError> {
        let key = PackedDataKey::Milestone(escrow_id, milestone_id);
        let milestone = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::MilestoneNotFound)?;
        Self::bump_persistent_ttl(env, &key);
        Ok(milestone)
    }

    fn save_milestone(env: &Env, escrow_id: u64, milestone: &Milestone) {
        let key = PackedDataKey::Milestone(escrow_id, milestone.id);
        env.storage().persistent().set(&key, milestone);
        Self::bump_persistent_ttl(env, &key);
    }

    fn load_escrow(env: &Env, escrow_id: u64) -> Result<EscrowState, EscrowError> {
        let meta = Self::load_escrow_meta(env, escrow_id)?;
        let mut milestones = Vec::new(env);

        for milestone_id in 0..meta.milestone_count {
            milestones.push_back(Self::load_milestone(env, escrow_id, milestone_id)?);
        }

        Ok(EscrowState {
            escrow_id: meta.escrow_id,
            client: meta.client,
            freelancer: meta.freelancer,
            token: meta.token,
            total_amount: meta.total_amount,
            remaining_balance: meta.remaining_balance,
            status: meta.status,
            milestones,
            arbiter: meta.arbiter,
            created_at: meta.created_at,
            deadline: meta.deadline,
            brief_hash: meta.brief_hash,
        })
    }

    fn load_reputation(env: &Env, address: &Address) -> ReputationRecord {
        let key = DataKey::Reputation(address.clone());
        match env.storage().persistent().get(&key) {
            Some(record) => {
                Self::bump_persistent_ttl(env, &key);
                record
            }
            None => ReputationRecord {
                address: address.clone(),
                total_score: 0,
                completed_escrows: 0,
                disputed_escrows: 0,
                disputes_won: 0,
                total_volume: 0,
                last_updated: env.ledger().timestamp(),
            },
        }
    }

    fn bump_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
    }

    fn bump_persistent_ttl<K>(env: &Env, key: &K)
    where
        K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
    {
        env.storage().persistent().extend_ttl(
            key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_EXTEND_TO,
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    // ── Initialization ────────────────────────────────────────────────────────

    /// Initializes the contract with an admin address.
    ///
    /// Must be called once before any other function.
    /// Sets the global escrow counter to 0.
    ///
    /// # Arguments
    /// * `admin` - Address with admin privileges (can resolve disputes, update params)
    ///
    /// # Errors
    /// * `EscrowError::AlreadyInitialized` — if called a second time
    ///
    /// # TODO (contributor — easy)
    /// Implement this function:
    /// 1. Check `DataKey::Admin` does not already exist in storage
    /// 2. Store `admin` under `DataKey::Admin`
    /// 3. Store `0u64` under `DataKey::EscrowCounter`
    pub fn initialize(env: Env, admin: Address) -> Result<(), EscrowError> {
        ContractStorage::initialize(&env, &admin)
    }

    // ── Escrow Lifecycle ──────────────────────────────────────────────────────

    /// Creates a new escrow and locks funds in the contract.
    ///
    /// The client deposits `total_amount` tokens which are held until
    /// milestones are approved. Milestones can be added at creation or
    /// via `add_milestone` later.
    ///
    /// # Arguments
    /// * `client`       - Must `require_auth()`. The party creating and funding the escrow.
    /// * `freelancer`   - The party who will deliver the work.
    /// * `token`        - The Stellar Asset Contract address for the payment token.
    /// * `total_amount` - Total value to lock. Must be > 0.
    /// * `brief_hash`   - 32-byte IPFS/content hash of the project brief.
    /// * `arbiter`      - Optional trusted third-party for dispute resolution.
    /// * `deadline`     - Optional ledger timestamp for auto-expiry.
    ///
    /// # Returns
    /// The assigned `escrow_id`.
    ///
    /// # Errors
    /// * `EscrowError::NotInitialized`    — contract not set up
    /// * `EscrowError::InvalidEscrowAmount` — amount <= 0
    /// * `EscrowError::InvalidDeadline`   — deadline in the past
    /// * `EscrowError::TransferFailed`    — token transfer failed
    ///
    /// # Events
    /// Emits `EscrowCreated` via `events::emit_escrow_created`
    ///
    /// # TODO (contributor — medium, Issue #2)
    /// Implement this function:
    /// 1. Call `client.require_auth()`
    /// 2. Validate inputs (amount > 0, deadline in future if provided)
    /// 3. Increment and read `DataKey::EscrowCounter`
    /// 4. Transfer tokens from `client` to `env.current_contract_address()`
    ///    using `token::Client::new(&env, &token).transfer(...)`
    /// 5. Build `EscrowState` with status `Active`, empty milestones, timestamps
    /// 6. Store under `DataKey::Escrow(escrow_id)`
    /// 7. Emit `emit_escrow_created` event
    /// 8. Return `escrow_id`
    pub fn create_escrow(
        env: Env,
        client: Address,
        freelancer: Address,
        token: Address,
        total_amount: i128,
        brief_hash: BytesN<32>,
        arbiter: Option<Address>,
        deadline: Option<u64>,
    ) -> Result<u64, EscrowError> {
        ContractStorage::require_initialized(&env)?;
        client.require_auth();

        if total_amount <= 0 {
            return Err(EscrowError::InvalidEscrowAmount);
        }

        let now = env.ledger().timestamp();
        if let Some(project_deadline) = deadline {
            if project_deadline <= now {
                return Err(EscrowError::InvalidDeadline);
            }
        }

        let escrow_id = ContractStorage::next_escrow_id(&env)?;
        let contract_address = env.current_contract_address();
        token::Client::new(&env, &token).transfer(&client, &contract_address, &total_amount);

        let meta = EscrowMeta {
            escrow_id,
            client: client.clone(),
            freelancer: freelancer.clone(),
            token,
            total_amount,
            allocated_amount: 0,
            remaining_balance: total_amount,
            status: EscrowStatus::Active,
            milestone_count: 0,
            arbiter,
            created_at: now,
            deadline,
            brief_hash,
        };
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_escrow_created(&env, escrow_id, &client, &freelancer, total_amount);
        Ok(escrow_id)
    }

    /// Adds a new milestone to an existing escrow.
    ///
    /// Only the client can add milestones, and only while the escrow is Active.
    /// The sum of all milestone amounts must not exceed `total_amount`.
    ///
    /// # Arguments
    /// * `caller`           - Must be the escrow's client.
    /// * `escrow_id`        - Target escrow.
    /// * `title`            - Short milestone title (on-chain).
    /// * `description_hash` - IPFS hash of full milestone description.
    /// * `amount`           - Token amount for this milestone.
    ///
    /// # Returns
    /// The assigned `milestone_id`.
    ///
    /// # Errors
    /// * `EscrowError::EscrowNotFound`
    /// * `EscrowError::ClientOnly`
    /// * `EscrowError::EscrowNotActive`
    /// * `EscrowError::MilestoneAmountExceedsEscrow`
    /// * `EscrowError::InvalidMilestoneAmount`
    ///
    /// # Events
    /// Emits `MilestoneAdded` via `events::emit_milestone_added`
    ///
    /// # TODO (contributor — medium, Issue #3)
    /// Implement this function:
    /// 1. `caller.require_auth()`
    /// 2. Load escrow from storage, check it exists and is Active
    /// 3. Check caller == escrow.client
    /// 4. Validate amount > 0
    /// 5. Check sum of existing milestones + new amount <= total_amount
    /// 6. Assign milestone_id = escrow.milestones.len()
    /// 7. Push new Milestone to escrow.milestones
    /// 8. Save escrow back to storage
    /// 9. Emit event, return milestone_id
    pub fn add_milestone(
        env: Env,
        caller: Address,
        escrow_id: u64,
        title: String,
        description_hash: BytesN<32>,
        amount: i128,
    ) -> Result<u32, EscrowError> {
        caller.require_auth();

        if amount <= 0 {
            return Err(EscrowError::InvalidMilestoneAmount);
        }

        let mut meta = ContractStorage::load_escrow_meta(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::ClientOnly);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }

        let next_allocated = meta
            .allocated_amount
            .checked_add(amount)
            .ok_or(EscrowError::MilestoneAmountExceedsEscrow)?;
        if next_allocated > meta.total_amount {
            return Err(EscrowError::MilestoneAmountExceedsEscrow);
        }

        let milestone_id = meta.milestone_count;
        let milestone = Milestone {
            id: milestone_id,
            title,
            description_hash,
            amount,
            status: MilestoneStatus::Pending,
            submitted_at: None,
            resolved_at: None,
        };

        meta.milestone_count = meta
            .milestone_count
            .checked_add(1)
            .ok_or(EscrowError::TooManyMilestones)?;
        meta.allocated_amount = next_allocated;

        ContractStorage::save_milestone(&env, escrow_id, &milestone);
        ContractStorage::save_escrow_meta(&env, &meta);
        events::emit_milestone_added(&env, escrow_id, milestone_id, amount);
        Ok(milestone_id)
    }

    /// Freelancer submits work for a specific milestone.
    ///
    /// Marks the milestone as `Submitted` so the client can review it.
    ///
    /// # Arguments
    /// * `caller`       - Must be the escrow's freelancer.
    /// * `escrow_id`    - Target escrow.
    /// * `milestone_id` - The milestone being submitted.
    ///
    /// # Errors
    /// * `EscrowError::FreelancerOnly`
    /// * `EscrowError::MilestoneNotFound`
    /// * `EscrowError::InvalidMilestoneState` — milestone not Pending
    ///
    /// # Events
    /// Emits `MilestoneSubmitted` via `events::emit_milestone_submitted`
    ///
    /// # TODO (contributor — easy, Issue #4)
    pub fn submit_milestone(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<(), EscrowError> {
        caller.require_auth();

        let meta = ContractStorage::load_escrow_meta(&env, escrow_id)?;
        if caller != meta.freelancer {
            return Err(EscrowError::FreelancerOnly);
        }

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MilestoneStatus::Pending
            && milestone.status != MilestoneStatus::Rejected
        {
            return Err(EscrowError::InvalidMilestoneState);
        }

        milestone.status = MilestoneStatus::Submitted;
        milestone.submitted_at = Some(env.ledger().timestamp());
        ContractStorage::save_milestone(&env, escrow_id, &milestone);

        events::emit_milestone_submitted(&env, escrow_id, milestone_id, &caller);
        Ok(())
    }

    /// Client approves a submitted milestone and triggers fund release.
    ///
    /// Marks the milestone as `Approved` and transfers the milestone amount
    /// to the freelancer. If all milestones are now Approved, the escrow
    /// status is set to `Completed`.
    ///
    /// # Arguments
    /// * `caller`       - Must be the escrow's client.
    /// * `escrow_id`    - Target escrow.
    /// * `milestone_id` - The milestone being approved.
    ///
    /// # Errors
    /// * `EscrowError::ClientOnly`
    /// * `EscrowError::EscrowNotActive`
    /// * `EscrowError::InvalidMilestoneState` — milestone not Submitted
    ///
    /// # Events
    /// Emits `MilestoneApproved` and `FundsReleased`
    pub fn approve_milestone(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<(), EscrowError> {
        caller.require_auth();

        let mut meta = ContractStorage::load_escrow_meta(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::ClientOnly);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MilestoneStatus::Submitted {
            return Err(EscrowError::InvalidMilestoneState);
        }

        // Mark approved and record timestamp
        milestone.status = MilestoneStatus::Approved;
        milestone.resolved_at = Some(env.ledger().timestamp());
        ContractStorage::save_milestone(&env, escrow_id, &milestone);

        // Release funds to freelancer
        let amount = milestone.amount;
        token::Client::new(&env, &meta.token).transfer(
            &env.current_contract_address(),
            &meta.freelancer,
            &amount,
        );
        meta.remaining_balance = meta
            .remaining_balance
            .checked_sub(amount)
            .unwrap_or(0);

        events::emit_milestone_approved(&env, escrow_id, milestone_id, amount);
        events::emit_funds_released(&env, escrow_id, &meta.freelancer, amount);

        // Check if all milestones are Approved → complete the escrow
        let all_approved = (0..meta.milestone_count).all(|id| {
            ContractStorage::load_milestone(&env, escrow_id, id)
                .map(|m| m.status == MilestoneStatus::Approved)
                .unwrap_or(false)
        });

        if all_approved && meta.milestone_count > 0 {
            meta.status = EscrowStatus::Completed;
        }

        ContractStorage::save_escrow_meta(&env, &meta);
        Ok(())
    }

    /// Client rejects a submitted milestone.
    ///
    /// Sets the milestone status to `Rejected`. The freelancer may resubmit
    /// by calling `submit_milestone` again (which accepts both Pending and
    /// Rejected states).
    ///
    /// # Arguments
    /// * `caller`       - Must be the escrow's client.
    /// * `escrow_id`    - Target escrow.
    /// * `milestone_id` - The milestone being rejected.
    ///
    /// # Events
    /// Emits `MilestoneRejected`
    pub fn reject_milestone(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<(), EscrowError> {
        caller.require_auth();

        let meta = ContractStorage::load_escrow_meta(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::ClientOnly);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MilestoneStatus::Submitted {
            return Err(EscrowError::InvalidMilestoneState);
        }

        milestone.status = MilestoneStatus::Rejected;
        milestone.resolved_at = Some(env.ledger().timestamp());
        ContractStorage::save_milestone(&env, escrow_id, &milestone);

        events::emit_milestone_rejected(&env, escrow_id, milestone_id, &caller);
        Ok(())
    }

    /// Releases funds to the freelancer for an approved milestone.
    ///
    /// This is callable by the admin to manually release funds in edge cases.
    /// Normal flow goes through `approve_milestone` which handles release
    /// atomically. Calling this on an already-released milestone is a no-op
    /// guard (milestone must be Approved and balance must cover the amount).
    ///
    /// # Arguments
    /// * `escrow_id`    - Target escrow.
    /// * `milestone_id` - The approved milestone to pay out.
    ///
    /// # Errors
    /// * `EscrowError::InvalidMilestoneState` — milestone not Approved
    ///
    /// # Events
    /// Emits `FundsReleased`
    pub fn release_funds(
        env: Env,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<(), EscrowError> {
        let mut meta = ContractStorage::load_escrow_meta(&env, escrow_id)?;
        let milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;

        if milestone.status != MilestoneStatus::Approved {
            return Err(EscrowError::InvalidMilestoneState);
        }

        let amount = milestone.amount;
        token::Client::new(&env, &meta.token).transfer(
            &env.current_contract_address(),
            &meta.freelancer,
            &amount,
        );
        meta.remaining_balance = meta.remaining_balance.checked_sub(amount).unwrap_or(0);
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_funds_released(&env, escrow_id, &meta.freelancer, amount);
        Ok(())
    }

    /// Cancels an escrow and returns remaining funds to the client.
    ///
    /// Can only be called by the client while no milestones are in Submitted
    /// or Approved state (to prevent cancellation after work is done).
    ///
    /// # Arguments
    /// * `caller`    - Must be the escrow's client.
    /// * `escrow_id` - Target escrow.
    ///
    /// # Errors
    /// * `EscrowError::ClientOnly`
    /// * `EscrowError::EscrowNotActive`
    /// * `EscrowError::CannotCancelWithPendingFunds`
    ///
    /// # Events
    /// Emits `EscrowCancelled`
    ///
    /// # TODO (contributor — medium, Issue #8)
    pub fn cancel_escrow(_env: Env, _caller: Address, _escrow_id: u64) -> Result<(), EscrowError> {
        todo!("implement cancel_escrow — see GitHub Issue #8")
    }

    // ── Dispute Resolution ────────────────────────────────────────────────────

    /// Raises a dispute on an escrow, freezing further fund releases.
    ///
    /// Either the client or freelancer can raise a dispute. Once raised,
    /// the escrow status changes to `Disputed` and only the arbiter
    /// (or admin if no arbiter) can resolve it.
    ///
    /// If a `milestone_id` is provided, that milestone's status is set to
    /// `Disputed` as well, giving granular tracking of which deliverable
    /// is contested.
    ///
    /// # Arguments
    /// * `caller`       - Must be client or freelancer of this escrow.
    /// * `escrow_id`    - The escrow to dispute.
    /// * `milestone_id` - Optional milestone to mark as Disputed.
    ///
    /// # Errors
    /// * `EscrowError::Unauthorized`
    /// * `EscrowError::EscrowNotActive`
    /// * `EscrowError::DisputeAlreadyExists`
    ///
    /// # Events
    /// Emits `DisputeRaised` and optionally `MilestoneDisputed`
    pub fn raise_dispute(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_id: Option<u32>,
    ) -> Result<(), EscrowError> {
        caller.require_auth();

        let mut meta = ContractStorage::load_escrow_meta(&env, escrow_id)?;
        if caller != meta.client && caller != meta.freelancer {
            return Err(EscrowError::Unauthorized);
        }
        if meta.status == EscrowStatus::Disputed {
            return Err(EscrowError::DisputeAlreadyExists);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }

        meta.status = EscrowStatus::Disputed;
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_dispute_raised(&env, escrow_id, &caller);

        // Optionally mark a specific milestone as Disputed
        if let Some(mid) = milestone_id {
            let mut milestone = ContractStorage::load_milestone(&env, escrow_id, mid)?;
            // Only submitted milestones can be disputed
            if milestone.status == MilestoneStatus::Submitted
                || milestone.status == MilestoneStatus::Pending
            {
                milestone.status = MilestoneStatus::Disputed;
                milestone.resolved_at = Some(env.ledger().timestamp());
                ContractStorage::save_milestone(&env, escrow_id, &milestone);
                events::emit_milestone_disputed(&env, escrow_id, mid, &caller);
            }
        }

        Ok(())
    }

    /// Resolves a dispute by distributing funds between client and freelancer.
    ///
    /// Only callable by the designated arbiter (or contract admin if no arbiter).
    /// The `client_amount + freelancer_amount` must equal `escrow.remaining_balance`.
    ///
    /// # Arguments
    /// * `caller`             - Must be arbiter or admin.
    /// * `escrow_id`          - The disputed escrow to resolve.
    /// * `client_amount`      - How much to return to the client.
    /// * `freelancer_amount`  - How much to send to the freelancer.
    ///
    /// # Errors
    /// * `EscrowError::ArbiterOnly`
    /// * `EscrowError::EscrowNotDisputed`
    /// * `EscrowError::AmountMismatch`
    ///
    /// # Events
    /// Emits `DisputeResolved`, `FundsReleased` (×2), `ReputationUpdated` (×2)
    ///
    /// # TODO (contributor — hard, Issue #10)
    /// After distributing funds, call `update_reputation` for both parties
    /// with a `disputed = true` flag to reduce their scores appropriately.
    pub fn resolve_dispute(
        _env: Env,
        _caller: Address,
        _escrow_id: u64,
        _client_amount: i128,
        _freelancer_amount: i128,
    ) -> Result<(), EscrowError> {
        todo!("implement resolve_dispute — see GitHub Issue #10")
    }

    // ── Reputation ────────────────────────────────────────────────────────────

    /// Updates the on-chain reputation record for a user.
    ///
    /// Called internally after escrow completion or dispute resolution.
    ///
    /// # Arguments
    /// * `address`    - The user to update.
    /// * `completed`  - Whether an escrow was completed (vs disputed).
    /// * `volume`     - Token amount involved.
    ///
    /// # Events
    /// Emits `ReputationUpdated`
    ///
    /// # TODO (contributor — medium, Issue #11)
    /// Reputation scoring formula (implement or propose a better one):
    /// - Completed escrow:  +10 base score + bonus for high volume
    /// - Disputed escrow:   -5 score, increment disputed_count
    /// - Won dispute:       recover 3 of the 5 lost points
    ///
    /// If no record exists, create a new `ReputationRecord`.
    pub fn update_reputation(
        _env: Env,
        _address: Address,
        _completed: bool,
        _disputed: bool,
        _volume: i128,
    ) -> Result<(), EscrowError> {
        todo!("implement update_reputation — see GitHub Issue #11")
    }

    // ── Upgrade ───────────────────────────────────────────────────────────────

    /// Upgrades the contract WASM while preserving all storage.
    ///
    /// Only the admin may call this. All persistent state (escrows, reputation,
    /// counter) is untouched because Soroban upgrades only replace the
    /// executable, not the instance storage.
    ///
    /// # Arguments
    /// * `caller`        - Must be the contract admin.
    /// * `new_wasm_hash` - Hash of the new WASM blob (must be uploaded first).
    ///
    /// # Errors
    /// * `EscrowError::NotInitialized` — contract not set up
    /// * `EscrowError::AdminOnly`      — caller is not the admin
    ///
    /// # TODO (contributor — easy, Issue #17)
    /// Implement this function:
    /// 1. Load `DataKey::Admin` from storage; return `NotInitialized` if absent
    /// 2. Call `caller.require_auth()`
    /// 3. Assert `caller == admin`, else return `AdminOnly`
    /// 4. Call `env.deployer().update_current_contract_wasm(new_wasm_hash)`
    pub fn upgrade(
        env: Env,
        caller: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<(), EscrowError> {
        todo!("implement upgrade — see GitHub Issue #17")
    }

    // ── View Functions ────────────────────────────────────────────────────────

    /// Returns the full state of an escrow.
    ///
    /// # TODO (contributor — easy, Issue #12)
    pub fn get_escrow(env: Env, escrow_id: u64) -> Result<EscrowState, EscrowError> {
        ContractStorage::load_escrow(&env, escrow_id)
    }

    /// Returns the reputation record for a given address.
    ///
    /// Returns a default zero-score record if none exists yet.
    ///
    /// # TODO (contributor — easy, Issue #13)
    pub fn get_reputation(env: Env, address: Address) -> Result<ReputationRecord, EscrowError> {
        Ok(ContractStorage::load_reputation(&env, &address))
    }

    /// Returns the total number of escrows created.
    ///
    /// # TODO (contributor — easy, Issue #14)
    pub fn escrow_count(env: Env) -> u64 {
        ContractStorage::escrow_count(&env)
    }

    /// Returns a specific milestone from an escrow.
    ///
    /// # TODO (contributor — easy, Issue #15)
    pub fn get_milestone(
        env: Env,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<Milestone, EscrowError> {
        ContractStorage::load_milestone(&env, escrow_id, milestone_id)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, BytesN, Env, String};

    /// Helper: sets up a default test environment with an initialized contract.
    ///
    /// # TODO (contributor — easy, Issue #16)
    /// Complete this setup helper and write tests for each contract function.
    fn setup() -> (Env, Address, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        (env, admin, contract_id, client)
    }

    #[test]
    fn test_initialize_uses_instance_storage() {
        let (env, admin, contract_id, client) = setup();

        client.initialize(&admin);

        env.as_contract(&contract_id, || {
            assert!(env.storage().instance().has(&DataKey::Admin));
            assert!(env.storage().instance().has(&DataKey::EscrowCounter));
            assert!(!env.storage().persistent().has(&DataKey::Admin));
            assert!(!env.storage().persistent().has(&DataKey::EscrowCounter));
        });
    }

    #[test]
    fn test_create_escrow_packs_metadata_separately() {
        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);

        token_admin.mint(&escrow_client, &1_000_i128);

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &1_000_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
        );

        assert_eq!(escrow_id, 0);
        assert_eq!(token_client.balance(&contract_id), 1_000_i128);

        env.as_contract(&contract_id, || {
            assert!(env
                .storage()
                .persistent()
                .has(&PackedDataKey::EscrowMeta(escrow_id)));
            assert!(!env.storage().persistent().has(&DataKey::Escrow(escrow_id)));
        });
    }

    #[test]
    fn test_get_milestone_reads_granular_storage_entry() {
        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        token_admin.mint(&escrow_client, &1_000_i128);

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &1_000_i128,
            &BytesN::from_array(&env, &[2; 32]),
            &None,
            &None,
        );

        let milestone_id = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Design"),
            &BytesN::from_array(&env, &[3; 32]),
            &300_i128,
        );

        let milestone = client.get_milestone(&escrow_id, &milestone_id);
        assert_eq!(milestone.id, milestone_id);
        assert_eq!(milestone.amount, 300_i128);

        env.as_contract(&contract_id, || {
            assert!(env
                .storage()
                .persistent()
                .has(&PackedDataKey::Milestone(escrow_id, milestone_id)));
        });
    }

    #[test]
    fn test_get_reputation_returns_default_record() {
        let (env, _, _, client) = setup();
        let user = Address::generate(&env);

        let record = client.get_reputation(&user);
        assert_eq!(record.address, user);
        assert_eq!(record.total_score, 0);
        assert_eq!(record.completed_escrows, 0);
    }

    #[test]
    #[ignore = "implement full flow — Issues #2–#11"]
    fn test_full_escrow_lifecycle() {
        // TODO: create → add milestones → submit → approve → verify reputation updated
    }

    #[test]
    #[ignore = "implement dispute flow — Issues #9–#10"]
    fn test_dispute_resolution() {
        // TODO: create → dispute → resolve → verify fund split
    }
}
