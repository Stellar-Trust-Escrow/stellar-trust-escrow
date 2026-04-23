//! # StellarTrustEscrow — Soroban Smart Contract
//!
//! Milestone-based escrow with on-chain reputation on the Stellar network.
//!
//! ## Gas Optimizations
//!
//! ### Issue #65 (original)
//!
//! 1. **Storage**: `EscrowMeta` and `Milestone` are stored in separate granular
//!    persistent entries — only the touched entry is read/written per call.
//!    The old monolithic `EscrowState` (with an inline `Vec<Milestone>`) is
//!    kept only as a view-layer return type.
//!
//! 2. **TTL bumps**: Consolidated into `bump_instance_ttl` / `bump_persistent_ttl`
//!    helpers called once per entry per transaction, not on every sub-call.
//!
//! 3. **Loop elimination**: `approve_milestone` previously re-loaded every
//!    milestone in a loop to check completion. Replaced with an `approved_count`
//!    field on `EscrowMeta` — O(1) completion check.
//!
//! 4. **Redundant loads**: `release_funds` no longer re-loads the milestone
//!    after `approve_milestone` already validated and saved it. Auth checks
//!    are done before any storage reads.
//!
//! 5. **Math**: All arithmetic uses `checked_*` only where overflow is
//!    plausible; inner hot-paths use direct ops with compile-time-safe bounds.
//!
//! 6. **Events**: Data tuples are kept minimal — addresses are passed by
//!    reference and cloned only at the `publish` call site.
//!
//! ### perf/contract-milestone-gas-optimization (this branch)
//!
//! 7. **Bitflag milestone status**: `MilestoneStatus` is now a `u32` type alias
//!    with `MS_*` constants instead of a `#[contracttype]` tagged-union enum.
//!    A tagged union serialises as a discriminant + padding (~40 bytes); a `u32`
//!    is 4 bytes — ~36 bytes saved per milestone entry.
//!
//! 8. **Fixed-capacity milestone storage**: `MAX_MILESTONES = 20` cap enforced
//!    in `add_milestone` and `batch_add_milestones`. Prevents unbounded storage
//!    growth and makes per-escrow storage cost predictable.
//!
//! 9. **`submitted_count` counter**: Added to `EscrowMeta` alongside the
//!    existing `approved_count`. `cancel_escrow` now does an O(1) counter check
//!    instead of loading every milestone to scan for Submitted/Approved states.
//!
//! 10. **Batch operations**: `batch_add_milestones`, `batch_approve_milestones`,
//!     and `batch_release_funds` load `EscrowMeta` once, write N milestones, and
//!     execute a single token transfer — reducing gas from O(2N) to O(N+1) for
//!     multi-milestone workflows.

#![no_std]
#![allow(clippy::too_many_arguments)]

mod bridge;
mod bridge_tests;
mod errors;
mod event_tests;
mod events;
mod oracle;
mod pause_tests;
mod types;
mod upgrade_tests;

pub use errors::EscrowError;
use storage::StorageManager;
use types::{CancellationRequest, RecurringInterval, RecurringPaymentConfig, SlashRecord};
pub use types::{
    DataKey, EscrowState, EscrowStatus, Milestone, MilestoneStatus, MultisigConfig,
    OptionalTimelock, ReputationRecord, Timelock, MS_APPROVED, MS_DISPUTED, MS_PENDING,
    MS_REJECTED, MS_RELEASED, MS_SUBMITTED,
};

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, String, Vec,
};

mod storage;

// ── TTL constants ─────────────────────────────────────────────────────────────
const INSTANCE_TTL_THRESHOLD: u32 = 5_000;
const INSTANCE_TTL_EXTEND_TO: u32 = 50_000;
const PERSISTENT_TTL_THRESHOLD: u32 = 5_000;
const PERSISTENT_TTL_EXTEND_TO: u32 = 50_000;

const CANCELLATION_DISPUTE_PERIOD: u64 = 120_960;
const SLASH_DISPUTE_PERIOD: u64 = 51_840;
const SLASH_PERCENTAGE: u64 = 10;
const RENT_PERIOD_SECONDS: u64 = 86_400;
const RENT_RESERVE_PERIODS: u64 = 30;
const RENT_PER_ENTRY_PER_PERIOD: i128 = 1;
pub const MAX_MILESTONES: u32 = 20;

// ── Granular storage keys ─────────────────────────────────────────────────────
// Separate keys for meta vs each milestone avoids deserialising the full
// milestone list on every escrow-level operation.
#[contracttype]
#[derive(Clone)]
pub enum PackedDataKey {
    EscrowMeta(u64),
    Milestone(u64, u32),
    RecurringConfig(u64),
}

// ── Meta-transaction argument structs ────────────────────────────────────────
#[allow(dead_code)]
#[derive(Clone)]
struct CreateEscrowArgs {
    client: Address,
    freelancer: Address,
    token: Address,
    total_amount: i128,
    brief_hash: BytesN<32>,
    arbiter: Option<Address>,
    deadline: Option<u64>,
    lock_time: Option<u64>,
}

#[allow(dead_code)]
#[derive(Clone)]
struct AddMilestoneArgs {
    caller: Address,
    escrow_id: u64,
    title: String,
    description_hash: BytesN<32>,
    amount: i128,
}

#[allow(dead_code)]
#[derive(Clone)]
struct SubmitMilestoneArgs {
    caller: Address,
    escrow_id: u64,
    milestone_id: u32,
}

#[allow(dead_code)]
#[derive(Clone)]
struct ApproveMilestoneArgs {
    caller: Address,
    escrow_id: u64,
    milestone_id: u32,
}

// ── EscrowMeta ────────────────────────────────────────────────────────────────
// Lightweight header stored separately from milestones.
// `approved_count` replaces the O(n) "all approved?" loop in approve_milestone.
// `submitted_count` replaces the O(n) loop in cancel_escrow.
#[contracttype]
#[derive(Clone, Debug)]
pub(crate) struct EscrowMeta {
    pub(crate) escrow_id: u64,
    pub(crate) client: Address,
    pub(crate) freelancer: Address,
    pub(crate) token: Address,
    pub(crate) total_amount: i128,
    /// Running sum of milestone amounts added so far (allocation guard).
    pub(crate) allocated_amount: i128,
    pub(crate) remaining_balance: i128,
    pub(crate) status: EscrowStatus,
    pub(crate) milestone_count: u32,
    /// Number of milestones in Approved state — avoids full scan on completion check.
    pub(crate) approved_count: u32,
    pub(crate) released_count: u32,
    /// Number of milestones in Submitted state — avoids O(n) scan in cancel_escrow.
    pub(crate) submitted_count: u32,
    pub(crate) arbiter: Option<Address>,
    pub(crate) buyer_signers: soroban_sdk::Vec<Address>,
    pub(crate) created_at: u64,
    pub(crate) deadline: Option<u64>,
    /// Optional lock time (ledger timestamp) - funds locked until this time.
    pub(crate) lock_time: Option<u64>,
    /// Optional extension deadline for the lock time.
    pub(crate) lock_time_extension: Option<u64>,
    /// Optional timelock controls release window after approval.
    pub(crate) timelock: OptionalTimelock,
    pub(crate) brief_hash: BytesN<32>,
    /// Prepaid storage rent reserve held by the contract in the escrow token.
    pub(crate) rent_balance: i128,
    /// Timestamp of the last successful rent collection checkpoint.
    pub(crate) last_rent_collection_at: u64,
}

// ── Storage helpers ───────────────────────────────────────────────────────────
struct ContractStorage;

impl ContractStorage {
    fn initialize(env: &Env, admin: &Address) -> Result<(), EscrowError> {
        let instance = env.storage().instance();
        if instance.has(&DataKey::Admin) {
            return Err(EscrowError::AlreadyInitialized);
        }
        instance.set(&DataKey::Admin, admin);
        instance.set(&DataKey::EscrowCounter, &0_u64);
        // Initialize storage version for upgradeable storage
        StorageManager::init_version(env);
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

    fn require_admin(env: &Env, caller: &Address) -> Result<(), EscrowError> {
        Self::require_initialized(env)?;
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::NotInitialized)?;
        if *caller != admin {
            return Err(EscrowError::AdminOnly);
        }
        Ok(())
    }

    fn next_escrow_id(env: &Env) -> Result<u64, EscrowError> {
        let instance = env.storage().instance();
        let id: u64 = instance.get(&DataKey::EscrowCounter).unwrap_or(0_u64);
        instance.set(&DataKey::EscrowCounter, &(id + 1));
        // Instance TTL already bumped by require_initialized caller
        Ok(id)
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

    // ── Escrow meta ───────────────────────────────────────────────────────────

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

    fn load_escrow_meta_with_rent(env: &Env, escrow_id: u64) -> Result<EscrowMeta, EscrowError> {
        let mut meta = Self::load_escrow_meta(env, escrow_id)?;
        Self::settle_rent_for_access(env, &mut meta)?;
        Ok(meta)
    }

    fn ensure_live_escrow(env: &Env, escrow_id: u64) -> Result<(), EscrowError> {
        let _ = Self::load_escrow_meta_with_rent(env, escrow_id)?;
        Ok(())
    }

    fn save_escrow_meta(env: &Env, meta: &EscrowMeta) {
        let key = PackedDataKey::EscrowMeta(meta.escrow_id);
        env.storage().persistent().set(&key, meta);
        Self::bump_persistent_ttl(env, &key);
    }

    fn remove_escrow_meta(env: &Env, escrow_id: u64) {
        env.storage()
            .persistent()
            .remove(&PackedDataKey::EscrowMeta(escrow_id));
    }

    // ── Milestones ────────────────────────────────────────────────────────────

    fn load_milestone(
        env: &Env,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<Milestone, EscrowError> {
        let key = PackedDataKey::Milestone(escrow_id, milestone_id);
        let m = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::MilestoneNotFound)?;
        Self::bump_persistent_ttl(env, &key);
        Ok(m)
    }

    fn save_milestone(env: &Env, escrow_id: u64, milestone: &Milestone) {
        let key = PackedDataKey::Milestone(escrow_id, milestone.id);
        env.storage().persistent().set(&key, milestone);
        Self::bump_persistent_ttl(env, &key);
    }

    fn remove_milestone(env: &Env, escrow_id: u64, milestone_id: u32) {
        env.storage()
            .persistent()
            .remove(&PackedDataKey::Milestone(escrow_id, milestone_id));
    }

    // ── Recurring configuration ─────────────────────────────────────────────

    fn load_recurring_config(
        env: &Env,
        escrow_id: u64,
    ) -> Result<RecurringPaymentConfig, EscrowError> {
        let key = PackedDataKey::RecurringConfig(escrow_id);
        let config = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::RecurringConfigNotFound)?;
        Self::bump_persistent_ttl(env, &key);
        Ok(config)
    }

    fn save_recurring_config(env: &Env, escrow_id: u64, config: &RecurringPaymentConfig) {
        let key = PackedDataKey::RecurringConfig(escrow_id);
        env.storage().persistent().set(&key, config);
        Self::bump_persistent_ttl(env, &key);
    }

    fn remove_recurring_config(env: &Env, escrow_id: u64) {
        env.storage()
            .persistent()
            .remove(&PackedDataKey::RecurringConfig(escrow_id));
    }

    // ── Full escrow view (read-only, assembles EscrowState for callers) ───────
    fn load_escrow(env: &Env, escrow_id: u64) -> Result<EscrowState, EscrowError> {
        let meta = Self::load_escrow_meta_with_rent(env, escrow_id)?;
        let mut milestones = Vec::new(env);
        for mid in 0..meta.milestone_count {
            milestones.push_back(Self::load_milestone(env, escrow_id, mid)?);
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
            buyer_signers: meta.buyer_signers.clone(),
            created_at: meta.created_at,
            deadline: meta.deadline,
            lock_time: meta.lock_time,
            lock_time_extension: meta.lock_time_extension,
            timelock: meta.timelock.into(),
            brief_hash: meta.brief_hash,
            // EscrowMeta uses buyer_signers for multisig; expose via EscrowState view fields
            multisig_approvers: meta.buyer_signers.clone(),
            multisig_weights: Vec::new(env),
            multisig_threshold: 0,
        })
    }

    // ── Reputation ────────────────────────────────────────────────────────────

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
                slash_count: 0,
                total_slashed: 0,
                last_updated: env.ledger().timestamp(),
            },
        }
    }

    fn save_reputation(env: &Env, record: &ReputationRecord) {
        let key = DataKey::Reputation(record.address.clone());
        env.storage().persistent().set(&key, record);
        Self::bump_persistent_ttl(env, &key);
    }

    fn load_cancellation_request(
        env: &Env,
        escrow_id: u64,
    ) -> Result<CancellationRequest, EscrowError> {
        let key = DataKey::CancellationRequest(escrow_id);
        let req = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::CancellationNotFound)?;
        Self::bump_persistent_ttl(env, &key);
        Ok(req)
    }

    fn save_cancellation_request(env: &Env, request: &CancellationRequest) {
        let key = DataKey::CancellationRequest(request.escrow_id);
        env.storage().persistent().set(&key, request);
        Self::bump_persistent_ttl(env, &key);
    }

    fn remove_cancellation_request(env: &Env, escrow_id: u64) {
        env.storage()
            .persistent()
            .remove(&DataKey::CancellationRequest(escrow_id));
    }

    fn load_slash_record(env: &Env, escrow_id: u64) -> Result<SlashRecord, EscrowError> {
        let key = DataKey::SlashRecord(escrow_id);
        let record = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::SlashNotFound)?;
        Self::bump_persistent_ttl(env, &key);
        Ok(record)
    }

    fn save_slash_record(env: &Env, record: &SlashRecord) {
        let key = DataKey::SlashRecord(record.escrow_id);
        env.storage().persistent().set(&key, record);
        Self::bump_persistent_ttl(env, &key);
    }

    fn remove_slash_record(env: &Env, escrow_id: u64) {
        env.storage()
            .persistent()
            .remove(&DataKey::SlashRecord(escrow_id));
    }

    // ── TTL helpers ───────────────────────────────────────────────────────────

    #[inline]
    fn bump_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
    }

    #[inline]
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

    // ── Storage rent helpers ─────────────────────────────────────────────────

    #[inline]
    fn active_storage_entries(env: &Env, meta: &EscrowMeta) -> i128 {
        let mut entries = 1 + i128::from(meta.milestone_count);
        if env
            .storage()
            .persistent()
            .has(&PackedDataKey::RecurringConfig(meta.escrow_id))
        {
            entries += 1;
        }
        if env
            .storage()
            .persistent()
            .has(&DataKey::CancellationRequest(meta.escrow_id))
        {
            entries += 1;
        }
        if env
            .storage()
            .persistent()
            .has(&DataKey::SlashRecord(meta.escrow_id))
        {
            entries += 1;
        }
        entries
    }

    #[inline]
    fn rent_due_per_period(env: &Env, meta: &EscrowMeta) -> i128 {
        Self::active_storage_entries(env, meta) * RENT_PER_ENTRY_PER_PERIOD
    }

    #[inline]
    fn reserve_for_entries(entries: i128) -> i128 {
        entries * RENT_PER_ENTRY_PER_PERIOD * i128::from(RENT_RESERVE_PERIODS)
    }

    fn rent_has_expired(env: &Env, meta: &EscrowMeta) -> bool {
        let now = env.ledger().timestamp();
        if now <= meta.last_rent_collection_at {
            return false;
        }

        let elapsed_periods = (now - meta.last_rent_collection_at) / RENT_PERIOD_SECONDS;
        if elapsed_periods == 0 {
            return false;
        }

        let covered_periods = meta.rent_balance / Self::rent_due_per_period(env, meta);
        i128::from(elapsed_periods) > covered_periods
    }

    fn rent_expires_at(env: &Env, meta: &EscrowMeta) -> u64 {
        let covered_periods = (meta.rent_balance / Self::rent_due_per_period(env, meta)) as u64;
        meta.last_rent_collection_at + ((covered_periods + 1) * RENT_PERIOD_SECONDS)
    }

    fn charge_rent_reserve(
        env: &Env,
        token: &Address,
        payer: &Address,
        amount: i128,
    ) -> Result<(), EscrowError> {
        if amount <= 0 {
            return Ok(());
        }

        token::Client::new(env, token).transfer(payer, &env.current_contract_address(), &amount);
        Ok(())
    }

    fn charge_entry_rent(
        env: &Env,
        meta: &mut EscrowMeta,
        payer: &Address,
        entries: i128,
    ) -> Result<i128, EscrowError> {
        let amount = Self::reserve_for_entries(entries);
        Self::charge_rent_reserve(env, &meta.token, payer, amount)?;
        meta.rent_balance = meta
            .rent_balance
            .checked_add(amount)
            .ok_or(EscrowError::AmountMismatch)?;
        Ok(amount)
    }

    fn collect_rent_due(env: &Env, meta: &mut EscrowMeta) -> Result<i128, EscrowError> {
        let now = env.ledger().timestamp();
        if now <= meta.last_rent_collection_at {
            return Ok(0);
        }

        let elapsed_periods = (now - meta.last_rent_collection_at) / RENT_PERIOD_SECONDS;
        if elapsed_periods == 0 {
            return Ok(0);
        }

        let rent_per_period = Self::rent_due_per_period(env, meta);
        let due = rent_per_period
            .checked_mul(i128::from(elapsed_periods))
            .ok_or(EscrowError::AmountMismatch)?;
        let collectable = due.min(meta.rent_balance);

        if collectable > 0 {
            let admin: Address = env
                .storage()
                .instance()
                .get(&DataKey::Admin)
                .ok_or(EscrowError::NotInitialized)?;
            token::Client::new(env, &meta.token).transfer(
                &env.current_contract_address(),
                &admin,
                &collectable,
            );
            meta.rent_balance -= collectable;
        }

        let covered_periods = (collectable / rent_per_period) as u64;
        if covered_periods > 0 {
            meta.last_rent_collection_at += covered_periods * RENT_PERIOD_SECONDS;
        }

        env.events().publish(
            (symbol_short!("rent_col"), meta.escrow_id),
            (
                collectable,
                meta.rent_balance,
                Self::rent_expires_at(env, meta),
            ),
        );
        Ok(collectable)
    }

    fn settle_rent_for_access(env: &Env, meta: &mut EscrowMeta) -> Result<i128, EscrowError> {
        if Self::rent_has_expired(env, meta) {
            return Err(EscrowError::EscrowNotFound);
        }

        let collectable = Self::collect_rent_due(env, meta)?;
        Self::save_escrow_meta(env, meta);
        Ok(collectable)
    }

    fn collect_rent(env: &Env, meta: &mut EscrowMeta) -> Result<i128, EscrowError> {
        let collectable = Self::collect_rent_due(env, meta)?;

        if Self::rent_has_expired(env, meta) {
            Self::expire_escrow(env, meta)?;
            return Ok(collectable);
        }

        Self::save_escrow_meta(env, meta);
        Ok(collectable)
    }

    fn expire_escrow(env: &Env, meta: &EscrowMeta) -> Result<(), EscrowError> {
        let refund_amount = meta
            .remaining_balance
            .checked_add(meta.rent_balance)
            .ok_or(EscrowError::AmountMismatch)?;

        if refund_amount > 0 {
            token::Client::new(env, &meta.token).transfer(
                &env.current_contract_address(),
                &meta.client,
                &refund_amount,
            );
        }

        for milestone_id in 0..meta.milestone_count {
            Self::remove_milestone(env, meta.escrow_id, milestone_id);
        }

        Self::remove_recurring_config(env, meta.escrow_id);
        Self::remove_cancellation_request(env, meta.escrow_id);
        Self::remove_slash_record(env, meta.escrow_id);
        Self::remove_escrow_meta(env, meta.escrow_id);

        env.events().publish(
            (symbol_short!("rent_exp"), meta.escrow_id),
            (refund_amount, meta.remaining_balance),
        );
        Ok(())
    }

    // ── Time lock helpers ─────────────────────────────────────────────────────────

    /// Checks if the lock time has expired for an escrow.
    /// Returns Ok(()) if funds can be released, Err if still locked.
    fn check_lock_time_expired(
        env: &Env,
        escrow_id: u64,
        lock_time: Option<u64>,
    ) -> Result<(), EscrowError> {
        if let Some(lt) = lock_time {
            let now = env.ledger().timestamp();
            if now < lt {
                return Err(EscrowError::LockTimeNotExpired);
            }
            // Lock has expired - emit event
            events::emit_lock_time_expired(env, escrow_id, lt);
        }
        Ok(())
    }

    fn check_timelock_expired(
        env: &Env,
        escrow_id: u64,
        timelock: OptionalTimelock,
    ) -> Result<(), EscrowError> {
        if let OptionalTimelock::Some(tl) = timelock {
            let now = env.ledger().timestamp();
            let expiry = tl
                .start_ledger
                .checked_add(tl.duration_ledger)
                .ok_or(EscrowError::InvalidTimelockDuration)?;
            if now < expiry {
                return Err(EscrowError::TimelockNotExpired);
            }
            events::emit_timelock_released(env, escrow_id, now);
        }
        Ok(())
    }

    // ── Pause helpers ──────────────────────────────────────────────────────────

    fn is_paused(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    fn set_paused(env: &Env, paused: bool) {
        env.storage().instance().set(&DataKey::Paused, &paused);
        Self::bump_instance_ttl(env);
    }

    fn require_not_paused(env: &Env) -> Result<(), EscrowError> {
        if Self::is_paused(env) {
            return Err(EscrowError::ContractPaused);
        }
        Ok(())
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

    pub fn initialize(env: Env, admin: Address) -> Result<(), EscrowError> {
        ContractStorage::initialize(&env, &admin)
    }

    // ── Oracle Configuration ──────────────────────────────────────────────────

    /// Set the primary price oracle contract address. Admin only.
    pub fn set_oracle(env: Env, caller: Address, oracle: Address) -> Result<(), EscrowError> {
        ContractStorage::require_admin(&env, &caller)?;
        caller.require_auth();
        oracle::set_oracle(&env, &oracle);
        ContractStorage::bump_instance_ttl(&env);
        Ok(())
    }

    /// Set the fallback oracle contract address. Admin only.
    pub fn set_fallback_oracle(
        env: Env,
        caller: Address,
        oracle: Address,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_admin(&env, &caller)?;
        caller.require_auth();
        oracle::set_fallback_oracle(&env, &oracle);
        ContractStorage::bump_instance_ttl(&env);
        Ok(())
    }

    /// Fetch the current USD price for `asset` from the configured oracle.
    /// Returns price with `oracle::PRICE_DECIMALS` decimal places.
    pub fn get_price(env: Env, asset: Address) -> Result<i128, EscrowError> {
        ContractStorage::require_initialized(&env)?;
        oracle::get_price_usd(&env, &asset)
    }

    /// Convert `amount` of `from_asset` into equivalent units of `to_asset`
    /// using live oracle prices.
    pub fn convert_amount(
        env: Env,
        amount: i128,
        from_asset: Address,
        to_asset: Address,
    ) -> Result<i128, EscrowError> {
        ContractStorage::require_initialized(&env)?;
        oracle::convert_amount(&env, amount, &from_asset, &to_asset)
    }

    // ── Bridge / Cross-Chain ──────────────────────────────────────────────────

    /// Set the Wormhole bridge contract address. Admin only.
    pub fn set_wormhole_bridge(
        env: Env,
        caller: Address,
        bridge_addr: Address,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_admin(&env, &caller)?;
        caller.require_auth();
        bridge::set_wormhole_bridge(&env, &bridge_addr);
        ContractStorage::bump_instance_ttl(&env);
        Ok(())
    }

    /// Register a wrapped (bridged) token so it can be used in escrows.
    /// Admin only. `info.is_approved` controls whether the token is usable.
    pub fn register_wrapped_token(
        env: Env,
        caller: Address,
        info: bridge::WrappedTokenInfo,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_admin(&env, &caller)?;
        caller.require_auth();
        bridge::register_wrapped_token(&env, &info);
        bridge::emit_wrapped_token_registered(&env, &info.stellar_address, &info.origin_chain);
        Ok(())
    }

    /// Return canonical metadata for a wrapped token, or None if not registered.
    pub fn get_wrapped_token_info(env: Env, token: Address) -> Option<bridge::WrappedTokenInfo> {
        bridge::get_wrapped_token_info(&env, &token)
    }

    /// Record or update bridge confirmation state for a cross-chain transfer.
    /// Anyone may call this; finality is determined by `MIN_BRIDGE_CONFIRMATIONS`.
    pub fn update_bridge_confirmation(
        env: Env,
        transfer_id: String,
        bridge_protocol: bridge::BridgeProtocol,
        confirmations: u32,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_initialized(&env)?;
        let is_finalized = confirmations >= bridge::MIN_BRIDGE_CONFIRMATIONS;
        let conf = bridge::BridgeConfirmation {
            transfer_id: transfer_id.clone(),
            bridge: bridge_protocol,
            confirmations,
            is_finalized,
            updated_at: env.ledger().timestamp(),
        };
        bridge::record_bridge_confirmation(&env, &conf);
        bridge::emit_bridge_confirmation_updated(&env, &transfer_id, confirmations, is_finalized);
        Ok(())
    }

    /// Return bridge confirmation state for a transfer ID.
    pub fn get_bridge_confirmation(
        env: Env,
        transfer_id: String,
    ) -> Option<bridge::BridgeConfirmation> {
        bridge::get_bridge_confirmation(&env, &transfer_id)
    }

    // ── Escrow Lifecycle ──────────────────────────────────────────────────────

    /// Creates a new escrow and locks funds in the contract.
    ///
    /// # Gas notes
    /// - Auth check before any storage read.
    /// - Single `save_escrow_meta` write; no milestone writes at creation.
    /// - Token transfer is the dominant cost; nothing we can do there.
    pub fn create_escrow(
        env: Env,
        client: Address,
        freelancer: Address,
        token: Address,
        total_amount: i128,
        brief_hash: BytesN<32>,
        arbiter: Option<Address>,
        deadline: Option<u64>,
        lock_time: Option<u64>,
        _timelock: Option<Timelock>,
        _multisig_config: MultisigConfig,
    ) -> Result<u64, EscrowError> {
        Self::create_escrow_internal(
            env,
            client,
            freelancer,
            token,
            total_amount,
            brief_hash,
            arbiter,
            deadline,
            lock_time,
            None,
        )
    }

    pub fn create_escrow_with_buyer_signers(
        env: Env,
        client: Address,
        freelancer: Address,
        token: Address,
        total_amount: i128,
        brief_hash: BytesN<32>,
        arbiter: Option<Address>,
        deadline: Option<u64>,
        lock_time: Option<u64>,
        buyer_signers: soroban_sdk::Vec<Address>,
    ) -> Result<u64, EscrowError> {
        Self::create_escrow_internal(
            env,
            client,
            freelancer,
            token,
            total_amount,
            brief_hash,
            arbiter,
            deadline,
            lock_time,
            Some(buyer_signers),
        )
    }

    fn create_escrow_internal(
        env: Env,
        client: Address,
        freelancer: Address,
        token: Address,
        total_amount: i128,
        brief_hash: BytesN<32>,
        arbiter: Option<Address>,
        deadline: Option<u64>,
        lock_time: Option<u64>,
        buyer_signers: Option<soroban_sdk::Vec<Address>>,
    ) -> Result<u64, EscrowError> {
        // Auth + validation before any storage I/O
        client.require_auth();
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        if total_amount <= 0 {
            return Err(EscrowError::InvalidEscrowAmount);
        }

        let now = env.ledger().timestamp();
        if let Some(dl) = deadline {
            if dl <= now {
                return Err(EscrowError::InvalidDeadline);
            }
        }

        // Validate lock_time if provided
        if let Some(lt) = lock_time {
            if lt <= now {
                return Err(EscrowError::InvalidLockTime);
            }
        }

        // Reject unapproved wrapped/bridged tokens
        bridge::validate_escrow_token(&env, &token)?;

        let buyer_signers = {
            let mut signers = buyer_signers.unwrap_or_else(|| soroban_sdk::Vec::new(&env));
            if !signers.contains(&client) {
                signers.push_back(client.clone());
            }
            signers
        };
        let escrow_id = ContractStorage::next_escrow_id(&env)?;
        let rent_reserve = ContractStorage::reserve_for_entries(1);

        // Transfer tokens — single cross-contract call
        token::Client::new(&env, &token).transfer(
            &client,
            &env.current_contract_address(),
            &total_amount,
        );
        ContractStorage::charge_rent_reserve(&env, &token, &client, rent_reserve)?;

        ContractStorage::save_escrow_meta(
            &env,
            &EscrowMeta {
                escrow_id,
                client: client.clone(),
                freelancer: freelancer.clone(),
                token,
                total_amount,
                allocated_amount: 0,
                remaining_balance: total_amount,
                status: EscrowStatus::Active,
                milestone_count: 0,
                approved_count: 0,
                released_count: 0,
                submitted_count: 0,
                arbiter,
                buyer_signers: buyer_signers.clone(),
                created_at: now,
                deadline,
                lock_time,
                lock_time_extension: None,
                timelock: OptionalTimelock::None,
                brief_hash,
                rent_balance: rent_reserve,
                last_rent_collection_at: now,
            },
        );

        events::emit_escrow_created(&env, escrow_id, &client, &freelancer, total_amount);
        Ok(escrow_id)
    }

    /// Creates a recurring escrow that automatically releases funds on a schedule.
    pub fn create_recurring_escrow(
        env: Env,
        client: Address,
        freelancer: Address,
        token: Address,
        payment_amount: i128,
        interval: RecurringInterval,
        start_time: u64,
        end_date: Option<u64>,
        number_of_payments: Option<u32>,
        brief_hash: BytesN<32>,
    ) -> Result<u64, EscrowError> {
        client.require_auth();
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        if payment_amount <= 0 {
            return Err(EscrowError::InvalidMilestoneAmount);
        }

        let now = env.ledger().timestamp();
        if start_time <= now {
            return Err(EscrowError::InvalidRecurringSchedule);
        }
        let total_payments = Self::resolve_total_payments(
            start_time,
            interval.clone(),
            end_date,
            number_of_payments,
        )?;
        let total_amount = payment_amount
            .checked_mul(i128::from(total_payments))
            .ok_or(EscrowError::AmountMismatch)?;
        let escrow_id = ContractStorage::next_escrow_id(&env)?;
        let base_rent_reserve = ContractStorage::reserve_for_entries(1);

        token::Client::new(&env, &token).transfer(
            &client,
            &env.current_contract_address(),
            &total_amount,
        );
        ContractStorage::charge_rent_reserve(&env, &token, &client, base_rent_reserve)?;

        let mut buyer_signers = soroban_sdk::Vec::new(&env);
        buyer_signers.push_back(client.clone());

        let mut meta = EscrowMeta {
            escrow_id,
            client: client.clone(),
            freelancer: freelancer.clone(),
            token,
            total_amount,
            allocated_amount: 0,
            remaining_balance: total_amount,
            status: EscrowStatus::Active,
            milestone_count: 0,
            approved_count: 0,
            released_count: 0,
            submitted_count: 0,
            arbiter: None,
            buyer_signers,
            created_at: now,
            deadline: None,
            lock_time: None,
            lock_time_extension: None,
            timelock: OptionalTimelock::None,
            brief_hash,
            rent_balance: base_rent_reserve,
            last_rent_collection_at: now,
        };
        ContractStorage::charge_entry_rent(&env, &mut meta, &client, 1)?;
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_escrow_created(&env, escrow_id, &client, &freelancer, total_amount);

        let recurring = RecurringPaymentConfig {
            interval,
            payment_amount,
            start_time,
            next_payment_at: start_time,
            end_date,
            total_payments,
            payments_remaining: total_payments,
            processed_payments: 0,
            paused: false,
            cancelled: false,
            paused_at: None,
            last_payment_at: None,
        };
        ContractStorage::save_recurring_config(&env, escrow_id, &recurring);

        events::emit_recurring_schedule_created(
            &env,
            escrow_id,
            payment_amount,
            total_payments,
            start_time,
        );
        Ok(escrow_id)
    }

    /// Adds a milestone to an existing escrow.
    ///
    /// # Gas notes
    /// - Auth before storage read.
    /// - Writes only the new `Milestone` entry + updated `EscrowMeta`.
    pub fn add_milestone(
        env: Env,
        caller: Address,
        escrow_id: u64,
        title: String,
        description_hash: BytesN<32>,
        amount: i128,
    ) -> Result<u32, EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        if amount <= 0 {
            return Err(EscrowError::InvalidMilestoneAmount);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

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
        // Enforce fixed-capacity limit — prevents unbounded storage growth.
        if milestone_id >= MAX_MILESTONES {
            return Err(EscrowError::TooManyMilestones);
        }
        meta.milestone_count = meta
            .milestone_count
            .checked_add(1)
            .ok_or(EscrowError::TooManyMilestones)?;
        meta.allocated_amount = next_allocated;
        ContractStorage::charge_entry_rent(&env, &mut meta, &caller, 1)?;

        ContractStorage::save_milestone(
            &env,
            escrow_id,
            &Milestone {
                id: milestone_id,
                title,
                description_hash,
                amount,
                status: MS_PENDING,
                submitted_at: None,
                resolved_at: None,
                approvals: soroban_sdk::Vec::new(&env),
            },
        );
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_milestone_added(&env, escrow_id, milestone_id, amount);
        Ok(milestone_id)
    }

    // ── Batch Operations ──────────────────────────────────────────────────────

    /// Adds multiple milestones in a single transaction.
    ///
    /// Loads `EscrowMeta` once, writes N milestone entries, then saves meta
    /// once — reducing storage round-trips from O(2N) to O(N+1).
    ///
    /// # Arguments
    /// * `titles`            — parallel array of milestone titles
    /// * `description_hashes`— parallel array of IPFS content hashes
    /// * `amounts`           — parallel array of token amounts
    ///
    /// Returns the first milestone ID assigned (subsequent IDs are sequential).
    pub fn batch_add_milestones(
        env: Env,
        caller: Address,
        escrow_id: u64,
        titles: soroban_sdk::Vec<String>,
        description_hashes: soroban_sdk::Vec<BytesN<32>>,
        amounts: soroban_sdk::Vec<i128>,
    ) -> Result<u32, EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let n = titles.len();
        if n == 0 || n != description_hashes.len() || n != amounts.len() {
            return Err(EscrowError::InvalidMilestoneAmount);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::ClientOnly);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }

        // Capacity check upfront — fail fast before any writes.
        if meta.milestone_count.saturating_add(n) > MAX_MILESTONES {
            return Err(EscrowError::TooManyMilestones);
        }

        let first_id = meta.milestone_count;

        // Validate all amounts and accumulate total before touching storage.
        let mut total_new: i128 = 0;
        for i in 0..n {
            let amt = amounts.get(i).ok_or(EscrowError::InvalidMilestoneAmount)?;
            if amt <= 0 {
                return Err(EscrowError::InvalidMilestoneAmount);
            }
            total_new = total_new
                .checked_add(amt)
                .ok_or(EscrowError::MilestoneAmountExceedsEscrow)?;
        }
        let next_allocated = meta
            .allocated_amount
            .checked_add(total_new)
            .ok_or(EscrowError::MilestoneAmountExceedsEscrow)?;
        if next_allocated > meta.total_amount {
            return Err(EscrowError::MilestoneAmountExceedsEscrow);
        }

        // Charge rent for all new entries in one call.
        ContractStorage::charge_entry_rent(&env, &mut meta, &caller, i128::from(n))?;
        meta.allocated_amount = next_allocated;

        // Write milestones — single persistent write per milestone.
        for i in 0..n {
            let milestone_id = first_id + i;
            ContractStorage::save_milestone(
                &env,
                escrow_id,
                &Milestone {
                    id: milestone_id,
                    title: titles.get(i).ok_or(EscrowError::InvalidMilestoneAmount)?,
                    description_hash: description_hashes
                        .get(i)
                        .ok_or(EscrowError::InvalidMilestoneAmount)?,
                    amount: amounts.get(i).ok_or(EscrowError::InvalidMilestoneAmount)?,
                    status: MS_PENDING,
                    submitted_at: None,
                    resolved_at: None,
                    approvals: soroban_sdk::Vec::new(&env),
                },
            );
            events::emit_milestone_added(
                &env,
                escrow_id,
                milestone_id,
                amounts.get(i).ok_or(EscrowError::InvalidMilestoneAmount)?,
            );
        }

        meta.milestone_count = first_id + n;
        // Single meta write for all N milestones.
        ContractStorage::save_escrow_meta(&env, &meta);

        Ok(first_id)
    }

    /// Approves multiple submitted milestones in a single transaction.
    ///
    /// Loads `EscrowMeta` once, processes each milestone, accumulates the
    /// total release amount, then executes a single token transfer and a
    /// single meta write — reducing gas from O(2N transfers + 2N writes) to
    /// O(N writes + 1 transfer + 1 meta write).
    ///
    /// All milestone IDs must be in `Submitted` state; the call fails atomically
    /// if any ID is invalid or in the wrong state.
    pub fn batch_approve_milestones(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_ids: soroban_sdk::Vec<u32>,
    ) -> Result<i128, EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        if milestone_ids.is_empty() {
            return Err(EscrowError::InvalidMilestoneAmount);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }
        ContractStorage::check_lock_time_expired(&env, escrow_id, meta.lock_time)?;
        if caller != meta.client && !meta.buyer_signers.contains(&caller) {
            return Err(EscrowError::Unauthorized);
        }

        let now = env.ledger().timestamp();
        let timelock_expired =
            ContractStorage::check_timelock_expired(&env, escrow_id, meta.timelock.clone()).is_ok();

        let mut total_amount: i128 = 0;

        // Pass 1: validate all milestones and accumulate total — no writes yet.
        for i in 0..milestone_ids.len() {
            let mid = milestone_ids.get(i).ok_or(EscrowError::MilestoneNotFound)?;
            let m = ContractStorage::load_milestone(&env, escrow_id, mid)?;
            if m.status != MS_SUBMITTED {
                return Err(EscrowError::InvalidMilestoneState);
            }
            total_amount = total_amount
                .checked_add(m.amount)
                .ok_or(EscrowError::AmountMismatch)?;
        }

        // Pass 2: write updated milestones and update counters.
        for i in 0..milestone_ids.len() {
            let mid = milestone_ids.get(i).ok_or(EscrowError::MilestoneNotFound)?;
            let mut m = ContractStorage::load_milestone(&env, escrow_id, mid)?;
            m.resolved_at = Some(now);
            m.status = if timelock_expired {
                MS_RELEASED
            } else {
                MS_APPROVED
            };
            ContractStorage::save_milestone(&env, escrow_id, &m);

            meta.approved_count = meta
                .approved_count
                .checked_add(1)
                .ok_or(EscrowError::AmountMismatch)?;
            meta.submitted_count = meta.submitted_count.saturating_sub(1);
            if timelock_expired {
                meta.released_count = meta
                    .released_count
                    .checked_add(1)
                    .ok_or(EscrowError::AmountMismatch)?;
            }
            events::emit_milestone_approved(&env, escrow_id, mid, m.amount);
        }

        // Single token transfer for the entire batch.
        if timelock_expired && total_amount > 0 {
            meta.remaining_balance = meta
                .remaining_balance
                .checked_sub(total_amount)
                .ok_or(EscrowError::AmountMismatch)?;
            token::Client::new(&env, &meta.token).transfer(
                &env.current_contract_address(),
                &meta.freelancer,
                &total_amount,
            );
            events::emit_funds_released(&env, escrow_id, &meta.freelancer, total_amount);
        }

        // Completion check — O(1) via counters.
        if meta.released_count == meta.milestone_count && meta.milestone_count > 0 {
            meta.status = EscrowStatus::Completed;
            events::emit_escrow_completed(&env, escrow_id);
        }

        // Single meta write for the entire batch.
        ContractStorage::save_escrow_meta(&env, &meta);

        Ok(total_amount)
    }

    /// Releases funds for multiple approved milestones in a single transaction.
    ///
    /// Admin-only. Batches the token transfer into one call instead of N calls.
    pub fn batch_release_funds(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_ids: soroban_sdk::Vec<u32>,
    ) -> Result<i128, EscrowError> {
        ContractStorage::require_initialized(&env)?;
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::NotInitialized)?;
        if caller != admin {
            return Err(EscrowError::AdminOnly);
        }

        if milestone_ids.is_empty() {
            return Err(EscrowError::InvalidMilestoneAmount);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        ContractStorage::check_lock_time_expired(&env, escrow_id, meta.lock_time)?;

        let mut total_amount: i128 = 0;

        // Pass 1: validate all milestones.
        for i in 0..milestone_ids.len() {
            let mid = milestone_ids.get(i).ok_or(EscrowError::MilestoneNotFound)?;
            let m = ContractStorage::load_milestone(&env, escrow_id, mid)?;
            if m.status != MS_APPROVED {
                return Err(EscrowError::InvalidMilestoneState);
            }
            total_amount = total_amount
                .checked_add(m.amount)
                .ok_or(EscrowError::AmountMismatch)?;
        }

        // Pass 2: mark released.
        for i in 0..milestone_ids.len() {
            let mid = milestone_ids.get(i).ok_or(EscrowError::MilestoneNotFound)?;
            let mut m = ContractStorage::load_milestone(&env, escrow_id, mid)?;
            m.status = MS_RELEASED;
            ContractStorage::save_milestone(&env, escrow_id, &m);
            meta.released_count = meta
                .released_count
                .checked_add(1)
                .ok_or(EscrowError::AmountMismatch)?;
            events::emit_funds_released(&env, escrow_id, &meta.freelancer, m.amount);
        }

        // Single transfer.
        meta.remaining_balance = meta
            .remaining_balance
            .checked_sub(total_amount)
            .ok_or(EscrowError::AmountMismatch)?;
        token::Client::new(&env, &meta.token).transfer(
            &env.current_contract_address(),
            &meta.freelancer,
            &total_amount,
        );

        if meta.released_count == meta.milestone_count && meta.milestone_count > 0 {
            meta.status = EscrowStatus::Completed;
            events::emit_escrow_completed(&env, escrow_id);
        }

        ContractStorage::save_escrow_meta(&env, &meta);
        Ok(total_amount)
    }

    /// Releases all recurring payments that are due at the current ledger timestamp.
    pub fn process_recurring_payments(env: Env, escrow_id: u64) -> Result<u32, EscrowError> {
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }

        let mut recurring = ContractStorage::load_recurring_config(&env, escrow_id)?;
        if recurring.cancelled {
            return Err(EscrowError::RecurringScheduleCancelled);
        }
        if recurring.paused {
            return Err(EscrowError::RecurringSchedulePaused);
        }

        let now = env.ledger().timestamp();
        if recurring.payments_remaining == 0 || now < recurring.next_payment_at {
            return Err(EscrowError::NoRecurringPaymentDue);
        }

        let mut processed_count: u32 = 0;
        let mut total_released: i128 = 0;

        while recurring.payments_remaining > 0 && now >= recurring.next_payment_at {
            let milestone_id = meta.milestone_count;
            meta.milestone_count = meta
                .milestone_count
                .checked_add(1)
                .ok_or(EscrowError::TooManyMilestones)?;
            meta.approved_count = meta
                .approved_count
                .checked_add(1)
                .ok_or(EscrowError::TooManyMilestones)?;
            meta.allocated_amount = meta
                .allocated_amount
                .checked_add(recurring.payment_amount)
                .ok_or(EscrowError::AmountMismatch)?;
            meta.remaining_balance = meta
                .remaining_balance
                .checked_sub(recurring.payment_amount)
                .ok_or(EscrowError::AmountMismatch)?;

            let payment_number = recurring
                .processed_payments
                .checked_add(1)
                .ok_or(EscrowError::TooManyMilestones)?;
            let title = String::from_str(&env, "Recurring payment");
            ContractStorage::save_milestone(
                &env,
                escrow_id,
                &Milestone {
                    id: milestone_id,
                    title,
                    description_hash: meta.brief_hash.clone(),
                    amount: recurring.payment_amount,
                    status: MS_APPROVED,
                    submitted_at: Some(recurring.next_payment_at),
                    resolved_at: Some(now),
                    approvals: soroban_sdk::Vec::new(&env),
                },
            );

            token::Client::new(&env, &meta.token).transfer(
                &env.current_contract_address(),
                &meta.freelancer,
                &recurring.payment_amount,
            );

            recurring.processed_payments = payment_number;
            recurring.payments_remaining -= 1;
            recurring.last_payment_at = Some(now);
            total_released = total_released
                .checked_add(recurring.payment_amount)
                .ok_or(EscrowError::AmountMismatch)?;
            processed_count += 1;

            if recurring.payments_remaining == 0 {
                recurring.next_payment_at = 0;
                break;
            }

            recurring.next_payment_at =
                Self::next_schedule_time(recurring.next_payment_at, &recurring.interval)?;

            if let Some(end_date) = recurring.end_date {
                if recurring.next_payment_at > end_date {
                    recurring.payments_remaining = 0;
                    recurring.next_payment_at = 0;
                    break;
                }
            }
        }

        if recurring.payments_remaining == 0 {
            meta.status = EscrowStatus::Completed;
            events::emit_escrow_completed(&env, escrow_id);
        }

        ContractStorage::save_escrow_meta(&env, &meta);
        ContractStorage::save_recurring_config(&env, escrow_id, &recurring);

        events::emit_recurring_payments_processed(
            &env,
            escrow_id,
            processed_count,
            total_released,
            if recurring.payments_remaining == 0 {
                None
            } else {
                Some(recurring.next_payment_at)
            },
        );
        events::emit_funds_released(&env, escrow_id, &meta.freelancer, total_released);
        Ok(processed_count)
    }

    /// Freelancer submits work for a milestone.
    ///
    /// # Gas notes
    /// - Loads only the single milestone entry, not the full escrow.
    pub fn submit_milestone(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        // Load meta only to verify freelancer identity and track submitted_count.
        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.freelancer {
            return Err(EscrowError::FreelancerOnly);
        }

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MS_PENDING && milestone.status != MS_REJECTED {
            return Err(EscrowError::InvalidMilestoneState);
        }

        milestone.status = MS_SUBMITTED;
        milestone.submitted_at = Some(env.ledger().timestamp());
        ContractStorage::save_milestone(&env, escrow_id, &milestone);

        // Increment submitted_count on the already-loaded meta — single write.
        meta.submitted_count = meta
            .submitted_count
            .checked_add(1)
            .ok_or(EscrowError::AmountMismatch)?;
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_milestone_submitted(&env, escrow_id, milestone_id, &caller);
        Ok(())
    }

    /// Client approves a submitted milestone and releases funds.
    ///
    /// # Gas notes
    /// - O(1) completion check via `approved_count` field — no milestone loop.
    /// - Single token transfer call.
    /// - Two storage writes: milestone + meta.
    pub fn approve_milestone(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }

        // Check if lock time has expired (legacy lock_time behaviour)
        ContractStorage::check_lock_time_expired(&env, escrow_id, meta.lock_time)?;

        // Caller must be the client or one of the buyer signers
        if caller != meta.client && !meta.buyer_signers.contains(&caller) {
            return Err(EscrowError::Unauthorized);
        }

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MS_SUBMITTED {
            return Err(EscrowError::InvalidMilestoneState);
        }

        let now = env.ledger().timestamp();
        let amount = milestone.amount;

        milestone.status = MS_APPROVED;
        milestone.resolved_at = Some(now);
        meta.approved_count = meta
            .approved_count
            .checked_add(1)
            .ok_or(EscrowError::AmountMismatch)?;

        let timelock_expired =
            ContractStorage::check_timelock_expired(&env, escrow_id, meta.timelock.clone()).is_ok();

        if timelock_expired {
            // Release funds immediately — timelock not active
            token::Client::new(&env, &meta.token).transfer(
                &env.current_contract_address(),
                &meta.freelancer,
                &amount,
            );
            meta.remaining_balance = meta
                .remaining_balance
                .checked_sub(amount)
                .ok_or(EscrowError::AmountMismatch)?;
            meta.released_count = meta
                .released_count
                .checked_add(1)
                .ok_or(EscrowError::AmountMismatch)?;
            milestone.status = MS_RELEASED;
            events::emit_funds_released(&env, escrow_id, &meta.freelancer, amount);
        }

        ContractStorage::save_milestone(&env, escrow_id, &milestone);

        if meta.approved_count == meta.milestone_count
            && meta.milestone_count > 0
            && meta.released_count == meta.milestone_count
        {
            meta.status = EscrowStatus::Completed;
            events::emit_escrow_completed(&env, escrow_id);
        }

        ContractStorage::save_escrow_meta(&env, &meta);
        events::emit_milestone_approved(&env, escrow_id, milestone_id, amount);
        Ok(())
    }

    /// Client rejects a submitted milestone.
    ///
    /// # Gas notes
    /// - Loads only the single milestone entry.
    pub fn reject_milestone(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::ClientOnly);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MS_SUBMITTED {
            return Err(EscrowError::InvalidMilestoneState);
        }

        milestone.status = MS_REJECTED;
        milestone.resolved_at = Some(env.ledger().timestamp());
        ContractStorage::save_milestone(&env, escrow_id, &milestone);

        // Decrement submitted_count on the already-loaded meta — single write.
        meta.submitted_count = meta.submitted_count.saturating_sub(1);
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_milestone_rejected(&env, escrow_id, milestone_id, &caller);
        Ok(())
    }

    /// Admin-only fallback for edge cases. Normal flow uses `approve_milestone`.
    ///
    /// # Security (STE-01, STE-02)
    /// - Requires admin authorization.
    /// - Milestone must be `Approved` to prevent double-payment.
    pub fn release_funds(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_initialized(&env)?;
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::NotInitialized)?;

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MS_APPROVED {
            return Err(EscrowError::InvalidMilestoneState);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

        let is_admin = caller == admin;
        let timelock_ok =
            ContractStorage::check_timelock_expired(&env, escrow_id, meta.timelock.clone()).is_ok();

        if !is_admin && !timelock_ok {
            return Err(EscrowError::TimelockNotExpired);
        }

        // Legacy lock_time also required if present.
        ContractStorage::check_lock_time_expired(&env, escrow_id, meta.lock_time)?;

        let amount = milestone.amount;

        token::Client::new(&env, &meta.token).transfer(
            &env.current_contract_address(),
            &meta.freelancer,
            &amount,
        );

        milestone.status = MS_RELEASED;
        ContractStorage::save_milestone(&env, escrow_id, &milestone);

        meta.remaining_balance = meta
            .remaining_balance
            .checked_sub(amount)
            .ok_or(EscrowError::AmountMismatch)?;
        meta.released_count = meta
            .released_count
            .checked_add(1)
            .ok_or(EscrowError::AmountMismatch)?;

        if meta.released_count == meta.milestone_count && meta.milestone_count > 0 {
            meta.status = EscrowStatus::Completed;
            events::emit_escrow_completed(&env, escrow_id);
        }

        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_funds_released(&env, escrow_id, &meta.freelancer, amount);
        if timelock_ok && !is_admin {
            events::emit_timelock_released(&env, escrow_id, env.ledger().timestamp());
        }

        Ok(())
    }

    /// Cancels an escrow and returns remaining funds to the client.
    pub fn cancel_escrow(env: Env, caller: Address, escrow_id: u64) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::ClientOnly);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }

        // O(1) check: if any milestone is Submitted or Approved, block cancellation.
        // `submitted_count` and `approved_count` are maintained incrementally on
        // every submit/approve/reject, so no storage iteration is needed here.
        if meta.submitted_count > 0 || meta.approved_count > meta.released_count {
            return Err(EscrowError::CannotCancelWithPendingFunds);
        }

        let returned = meta.remaining_balance;
        token::Client::new(&env, &meta.token).transfer(
            &env.current_contract_address(),
            &meta.client,
            &returned,
        );

        meta.remaining_balance = 0;
        meta.status = EscrowStatus::Cancelled;
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_escrow_cancelled(&env, escrow_id, returned);
        Ok(())
    }

    /// Starts a timed release window for the escrow.
    ///
    /// `duration_ledger` is the number of ledger seconds to wait before release.
    /// Valid values are 1 to 30 days (inclusive).
    pub fn start_timelock(
        env: Env,
        caller: Address,
        escrow_id: u64,
        duration_ledger: u64,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        if duration_ledger == 0 || duration_ledger > 30 * 24 * 60 * 60 {
            return Err(EscrowError::InvalidTimelockDuration);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client && caller != meta.freelancer {
            return Err(EscrowError::Unauthorized);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }
        if meta.timelock != OptionalTimelock::None {
            return Err(EscrowError::TimelockAlreadyActive);
        }

        let now = env.ledger().timestamp();
        meta.timelock = OptionalTimelock::Some(types::Timelock {
            duration_ledger,
            start_ledger: now,
        });
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_timelock_started(&env, escrow_id, duration_ledger, now);
        Ok(())
    }

    // ── Time Lock Extension ─────────────────────────────────────────────────────

    /// Extends the lock time for an escrow.
    ///
    /// Only the client can extend the lock time, and the new lock time
    /// must be in the future.
    pub fn extend_lock_time(
        env: Env,
        caller: Address,
        escrow_id: u64,
        new_lock_time: u64,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

        if caller != meta.client {
            return Err(EscrowError::ClientOnly);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }

        let now = env.ledger().timestamp();
        if new_lock_time <= now {
            return Err(EscrowError::InvalidLockTimeExtension);
        }

        let old_lock_time = meta.lock_time.unwrap_or(0);

        // If there's an existing lock_time_extension, use that as the maximum
        if let Some(ext) = meta.lock_time_extension {
            if new_lock_time > ext {
                return Err(EscrowError::InvalidLockTimeExtension);
            }
        }

        meta.lock_time = Some(new_lock_time);
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_lock_time_extended(&env, escrow_id, old_lock_time, new_lock_time, &caller);
        Ok(())
    }

    // ── Dispute Resolution ────────────────────────────────────────────────────

    /// Raises a dispute, freezing further fund releases.
    pub fn raise_dispute(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_id: Option<u32>,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
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

        if let Some(mid) = milestone_id {
            let mut milestone = ContractStorage::load_milestone(&env, escrow_id, mid)?;
            let was_submitted = milestone.status == MS_SUBMITTED;
            if was_submitted || milestone.status == MS_PENDING {
                milestone.status = MS_DISPUTED;
                milestone.resolved_at = Some(env.ledger().timestamp());
                ContractStorage::save_milestone(&env, escrow_id, &milestone);
                // Keep submitted_count consistent — meta already saved above,
                // so reload, decrement, and save again.
                if was_submitted {
                    let mut meta2 = ContractStorage::load_escrow_meta(&env, escrow_id)?;
                    meta2.submitted_count = meta2.submitted_count.saturating_sub(1);
                    ContractStorage::save_escrow_meta(&env, &meta2);
                }
                events::emit_milestone_disputed(&env, escrow_id, mid, &caller);
            }
        }

        Ok(())
    }

    /// Resolves a dispute by distributing remaining funds.
    ///
    /// # Gas notes
    /// - Two token transfers in sequence; unavoidable.
    /// - Reputation updates are two upserts, each touching only one storage entry.
    pub fn resolve_dispute(
        env: Env,
        caller: Address,
        escrow_id: u64,
        client_amount: i128,
        freelancer_amount: i128,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

        // Caller must be arbiter or admin
        let is_arbiter = meta.arbiter.as_ref().is_some_and(|a| *a == caller);
        if !is_arbiter {
            ContractStorage::require_admin(&env, &caller)?;
        }

        if meta.status != EscrowStatus::Disputed {
            return Err(EscrowError::EscrowNotDisputed);
        }
        if client_amount + freelancer_amount != meta.remaining_balance {
            return Err(EscrowError::AmountMismatch);
        }

        let token = token::Client::new(&env, &meta.token);
        let contract_addr = env.current_contract_address();

        if client_amount > 0 {
            token.transfer(&contract_addr, &meta.client, &client_amount);
        }
        if freelancer_amount > 0 {
            token.transfer(&contract_addr, &meta.freelancer, &freelancer_amount);
        }

        meta.remaining_balance = 0;
        meta.status = EscrowStatus::Completed;
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_dispute_resolved(&env, escrow_id, client_amount, freelancer_amount);

        // Update reputation for both parties
        Self::_update_reputation_internal(&env, &meta.client, false, true, client_amount);
        Self::_update_reputation_internal(&env, &meta.freelancer, false, true, freelancer_amount);

        Ok(())
    }

    // ── Reputation ────────────────────────────────────────────────────────────

    /// Updates on-chain reputation for a user.
    ///
    /// Scoring:
    /// - Completed escrow: +10 base + 1 per 1000 units volume (capped at +20)
    /// - Disputed escrow:  -5 score, increment disputed_count
    pub fn update_reputation(
        env: Env,
        address: Address,
        completed: bool,
        disputed: bool,
        volume: i128,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_not_paused(&env)?;
        Self::_update_reputation_internal(&env, &address, completed, disputed, volume);
        Ok(())
    }

    // ── Upgrade ───────────────────────────────────────────────────────────────

    pub fn upgrade(
        env: Env,
        caller: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_admin(&env, &caller)?;

        // Run storage migration before upgrading contract code
        // This ensures data is in the correct format for the new version
        StorageManager::migrate(&env)?;

        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    // ── Emergency Pause ──────────────────────────────────────────────────────

    /// Pauses the contract, preventing new escrows and milestone additions.
    pub fn pause(env: Env, caller: Address) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_admin(&env, &caller)?;

        if ContractStorage::is_paused(&env) {
            return Ok(());
        }

        ContractStorage::set_paused(&env, true);
        events::emit_contract_paused(&env, &caller);
        Ok(())
    }

    /// Unpauses the contract, resuming normal operation.
    pub fn unpause(env: Env, caller: Address) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_admin(&env, &caller)?;

        if !ContractStorage::is_paused(&env) {
            return Ok(());
        }

        ContractStorage::set_paused(&env, false);
        events::emit_contract_unpaused(&env, &caller);
        Ok(())
    }

    /// Returns the current pause state of the contract.
    pub fn is_paused(env: Env) -> bool {
        ContractStorage::is_paused(&env)
    }

    /// Returns the current admin address.
    /// Returns EscrowError::NotInitialized if the contract has not been initialized.
    pub fn get_admin(env: Env) -> Result<Address, EscrowError> {
        ContractStorage::require_initialized(&env)?;
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::NotInitialized)?;
        Ok(admin)
    }

    /// Pauses scheduled recurring releases for an escrow.
    pub fn pause_recurring_schedule(
        env: Env,
        caller: Address,
        escrow_id: u64,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::ClientOnly);
        }

        let mut recurring = ContractStorage::load_recurring_config(&env, escrow_id)?;
        if recurring.cancelled {
            return Err(EscrowError::RecurringScheduleCancelled);
        }
        recurring.paused = true;
        recurring.paused_at = Some(env.ledger().timestamp());
        ContractStorage::save_recurring_config(&env, escrow_id, &recurring);

        events::emit_recurring_schedule_paused(&env, escrow_id, &caller);
        Ok(())
    }

    /// Resumes scheduled recurring releases for an escrow.
    pub fn resume_recurring_schedule(
        env: Env,
        caller: Address,
        escrow_id: u64,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::ClientOnly);
        }

        let mut recurring = ContractStorage::load_recurring_config(&env, escrow_id)?;
        if recurring.cancelled {
            return Err(EscrowError::RecurringScheduleCancelled);
        }
        if !recurring.paused {
            return Ok(());
        }

        let now = env.ledger().timestamp();
        recurring.paused = false;
        recurring.next_payment_at = now.max(recurring.next_payment_at);
        recurring.paused_at = None;
        ContractStorage::save_recurring_config(&env, escrow_id, &recurring);

        events::emit_recurring_schedule_resumed(
            &env,
            escrow_id,
            &caller,
            recurring.next_payment_at,
        );
        Ok(())
    }

    /// Cancels a recurring schedule and refunds all future payments to the client.
    pub fn cancel_recurring_escrow(
        env: Env,
        caller: Address,
        escrow_id: u64,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::ClientOnly);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::EscrowNotActive);
        }

        let mut recurring = ContractStorage::load_recurring_config(&env, escrow_id)?;
        if recurring.cancelled {
            return Err(EscrowError::RecurringScheduleCancelled);
        }

        let refunded_amount = meta.remaining_balance;
        if refunded_amount > 0 {
            token::Client::new(&env, &meta.token).transfer(
                &env.current_contract_address(),
                &meta.client,
                &refunded_amount,
            );
        }

        recurring.cancelled = true;
        recurring.paused = false;
        recurring.payments_remaining = 0;
        recurring.next_payment_at = 0;
        meta.remaining_balance = 0;
        meta.status = EscrowStatus::Cancelled;

        ContractStorage::save_escrow_meta(&env, &meta);
        ContractStorage::save_recurring_config(&env, escrow_id, &recurring);

        events::emit_recurring_schedule_cancelled(&env, escrow_id, &caller, refunded_amount);
        Ok(())
    }

    // ── View Functions ────────────────────────────────────────────────────────

    pub fn get_escrow(env: Env, escrow_id: u64) -> Result<EscrowState, EscrowError> {
        ContractStorage::load_escrow(&env, escrow_id)
    }

    pub fn collect_rent(env: Env, escrow_id: u64) -> Result<i128, EscrowError> {
        ContractStorage::require_initialized(&env)?;
        let mut meta = ContractStorage::load_escrow_meta(&env, escrow_id)?;
        ContractStorage::collect_rent(&env, &mut meta)
    }

    pub fn top_up_rent(
        env: Env,
        caller: Address,
        escrow_id: u64,
        additional_periods: u64,
    ) -> Result<i128, EscrowError> {
        caller.require_auth();
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::ClientOnly);
        }
        if additional_periods == 0 {
            return Ok(0);
        }

        let top_up = ContractStorage::rent_due_per_period(&env, &meta)
            .checked_mul(i128::from(additional_periods))
            .ok_or(EscrowError::AmountMismatch)?;
        ContractStorage::charge_rent_reserve(&env, &meta.token, &caller, top_up)?;
        meta.rent_balance = meta
            .rent_balance
            .checked_add(top_up)
            .ok_or(EscrowError::AmountMismatch)?;
        ContractStorage::save_escrow_meta(&env, &meta);
        Ok(top_up)
    }

    pub fn get_reputation(env: Env, address: Address) -> Result<ReputationRecord, EscrowError> {
        Ok(ContractStorage::load_reputation(&env, &address))
    }

    pub fn get_recurring_config(
        env: Env,
        escrow_id: u64,
    ) -> Result<RecurringPaymentConfig, EscrowError> {
        ContractStorage::ensure_live_escrow(&env, escrow_id)?;
        ContractStorage::load_recurring_config(&env, escrow_id)
    }

    pub fn escrow_count(env: Env) -> u64 {
        ContractStorage::escrow_count(&env)
    }

    pub fn get_milestone(
        env: Env,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<Milestone, EscrowError> {
        ContractStorage::ensure_live_escrow(&env, escrow_id)?;
        ContractStorage::load_milestone(&env, escrow_id, milestone_id)
    }

    pub fn get_cancellation_request(
        env: Env,
        escrow_id: u64,
    ) -> Result<CancellationRequest, EscrowError> {
        ContractStorage::ensure_live_escrow(&env, escrow_id)?;
        ContractStorage::load_cancellation_request(&env, escrow_id)
    }

    pub fn get_slash_record(env: Env, escrow_id: u64) -> Result<SlashRecord, EscrowError> {
        ContractStorage::ensure_live_escrow(&env, escrow_id)?;
        ContractStorage::load_slash_record(&env, escrow_id)
    }

    // ── Cancellation Functions ─────────────────────────────────────────────────

    /// Requests cancellation of an escrow.
    ///
    /// Can be called by client or freelancer. Starts a dispute period.
    pub fn request_cancellation(
        env: Env,
        caller: Address,
        escrow_id: u64,
        reason: String,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

        // Only client or freelancer can request cancellation
        if caller != meta.client && caller != meta.freelancer {
            return Err(EscrowError::Unauthorized);
        }

        // Check if escrow is in a cancellable state
        if !matches!(meta.status, EscrowStatus::Active) {
            return Err(EscrowError::EscrowNotActive);
        }

        // Check if cancellation already exists
        if ContractStorage::load_cancellation_request(&env, escrow_id).is_ok() {
            return Err(EscrowError::CancellationAlreadyExists);
        }

        let now = env.ledger().timestamp();
        let dispute_deadline = now + CANCELLATION_DISPUTE_PERIOD;

        ContractStorage::charge_entry_rent(&env, &mut meta, &caller, 1)?;

        // Create cancellation request
        let request = CancellationRequest {
            escrow_id,
            requester: caller.clone(),
            reason: reason.clone(),
            requested_at: now,
            dispute_deadline,
            disputed: false,
        };
        ContractStorage::save_cancellation_request(&env, &request);

        // Update escrow status
        meta.status = EscrowStatus::CancellationPending;
        ContractStorage::save_escrow_meta(&env, &meta);

        // Emit event
        events::emit_cancellation_requested(&env, escrow_id, &caller, &reason, dispute_deadline);

        Ok(())
    }

    /// Executes a cancellation after the dispute period.
    ///
    /// Can be called by anyone after dispute period expires.
    pub fn execute_cancellation(env: Env, escrow_id: u64) -> Result<(), EscrowError> {
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        let request = ContractStorage::load_cancellation_request(&env, escrow_id)?;

        // Check if dispute period has passed
        let now = env.ledger().timestamp();
        if now < request.dispute_deadline {
            return Err(EscrowError::CancellationDisputePeriodActive);
        }

        // Check if disputed
        if request.disputed {
            return Err(EscrowError::CancellationDisputed);
        }

        // Calculate slash amount
        let slash_amount = Self::calculate_slash_amount(meta.remaining_balance);
        let client_amount = meta.remaining_balance - slash_amount;

        // Determine who gets the slash (the non-requesting party)
        let slash_recipient = if request.requester == meta.client {
            meta.freelancer.clone()
        } else {
            meta.client.clone()
        };

        // Apply slash (records reputation hit + slash record; funds held in contract)
        let reason = String::from_str(&env, "Escrow cancellation");
        Self::apply_slash(
            &env,
            &request.requester,
            &slash_recipient,
            slash_amount,
            &reason,
            escrow_id,
        );

        // Transfer funds
        let token = token::Client::new(&env, &meta.token);
        let contract_addr = env.current_contract_address();

        // NOTE: slash_amount is intentionally held in the contract until the
        // slash dispute period expires. Call `finalize_slash` after
        // SLASH_DISPUTE_PERIOD to release it to the recipient, or
        // `dispute_slash` + `resolve_slash_dispute` to reverse it.

        // Return remaining funds (after slash) to requester
        if client_amount > 0 {
            token.transfer(&contract_addr, &request.requester, &client_amount);
        }

        // Update escrow status
        meta.status = EscrowStatus::Cancelled;
        meta.remaining_balance = 0;
        ContractStorage::save_escrow_meta(&env, &meta);

        // Clean up cancellation request
        ContractStorage::remove_cancellation_request(&env, escrow_id);

        // Emit event
        events::emit_cancellation_executed(&env, escrow_id, client_amount, slash_amount);

        Ok(())
    }

    /// Disputes a cancellation request.
    ///
    /// Can only be called by the other party (non-requester).
    pub fn dispute_cancellation(
        env: Env,
        caller: Address,
        escrow_id: u64,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        let mut request = ContractStorage::load_cancellation_request(&env, escrow_id)?;

        // Only non-requester can dispute
        if caller == request.requester {
            return Err(EscrowError::Unauthorized);
        }

        // Check if already disputed
        if request.disputed {
            return Err(EscrowError::CancellationAlreadyDisputed);
        }

        // Check if dispute deadline has passed
        let now = env.ledger().timestamp();
        if now >= request.dispute_deadline {
            return Err(EscrowError::CancellationDisputeDeadlineExpired);
        }

        // Mark as disputed
        request.disputed = true;
        ContractStorage::save_cancellation_request(&env, &request);

        // Raise dispute on escrow
        meta.status = EscrowStatus::Disputed;
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_dispute_raised(&env, escrow_id, &caller);

        Ok(())
    }

    // ── Slash Dispute Functions ───────────────────────────────────────────────────

    /// Releases a held slash to the recipient after the dispute period expires.
    ///
    /// Can be called by anyone once `SLASH_DISPUTE_PERIOD` has passed without a dispute.
    pub fn finalize_slash(env: Env, escrow_id: u64) -> Result<(), EscrowError> {
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        let slash_record = ContractStorage::load_slash_record(&env, escrow_id)?;

        if slash_record.disputed {
            return Err(EscrowError::SlashAlreadyDisputed);
        }

        let now = env.ledger().timestamp();
        let dispute_deadline = slash_record.slashed_at + SLASH_DISPUTE_PERIOD;
        if now < dispute_deadline {
            return Err(EscrowError::SlashDisputeDeadlineExpired); // reuse: period still active
        }

        let meta = ContractStorage::load_escrow_meta(&env, escrow_id)?;
        token::Client::new(&env, &meta.token).transfer(
            &env.current_contract_address(),
            &slash_record.recipient,
            &slash_record.amount,
        );

        ContractStorage::remove_slash_record(&env, escrow_id);

        events::emit_slash_applied(
            &env,
            escrow_id,
            &slash_record.slashed_user,
            &slash_record.recipient,
            slash_record.amount,
            &slash_record.reason,
        );
        Ok(())
    }

    /// Disputes a slash applied to a user.
    ///
    /// Can only be called by the slashed user within the dispute period.
    pub fn dispute_slash(env: Env, caller: Address, escrow_id: u64) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;
        ContractStorage::ensure_live_escrow(&env, escrow_id)?;

        let mut slash_record = ContractStorage::load_slash_record(&env, escrow_id)?;

        // Only the slashed user can dispute
        if caller != slash_record.slashed_user {
            return Err(EscrowError::Unauthorized);
        }

        if slash_record.disputed {
            return Err(EscrowError::SlashAlreadyDisputed);
        }

        let now = env.ledger().timestamp();
        let dispute_deadline = slash_record.slashed_at + SLASH_DISPUTE_PERIOD;

        // Check if dispute deadline has passed
        if now >= dispute_deadline {
            return Err(EscrowError::SlashDisputeDeadlineExpired);
        }

        // Mark as disputed
        slash_record.disputed = true;
        ContractStorage::save_slash_record(&env, &slash_record);

        // Emit dispute event
        events::emit_slash_disputed(&env, escrow_id, &caller, slash_record.amount);

        Ok(())
    }

    /// Resolves a slash dispute.
    ///
    /// Can only be called by arbiter or admin.
    /// If upheld, the slash remains. If reversed, funds are returned.
    pub fn resolve_slash_dispute(
        env: Env,
        caller: Address,
        escrow_id: u64,
        upheld: bool,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let slash_record = ContractStorage::load_slash_record(&env, escrow_id)?;
        let meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

        // Caller must be arbiter or admin
        let is_arbiter = meta.arbiter.as_ref().is_some_and(|a| *a == caller);
        if !is_arbiter {
            ContractStorage::require_admin(&env, &caller)?;
        }

        if !slash_record.disputed {
            return Err(EscrowError::SlashNotFound);
        }

        let token = token::Client::new(&env, &meta.token);
        let contract_addr = env.current_contract_address();

        if upheld {
            // Slash stands — funds already with recipient, nothing to move
            events::emit_slash_dispute_resolved(&env, escrow_id, true, slash_record.amount);
        } else {
            // Reverse: claw back from recipient and return to slashed user
            token.transfer(
                &contract_addr,
                &slash_record.slashed_user,
                &slash_record.amount,
            );

            // Restore reputation
            let mut reputation = ContractStorage::load_reputation(&env, &slash_record.slashed_user);
            reputation.slash_count = reputation.slash_count.saturating_sub(1);
            reputation.total_slashed = reputation.total_slashed.saturating_sub(slash_record.amount);
            reputation.total_score = reputation.total_score.saturating_add(10);
            ContractStorage::save_reputation(&env, &reputation);

            events::emit_slash_dispute_resolved(&env, escrow_id, false, slash_record.amount);
        }

        // Clean up slash record
        ContractStorage::remove_slash_record(&env, escrow_id);

        Ok(())
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn _update_reputation_internal(
        env: &Env,
        address: &Address,
        completed: bool,
        disputed: bool,
        volume: i128,
    ) {
        let mut record = ContractStorage::load_reputation(env, address);
        let now = env.ledger().timestamp();

        if completed {
            // +10 base + 1 per 1000 volume units, capped at +20 total
            let volume_bonus = (volume / 1_000).min(10) as u64;
            record.total_score = record.total_score.saturating_add(10 + volume_bonus);
            record.completed_escrows += 1;
            record.total_volume = record.total_volume.saturating_add(volume);
        }

        if disputed {
            record.total_score = record.total_score.saturating_sub(5);
            record.disputed_escrows += 1;
        }

        record.last_updated = now;
        ContractStorage::save_reputation(env, &record);
        events::emit_reputation_updated(env, address, record.total_score);
    }

    fn resolve_total_payments(
        start_time: u64,
        interval: RecurringInterval,
        end_date: Option<u64>,
        number_of_payments: Option<u32>,
    ) -> Result<u32, EscrowError> {
        let derived_from_end_date = if let Some(end) = end_date {
            if end < start_time {
                return Err(EscrowError::InvalidRecurringSchedule);
            }

            let mut payments: u32 = 1;
            let mut scheduled_at = start_time;
            while scheduled_at < end {
                let next = Self::next_schedule_time(scheduled_at, &interval)?;
                if next > end {
                    break;
                }
                payments = payments
                    .checked_add(1)
                    .ok_or(EscrowError::InvalidRecurringSchedule)?;
                scheduled_at = next;
            }
            Some(payments)
        } else {
            None
        };

        let total = match (derived_from_end_date, number_of_payments) {
            (Some(by_end_date), Some(by_count)) => by_end_date.min(by_count),
            (Some(by_end_date), None) => by_end_date,
            (None, Some(by_count)) => by_count,
            (None, None) => return Err(EscrowError::InvalidRecurringSchedule),
        };

        if total == 0 {
            return Err(EscrowError::InvalidRecurringSchedule);
        }

        Ok(total)
    }

    fn next_schedule_time(current: u64, interval: &RecurringInterval) -> Result<u64, EscrowError> {
        let seconds = match interval {
            RecurringInterval::Daily => 86_400_u64,
            RecurringInterval::Weekly => 7 * 86_400_u64,
            RecurringInterval::Monthly => 30 * 86_400_u64,
        };

        current
            .checked_add(seconds)
            .ok_or(EscrowError::InvalidRecurringSchedule)
    }

    // ── Slashing helpers ─────────────────────────────────────────────────────

    /// Calculates the slash amount based on remaining balance.
    fn calculate_slash_amount(remaining_balance: i128) -> i128 {
        remaining_balance * SLASH_PERCENTAGE as i128 / 100
    }

    /// Applies a slash to a user and updates reputation.
    fn apply_slash(
        env: &Env,
        slashed_user: &Address,
        recipient: &Address,
        amount: i128,
        reason: &String,
        escrow_id: u64,
    ) {
        // Update reputation
        let mut reputation = ContractStorage::load_reputation(env, slashed_user);
        reputation.total_score = reputation.total_score.saturating_sub(10);
        reputation.slash_count += 1;
        reputation.total_slashed += amount;
        reputation.last_updated = env.ledger().timestamp();
        ContractStorage::save_reputation(env, &reputation);

        // Create slash record
        let slash_record = SlashRecord {
            escrow_id,
            slashed_user: slashed_user.clone(),
            recipient: recipient.clone(),
            amount,
            reason: reason.clone(),
            slashed_at: env.ledger().timestamp(),
            disputed: false,
        };
        ContractStorage::save_slash_record(env, &slash_record);

        // Emit slash event
        events::emit_slash_applied(env, escrow_id, slashed_user, recipient, amount, reason);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token, BytesN, Env, String,
    };

    fn setup() -> (Env, Address, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        (env, admin, contract_id, client)
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn advance(env: &Env, seconds: u64) {
        env.ledger().with_mut(|ledger| ledger.timestamp += seconds);
    }

    #[test]
    fn test_create_recurring_escrow_stores_schedule() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        let total_reserve = 2 * ContractStorage::reserve_for_entries(1);
        token_admin.mint(&escrow_client, &(300_i128 + total_reserve));

        let start_time = env.ledger().timestamp() + 100;
        let escrow_id = client.create_recurring_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &100_i128,
            &RecurringInterval::Weekly,
            &start_time,
            &None,
            &Some(3_u32),
            &BytesN::from_array(&env, &[12; 32]),
        );

        let state = client.get_escrow(&escrow_id);
        let recurring = client.get_recurring_config(&escrow_id);

        assert_eq!(state.total_amount, 300_i128);
        assert_eq!(recurring.total_payments, 3);
        assert_eq!(recurring.payments_remaining, 3);
        assert_eq!(recurring.next_payment_at, start_time);
    }

    #[test]
    fn test_process_recurring_payments_releases_due_amounts() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);

        let total_reserve = 2 * ContractStorage::reserve_for_entries(1);
        token_admin.mint(&escrow_client, &(200_i128 + total_reserve));

        let start_time = env.ledger().timestamp() + 10;
        let escrow_id = client.create_recurring_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &100_i128,
            &RecurringInterval::Daily,
            &start_time,
            &None,
            &Some(2_u32),
            &BytesN::from_array(&env, &[13; 32]),
        );

        advance(&env, 10);
        assert_eq!(client.process_recurring_payments(&escrow_id), 1);
        assert_eq!(token_client.balance(&freelancer), 100_i128);
        assert_eq!(client.get_escrow(&escrow_id).remaining_balance, 100_i128);

        advance(&env, 86_400);
        assert_eq!(client.process_recurring_payments(&escrow_id), 1);
        assert_eq!(token_client.balance(&freelancer), 200_i128);
        assert_eq!(
            client.get_escrow(&escrow_id).status,
            EscrowStatus::Completed
        );
    }

    #[test]
    fn test_pause_and_resume_recurring_schedule() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        let total_reserve = 2 * ContractStorage::reserve_for_entries(1);
        token_admin.mint(&escrow_client, &(200_i128 + total_reserve));

        let start_time = env.ledger().timestamp() + 10;
        let escrow_id = client.create_recurring_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &100_i128,
            &RecurringInterval::Daily,
            &start_time,
            &None,
            &Some(2_u32),
            &BytesN::from_array(&env, &[14; 32]),
        );

        client.pause_recurring_schedule(&escrow_client, &escrow_id);
        advance(&env, 10);
        let paused_result = client.try_process_recurring_payments(&escrow_id);
        assert!(matches!(
            paused_result,
            Err(Ok(EscrowError::RecurringSchedulePaused))
        ));

        client.resume_recurring_schedule(&escrow_client, &escrow_id);
        let recurring = client.get_recurring_config(&escrow_id);
        assert!(!recurring.paused);
        assert_eq!(client.process_recurring_payments(&escrow_id), 1);
    }

    #[test]
    fn test_cancel_recurring_escrow_refunds_unreleased_balance() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);

        let total_reserve = 2 * ContractStorage::reserve_for_entries(1);
        token_admin.mint(&escrow_client, &(300_i128 + total_reserve));

        let start_time = env.ledger().timestamp() + 10;
        let escrow_id = client.create_recurring_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &100_i128,
            &RecurringInterval::Daily,
            &start_time,
            &None,
            &Some(3_u32),
            &BytesN::from_array(&env, &[15; 32]),
        );

        advance(&env, 10);
        client.process_recurring_payments(&escrow_id);
        client.cancel_recurring_escrow(&escrow_client, &escrow_id);

        assert_eq!(token_client.balance(&escrow_client), 200_i128);
        assert_eq!(
            client.get_escrow(&escrow_id).status,
            EscrowStatus::Cancelled
        );
        assert!(client.get_recurring_config(&escrow_id).cancelled);
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
    fn test_get_admin_returns_initialized_admin() {
        let (_env, admin, _contract_id, client) = setup();
        client.initialize(&admin);
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    #[should_panic]
    fn test_get_admin_not_initialized_panics() {
        let (_env, _admin, _contract_id, client) = setup();
        // contract not initialized — should return NotInitialized error
        client.get_admin();
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

        let expected_rent_reserve = ContractStorage::reserve_for_entries(1);
        token_admin.mint(&escrow_client, &(1_000_i128 + expected_rent_reserve));

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &1_000_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        assert_eq!(escrow_id, 0);
        assert_eq!(
            token_client.balance(&contract_id),
            1_000_i128 + expected_rent_reserve
        );

        env.as_contract(&contract_id, || {
            assert!(env
                .storage()
                .persistent()
                .has(&PackedDataKey::EscrowMeta(escrow_id)));
            assert!(!env.storage().persistent().has(&DataKey::Escrow(escrow_id)));
            let meta: EscrowMeta = env
                .storage()
                .persistent()
                .get(&PackedDataKey::EscrowMeta(escrow_id))
                .unwrap();
            assert_eq!(meta.rent_balance, expected_rent_reserve);
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

        token_admin.mint(
            &escrow_client,
            &(1_000_i128 + (2 * ContractStorage::reserve_for_entries(1))),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &1_000_i128,
            &BytesN::from_array(&env, &[2; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
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
    fn test_approve_milestone_o1_completion_check() {
        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        token_admin.mint(
            &escrow_client,
            &(500_i128 + (2 * ContractStorage::reserve_for_entries(1))),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &500_i128,
            &BytesN::from_array(&env, &[4; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let mid = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Dev"),
            &BytesN::from_array(&env, &[5; 32]),
            &500_i128,
        );

        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.approve_milestone(&escrow_client, &escrow_id, &mid);

        // Escrow should be Completed after the single milestone is approved
        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Completed);

        // approved_count field should be 1 in raw storage
        env.as_contract(&contract_id, || {
            let meta: EscrowMeta = env
                .storage()
                .persistent()
                .get(&PackedDataKey::EscrowMeta(escrow_id))
                .unwrap();
            assert_eq!(meta.approved_count, 1);
            assert_eq!(meta.milestone_count, 1);
        });
    }

    #[test]
    fn test_cancel_escrow() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);

        token_admin.mint(
            &escrow_client,
            &(200_i128 + ContractStorage::reserve_for_entries(1)),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &200_i128,
            &BytesN::from_array(&env, &[6; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.cancel_escrow(&escrow_client, &escrow_id);

        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Cancelled);
        assert_eq!(token_client.balance(&escrow_client), 200_i128);
    }

    #[test]
    fn test_collect_rent_transfers_periodic_fees_to_admin() {
        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);
        let start = env.ledger().timestamp();

        token_admin.mint(
            &escrow_client,
            &(1_000_i128 + ContractStorage::reserve_for_entries(1)),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &1_000_i128,
            &BytesN::from_array(&env, &[7; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        advance(&env, 3 * RENT_PERIOD_SECONDS);

        let collected = client.collect_rent(&escrow_id);
        assert_eq!(collected, 3);
        assert_eq!(token_client.balance(&admin), 3);

        env.as_contract(&contract_id, || {
            let meta: EscrowMeta = env
                .storage()
                .persistent()
                .get(&PackedDataKey::EscrowMeta(escrow_id))
                .unwrap();
            assert_eq!(meta.rent_balance, 27);
            assert_eq!(
                meta.last_rent_collection_at,
                start + (3 * RENT_PERIOD_SECONDS)
            );
        });
    }

    #[test]
    fn test_expired_escrow_is_cleaned_up_by_collect_rent() {
        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);

        token_admin.mint(
            &escrow_client,
            &(200_i128 + (2 * ContractStorage::reserve_for_entries(1))),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &200_i128,
            &BytesN::from_array(&env, &[8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        let milestone_id = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Scope"),
            &BytesN::from_array(&env, &[9; 32]),
            &200_i128,
        );

        advance(&env, (RENT_RESERVE_PERIODS + 1) * RENT_PERIOD_SECONDS);

        let collected = client.collect_rent(&escrow_id);
        assert_eq!(collected, 60);
        assert_eq!(token_client.balance(&admin), 60);
        assert_eq!(token_client.balance(&escrow_client), 200);

        let result = client.try_get_milestone(&escrow_id, &milestone_id);
        assert!(matches!(result, Err(Ok(EscrowError::EscrowNotFound))));

        env.as_contract(&contract_id, || {
            assert!(!env
                .storage()
                .persistent()
                .has(&PackedDataKey::EscrowMeta(escrow_id)));
            assert!(!env
                .storage()
                .persistent()
                .has(&PackedDataKey::Milestone(escrow_id, milestone_id)));
        });
    }

    #[test]
    fn test_top_up_rent_extends_escrow_lifetime() {
        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        token_admin.mint(
            &escrow_client,
            &(100_i128 + (2 * ContractStorage::reserve_for_entries(1))),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &100_i128,
            &BytesN::from_array(&env, &[10; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let topped_up = client.top_up_rent(&escrow_client, &escrow_id, &5_u64);
        assert_eq!(topped_up, 5);

        advance(&env, (RENT_RESERVE_PERIODS + 3) * RENT_PERIOD_SECONDS);

        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Active);

        env.as_contract(&contract_id, || {
            let meta: EscrowMeta = env
                .storage()
                .persistent()
                .get(&PackedDataKey::EscrowMeta(escrow_id))
                .unwrap();
            assert_eq!(meta.rent_balance, 2);
            assert_eq!(
                meta.last_rent_collection_at,
                state.created_at + ((RENT_RESERVE_PERIODS + 3) * RENT_PERIOD_SECONDS)
            );
        });
    }

    #[test]
    fn test_cancellation_request_funds_extra_storage_rent() {
        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);

        token_admin.mint(
            &escrow_client,
            &(250_i128 + (2 * ContractStorage::reserve_for_entries(1))),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &250_i128,
            &BytesN::from_array(&env, &[11; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.request_cancellation(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Need to stop"),
        );

        assert_eq!(
            token_client.balance(&contract_id),
            250_i128 + (2 * ContractStorage::reserve_for_entries(1))
        );

        advance(&env, RENT_PERIOD_SECONDS);

        let collected = client.collect_rent(&escrow_id);
        assert_eq!(collected, 2);
        assert_eq!(token_client.balance(&admin), 2);

        env.as_contract(&contract_id, || {
            let meta: EscrowMeta = env
                .storage()
                .persistent()
                .get(&PackedDataKey::EscrowMeta(escrow_id))
                .unwrap();
            assert_eq!(meta.rent_balance, 58);
            assert!(env
                .storage()
                .persistent()
                .has(&DataKey::CancellationRequest(escrow_id)));
        });
    }

    #[test]
    #[ignore = "implement full flow — Issues #2–#11"]
    fn test_full_escrow_lifecycle() {}

    #[test]
    #[ignore = "implement dispute flow — Issues #9–#10"]
    fn test_dispute_resolution() {}

    // ── Cancellation + Slash tests ────────────────────────────────────────────

    fn setup_funded_escrow(
        env: &Env,
        admin: &Address,
        client: &EscrowContractClient,
        amount: i128,
    ) -> (Address, Address, Address, u64) {
        let escrow_client = Address::generate(env);
        let freelancer = Address::generate(env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(env, &token_id);
        token_admin.mint(
            &escrow_client,
            &(amount + (2 * ContractStorage::reserve_for_entries(1))),
        );
        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &amount,
            &BytesN::from_array(env, &[99; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(env),
        );
        (escrow_client, freelancer, token_id, escrow_id)
    }

    #[test]
    fn test_execute_cancellation_slashes_requester_and_distributes() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let (escrow_client, freelancer, token_id, escrow_id) =
            setup_funded_escrow(&env, &admin, &client, 100_i128);
        let token_client = token::Client::new(&env, &token_id);

        client.request_cancellation(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Changed my mind"),
        );

        // Advance past dispute period
        advance(&env, CANCELLATION_DISPUTE_PERIOD + 1);
        client.execute_cancellation(&escrow_id);

        // 10% of 100 = 10 held in contract (slash), 90 back to client
        // Slash is held until finalize_slash is called
        assert_eq!(token_client.balance(&escrow_client), 90_i128);
        assert_eq!(token_client.balance(&freelancer), 0_i128);

        // Finalize slash after dispute period — releases 10 to freelancer
        advance(&env, SLASH_DISPUTE_PERIOD + 1);
        client.finalize_slash(&escrow_id);
        assert_eq!(token_client.balance(&freelancer), 10_i128);

        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Cancelled);
        assert_eq!(state.remaining_balance, 0);
    }

    #[test]
    fn test_execute_cancellation_freelancer_requester_slashes_to_client() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let (escrow_client, freelancer, token_id, escrow_id) =
            setup_funded_escrow(&env, &admin, &client, 200_i128);
        let token_client = token::Client::new(&env, &token_id);

        // Mint rent reserve for the freelancer so they can pay the cancellation entry rent
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&freelancer, &ContractStorage::reserve_for_entries(1));

        client.request_cancellation(
            &freelancer,
            &escrow_id,
            &String::from_str(&env, "Cannot deliver"),
        );

        advance(&env, CANCELLATION_DISPUTE_PERIOD + 1);
        client.execute_cancellation(&escrow_id);

        // 10% of 200 = 20 held in contract (slash), 180 back to freelancer
        // escrow_client: 30 leftover after funding (minted 260, paid 230) + 0 slash yet = 30
        assert_eq!(token_client.balance(&freelancer), 180_i128);
        assert_eq!(token_client.balance(&escrow_client), 30_i128);

        // Finalize slash — releases 20 to escrow_client
        advance(&env, SLASH_DISPUTE_PERIOD + 1);
        client.finalize_slash(&escrow_id);
        assert_eq!(token_client.balance(&escrow_client), 50_i128);
    }

    #[test]
    fn test_execute_cancellation_fails_during_dispute_period() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let (escrow_client, _, _, escrow_id) = setup_funded_escrow(&env, &admin, &client, 100_i128);

        client.request_cancellation(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "reason"),
        );

        let result = client.try_execute_cancellation(&escrow_id);
        assert!(matches!(
            result,
            Err(Ok(EscrowError::CancellationDisputePeriodActive))
        ));
    }

    #[test]
    fn test_dispute_cancellation_blocks_execution() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let (escrow_client, freelancer, _, escrow_id) =
            setup_funded_escrow(&env, &admin, &client, 100_i128);

        client.request_cancellation(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "reason"),
        );

        client.dispute_cancellation(&freelancer, &escrow_id);

        advance(&env, CANCELLATION_DISPUTE_PERIOD + 1);

        let result = client.try_execute_cancellation(&escrow_id);
        assert!(matches!(result, Err(Ok(EscrowError::CancellationDisputed))));

        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Disputed);
    }

    #[test]
    fn test_slash_reputation_updated_on_cancellation() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let (escrow_client, _, _, escrow_id) = setup_funded_escrow(&env, &admin, &client, 100_i128);

        client.request_cancellation(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "reason"),
        );

        advance(&env, CANCELLATION_DISPUTE_PERIOD + 1);
        client.execute_cancellation(&escrow_id);

        let rep = client.get_reputation(&escrow_client);
        assert_eq!(rep.slash_count, 1);
        assert_eq!(rep.total_slashed, 10_i128);
    }

    #[test]
    fn test_dispute_slash_reversal_restores_funds_and_reputation() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let (escrow_client, freelancer, token_id, escrow_id) =
            setup_funded_escrow(&env, &admin, &client, 100_i128);
        let token_client = token::Client::new(&env, &token_id);

        client.request_cancellation(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "reason"),
        );

        advance(&env, CANCELLATION_DISPUTE_PERIOD + 1);
        client.execute_cancellation(&escrow_id);

        // Slash of 10 is held in contract (not yet sent to freelancer)
        assert_eq!(token_client.balance(&freelancer), 0_i128);

        // escrow_client disputes the slash within the slash dispute period
        client.dispute_slash(&escrow_client, &escrow_id);

        // Admin reverses the slash — funds returned to slashed user from contract
        client.resolve_slash_dispute(&admin, &escrow_id, &false);

        // Funds returned to slashed user (escrow_client had 90 refund + 10 slash returned = 100)
        assert_eq!(token_client.balance(&escrow_client), 100_i128);

        let rep = client.get_reputation(&escrow_client);
        assert_eq!(rep.slash_count, 0);
        assert_eq!(rep.total_slashed, 0_i128);
    }

    // ── Emergency Pause Tests ─────────────────────────────────────────────────

    /// Helper: create a funded escrow and return (env, admin, client_addr, freelancer, token_id, escrow_id, contract_client)
    fn setup_pause_escrow(
        amount: i128,
    ) -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        u64,
        EscrowContractClient<'static>,
    ) {
        let (env, admin, _, contract_client) = setup();
        contract_client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        let reserve = 2 * ContractStorage::reserve_for_entries(1);
        token_admin.mint(&escrow_client, &(amount + reserve));

        let escrow_id = contract_client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &amount,
            &BytesN::from_array(&env, &[0u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &MultisigConfig {
                approvers: soroban_sdk::Vec::new(&env),
                weights: soroban_sdk::Vec::new(&env),
                threshold: 0,
            },
        );

        (
            env,
            admin,
            escrow_client,
            freelancer,
            token_id,
            escrow_id,
            contract_client,
        )
    }

    #[test]
    fn test_pause_sets_state_and_emits_event() {
        let (env, admin, _, _, _, _, client) = setup_pause_escrow(100);
        assert!(!client.is_paused());
        client.pause(&admin);
        assert!(client.is_paused());
    }

    #[test]
    fn test_unpause_clears_state_and_emits_event() {
        let (env, admin, _, _, _, _, client) = setup_pause_escrow(100);
        client.pause(&admin);
        assert!(client.is_paused());
        client.unpause(&admin);
        assert!(!client.is_paused());
    }

    #[test]
    fn test_pause_is_idempotent() {
        let (env, admin, _, _, _, _, client) = setup_pause_escrow(100);
        client.pause(&admin);
        // Second pause should not panic
        client.pause(&admin);
        assert!(client.is_paused());
    }

    #[test]
    fn test_unpause_is_idempotent() {
        let (env, admin, _, _, _, _, client) = setup_pause_escrow(100);
        // Unpause on already-unpaused contract should not panic
        client.unpause(&admin);
        assert!(!client.is_paused());
    }

    #[test]
    #[should_panic]
    fn test_pause_non_admin_rejected() {
        let (env, admin, escrow_client, _, _, _, client) = setup_pause_escrow(100);
        // Non-admin cannot pause
        client.pause(&escrow_client);
    }

    #[test]
    #[should_panic]
    fn test_unpause_non_admin_rejected() {
        let (env, admin, escrow_client, _, _, _, client) = setup_pause_escrow(100);
        client.pause(&admin);
        // Non-admin cannot unpause
        client.unpause(&escrow_client);
    }

    #[test]
    #[should_panic]
    fn test_create_escrow_blocked_when_paused() {
        let (env, admin, escrow_client, freelancer, token_id, _, client) = setup_pause_escrow(100);
        client.pause(&admin);
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&escrow_client, &200_i128);
        client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &100_i128,
            &BytesN::from_array(&env, &[1u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &MultisigConfig {
                approvers: soroban_sdk::Vec::new(&env),
                weights: soroban_sdk::Vec::new(&env),
                threshold: 0,
            },
        );
    }

    #[test]
    #[should_panic]
    fn test_add_milestone_blocked_when_paused() {
        let (env, admin, escrow_client, _, _, escrow_id, client) = setup_pause_escrow(100);
        client.pause(&admin);
        client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "M1"),
            &BytesN::from_array(&env, &[0u8; 32]),
            &50_i128,
        );
    }

    #[test]
    #[should_panic]
    fn test_submit_milestone_blocked_when_paused() {
        let (env, admin, escrow_client, freelancer, _, escrow_id, client) = setup_pause_escrow(100);
        // Add milestone before pausing
        client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "M1"),
            &BytesN::from_array(&env, &[0u8; 32]),
            &50_i128,
        );
        client.pause(&admin);
        client.submit_milestone(&freelancer, &escrow_id, &0);
    }

    #[test]
    #[should_panic]
    fn test_approve_milestone_blocked_when_paused() {
        let (env, admin, escrow_client, freelancer, _, escrow_id, client) = setup_pause_escrow(100);
        client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "M1"),
            &BytesN::from_array(&env, &[0u8; 32]),
            &50_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &0);
        client.pause(&admin);
        client.approve_milestone(&escrow_client, &escrow_id, &0);
    }

    #[test]
    #[should_panic]
    fn test_cancel_escrow_blocked_when_paused() {
        let (env, admin, escrow_client, _, _, escrow_id, client) = setup_pause_escrow(100);
        client.pause(&admin);
        client.cancel_escrow(&escrow_client, &escrow_id);
    }

    #[test]
    #[should_panic]
    fn test_raise_dispute_blocked_when_paused() {
        let (env, admin, escrow_client, _, _, escrow_id, client) = setup_pause_escrow(100);
        client.pause(&admin);
        client.raise_dispute(&escrow_client, &escrow_id, &None);
    }

    #[test]
    #[should_panic]
    fn test_request_cancellation_blocked_when_paused() {
        let (env, admin, escrow_client, _, _, escrow_id, client) = setup_pause_escrow(100);
        client.pause(&admin);
        client.request_cancellation(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "reason"),
        );
    }

    /// View functions must remain accessible while paused.
    #[test]
    fn test_view_functions_work_when_paused() {
        let (env, admin, _, _, _, escrow_id, client) = setup_pause_escrow(100);
        client.pause(&admin);

        // All reads should succeed
        let _ = client.get_escrow(&escrow_id);
        let _ = client.escrow_count();
        let _ = client.is_paused();
    }

    /// Full pause → mutation blocked → unpause → mutation succeeds cycle.
    #[test]
    fn test_pause_unpause_cycle_restores_mutations() {
        let (env, admin, escrow_client, freelancer, _, escrow_id, client) = setup_pause_escrow(100);

        client.pause(&admin);
        assert!(client.is_paused());

        // Mutation blocked
        let result = client.try_add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "M1"),
            &BytesN::from_array(&env, &[0u8; 32]),
            &50_i128,
        );
        assert!(result.is_err(), "add_milestone should fail while paused");

        client.unpause(&admin);
        assert!(!client.is_paused());

        // Mutation succeeds after unpause
        let mid = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "M1"),
            &BytesN::from_array(&env, &[0u8; 32]),
            &50_i128,
        );
        assert_eq!(mid, 0);
    }
}
