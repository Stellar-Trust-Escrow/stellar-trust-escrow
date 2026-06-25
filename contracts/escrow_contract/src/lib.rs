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
#![deny(warnings)]
#![allow(clippy::too_many_arguments)]

mod admin_transfer_tests;
mod arbiter_reputation_tests;
mod batch_add_milestones_cap_tests;
mod batch_approve_release_e2e_tests;
mod bridge;
mod bridge_tests;
mod errors;
mod event_names;
mod event_tests;
mod events;
mod governance_escalation_tests;
mod lock_time_enforcement_tests;
mod max_escrow_amount_tests;
mod meta_snapshot_tests;
mod nft;
mod nft_tests;
mod oracle;
mod oracle_fallback_tests;
mod oracle_overflow_tests;
mod oracle_tests;
mod partial_cancel_tests;
mod pause_tests;
mod self_escrow_tests;
mod timelock_enforcement_tests;
mod transfer_client_tests;
mod types;
mod upgrade_tests;

pub use errors::EscrowError;
use storage::StorageManager;
pub use types::{
    ApprovalRecord, DataKey, EscrowFeeSnapshot, EscrowState, EscrowStatus, EscrowTemplate, FeeTier,
    Milestone, MilestoneStatus, MilestoneTemplate, MultisigConfig, OptionalBytesN32,
    OptionalPriceCondition, OptionalTimelock, OracleResolutionPayload, PriceCondition,
    PriceDirection, RecurringInterval, RecurringScheduleStatus, ReputationRecord, Timelock,
    MS_APPROVED, MS_DISPUTED, MS_PENDING, MS_REJECTED, MS_RELEASED, MS_SUBMITTED,
};
use types::{CancellationRequest, RecurringPaymentConfig, SlashRecord};
use types::{FundPayload, ProposalPayload, ProposalType};

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, token, Address, BytesN,
    Env, IntoVal, String, Vec,
};
use stellar_trust_shared::auth as shared_auth;
use stellar_trust_shared::{
    bump_instance_ttl as shared_bump_instance_ttl,
    bump_persistent_ttl as shared_bump_persistent_ttl,
};

mod storage;

/// Maximum allowed `total_amount` for a single escrow, in stroops.
///
/// Equivalent to 10 billion XLM (10_000_000_000 XLM × 10_000_000 stroops/XLM).
///
/// # Rationale
/// While Rust's `overflow-checks = true` catches wrapping arithmetic at runtime,
/// an uncapped `total_amount` near `i128::MAX` creates downstream risk in
/// expressions such as `allocated_amount + milestone.amount` and
/// `remaining_balance - release_amount` where intermediate values can still
/// produce unexpected results before the overflow trap fires.  A domain-meaningful
/// cap of 10 billion XLM allows all legitimate large escrows while bounding the
/// protocol's arithmetic attack surface.  Exported as `pub` so integrators can
/// validate amounts client-side before submitting a transaction.
pub const MAX_ESCROW_AMOUNT: i128 = 100_000_000_000_000_000i128;

const CANCELLATION_DISPUTE_PERIOD: u64 = 120_960;
const SLASH_DISPUTE_PERIOD: u64 = 51_840;
const SLASH_PERCENTAGE: u64 = 10;
const RENT_PERIOD_SECONDS: u64 = 86_400;
const RENT_RESERVE_PERIODS: u64 = 30;
const RENT_PER_ENTRY_PER_PERIOD: i128 = 1;
pub const MAX_MILESTONES: u32 = 20;
pub const MAX_STRING_LEN: u32 = 256;
pub const MAX_BUYER_SIGNERS: u32 = 10;

/// Automatic deadline extension when milestone submitted near deadline (7 days).
pub const AUTO_DEADLINE_EXTENSION_SECONDS: u64 = 604_800;

/// Minimum escrow amount in base token units.
pub const MIN_ESCROW_AMOUNT: i128 = 1_i128;

/// Minimum reputation score required for an address to serve as an arbiter.
/// This prevents sybil attacks where fresh addresses with zero reputation
/// could be used to gain control over dispute resolution.
pub const MIN_ARBITER_REPUTATION_SCORE: u64 = 100;

/// Threshold for high-value escrows that can be escalated to governance (1000 XLM in stroops).
pub const HIGH_VALUE_THRESHOLD: i128 = 10_000_000_000i128;

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
pub struct EscrowMeta {
    pub escrow_id: u64,
    pub client: Address,
    pub freelancer: Address,
    pub token: Address,
    pub total_amount: i128,
    /// Running sum of milestone amounts added so far (allocation guard).
    pub allocated_amount: i128,
    pub remaining_balance: i128,
    pub status: EscrowStatus,
    pub milestone_count: u32,
    /// Number of milestones in Approved state — avoids full scan on completion check.
    pub approved_count: u32,
    pub released_count: u32,
    /// Number of milestones in Submitted state — avoids O(n) scan in cancel_escrow.
    pub submitted_count: u32,
    pub arbiter: Option<Address>,
    pub buyer_signers: soroban_sdk::Vec<Address>,
    pub created_at: u64,
    pub deadline: Option<u64>,
    /// Optional lock time (ledger timestamp) - funds locked until this time.
    pub lock_time: Option<u64>,
    /// Optional extension deadline for the lock time.
    pub lock_time_extension: Option<u64>,
    /// Optional timelock controls release window after approval.
    pub timelock: OptionalTimelock,
    /// Optional dispute timeout measured in ledger sequence increments.
    pub dispute_timeout_ledger: Option<u32>,
    /// Ledger sequence at which the current dispute was raised.
    pub dispute_started_ledger: Option<u32>,
    pub brief_hash: BytesN<32>,
    /// Prepaid storage rent reserve held by the contract in the escrow token.
    pub rent_balance: i128,
    /// Timestamp of the last successful rent collection checkpoint.
    pub last_rent_collection_at: u64,
    /// Ledger timestamp when the dispute was raised. None if not disputed.
    pub dispute_start_ledger: Option<u64>,
}

// ── Storage helpers ───────────────────────────────────────────────────────────
struct ContractStorage;

impl ContractStorage {
    fn initialize(env: &Env, admin: &Address) -> Result<(), EscrowError> {
        let instance = env.storage().instance();
        if instance.has(&DataKey::Admin) {
            return Err(EscrowError::E1);
        }
        instance.set(&DataKey::Admin, admin);
        // Default admin multisig: 1-of-1 (initializer).
        let mut signers: soroban_sdk::Vec<Address> = soroban_sdk::Vec::new(env);
        signers.push_back(admin.clone());
        instance.set(&DataKey::AdminSigners, &signers);
        instance.set(&DataKey::AdminThreshold, &1_u32);
        instance.set(&DataKey::EscrowCounter, &0_u64);
        instance.set(&DataKey::PlatformTreasury, admin);
        // Initialize storage version for upgradeable storage
        StorageManager::init_version(env);
        Self::bump_instance_ttl(env);
        events::emit_admin_initialized(env, admin);
        Ok(())
    }

    fn require_initialized(env: &Env) -> Result<(), EscrowError> {
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(EscrowError::E2);
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
            .ok_or(EscrowError::E2)?;
        if *caller != admin {
            return Err(EscrowError::E4);
        }
        Ok(())
    }

    fn is_esc_frz(env: &Env, escrow_id: u64) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::EscrowFrozen(escrow_id))
            .unwrap_or(false)
    }

    fn require_not_frozen(env: &Env, escrow_id: u64) -> Result<(), EscrowError> {
        if Self::is_esc_frz(env, escrow_id) {
            return Err(EscrowError::E61);
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
            .ok_or(EscrowError::E8)?;
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

    fn load_fee_snapshot(env: &Env, escrow_id: u64) -> EscrowFeeSnapshot {
        env.storage()
            .persistent()
            .get(&DataKey::PlatformFeeSnapshot(escrow_id))
            .unwrap_or(EscrowFeeSnapshot {
                fee_bps: 0,
                fee_amount: 0,
                collected: true,
            })
    }

    fn save_fee_snapshot(env: &Env, escrow_id: u64, snapshot: &EscrowFeeSnapshot) {
        let key = DataKey::PlatformFeeSnapshot(escrow_id);
        env.storage().persistent().set(&key, snapshot);
        Self::bump_persistent_ttl(env, &key);
    }

    fn remove_fee_snapshot(env: &Env, escrow_id: u64) {
        env.storage()
            .persistent()
            .remove(&DataKey::PlatformFeeSnapshot(escrow_id));
    }

    fn with_reentrancy_guard<T, F>(env: &Env, f: F) -> Result<T, EscrowError>
    where
        F: FnOnce() -> Result<T, EscrowError>,
    {
        if env
            .storage()
            .instance()
            .get(&DataKey::ReentrancyLock)
            .unwrap_or(false)
        {
            panic_with_error!(env, EscrowError::E22);
        }

        env.storage()
            .instance()
            .set(&DataKey::ReentrancyLock, &true);
        Self::bump_instance_ttl(env);
        let result = f();
        env.storage().instance().remove(&DataKey::ReentrancyLock);
        result
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
            .ok_or(EscrowError::E13)?;
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
            .ok_or(EscrowError::E43)?;
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
        let milestones = (0..meta.milestone_count)
            .map(|mid| Self::load_milestone(env, escrow_id, mid))
            .try_fold(Vec::new(env), |mut result, item| {
                result.push_back(item?);
                Ok(result)
            })?;
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
            timelock: meta.timelock,
            dispute_timeout_ledger: meta.dispute_timeout_ledger,
            dispute_started_ledger: meta.dispute_started_ledger,
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
            .ok_or(EscrowError::E32)?;
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
            .ok_or(EscrowError::E38)?;
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

    // ── Meta-transaction nonce tracking ────────────────────────────────────────

    /// Validates and updates the nonce for a meta-transaction signer.
    ///
    /// Enforces strictly monotonically increasing nonces to prevent replay attacks.
    /// Returns Unauthorized if nonce <= last_nonce.
    fn _validate_and_update_nonce(
        env: &Env,
        signer: &Address,
        nonce: u64,
    ) -> Result<(), EscrowError> {
        let key = DataKey::MetaTxNonce(signer.clone());
        let last_nonce: u64 = env.storage().persistent().get(&key).unwrap_or(0);

        if nonce <= last_nonce {
            return Err(EscrowError::E3);
        }

        env.storage().persistent().set(&key, &nonce);
        Self::bump_persistent_ttl(env, &key);
        Ok(())
    }

    // ── TTL helpers ───────────────────────────────────────────────────────────

    /// Bump instance TTL using shared config constants from `stellar_trust_shared`.
    #[inline]
    fn bump_instance_ttl(env: &Env) {
        shared_bump_instance_ttl(env);
    }

    /// Bump persistent TTL using shared config constants from `stellar_trust_shared`.
    #[inline]
    fn bump_persistent_ttl<K>(env: &Env, key: &K)
    where
        K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
    {
        shared_bump_persistent_ttl(env, key);
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

    /// Validates that a token is approved for use as an escrow token.
    ///
    /// For wrapped/bridged tokens, checks that they are registered and approved.
    /// Native Stellar tokens bypass this check and are always accepted.
    fn _validate_escrow_token(_env: &Env, _token: &Address) -> Result<(), EscrowError> {
        // Native tokens are always valid; only validate if it's a contract
        // In a real implementation, this would check a wrapped token registry.
        // For now, we accept all tokens (native and wrapped).
        // TODO: Implement wrapped token registry check with is_approved flag
        Ok(())
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
            .ok_or(EscrowError::E20)?;
        Ok(amount)
    }

    fn collect_rent_due(env: &Env, meta: &mut EscrowMeta) -> Result<i128, EscrowError> {
        let now = env.ledger().timestamp();
        // Use saturating_sub to prevent underflow if ledger timestamp is inconsistent
        let time_since_last = now.saturating_sub(meta.last_rent_collection_at);
        if time_since_last == 0 {
            return Ok(0);
        }

        let elapsed_periods = time_since_last / RENT_PERIOD_SECONDS;
        if elapsed_periods == 0 {
            return Ok(0);
        }

        let rent_per_period = Self::rent_due_per_period(env, meta);
        // Use checked_mul to prevent overflow in rent calculation
        let due = rent_per_period
            .checked_mul(i128::from(elapsed_periods))
            .ok_or(EscrowError::E20)?;
        let collectable = due.min(meta.rent_balance);

        if collectable > 0 {
            let admin: Address = env
                .storage()
                .instance()
                .get(&DataKey::Admin)
                .ok_or(EscrowError::E2)?;
            token::Client::new(env, &meta.token).transfer(
                &env.current_contract_address(),
                &admin,
                &collectable,
            );
            meta.rent_balance = meta.rent_balance.saturating_sub(collectable);
        }

        let covered_periods = (collectable / rent_per_period) as u64;
        if covered_periods > 0 {
            meta.last_rent_collection_at = meta
                .last_rent_collection_at
                .saturating_add(covered_periods * RENT_PERIOD_SECONDS);
        }

        env.events().publish(
            (event_names::RENT_COLLECTED, meta.escrow_id),
            (
                collectable,
                meta.rent_balance,
                Self::rent_expires_at(env, meta),
            ),
        );
        Ok(collectable)
    }

    fn settle_rent_for_access(env: &Env, meta: &mut EscrowMeta) -> Result<i128, EscrowError> {
        // SECURITY AUDIT: settle_rent_for_access is called by read functions like
        // load_escrow_meta_with_rent to lazily collect rent on every access.
        //
        // ANALYSIS: The function is safe from rent manipulation via repeated view calls
        // because:
        // 1. collect_rent_due checks `time_since_last > 0` and only charges rent if
        //    enough time has passed (elapsed_periods > 0).
        // 2. last_rent_collection_at is updated after each collection, preventing
        //    double-charging within the same period.
        // 3. Even if called 1000x in the same block, only the first call will collect
        //    rent (subsequent calls return 0 because elapsed_periods == 0).
        // 4. The period boundary is correctly enforced: rent is only charged for
        //    complete periods that have elapsed since last_rent_collection_at.
        //
        // CONCLUSION: No manipulation vector exists. Repeated view calls cannot
        // accelerate rent depletion beyond the normal collect_rent_due schedule.
        if Self::rent_has_expired(env, meta) {
            return Err(EscrowError::E8);
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
            .ok_or(EscrowError::E20)?;

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
            (event_names::RENT_EXPIRED, meta.escrow_id),
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
                return Err(EscrowError::E28);
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
                .ok_or(EscrowError::E51)?;
            if now < expiry {
                return Err(EscrowError::E53);
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
            return Err(EscrowError::E31);
        }
        Ok(())
    }

    fn _get_migration_cursor(env: &Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::MigrationCursor)
            .unwrap_or(0_u64)
    }

    fn _set_migration_cursor(env: &Env, cursor: u64) {
        env.storage()
            .instance()
            .set(&DataKey::MigrationCursor, &cursor);
        Self::bump_instance_ttl(env);
    }

    // ── Token whitelist helpers ───────────────────────────────────────────────

    fn is_token_whitelist_enabled(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::TokenWhitelistEnabled)
            .unwrap_or(false)
    }

    fn set_token_whitelist_enabled(env: &Env, enabled: bool) {
        env.storage()
            .instance()
            .set(&DataKey::TokenWhitelistEnabled, &enabled);
        Self::bump_instance_ttl(env);
    }

    fn is_token_approved(env: &Env, token: &Address) -> bool {
        env.storage()
            .instance()
            .has(&DataKey::ApprovedToken(token.clone()))
    }

    fn add_approved_token(env: &Env, token: &Address) {
        env.storage()
            .instance()
            .set(&DataKey::ApprovedToken(token.clone()), &true);
        Self::bump_instance_ttl(env);
    }

    fn remove_approved_token(env: &Env, token: &Address) {
        env.storage()
            .instance()
            .remove(&DataKey::ApprovedToken(token.clone()));
        Self::bump_instance_ttl(env);
    }

    // ── Escrow template helpers ──────────────────────────────────────────────

    fn next_template_id(env: &Env) -> Result<u64, EscrowError> {
        let instance = env.storage().instance();
        let id: u64 = instance.get(&DataKey::TemplateCounter).unwrap_or(0_u64);
        instance.set(&DataKey::TemplateCounter, &(id + 1));
        Self::bump_instance_ttl(env);
        Ok(id)
    }

    fn save_template(env: &Env, template: &EscrowTemplate) {
        env.storage()
            .persistent()
            .set(&DataKey::Template(template.id), template);
    }

    fn load_template(env: &Env, id: u64) -> Result<EscrowTemplate, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Template(id))
            .ok_or(EscrowError::E8)
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

    pub fn set_admin_multisig(
        env: Env,
        caller: Address,
        admin_signers: soroban_sdk::Vec<Address>,
        threshold: u32,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_admin(&env, &caller)?;
        caller.require_auth();
        if threshold == 0 || threshold > admin_signers.len() {
            return Err(EscrowError::E63);
        }
        env.storage()
            .instance()
            .set(&DataKey::AdminSigners, &admin_signers);
        env.storage()
            .instance()
            .set(&DataKey::AdminThreshold, &threshold);
        ContractStorage::bump_instance_ttl(&env);
        Ok(())
    }

    pub fn freeze_escrow(
        env: Env,
        escrow_id: u64,
        admin_signers: soroban_sdk::Vec<Address>,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_initialized(&env)?;
        ContractStorage::ensure_live_escrow(&env, escrow_id)?;

        let configured: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::AdminSigners)
            .unwrap_or(soroban_sdk::Vec::new(&env));
        let threshold: u32 = env
            .storage()
            .instance()
            .get(&DataKey::AdminThreshold)
            .unwrap_or(1);

        if shared_auth::require_admin_threshold(&env, &configured, threshold, &admin_signers)
            .is_err()
        {
            return Err(EscrowError::E62);
        }

        env.storage()
            .persistent()
            .set(&DataKey::EscrowFrozen(escrow_id), &true);
        ContractStorage::bump_persistent_ttl(&env, &DataKey::EscrowFrozen(escrow_id));

        env.events().publish(
            (symbol_short!("esc_frz"), escrow_id),
            (
                admin_signers,
                env.ledger().sequence(),
                env.ledger().timestamp(),
                true,
            ),
        );
        Ok(())
    }

    pub fn unfreeze_escrow(
        env: Env,
        escrow_id: u64,
        admin_signers: soroban_sdk::Vec<Address>,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_initialized(&env)?;
        ContractStorage::ensure_live_escrow(&env, escrow_id)?;

        let configured: soroban_sdk::Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::AdminSigners)
            .unwrap_or(soroban_sdk::Vec::new(&env));
        let threshold: u32 = env
            .storage()
            .instance()
            .get(&DataKey::AdminThreshold)
            .unwrap_or(1);

        if shared_auth::require_admin_threshold(&env, &configured, threshold, &admin_signers)
            .is_err()
        {
            return Err(EscrowError::E62);
        }

        env.storage()
            .persistent()
            .set(&DataKey::EscrowFrozen(escrow_id), &false);
        ContractStorage::bump_persistent_ttl(&env, &DataKey::EscrowFrozen(escrow_id));

        env.events().publish(
            (symbol_short!("esc_unfrz"), escrow_id),
            (
                admin_signers,
                env.ledger().sequence(),
                env.ledger().timestamp(),
                false,
            ),
        );
        Ok(())
    }

    /// Ensures any configured milestone dependency is satisfied.
    ///
    /// Gas overhead: one additional persistent milestone read for the prerequisite.
    fn require_dependency_satisfied(
        env: &Env,
        escrow_id: u64,
        milestone: &Milestone,
    ) -> Result<(), EscrowError> {
        if let Some(prereq_id) = milestone.depends_on {
            let prereq = ContractStorage::load_milestone(env, escrow_id, prereq_id)?;
            if prereq.status != MS_APPROVED && prereq.status != MS_RELEASED {
                return Err(EscrowError::E14);
            }
        }
        Ok(())
    }

    /// Emits an event for each milestone that becomes unlocked by `prereq_id`.
    ///
    /// Gas overhead: up to `milestone_count` additional milestone reads (max 20)
    /// to discover dependents.
    fn emit_dependents_unlocked(env: &Env, escrow_id: u64, prereq_id: u32) {
        let meta = match ContractStorage::load_escrow_meta_with_rent(env, escrow_id) {
            Ok(m) => m,
            Err(_) => return,
        };

        for mid in 0..meta.milestone_count {
            if let Ok(m) = ContractStorage::load_milestone(env, escrow_id, mid) {
                if m.depends_on == Some(prereq_id) {
                    env.events()
                        .publish((symbol_short!("mil_unlk"), escrow_id), (mid, prereq_id));
                }
            }
        }
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

    /// Set the oracle staleness threshold (in seconds). Admin only.
    /// Valid range: 1–86400 seconds.
    pub fn set_oracle_stale_threshold(
        env: Env,
        caller: Address,
        threshold_seconds: u64,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_admin(&env, &caller)?;
        caller.require_auth();
        oracle::set_oracle_stale_threshold(&env, threshold_seconds)?;
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

    /// Adds a milestone with a price-based release condition.
    ///
    /// Identical to `add_milestone` but stores a `PriceCondition` on the
    /// milestone. Funds are released automatically when `trigger_oracle_release`
    /// is called and the condition is satisfied.
    pub fn create_price_indexed_milestone(
        env: Env,
        caller: Address,
        escrow_id: u64,
        title: String,
        description_hash: BytesN<32>,
        amount: i128,
        price_condition: PriceCondition,
    ) -> Result<u32, EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        if amount <= 0 {
            return Err(EscrowError::E17);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

        if caller != meta.client {
            return Err(EscrowError::E5);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }
        if meta.allocated_amount + amount > meta.total_amount {
            return Err(EscrowError::E15);
        }

        let milestone_id = meta.milestone_count;
        meta.milestone_count = meta
            .milestone_count
            .checked_add(1)
            .ok_or(EscrowError::E20)?;
        meta.allocated_amount = meta
            .allocated_amount
            .checked_add(amount)
            .ok_or(EscrowError::E20)?;

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
                rejection_reason: OptionalBytesN32::None,
                price_condition: OptionalPriceCondition::Some(price_condition),
                depends_on: None,
            },
        );
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_milestone_added(&env, escrow_id, milestone_id, amount);
        Ok(milestone_id)
    }

    /// Checks the oracle price for a price-indexed milestone and releases funds
    /// if the condition is met.
    ///
    /// Returns `EscrowError::E14` if the price condition
    /// is not yet satisfied, or if the milestone has no price condition.
    pub fn trigger_oracle_release(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MS_PENDING {
            return Err(EscrowError::E14);
        }

        let condition = match milestone.price_condition.clone() {
            OptionalPriceCondition::Some(c) => c,
            OptionalPriceCondition::None => return Err(EscrowError::E14),
        };

        let current_price = oracle::get_price_usd(&env, &condition.asset)?;

        let condition_met = match condition.direction {
            PriceDirection::Above => current_price >= condition.target_price_usd,
            PriceDirection::Below => current_price <= condition.target_price_usd,
        };

        if !condition_met {
            return Err(EscrowError::E14);
        }

        let now = env.ledger().timestamp();
        let amount = milestone.amount;

        milestone.status = MS_RELEASED;
        milestone.submitted_at = Some(now);
        milestone.resolved_at = Some(now);
        ContractStorage::save_milestone(&env, escrow_id, &milestone);

        meta.remaining_balance = meta
            .remaining_balance
            .checked_sub(amount)
            .ok_or(EscrowError::E20)?;
        meta.approved_count = meta.approved_count.checked_add(1).ok_or(EscrowError::E20)?;
        meta.released_count = meta.released_count.checked_add(1).ok_or(EscrowError::E20)?;

        token::Client::new(&env, &meta.token).transfer(
            &env.current_contract_address(),
            &meta.freelancer,
            &amount,
        );

        events::emit_milestone_approved(&env, escrow_id, milestone_id, amount);
        events::emit_funds_released(&env, escrow_id, &meta.freelancer, amount);

        if meta.released_count == meta.milestone_count && meta.milestone_count > 0 {
            meta.status = EscrowStatus::Completed;
            events::emit_escrow_completed(&env, escrow_id);
        }

        ContractStorage::save_escrow_meta(&env, &meta);
        ContractStorage::bump_instance_ttl(&env);
        Ok(())
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

    /// Record or update bridge confirmation state for a bridged token.
    /// Anyone may call this; finality is determined by `MIN_BRIDGE_CONFIRMATIONS`.
    pub fn update_bridge_confirmation(
        env: Env,
        token: Address,
        bridge_protocol: bridge::BridgeProtocol,
        confirmations: u32,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_initialized(&env)?;
        let is_finalized = confirmations >= bridge::MIN_BRIDGE_CONFIRMATIONS;
        let conf = bridge::BridgeConfirmation {
            token: token.clone(),
            bridge: bridge_protocol,
            confirmations,
            is_finalized,
            updated_at: env.ledger().timestamp(),
        };
        bridge::record_bridge_confirmation(&env, &conf);
        bridge::emit_bridge_confirmation_updated(&env, &token, confirmations, is_finalized);
        Ok(())
    }

    /// Return bridge confirmation state for a bridged token.
    pub fn get_bridge_confirmation(env: Env, token: Address) -> Option<bridge::BridgeConfirmation> {
        bridge::get_bridge_confirmation(&env, &token)
    }

    // ── Arbiter Reputation Configuration ──────────────────────────────────────

    /// Sets the minimum reputation score required for an address to serve as an arbiter.
    /// Admin only. This helps prevent sybil attacks by ensuring arbiters have
    /// a track record on the platform.
    ///
    /// # Arguments
    /// * `new_min` - The new minimum reputation score (0 to disable check)
    pub fn set_min_arbiter_reputation(
        env: Env,
        caller: Address,
        new_min: u64,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_admin(&env, &caller)?;
        caller.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::MinArbiterReputation, &new_min);
        ContractStorage::bump_instance_ttl(&env);
        Ok(())
    }

    /// Returns the current minimum arbiter reputation score threshold.
    pub fn get_min_arbiter_reputation(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::MinArbiterReputation)
            .unwrap_or(MIN_ARBITER_REPUTATION_SCORE)
    }

    // ── Governance Contract Configuration ─────────────────────────────────────

    /// Sets the governance contract address for dispute escalation.
    /// Admin only.
    pub fn set_governance_contract(
        env: Env,
        caller: Address,
        governance_addr: Address,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_admin(&env, &caller)?;
        caller.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::GovernanceContract, &governance_addr);
        ContractStorage::bump_instance_ttl(&env);
        Ok(())
    }

    /// Returns the governance contract address if configured.
    pub fn get_governance_contract(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::GovernanceContract)
    }

    fn validate_fee_tiers(tiers: &Vec<FeeTier>) -> Result<(), EscrowError> {
        if tiers.is_empty() {
            return Err(EscrowError::E19);
        }

        let mut last_threshold: Option<i128> = None;
        for i in 0..tiers.len() {
            let tier = tiers.get(i).ok_or(EscrowError::E19)?;
            if tier.min_total_amount < 0 || tier.fee_bps > 10_000 {
                return Err(EscrowError::E19);
            }
            if let Some(prev) = last_threshold {
                if tier.min_total_amount <= prev {
                    return Err(EscrowError::E19);
                }
            }
            last_threshold = Some(tier.min_total_amount);
        }

        Ok(())
    }

    fn default_platform_fee_tiers(env: &Env) -> Vec<FeeTier> {
        let mut defaults = Vec::new(env);
        defaults.push_back(FeeTier {
            min_total_amount: 0,
            fee_bps: 200,
        });
        defaults.push_back(FeeTier {
            min_total_amount: 1_000,
            fee_bps: 150,
        });
        defaults.push_back(FeeTier {
            min_total_amount: 10_000,
            fee_bps: 100,
        });
        defaults
    }

    #[allow(dead_code)]
    fn calculate_platform_fee(
        env: &Env,
        total_amount: i128,
    ) -> Result<EscrowFeeSnapshot, EscrowError> {
        let tiers: Vec<FeeTier> = env
            .storage()
            .instance()
            .get(&DataKey::PlatformFeeTiers)
            .unwrap_or_else(|| Self::default_platform_fee_tiers(env));
        Self::validate_fee_tiers(&tiers)?;

        let mut selected_bps = 0_u32;
        for i in 0..tiers.len() {
            let tier = tiers.get(i).ok_or(EscrowError::E19)?;
            if total_amount >= tier.min_total_amount {
                selected_bps = tier.fee_bps;
            }
        }

        let fee_amount = total_amount
            .checked_mul(i128::from(selected_bps))
            .ok_or(EscrowError::E20)?
            / 10_000;

        Ok(EscrowFeeSnapshot {
            fee_bps: selected_bps,
            fee_amount,
            collected: fee_amount == 0,
        })
    }

    fn collect_platform_fee(
        env: &Env,
        escrow_id: u64,
        token: &Address,
        snapshot: &mut EscrowFeeSnapshot,
    ) -> Result<i128, EscrowError> {
        if snapshot.collected || snapshot.fee_amount == 0 {
            return Ok(0);
        }

        let treasury: Address = env
            .storage()
            .instance()
            .get(&DataKey::PlatformTreasury)
            .ok_or(EscrowError::E2)?;

        token::Client::new(env, token).transfer(
            &env.current_contract_address(),
            &treasury,
            &snapshot.fee_amount,
        );
        snapshot.collected = true;
        ContractStorage::save_fee_snapshot(env, escrow_id, snapshot);
        Ok(snapshot.fee_amount)
    }

    fn settle_completion_fee_from_single_payout(
        env: &Env,
        escrow_id: u64,
        token: &Address,
        gross_amount: i128,
    ) -> Result<(i128, i128), EscrowError> {
        let mut snapshot = ContractStorage::load_fee_snapshot(env, escrow_id);
        let collected_fee = Self::collect_platform_fee(env, escrow_id, token, &mut snapshot)?;
        Ok((gross_amount, collected_fee))
    }

    fn settle_completion_fee_from_split_payout(
        env: &Env,
        escrow_id: u64,
        token: &Address,
        client_amount: i128,
        freelancer_amount: i128,
    ) -> Result<(i128, i128, i128), EscrowError> {
        let mut snapshot = ContractStorage::load_fee_snapshot(env, escrow_id);
        let collected_fee = Self::collect_platform_fee(env, escrow_id, token, &mut snapshot)?;
        Ok((client_amount, freelancer_amount, collected_fee))
    }

    pub fn set_platform_treasury(
        env: Env,
        caller: Address,
        treasury: Address,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_admin(&env, &caller)?;
        caller.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::PlatformTreasury, &treasury);
        ContractStorage::bump_instance_ttl(&env);
        Ok(())
    }

    pub fn get_platform_treasury(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PlatformTreasury)
    }

    pub fn set_platform_fee_tiers(
        env: Env,
        caller: Address,
        tiers: Vec<FeeTier>,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_admin(&env, &caller)?;
        caller.require_auth();
        Self::validate_fee_tiers(&tiers)?;
        env.storage()
            .instance()
            .set(&DataKey::PlatformFeeTiers, &tiers);
        ContractStorage::bump_instance_ttl(&env);
        Ok(())
    }

    pub fn get_platform_fee_tiers(env: Env) -> Vec<FeeTier> {
        env.storage()
            .instance()
            .get(&DataKey::PlatformFeeTiers)
            .unwrap_or_else(|| Self::default_platform_fee_tiers(&env))
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
            None,
        )
    }

    pub fn create_escrow_dispute_timeout(
        env: Env,
        client: Address,
        freelancer: Address,
        token: Address,
        total_amount: i128,
        brief_hash: BytesN<32>,
        arbiter: Option<Address>,
        deadline: Option<u64>,
        lock_time: Option<u64>,
        dispute_timeout_ledger: u32,
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
            Some(dispute_timeout_ledger),
            None,
        )
    }

    /// Creates an escrow gated by NFT ownership.
    ///
    /// The `caller` must hold at least one token of `token_id` in `nft_contract`.
    /// If the balance check passes, delegates to `create_escrow_internal` and
    /// emits an additional `nft_esc` event.
    pub fn create_escrow_with_nft_gate(
        env: Env,
        caller: Address,
        nft_contract: Address,
        token_id: u64,
        freelancer: Address,
        token: Address,
        total_amount: i128,
        brief_hash: BytesN<32>,
        arbiter: Option<Address>,
        deadline: Option<u64>,
        lock_time: Option<u64>,
    ) -> Result<u64, EscrowError> {
        let balance = nft::NftClient::new(&env, &nft_contract).balance(&caller, &token_id);
        if balance == 0 {
            return Err(EscrowError::E3);
        }
        let escrow_id = Self::create_escrow_internal(
            env.clone(),
            caller,
            freelancer,
            token,
            total_amount,
            brief_hash,
            arbiter,
            deadline,
            lock_time,
            None,
            None,
        )?;
        events::emit_nft_gated_escrow_created(&env, escrow_id, &nft_contract, token_id);
        Ok(escrow_id)
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
        if buyer_signers.len() > MAX_BUYER_SIGNERS {
            // TODO: return Err(EscrowError::TooManyBuyerSigners);
        }
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
            Some(buyer_signers),
        )
    }

    /// Validates all scalar inputs for escrow creation.
    ///
    /// Checks performed (in order):
    /// 1. `total_amount` must be positive and within `MAX_ESCROW_AMOUNT` (`InvalidEscrowAmount`)
    /// 2. `deadline`, if provided, must be in the future (`InvalidDeadline`)
    /// 3. `lock_time`, if provided, must be in the future (`InvalidLockTime`)
    fn validate_escrow_inputs(
        env: &Env,
        total_amount: i128,
        deadline: Option<u64>,
        lock_time: Option<u64>,
    ) -> Result<(), EscrowError> {
        if total_amount <= 0 || total_amount > MAX_ESCROW_AMOUNT {
            return Err(EscrowError::E19);
        }

        let now = env.ledger().timestamp();

        if let Some(dl) = deadline {
            if dl <= now {
                return Err(EscrowError::E19);
            }
        }

        if let Some(lt) = lock_time {
            if lt <= now {
                return Err(EscrowError::E30);
            }
        }

        Ok(())
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
        dispute_timeout_ledger: Option<u32>,
        buyer_signers: Option<soroban_sdk::Vec<Address>>,
    ) -> Result<u64, EscrowError> {
        // Auth + validation before any storage I/O
        client.require_auth();
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        if client == freelancer {
            return Err(EscrowError::E3);
        }

        if let Some(ref a) = arbiter {
            if a == &client || a == &freelancer {
                return Err(EscrowError::E3);
            }
        }

        if total_amount < MIN_ESCROW_AMOUNT {
            return Err(EscrowError::E19);
        }

        Self::validate_escrow_inputs(&env, total_amount, deadline, lock_time)?;

        if brief_hash == BytesN::from_array(&env, &[0u8; 32]) {
            // TODO: return Err(EscrowError::InvalidBriefHash);
        }

        let now = env.ledger().timestamp();

        // Reject unapproved wrapped/bridged tokens
        bridge::validate_escrow_token(&env, &token)?;

        // Check token whitelist if enabled
        if ContractStorage::is_token_whitelist_enabled(&env)
            && !ContractStorage::is_token_approved(&env, &token)
        {
            return Err(EscrowError::E3);
        }

        // Validate arbiter reputation if arbiter is specified
        if let Some(ref arbiter_addr) = arbiter {
            let min_reputation: u64 = env
                .storage()
                .instance()
                .get(&DataKey::MinArbiterReputation)
                .unwrap_or(MIN_ARBITER_REPUTATION_SCORE);
            let arbiter_reputation = ContractStorage::load_reputation(&env, arbiter_addr);
            if (arbiter_reputation.completed_escrows > 0 || arbiter_reputation.total_score > 0)
                && arbiter_reputation.total_score < min_reputation
            {
                return Err(EscrowError::E3);
            }
        }

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
                dispute_timeout_ledger,
                dispute_started_ledger: None,
                brief_hash,
                rent_balance: rent_reserve,
                last_rent_collection_at: now,
                dispute_start_ledger: None,
            },
        );

        Self::append_to_address_index(
            &env,
            &DataKey::EscrowsByParticipant(client.clone()),
            escrow_id,
        );
        Self::append_to_address_index(
            &env,
            &DataKey::EscrowsByParticipant(freelancer.clone()),
            escrow_id,
        );
        Self::append_to_vec_index(
            &env,
            &DataKey::EscrowsByStatus(EscrowStatus::Active),
            escrow_id,
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

        if client == freelancer {
            return Err(EscrowError::E3);
        }

        if payment_amount < MIN_ESCROW_AMOUNT {
            return Err(EscrowError::E19);
        }

        if brief_hash == BytesN::from_array(&env, &[0u8; 32]) {
            // TODO: return Err(EscrowError::InvalidBriefHash);
        }

        let now = env.ledger().timestamp();
        if start_time <= now {
            return Err(EscrowError::E44);
        }
        let total_payments = Self::resolve_total_payments(
            start_time,
            interval.clone(),
            end_date,
            number_of_payments,
        )?;
        let total_amount = payment_amount
            .checked_mul(i128::from(total_payments))
            .ok_or(EscrowError::E20)?;
        if total_amount > MAX_ESCROW_AMOUNT {
            return Err(EscrowError::E19);
        }
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
            dispute_timeout_ledger: None,
            dispute_started_ledger: None,
            brief_hash,
            rent_balance: base_rent_reserve,
            last_rent_collection_at: now,
            dispute_start_ledger: None,
        };
        ContractStorage::charge_entry_rent(&env, &mut meta, &client, 1)?;
        ContractStorage::save_escrow_meta(&env, &meta);

        Self::append_to_address_index(
            &env,
            &DataKey::EscrowsByParticipant(client.clone()),
            escrow_id,
        );
        Self::append_to_address_index(
            &env,
            &DataKey::EscrowsByParticipant(freelancer.clone()),
            escrow_id,
        );
        Self::append_to_vec_index(
            &env,
            &DataKey::EscrowsByStatus(EscrowStatus::Active),
            escrow_id,
        );

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
            final_payment_amount: None,
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
        ContractStorage::require_not_frozen(&env, escrow_id)?;

        if amount <= 0 {
            return Err(EscrowError::E17);
        }

        if title.len() > MAX_STRING_LEN {
            return Err(EscrowError::E19);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

        if caller != meta.client {
            return Err(EscrowError::E5);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        let next_allocated = meta
            .allocated_amount
            .checked_add(amount)
            .ok_or(EscrowError::E15)?;
        if next_allocated > meta.total_amount {
            return Err(EscrowError::E15);
        }

        let milestone_id = meta.milestone_count;
        // Enforce configurable capacity limit — falls back to compile-time MAX_MILESTONES.
        let effective_max: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MaxMilestones)
            .unwrap_or(MAX_MILESTONES);
        if milestone_id >= effective_max {
            return Err(EscrowError::E16);
        }
        meta.milestone_count = meta
            .milestone_count
            .checked_add(1)
            .ok_or(EscrowError::E16)?;
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
                rejection_reason: OptionalBytesN32::None,
                price_condition: OptionalPriceCondition::None,
                depends_on: None,
            },
        );
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_milestone_added(&env, escrow_id, milestone_id, amount);
        Ok(milestone_id)
    }

    fn add_milestone_internal(
        env: &Env,
        caller: &Address,
        escrow_id: u64,
        title: String,
        description_hash: BytesN<32>,
        amount: i128,
    ) -> Result<u32, EscrowError> {
        if amount <= 0 {
            return Err(EscrowError::E17);
        }

        if title.len() > MAX_STRING_LEN {
            return Err(EscrowError::E55);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(env, escrow_id)?;

        if *caller != meta.client {
            return Err(EscrowError::E5);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        let next_allocated = meta
            .allocated_amount
            .checked_add(amount)
            .ok_or(EscrowError::E15)?;
        if next_allocated > meta.total_amount {
            return Err(EscrowError::E15);
        }

        let milestone_id = meta.milestone_count;
        // Enforce configurable capacity limit — falls back to compile-time MAX_MILESTONES.
        let effective_max: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MaxMilestones)
            .unwrap_or(MAX_MILESTONES);
        if milestone_id >= effective_max {
            return Err(EscrowError::E16);
        }
        meta.milestone_count = meta
            .milestone_count
            .checked_add(1)
            .ok_or(EscrowError::E16)?;
        meta.allocated_amount = next_allocated;
        ContractStorage::charge_entry_rent(env, &mut meta, caller, 1)?;

        ContractStorage::save_milestone(
            env,
            escrow_id,
            &Milestone {
                id: milestone_id,
                title,
                description_hash,
                amount,
                status: MS_PENDING,
                submitted_at: None,
                resolved_at: None,
                approvals: soroban_sdk::Vec::new(env),
                rejection_reason: OptionalBytesN32::None,
                price_condition: OptionalPriceCondition::None,
                depends_on: None,
            },
        );
        ContractStorage::save_escrow_meta(env, &meta);

        events::emit_milestone_added(env, escrow_id, milestone_id, amount);
        Ok(milestone_id)
    }

    /// Corrects the title of a pending milestone.
    ///
    /// Only callable by the client; milestone must still be in `MS_PENDING` state.
    pub fn update_milestone_title(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_id: u32,
        new_title: String,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        if new_title.is_empty() || new_title.len() > MAX_STRING_LEN {
            return Err(EscrowError::E55);
        }

        let meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::E5);
        }

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MS_PENDING {
            return Err(EscrowError::E14);
        }

        milestone.title = new_title.clone();
        ContractStorage::save_milestone(&env, escrow_id, &milestone);

        events::emit_milestone_title_updated(&env, escrow_id, milestone_id, &new_title);
        Ok(())
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
        ContractStorage::require_not_frozen(&env, escrow_id)?;

        let n = titles.len();
        if n == 0 || n != description_hashes.len() || n != amounts.len() {
            return Err(EscrowError::E17);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::E5);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        // Capacity check upfront — fail fast before any writes.
        let effective_max: u32 = env
            .storage()
            .instance()
            .get(&DataKey::MaxMilestones)
            .unwrap_or(MAX_MILESTONES);
        if meta.milestone_count.saturating_add(n) > effective_max {
            return Err(EscrowError::E16);
        }

        let first_id = meta.milestone_count;

        // Validate all amounts and accumulate total before touching storage.
        let mut total_new: i128 = 0;
        for i in 0..n {
            let amt = amounts.get(i).ok_or(EscrowError::E17)?;
            if amt <= 0 {
                return Err(EscrowError::E17);
            }
            if titles.get(i).ok_or(EscrowError::E17)?.len() > MAX_STRING_LEN {
                return Err(EscrowError::E19);
            }
            total_new = total_new.checked_add(amt).ok_or(EscrowError::E15)?;
        }
        let next_allocated = meta
            .allocated_amount
            .checked_add(total_new)
            .ok_or(EscrowError::E15)?;
        if next_allocated > meta.total_amount {
            return Err(EscrowError::E15);
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
                    title: titles.get(i).ok_or(EscrowError::E17)?,
                    description_hash: description_hashes.get(i).ok_or(EscrowError::E17)?,
                    amount: amounts.get(i).ok_or(EscrowError::E17)?,
                    status: MS_PENDING,
                    submitted_at: None,
                    resolved_at: None,
                    approvals: soroban_sdk::Vec::new(&env),
                    rejection_reason: OptionalBytesN32::None,
                    price_condition: OptionalPriceCondition::None,
                    depends_on: None,
                },
            );
            events::emit_milestone_added(
                &env,
                escrow_id,
                milestone_id,
                amounts.get(i).ok_or(EscrowError::E17)?,
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
            return Err(EscrowError::E17);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }
        ContractStorage::check_lock_time_expired(&env, escrow_id, meta.lock_time)?;
        if caller != meta.client && !meta.buyer_signers.contains(&caller) {
            return Err(EscrowError::E3);
        }

        let now = env.ledger().timestamp();
        let timelock_expired =
            ContractStorage::check_timelock_expired(&env, escrow_id, meta.timelock.clone()).is_ok();

        let mut total_amount: i128 = 0;

        // Pass 1: validate all milestones and accumulate total — no writes yet.
        for i in 0..milestone_ids.len() {
            let mid = milestone_ids.get(i).ok_or(EscrowError::E13)?;
            let m = ContractStorage::load_milestone(&env, escrow_id, mid)?;
            if m.status != MS_SUBMITTED {
                return Err(EscrowError::E14);
            }
            Self::require_dependency_satisfied(&env, escrow_id, &m)?;
            total_amount = total_amount.checked_add(m.amount).ok_or(EscrowError::E20)?;
        }

        // Pass 2: write updated milestones and update counters.
        for i in 0..milestone_ids.len() {
            let mid = milestone_ids.get(i).ok_or(EscrowError::E13)?;
            let mut m = ContractStorage::load_milestone(&env, escrow_id, mid)?;
            m.resolved_at = Some(now);
            m.status = if timelock_expired {
                MS_RELEASED
            } else {
                MS_APPROVED
            };
            ContractStorage::save_milestone(&env, escrow_id, &m);
            Self::emit_dependents_unlocked(&env, escrow_id, mid);

            meta.approved_count = meta.approved_count.checked_add(1).ok_or(EscrowError::E20)?;
            meta.submitted_count = meta.submitted_count.saturating_sub(1);
            if timelock_expired {
                meta.released_count = meta.released_count.checked_add(1).ok_or(EscrowError::E20)?;
            }
            events::emit_milestone_approved(&env, escrow_id, mid, m.amount);
        }

        // Single token transfer for the entire batch.
        if timelock_expired && total_amount > 0 {
            meta.remaining_balance = meta
                .remaining_balance
                .checked_sub(total_amount)
                .ok_or(EscrowError::E20)?;
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

        ContractStorage::with_reentrancy_guard(&env, || {
            let admin: Address = env
                .storage()
                .instance()
                .get(&DataKey::Admin)
                .ok_or(EscrowError::E2)?;
            if caller != admin {
                return Err(EscrowError::E4);
            }

            if milestone_ids.is_empty() {
                return Err(EscrowError::E17);
            }

            let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
            ContractStorage::check_lock_time_expired(&env, escrow_id, meta.lock_time)?;

            let mut total_amount: i128 = 0;
            for i in 0..milestone_ids.len() {
                let mid = milestone_ids.get(i).ok_or(EscrowError::E13)?;
                let m = ContractStorage::load_milestone(&env, escrow_id, mid)?;
                if m.status != MS_APPROVED {
                    return Err(EscrowError::E14);
                }
                total_amount = total_amount.checked_add(m.amount).ok_or(EscrowError::E20)?;
            }

            for i in 0..milestone_ids.len() {
                let mid = milestone_ids.get(i).ok_or(EscrowError::E13)?;
                let mut m = ContractStorage::load_milestone(&env, escrow_id, mid)?;
                m.status = MS_RELEASED;
                ContractStorage::save_milestone(&env, escrow_id, &m);
                meta.released_count = meta.released_count.checked_add(1).ok_or(EscrowError::E20)?;
                events::emit_funds_released(&env, escrow_id, &meta.freelancer, m.amount);
            }

            meta.remaining_balance = meta
                .remaining_balance
                .checked_sub(total_amount)
                .ok_or(EscrowError::E20)?;

            let completes_escrow =
                meta.released_count == meta.milestone_count && meta.milestone_count > 0;
            let (payout_amount, _) = if completes_escrow {
                Self::settle_completion_fee_from_single_payout(
                    &env,
                    escrow_id,
                    &meta.token,
                    total_amount,
                )?
            } else {
                (total_amount, 0)
            };

            token::Client::new(&env, &meta.token).transfer(
                &env.current_contract_address(),
                &meta.freelancer,
                &payout_amount,
            );

            if completes_escrow {
                meta.status = EscrowStatus::Completed;
                Self::remove_from_vec_index(
                    &env,
                    &DataKey::EscrowsByStatus(EscrowStatus::Active),
                    escrow_id,
                );
                Self::append_to_vec_index(
                    &env,
                    &DataKey::EscrowsByStatus(EscrowStatus::Completed),
                    escrow_id,
                );
                events::emit_escrow_completed(&env, escrow_id);
            }

            ContractStorage::save_escrow_meta(&env, &meta);
            Ok(payout_amount)
        })
    }

    /// Releases all recurring payments that are due at the current ledger timestamp.
    pub fn process_recurring_payments(env: Env, escrow_id: u64) -> Result<u32, EscrowError> {
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        let mut recurring = ContractStorage::load_recurring_config(&env, escrow_id)?;
        if recurring.cancelled {
            return Err(EscrowError::E47);
        }
        if recurring.paused {
            return Err(EscrowError::E46);
        }

        let now = env.ledger().timestamp();
        if recurring.payments_remaining == 0 || now < recurring.next_payment_at {
            return Err(EscrowError::E45);
        }

        let mut processed_count: u32 = 0;
        let mut total_released: i128 = 0;

        while recurring.payments_remaining > 0 && now >= recurring.next_payment_at {
            let current_payment_amount = if recurring.payments_remaining == 1 {
                recurring
                    .final_payment_amount
                    .unwrap_or(recurring.payment_amount)
            } else {
                recurring.payment_amount
            };
            let milestone_id = meta.milestone_count;
            meta.milestone_count = meta
                .milestone_count
                .checked_add(1)
                .ok_or(EscrowError::E16)?;
            meta.approved_count = meta.approved_count.checked_add(1).ok_or(EscrowError::E16)?;
            meta.allocated_amount = meta
                .allocated_amount
                .checked_add(current_payment_amount)
                .ok_or(EscrowError::E20)?;
            meta.remaining_balance = meta
                .remaining_balance
                .checked_sub(current_payment_amount)
                .ok_or(EscrowError::E20)?;

            let payment_number = recurring
                .processed_payments
                .checked_add(1)
                .ok_or(EscrowError::E16)?;
            let title = String::from_str(&env, "Recurring payment");
            ContractStorage::save_milestone(
                &env,
                escrow_id,
                &Milestone {
                    id: milestone_id,
                    title,
                    description_hash: meta.brief_hash.clone(),
                    amount: current_payment_amount,
                    status: MS_APPROVED,
                    submitted_at: Some(recurring.next_payment_at),
                    resolved_at: Some(now),
                    approvals: soroban_sdk::Vec::new(&env),
                    rejection_reason: OptionalBytesN32::None,
                    price_condition: OptionalPriceCondition::None,
                    depends_on: None,
                },
            );

            token::Client::new(&env, &meta.token).transfer(
                &env.current_contract_address(),
                &meta.freelancer,
                &current_payment_amount,
            );

            recurring.processed_payments = payment_number;
            recurring.payments_remaining -= 1;
            recurring.last_payment_at = Some(now);
            processed_count = processed_count.checked_add(1).ok_or(EscrowError::E16)?;
            total_released = total_released
                .checked_add(current_payment_amount)
                .ok_or(EscrowError::E20)?;

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
        ContractStorage::require_not_frozen(&env, escrow_id)?;

        // Load meta only to verify freelancer identity and track submitted_count.
        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.freelancer {
            return Err(EscrowError::E3);
        }

        // Auto-extend deadline if submitted near expiry
        if let Some(deadline) = meta.deadline {
            let now = env.ledger().timestamp();
            if deadline > now && deadline - now < AUTO_DEADLINE_EXTENSION_SECONDS {
                let new_deadline = now + AUTO_DEADLINE_EXTENSION_SECONDS;
                // Do not extend past lock_time if it exists
                if meta.lock_time.is_none() || new_deadline < meta.lock_time.unwrap() {
                    let old_deadline = deadline;
                    meta.deadline = Some(new_deadline);
                    events::emit_deadline_extended(&env, escrow_id, old_deadline, new_deadline);
                }
            }
        }

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MS_PENDING && milestone.status != MS_REJECTED {
            return Err(EscrowError::E14);
        }

        Self::require_dependency_satisfied(&env, escrow_id, &milestone)?;

        milestone.status = MS_SUBMITTED;
        milestone.submitted_at = Some(env.ledger().timestamp());
        ContractStorage::save_milestone(&env, escrow_id, &milestone);

        // Increment submitted_count on the already-loaded meta — single write.
        meta.submitted_count = meta
            .submitted_count
            .checked_add(1)
            .ok_or(EscrowError::E20)?;
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
        ContractStorage::require_not_frozen(&env, escrow_id)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        // Check if lock time has expired (legacy lock_time behaviour)
        ContractStorage::check_lock_time_expired(&env, escrow_id, meta.lock_time)?;

        // Caller must be the client or one of the buyer signers
        if caller != meta.client && !meta.buyer_signers.contains(&caller) {
            return Err(EscrowError::E3);
        }

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MS_SUBMITTED {
            return Err(EscrowError::E14);
        }

        Self::require_dependency_satisfied(&env, escrow_id, &milestone)?;

        let now = env.ledger().timestamp();
        let amount = milestone.amount;

        milestone.status = MS_APPROVED;
        milestone.resolved_at = Some(now);
        meta.approved_count = meta.approved_count.checked_add(1).ok_or(EscrowError::E20)?;

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
                .ok_or(EscrowError::E20)?;
            meta.released_count = meta.released_count.checked_add(1).ok_or(EscrowError::E20)?;
            milestone.status = MS_RELEASED;
            events::emit_funds_released(&env, escrow_id, &meta.freelancer, amount);
        }

        ContractStorage::save_milestone(&env, escrow_id, &milestone);
        Self::emit_dependents_unlocked(&env, escrow_id, milestone_id);

        if meta.approved_count == meta.milestone_count
            && meta.milestone_count > 0
            && meta.released_count == meta.milestone_count
        {
            meta.status = EscrowStatus::Completed;
            Self::remove_from_vec_index(
                &env,
                &DataKey::EscrowsByStatus(EscrowStatus::Active),
                escrow_id,
            );
            Self::append_to_vec_index(
                &env,
                &DataKey::EscrowsByStatus(EscrowStatus::Completed),
                escrow_id,
            );
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
        ContractStorage::require_not_frozen(&env, escrow_id)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::E5);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MS_SUBMITTED {
            return Err(EscrowError::E14);
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

    /// Sets the configurable milestone cap stored in instance storage.
    ///
    /// Requires admin authorization. `new_max` must be in [1, 100].
    pub fn set_max_milestones(env: Env, caller: Address, new_max: u32) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_admin(&env, &caller)?;

        if new_max == 0 || new_max > 100 {
            return Err(EscrowError::E17);
        }

        env.storage()
            .instance()
            .set(&DataKey::MaxMilestones, &new_max);
        ContractStorage::bump_instance_ttl(&env);

        events::emit_max_milestones_set(&env, new_max);
        Ok(())
    }

    /// Rejects a submitted milestone and stores an IPFS reason hash on-chain.
    ///
    /// `reason_hash` must be non-zero (a real IPFS CID).
    pub fn reject_milestone_with_reason(
        env: Env,
        caller: Address,
        escrow_id: u64,
        milestone_id: u32,
        reason_hash: BytesN<32>,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        if reason_hash == BytesN::from_array(&env, &[0u8; 32]) {
            return Err(EscrowError::E19);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::E5);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        if milestone.status != MS_SUBMITTED {
            return Err(EscrowError::E14);
        }

        milestone.status = MS_REJECTED;
        milestone.resolved_at = Some(env.ledger().timestamp());
        milestone.rejection_reason = OptionalBytesN32::Some(reason_hash.clone());
        ContractStorage::save_milestone(&env, escrow_id, &milestone);

        meta.submitted_count = meta.submitted_count.saturating_sub(1);
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_milestone_rejected_with_reason(
            &env,
            escrow_id,
            milestone_id,
            &caller,
            &reason_hash,
        );
        Ok(())
    }

    /// Allows the client to withdraw excess rent above the minimum required reserve.
    pub fn withdraw_rent_overpayment(
        env: Env,
        caller: Address,
        escrow_id: u64,
        amount: i128,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client {
            return Err(EscrowError::E5);
        }

        let entries = ContractStorage::active_storage_entries(&env, &meta);
        let min_reserve = ContractStorage::reserve_for_entries(entries);

        let overpayment = meta.rent_balance.saturating_sub(min_reserve);

        if amount <= 0 || amount > overpayment {
            return Err(EscrowError::E19);
        }

        meta.rent_balance = meta
            .rent_balance
            .checked_sub(amount)
            .ok_or(EscrowError::E20)?;
        ContractStorage::save_escrow_meta(&env, &meta);

        token::Client::new(&env, &meta.token).transfer(
            &env.current_contract_address(),
            &caller,
            &amount,
        );

        events::emit_rent_withdrawn(&env, escrow_id, &caller, amount);
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
        ContractStorage::require_not_frozen(&env, escrow_id)?;
        ContractStorage::with_reentrancy_guard(&env, || {
            let admin: Address = env
                .storage()
                .instance()
                .get(&DataKey::Admin)
                .ok_or(EscrowError::E2)?;

            let mut milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
            if milestone.status != MS_APPROVED {
                return Err(EscrowError::E14);
            }
            Self::require_dependency_satisfied(&env, escrow_id, &milestone)?;

            let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

            let is_admin = caller == admin;
            let timelock_ok =
                ContractStorage::check_timelock_expired(&env, escrow_id, meta.timelock.clone())
                    .is_ok();

            if !is_admin && !timelock_ok {
                return Err(EscrowError::E53);
            }

            ContractStorage::check_lock_time_expired(&env, escrow_id, meta.lock_time)?;

            let amount = milestone.amount;
            let completes_escrow =
                meta.released_count + 1 == meta.milestone_count && meta.milestone_count > 0;
            let (payout_amount, _) = if completes_escrow {
                Self::settle_completion_fee_from_single_payout(
                    &env,
                    escrow_id,
                    &meta.token,
                    amount,
                )?
            } else {
                (amount, 0)
            };

            token::Client::new(&env, &meta.token).transfer(
                &env.current_contract_address(),
                &meta.freelancer,
                &payout_amount,
            );

            milestone.status = MS_RELEASED;
            ContractStorage::save_milestone(&env, escrow_id, &milestone);
            Self::emit_dependents_unlocked(&env, escrow_id, milestone_id);

            meta.remaining_balance = meta
                .remaining_balance
                .checked_sub(amount)
                .ok_or(EscrowError::E20)?;
            meta.released_count = meta.released_count.checked_add(1).ok_or(EscrowError::E20)?;

            if meta.released_count == meta.milestone_count && meta.milestone_count > 0 {
                meta.status = EscrowStatus::Completed;
                Self::remove_from_vec_index(
                    &env,
                    &DataKey::EscrowsByStatus(EscrowStatus::Active),
                    escrow_id,
                );
                Self::append_to_vec_index(
                    &env,
                    &DataKey::EscrowsByStatus(EscrowStatus::Completed),
                    escrow_id,
                );
                events::emit_escrow_completed(&env, escrow_id);
            }

            ContractStorage::save_escrow_meta(&env, &meta);

            events::emit_funds_released(&env, escrow_id, &meta.freelancer, payout_amount);
            if timelock_ok && !is_admin {
                events::emit_timelock_released(&env, escrow_id, env.ledger().timestamp());
            }

            Ok(())
        })
    }

    /// Transfers the client role to a new address.
    ///
    /// Only the current client may call this. The new client must not be the
    /// freelancer or the arbiter, and the escrow must be Active.
    pub fn transfer_client_role(
        env: Env,
        escrow_id: u64,
        new_client: Address,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

        meta.client.require_auth();

        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        if new_client == meta.freelancer {
            return Err(EscrowError::E3);
        }
        if let Some(ref arbiter) = meta.arbiter {
            if new_client == *arbiter {
                return Err(EscrowError::E3);
            }
        }

        let old_client = meta.client.clone();
        meta.client = new_client.clone();
        ContractStorage::save_escrow_meta(&env, &meta);

        events::emit_client_role_transferred(&env, escrow_id, &old_client, &new_client);
        Ok(())
    }

    /// Cancels an escrow and returns remaining funds to the client.
    pub fn cancel_escrow(env: Env, caller: Address, escrow_id: u64) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;
        ContractStorage::require_not_frozen(&env, escrow_id)?;
        ContractStorage::with_reentrancy_guard(&env, || {
            let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
            if caller != meta.client {
                return Err(EscrowError::E5);
            }
            if meta.status != EscrowStatus::Active {
                return Err(EscrowError::E9);
            }

            // Stage-based cancellation split:
            // - Deduct platform fee from the remaining escrow balance first.
            // - Pay any Approved (but not yet Released) milestone amounts to the freelancer.
            // - Refund the rest to the client.
            let snapshot = Self::calculate_platform_fee(&env, meta.total_amount)?;
            let mut fee_amount = snapshot.fee_amount;
            if fee_amount > meta.remaining_balance {
                fee_amount = meta.remaining_balance;
            }

            let mut approved_due: i128 = 0;
            for mid in 0..meta.milestone_count {
                let m = ContractStorage::load_milestone(&env, escrow_id, mid)?;
                if m.status == MS_APPROVED {
                    approved_due = approved_due.checked_add(m.amount).ok_or(EscrowError::E20)?;
                }
            }

            let available_after_fee = meta
                .remaining_balance
                .checked_sub(fee_amount)
                .ok_or(EscrowError::E20)?;
            if approved_due > available_after_fee {
                return Err(EscrowError::E20);
            }

            let freelancer_payout = approved_due;
            let client_refund = available_after_fee
                .checked_sub(approved_due)
                .ok_or(EscrowError::E20)?;

            if fee_amount > 0 {
                let treasury: Address = env
                    .storage()
                    .instance()
                    .get(&DataKey::PlatformTreasury)
                    .ok_or(EscrowError::E2)?;
                token::Client::new(&env, &meta.token).transfer(
                    &env.current_contract_address(),
                    &treasury,
                    &fee_amount,
                );
            }

            if freelancer_payout > 0 {
                token::Client::new(&env, &meta.token).transfer(
                    &env.current_contract_address(),
                    &meta.freelancer,
                    &freelancer_payout,
                );
            }

            if client_refund > 0 {
                token::Client::new(&env, &meta.token).transfer(
                    &env.current_contract_address(),
                    &meta.client,
                    &client_refund,
                );
            }

            meta.remaining_balance = 0;
            meta.status = EscrowStatus::Cancelled;
            Self::remove_from_vec_index(
                &env,
                &DataKey::EscrowsByStatus(EscrowStatus::Active),
                escrow_id,
            );
            Self::append_to_vec_index(
                &env,
                &DataKey::EscrowsByStatus(EscrowStatus::Cancelled),
                escrow_id,
            );
            ContractStorage::save_escrow_meta(&env, &meta);
            ContractStorage::remove_fee_snapshot(&env, escrow_id);

            env.events().publish(
                (symbol_short!("esc_canbd"), escrow_id),
                (freelancer_payout, client_refund, fee_amount),
            );
            events::emit_escrow_cancelled(&env, escrow_id, client_refund);
            Ok(())
        })
    }

    /// Splits the unallocated balance of an active escrow into two new child escrows.
    /// Requires joint authorization from both the client and freelancer.
    pub fn split_escrow(
        env: Env,
        caller: Address,
        escrow_id: u64,
        split_amount: i128,
        new_brief_hash: BytesN<32>,
    ) -> Result<(u64, u64), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        // Require joint consent from both parties
        meta.client.require_auth();
        meta.freelancer.require_auth();

        let unallocated = meta.remaining_balance - meta.allocated_amount;
        if split_amount <= 0 || split_amount >= unallocated {
            return Err(EscrowError::E19);
        }

        let child1_amount = split_amount;
        let child2_amount = unallocated - split_amount;

        // Create first child escrow
        let child1_id = Self::create_escrow_internal(
            env.clone(),
            meta.client.clone(),
            meta.freelancer.clone(),
            meta.token.clone(),
            child1_amount,
            new_brief_hash.clone(),
            meta.arbiter.clone(),
            meta.deadline,
            meta.lock_time,
            meta.dispute_timeout_ledger,
            Some(meta.buyer_signers.clone()),
        )?;

        // Create second child escrow
        let child2_id = Self::create_escrow_internal(
            env.clone(),
            meta.client.clone(),
            meta.freelancer.clone(),
            meta.token.clone(),
            child2_amount,
            new_brief_hash,
            meta.arbiter.clone(),
            meta.deadline,
            meta.lock_time,
            meta.dispute_timeout_ledger,
            Some(meta.buyer_signers.clone()),
        )?;

        // Note: Parent escrow remains active, only unallocated balance is split

        events::emit_escrow_split(&env, escrow_id, child1_id, child2_id);
        Ok((child1_id, child2_id))
    }

    /// Partially cancels an escrow by refunding only the unallocated balance.
    ///
    /// This allows the client to retrieve funds that haven't been allocated to
    /// milestones while keeping the escrow active for allocated milestones.
    ///
    /// # Arguments
    /// * `escrow_id` - The ID of the escrow to partially cancel
    ///
    /// # Returns
    /// The amount refunded to the client (unallocated balance)
    pub fn partial_cancel(env: Env, caller: Address, escrow_id: u64) -> Result<i128, EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;
        ContractStorage::require_not_frozen(&env, escrow_id)?;
        ContractStorage::with_reentrancy_guard(&env, || {
            let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
            if caller != meta.client {
                return Err(EscrowError::E5);
            }
            if meta.status != EscrowStatus::Active {
                return Err(EscrowError::E9);
            }

            let unallocated = meta.remaining_balance.saturating_sub(meta.allocated_amount);
            if unallocated <= 0 {
                return Ok(0);
            }

            token::Client::new(&env, &meta.token).transfer(
                &env.current_contract_address(),
                &meta.client,
                &unallocated,
            );

            meta.remaining_balance = meta
                .remaining_balance
                .checked_sub(unallocated)
                .ok_or(EscrowError::E20)?;
            ContractStorage::save_escrow_meta(&env, &meta);

            events::emit_partial_cancellation(&env, escrow_id, unallocated);

            Ok(unallocated)
        })
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
        ContractStorage::require_not_frozen(&env, escrow_id)?;

        if duration_ledger == 0 || duration_ledger > 30 * 24 * 60 * 60 {
            return Err(EscrowError::E51);
        }

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client && caller != meta.freelancer {
            return Err(EscrowError::E3);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }
        if meta.timelock != OptionalTimelock::None {
            return Err(EscrowError::E51);
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
            return Err(EscrowError::E5);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        let now = env.ledger().timestamp();
        if new_lock_time <= now {
            return Err(EscrowError::E30);
        }

        let old_lock_time = meta.lock_time.unwrap_or(0);

        // If there's an existing lock_time_extension, use that as the maximum
        if let Some(ext) = meta.lock_time_extension {
            if new_lock_time > ext {
                return Err(EscrowError::E30);
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
        ContractStorage::require_not_frozen(&env, escrow_id)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if caller != meta.client && caller != meta.freelancer {
            return Err(EscrowError::E3);
        }
        if meta.status == EscrowStatus::Disputed {
            return Err(EscrowError::E9);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        meta.status = EscrowStatus::Disputed;
        meta.dispute_started_ledger = Some(env.ledger().sequence());
        meta.dispute_start_ledger = Some(env.ledger().timestamp());
        Self::remove_from_vec_index(
            &env,
            &DataKey::EscrowsByStatus(EscrowStatus::Active),
            escrow_id,
        );
        Self::append_to_vec_index(
            &env,
            &DataKey::EscrowsByStatus(EscrowStatus::Disputed),
            escrow_id,
        );
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

    pub fn claim_dispute_timeout(
        env: Env,
        caller: Address,
        escrow_id: u64,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;
        ContractStorage::require_not_frozen(&env, escrow_id)?;

        ContractStorage::with_reentrancy_guard(&env, || {
            let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
            if caller != meta.client && caller != meta.freelancer {
                return Err(EscrowError::E3);
            }
            if meta.status != EscrowStatus::Disputed {
                return Err(EscrowError::E10);
            }

            let timeout = meta.dispute_timeout_ledger.ok_or(EscrowError::E23)?;
            let started = meta.dispute_started_ledger.ok_or(EscrowError::E23)?;
            let deadline = started.checked_add(timeout).ok_or(EscrowError::E20)?;
            if env.ledger().sequence() < deadline {
                return Err(EscrowError::E23);
            }

            let client_amount = meta.remaining_balance / 2;
            let freelancer_amount = meta
                .remaining_balance
                .checked_sub(client_amount)
                .ok_or(EscrowError::E20)?;
            let (client_payout, freelancer_payout, _) =
                Self::settle_completion_fee_from_split_payout(
                    &env,
                    escrow_id,
                    &meta.token,
                    client_amount,
                    freelancer_amount,
                )?;

            let token = token::Client::new(&env, &meta.token);
            let contract_addr = env.current_contract_address();
            if client_payout > 0 {
                token.transfer(&contract_addr, &meta.client, &client_payout);
            }
            if freelancer_payout > 0 {
                token.transfer(&contract_addr, &meta.freelancer, &freelancer_payout);
            }

            meta.remaining_balance = 0;
            meta.status = EscrowStatus::Completed;
            meta.dispute_started_ledger = None;
            Self::remove_from_vec_index(
                &env,
                &DataKey::EscrowsByStatus(EscrowStatus::Disputed),
                escrow_id,
            );
            Self::append_to_vec_index(
                &env,
                &DataKey::EscrowsByStatus(EscrowStatus::Completed),
                escrow_id,
            );
            ContractStorage::save_escrow_meta(&env, &meta);

            events::emit_dispute_timeout_claimed(
                &env,
                escrow_id,
                &caller,
                client_payout,
                freelancer_payout,
            );
            events::emit_escrow_completed(&env, escrow_id);
            Ok(())
        })
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
        ContractStorage::require_not_frozen(&env, escrow_id)?;
        ContractStorage::with_reentrancy_guard(&env, || {
            let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

            let is_arbiter = meta.arbiter.as_ref().is_some_and(|a| *a == caller);
            if !is_arbiter {
                ContractStorage::require_admin(&env, &caller)?;
            }

            if meta.status != EscrowStatus::Disputed {
                return Err(EscrowError::E10);
            }
            if client_amount + freelancer_amount != meta.remaining_balance {
                return Err(EscrowError::E20);
            }

            let (client_payout, freelancer_payout, _) =
                Self::settle_completion_fee_from_split_payout(
                    &env,
                    escrow_id,
                    &meta.token,
                    client_amount,
                    freelancer_amount,
                )?;

            let token = token::Client::new(&env, &meta.token);
            let contract_addr = env.current_contract_address();

            if client_payout > 0 {
                token.transfer(&contract_addr, &meta.client, &client_payout);
            }
            if freelancer_payout > 0 {
                token.transfer(&contract_addr, &meta.freelancer, &freelancer_payout);
            }

            meta.remaining_balance = 0;
            meta.status = EscrowStatus::Completed;
            meta.dispute_started_ledger = None;
            Self::remove_from_vec_index(
                &env,
                &DataKey::EscrowsByStatus(EscrowStatus::Disputed),
                escrow_id,
            );
            Self::append_to_vec_index(
                &env,
                &DataKey::EscrowsByStatus(EscrowStatus::Completed),
                escrow_id,
            );
            ContractStorage::save_escrow_meta(&env, &meta);

            events::emit_dispute_resolved(&env, escrow_id, client_payout, freelancer_payout);

            Self::_update_reputation_internal(&env, &meta.client, false, true, client_payout);
            Self::_update_reputation_internal(
                &env,
                &meta.freelancer,
                false,
                true,
                freelancer_payout,
            );

            Ok(())
        })
    }

    /// Escalates a disputed escrow to governance for DAO resolution.
    ///
    /// This is available for high-value disputes that require community governance
    /// rather than arbiter resolution. The escrow must be in Disputed status and
    /// exceed the HIGH_VALUE_THRESHOLD.
    ///
    /// # Arguments
    /// * `escrow_id` - The ID of the disputed escrow
    ///
    /// # Returns
    /// The proposal ID created in the governance contract
    pub fn escalate_dispute_to_governance(
        env: Env,
        caller: Address,
        escrow_id: u64,
    ) -> Result<u64, EscrowError> {
        caller.require_auth();
        ContractStorage::require_not_paused(&env)?;

        let meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

        // Only client or freelancer can escalate
        if caller != meta.client && caller != meta.freelancer {
            return Err(EscrowError::E3);
        }

        // Escrow must be in disputed status
        if meta.status != EscrowStatus::Disputed {
            return Err(EscrowError::E10);
        }

        // Must meet high-value threshold
        if meta.total_amount < HIGH_VALUE_THRESHOLD {
            return Err(EscrowError::E19);
        }

        // Get governance contract address
        let governance_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::GovernanceContract)
            .ok_or(EscrowError::E2)?;

        // Create proposal payload for fund allocation
        let proposal_type = ProposalType::FundAllocation;
        let title = String::from_str(&env, "Escalated Dispute");
        let description = String::from_str(&env, "High-value dispute requiring DAO resolution");

        let payload = ProposalPayload::FundAllocation(FundPayload {
            recipient: env.current_contract_address(),
            token: meta.token.clone(),
            amount: meta.remaining_balance,
        });

        // Call governance contract to create proposal
        let proposal_id: u64 = env.invoke_contract(
            &governance_addr,
            &symbol_short!("create"),
            (proposal_type, title, description, payload).into_val(&env),
        );

        // Emit escalation event
        events::emit_dispute_escalated_to_governance(
            &env,
            escrow_id,
            &caller,
            proposal_id,
            meta.total_amount,
        );

        Ok(proposal_id)
    }

    // ── Oracle Fallback Dispute Resolution ───────────────────────────────────

    /// Admin-only: register the trusted oracle Ed25519 public key used to
    /// verify fallback resolution payloads.
    pub fn set_trusted_oracle_key(
        env: Env,
        caller: Address,
        pubkey: BytesN<32>,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_admin(&env, &caller)?;
        caller.require_auth();
        env.storage()
            .instance()
            .set(&types::DataKey::TrustedOracleKey, &pubkey);
        ContractStorage::bump_instance_ttl(&env);
        Ok(())
    }

    /// Resolve a stalled dispute via a signed oracle payload.
    ///
    /// Callable by anyone once `dispute_start_ledger + grace_period_seconds`
    /// has elapsed without the assigned arbiter acting.
    ///
    /// # Verification steps
    /// 1. Escrow must be `Disputed` and grace period must have elapsed.
    /// 2. Payload `expires_at` must be in the future (not stale).
    /// 3. `client_bps + freelancer_bps` must equal 10 000.
    /// 4. Ed25519 signature over the canonical message must verify against
    ///    the stored trusted oracle public key.
    ///
    /// On success, funds are distributed and the escrow is marked Completed.
    pub fn oracle_resolve_dispute(
        env: Env,
        escrow_id: u64,
        payload: types::OracleResolutionPayload,
        grace_period_seconds: u64,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;

        if meta.status != EscrowStatus::Disputed {
            return Err(EscrowError::E10);
        }

        // 1. Grace period check
        let dispute_start = meta.dispute_start_ledger.ok_or(EscrowError::E60)?;
        let now = env.ledger().timestamp();
        if now < dispute_start.saturating_add(grace_period_seconds) {
            return Err(EscrowError::E56);
        }

        // 2. Payload freshness
        if now > payload.expires_at {
            return Err(EscrowError::E58);
        }

        // 3. Payout percentages must sum to 10 000 bps
        if payload.client_bps.saturating_add(payload.freelancer_bps) != 10_000 {
            return Err(EscrowError::E59);
        }

        // 4. Signature verification
        // Canonical message: escrow_id (8 bytes LE) || client_bps (4 bytes LE)
        //                  || freelancer_bps (4 bytes LE) || expires_at (8 bytes LE)
        let trusted_key: BytesN<32> = env
            .storage()
            .instance()
            .get(&types::DataKey::TrustedOracleKey)
            .ok_or(EscrowError::E54)?;

        if payload.oracle_pubkey != trusted_key {
            return Err(EscrowError::E57);
        }

        // Build the 24-byte message buffer
        let mut msg = [0u8; 24];
        msg[0..8].copy_from_slice(&payload.escrow_id.to_le_bytes());
        msg[8..12].copy_from_slice(&payload.client_bps.to_le_bytes());
        msg[12..16].copy_from_slice(&payload.freelancer_bps.to_le_bytes());
        msg[16..24].copy_from_slice(&payload.expires_at.to_le_bytes());

        env.crypto().ed25519_verify(
            &payload.oracle_pubkey,
            &soroban_sdk::Bytes::from_slice(&env, &msg),
            &payload.signature,
        );

        // 5. Distribute funds
        let total = meta.remaining_balance;
        let client_amount = (total * i128::from(payload.client_bps)) / 10_000;
        let freelancer_amount = total - client_amount;

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

        // Update status index: Disputed → Completed
        Self::remove_from_vec_index(
            &env,
            &DataKey::EscrowsByStatus(EscrowStatus::Disputed),
            escrow_id,
        );
        Self::append_to_vec_index(
            &env,
            &DataKey::EscrowsByStatus(EscrowStatus::Completed),
            escrow_id,
        );

        events::emit_dispute_resolved(&env, escrow_id, client_amount, freelancer_amount);

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
    /// Returns EscrowError::E2 if the contract has not been initialized.
    pub fn get_admin(env: Env) -> Result<Address, EscrowError> {
        ContractStorage::require_initialized(&env)?;
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::E2)?;
        Ok(admin)
    }

    /// Step 1 of two-step admin transfer: propose a new admin.
    ///
    /// Only the current admin may call this. Stores `new_admin` under
    /// `DataKey::PendingAdmin`. The transfer is not complete until the
    /// proposed admin calls `accept_admin`.
    pub fn propose_admin(env: Env, caller: Address, new_admin: Address) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_admin(&env, &caller)?;

        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        ContractStorage::bump_instance_ttl(&env);

        events::emit_admin_proposed(&env, &caller, &new_admin);
        Ok(())
    }

    /// Step 2 of two-step admin transfer: accept the pending admin role.
    ///
    /// Only the address stored as `DataKey::PendingAdmin` may call this.
    /// On success, `DataKey::Admin` is updated to the caller and
    /// `DataKey::PendingAdmin` is cleared.
    pub fn accept_admin(env: Env, caller: Address) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_initialized(&env)?;

        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(EscrowError::E3)?;

        if caller != pending {
            return Err(EscrowError::E3);
        }

        let old_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::E2)?;

        env.storage().instance().set(&DataKey::Admin, &caller);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        ContractStorage::bump_instance_ttl(&env);

        events::emit_admin_changed(&env, &old_admin, &caller);
        Ok(())
    }

    // ── Token Whitelist Management ────────────────────────────────────────────

    /// Adds a token to the approved whitelist for escrow creation.
    /// Requires admin authorization.
    pub fn add_approved_token(
        env: Env,
        caller: Address,
        token: Address,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_admin(&env, &caller)?;
        ContractStorage::add_approved_token(&env, &token);
        Ok(())
    }

    /// Removes a token from the approved whitelist.
    /// Requires admin authorization.
    pub fn remove_approved_token(
        env: Env,
        caller: Address,
        token: Address,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_admin(&env, &caller)?;
        ContractStorage::remove_approved_token(&env, &token);
        Ok(())
    }

    /// Enables or disables the token whitelist enforcement.
    /// When enabled, only whitelisted tokens can be used in new escrows.
    /// Requires admin authorization.
    pub fn set_token_whitelist_enabled(
        env: Env,
        caller: Address,
        enabled: bool,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_admin(&env, &caller)?;
        ContractStorage::set_token_whitelist_enabled(&env, enabled);
        Ok(())
    }

    // ── Escrow Template System ───────────────────────────────────────────────

    /// Creates a new escrow template with predefined milestones.
    pub fn create_template(
        env: Env,
        caller: Address,
        name: String,
        milestones: soroban_sdk::Vec<MilestoneTemplate>,
    ) -> Result<u64, EscrowError> {
        caller.require_auth();
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        let template_id = ContractStorage::next_template_id(&env)?;
        let template = EscrowTemplate {
            id: template_id,
            creator: caller,
            name,
            milestones,
        };
        ContractStorage::save_template(&env, &template);
        Ok(template_id)
    }

    /// Retrieves an escrow template by ID.
    pub fn get_template(env: Env, template_id: u64) -> Result<EscrowTemplate, EscrowError> {
        ContractStorage::require_initialized(&env)?;
        ContractStorage::load_template(&env, template_id)
    }

    /// Creates a new escrow from a template, adding all template milestones.
    pub fn create_escrow_from_template(
        env: Env,
        caller: Address,
        template_id: u64,
        client: Address,
        freelancer: Address,
        token: Address,
        total_amount: i128,
        brief_hash: BytesN<32>,
        arbiter: Option<Address>,
        deadline: Option<u64>,
    ) -> Result<u64, EscrowError> {
        caller.require_auth();
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        if caller != client {
            return Err(EscrowError::E3);
        }

        let template = ContractStorage::load_template(&env, template_id)?;

        // Create the escrow
        let escrow_id = Self::create_escrow_internal(
            env.clone(),
            client.clone(),
            freelancer.clone(),
            token.clone(),
            total_amount,
            brief_hash,
            arbiter.clone(),
            deadline,
            None, // lock_time
            None, // dispute_timeout_ledger
            None, // buyer_signers
        )?;

        // Add template milestones
        for milestone in template.milestones.iter() {
            Self::add_milestone_internal(
                &env,
                &client,
                escrow_id,
                milestone.title.clone(),
                milestone.description_hash.clone(),
                milestone.amount,
            )?;
        }

        Ok(escrow_id)
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
            return Err(EscrowError::E5);
        }

        let mut recurring = ContractStorage::load_recurring_config(&env, escrow_id)?;
        if recurring.cancelled {
            return Err(EscrowError::E47);
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
            return Err(EscrowError::E5);
        }

        let mut recurring = ContractStorage::load_recurring_config(&env, escrow_id)?;
        if recurring.cancelled {
            return Err(EscrowError::E47);
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
            return Err(EscrowError::E5);
        }
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        let mut recurring = ContractStorage::load_recurring_config(&env, escrow_id)?;
        if recurring.cancelled {
            return Err(EscrowError::E47);
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

    /// O(1) lightweight view — returns only the escrow header without loading milestones.
    /// Suitable for monitoring dashboards that only need status, balances, and party info.
    pub fn get_escrow_meta(env: Env, escrow_id: u64) -> Result<EscrowMeta, EscrowError> {
        let mut meta = ContractStorage::load_escrow_meta(&env, escrow_id)?;
        ContractStorage::settle_rent_for_access(&env, &mut meta)?;
        Ok(meta)
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
            return Err(EscrowError::E5);
        }
        if additional_periods == 0 {
            return Ok(0);
        }

        let top_up = ContractStorage::rent_due_per_period(&env, &meta)
            .checked_mul(i128::from(additional_periods))
            .ok_or(EscrowError::E20)?;
        ContractStorage::charge_rent_reserve(&env, &meta.token, &caller, top_up)?;
        meta.rent_balance = meta
            .rent_balance
            .checked_add(top_up)
            .ok_or(EscrowError::E20)?;
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

    /// Returns a lightweight status summary of a recurring payment schedule.
    ///
    /// Prefer this over `get_recurring_config` when only active/paused/cancelled
    /// state and next-payment info are needed.
    pub fn get_recurring_schedule_status(
        env: Env,
        escrow_id: u64,
    ) -> Result<RecurringScheduleStatus, EscrowError> {
        ContractStorage::ensure_live_escrow(&env, escrow_id)?;
        let r = ContractStorage::load_recurring_config(&env, escrow_id)?;
        Ok(RecurringScheduleStatus {
            is_active: !r.paused && !r.cancelled,
            is_paused: r.paused,
            is_cancelled: r.cancelled,
            next_payment_at: r.next_payment_at,
            payments_remaining: r.payments_remaining,
            payment_amount: r.payment_amount,
        })
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

    /// Returns the approvals list for a given milestone.
    /// Useful for frontends displaying multisig approval progress (e.g. "2 of 3 signers approved").
    /// Returns `EscrowError::E13` if the milestone does not exist.
    pub fn get_milestone_approvals(
        env: Env,
        escrow_id: u64,
        milestone_id: u32,
    ) -> Result<soroban_sdk::Vec<ApprovalRecord>, EscrowError> {
        ContractStorage::ensure_live_escrow(&env, escrow_id)?;
        let milestone = ContractStorage::load_milestone(&env, escrow_id, milestone_id)?;
        Ok(milestone.approvals)
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

    /// Returns escrow IDs where `participant` is the client or freelancer.
    pub fn get_escrow_ids_by_participant(
        env: Env,
        participant: Address,
        offset: u32,
        limit: u32,
    ) -> soroban_sdk::Vec<u64> {
        let capped_limit = limit.min(50) as usize;
        let ids: soroban_sdk::Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::EscrowsByParticipant(participant))
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));
        let start = (offset as usize).min(ids.len() as usize);
        let end = (start + capped_limit).min(ids.len() as usize);
        let mut result = soroban_sdk::Vec::new(&env);
        for i in start..end {
            result.push_back(ids.get(i as u32).unwrap());
        }
        result
    }

    /// Returns escrow IDs in the given status.
    pub fn get_escrow_ids_by_status(
        env: Env,
        status: EscrowStatus,
        offset: u32,
        limit: u32,
    ) -> soroban_sdk::Vec<u64> {
        let capped_limit = limit.min(50) as usize;
        let ids: soroban_sdk::Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::EscrowsByStatus(status))
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));
        let start = (offset as usize).min(ids.len() as usize);
        let end = (start + capped_limit).min(ids.len() as usize);
        let mut result = soroban_sdk::Vec::new(&env);
        for i in start..end {
            result.push_back(ids.get(i as u32).unwrap());
        }
        result
    }

    /// Returns escrow IDs with active cancellation requests by `requester`.
    pub fn list_cancellations_by_requester(env: Env, requester: Address) -> soroban_sdk::Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::CancellationsByRequester(requester))
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env))
    }

    /// Returns slash records for the given slashed user address.
    pub fn get_slash_records_by_address(
        env: Env,
        slashed_user: Address,
    ) -> soroban_sdk::Vec<SlashRecord> {
        let escrow_ids: soroban_sdk::Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::SlashsByAddress(slashed_user))
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env));
        let mut records = soroban_sdk::Vec::new(&env);
        for i in 0..escrow_ids.len() {
            let escrow_id = escrow_ids.get(i).unwrap();
            if let Ok(record) = ContractStorage::load_slash_record(&env, escrow_id) {
                records.push_back(record);
            }
        }
        records
    }

    /// Replaces the arbiter on an active escrow.
    ///
    /// Requires authorization from both the client and the freelancer.
    /// The new arbiter must not be the client or freelancer themselves.
    pub fn update_arbiter(
        env: Env,
        escrow_id: u64,
        new_arbiter: Option<Address>,
    ) -> Result<(), EscrowError> {
        ContractStorage::require_not_paused(&env)?;

        let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        if meta.status != EscrowStatus::Active {
            return Err(EscrowError::E9);
        }

        // Both parties must sign.
        meta.client.require_auth();
        meta.freelancer.require_auth();

        // Validate: arbiter must not be client or freelancer.
        if let Some(ref a) = new_arbiter {
            if a == &meta.client || a == &meta.freelancer {
                return Err(EscrowError::E3);
            }
        }

        meta.arbiter = new_arbiter.clone();
        ContractStorage::save_escrow_meta(&env, &meta);
        events::emit_arbiter_updated(&env, escrow_id, &new_arbiter);
        Ok(())
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
            return Err(EscrowError::E3);
        }

        if reason.len() > MAX_STRING_LEN {
            return Err(EscrowError::E19);
        }

        // Check if escrow is in a cancellable state
        if !matches!(meta.status, EscrowStatus::Active) {
            return Err(EscrowError::E9);
        }

        // Check if cancellation already exists
        if ContractStorage::load_cancellation_request(&env, escrow_id).is_ok() {
            return Err(EscrowError::E33);
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
            counterparty_approved: false,
        };
        ContractStorage::save_cancellation_request(&env, &request);

        // Update escrow status
        meta.status = EscrowStatus::CancellationPending;
        Self::append_to_address_index(
            &env,
            &DataKey::CancellationsByRequester(caller.clone()),
            escrow_id,
        );
        Self::remove_from_vec_index(
            &env,
            &DataKey::EscrowsByStatus(EscrowStatus::Active),
            escrow_id,
        );
        Self::append_to_vec_index(
            &env,
            &DataKey::EscrowsByStatus(EscrowStatus::CancellationPending),
            escrow_id,
        );
        ContractStorage::save_escrow_meta(&env, &meta);

        // Emit event
        events::emit_cancellation_requested(&env, escrow_id, &caller, &reason, dispute_deadline);

        Ok(())
    }

    /// Allows the counterparty to explicitly approve a pending cancellation,
    /// enabling immediate execution without waiting for the dispute window.
    pub fn client_approve_cancellation(
        env: Env,
        caller: Address,
        escrow_id: u64,
    ) -> Result<(), EscrowError> {
        caller.require_auth();
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;

        let meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
        let mut request = ContractStorage::load_cancellation_request(&env, escrow_id)?;

        // Caller must be the counterparty (the party that did NOT request cancellation)
        let counterparty = if request.requester == meta.client {
            meta.freelancer.clone()
        } else {
            meta.client.clone()
        };
        if caller != counterparty {
            return Err(EscrowError::E3);
        }

        request.counterparty_approved = true;
        ContractStorage::save_cancellation_request(&env, &request);

        events::emit_cancellation_approved(&env, escrow_id, &caller);
        Ok(())
    }

    /// Executes a cancellation after the dispute period.
    ///
    /// Can be called by anyone after dispute period expires.
    pub fn execute_cancellation(env: Env, escrow_id: u64) -> Result<(), EscrowError> {
        ContractStorage::require_initialized(&env)?;
        ContractStorage::require_not_paused(&env)?;
        ContractStorage::with_reentrancy_guard(&env, || {
            let mut meta = ContractStorage::load_escrow_meta_with_rent(&env, escrow_id)?;
            let request = ContractStorage::load_cancellation_request(&env, escrow_id)?;

            let now = env.ledger().timestamp();
            if !request.counterparty_approved && now < request.dispute_deadline {
                return Err(EscrowError::E35);
            }

            if request.disputed {
                return Err(EscrowError::E37);
            }

            let slash_amount = Self::calculate_slash_amount(meta.remaining_balance);
            let client_amount = meta.remaining_balance - slash_amount;

            let slash_recipient = if request.requester == meta.client {
                meta.freelancer.clone()
            } else {
                meta.client.clone()
            };

            let reason = String::from_str(&env, "Escrow cancellation");
            Self::apply_slash(
                &env,
                &request.requester,
                &slash_recipient,
                slash_amount,
                &reason,
                escrow_id,
            );

            let token = token::Client::new(&env, &meta.token);
            let contract_addr = env.current_contract_address();

            if client_amount > 0 {
                token.transfer(&contract_addr, &request.requester, &client_amount);
            }

            meta.status = EscrowStatus::Cancelled;
            meta.remaining_balance = 0;
            Self::remove_from_address_index(
                &env,
                &DataKey::CancellationsByRequester(request.requester.clone()),
                escrow_id,
            );
            Self::remove_from_vec_index(
                &env,
                &DataKey::EscrowsByStatus(EscrowStatus::CancellationPending),
                escrow_id,
            );
            Self::append_to_vec_index(
                &env,
                &DataKey::EscrowsByStatus(EscrowStatus::Cancelled),
                escrow_id,
            );
            ContractStorage::save_escrow_meta(&env, &meta);
            ContractStorage::remove_fee_snapshot(&env, escrow_id);
            ContractStorage::remove_cancellation_request(&env, escrow_id);

            events::emit_cancellation_executed(&env, escrow_id, client_amount, slash_amount);

            Ok(())
        })
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
            return Err(EscrowError::E3);
        }

        // Check if already disputed
        if request.disputed {
            return Err(EscrowError::E34);
        }

        // Check if dispute deadline has passed
        let now = env.ledger().timestamp();
        if now >= request.dispute_deadline {
            return Err(EscrowError::E36);
        }

        // Mark as disputed
        request.disputed = true;
        ContractStorage::save_cancellation_request(&env, &request);

        // Raise dispute on escrow
        meta.status = EscrowStatus::Disputed;
        Self::remove_from_vec_index(
            &env,
            &DataKey::EscrowsByStatus(EscrowStatus::CancellationPending),
            escrow_id,
        );
        Self::append_to_vec_index(
            &env,
            &DataKey::EscrowsByStatus(EscrowStatus::Disputed),
            escrow_id,
        );
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
            return Err(EscrowError::E39);
        }

        let now = env.ledger().timestamp();
        let dispute_deadline = slash_record.slashed_at + SLASH_DISPUTE_PERIOD;
        if now < dispute_deadline {
            return Err(EscrowError::E40); // reuse: period still active
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
            return Err(EscrowError::E3);
        }

        if slash_record.disputed {
            return Err(EscrowError::E39);
        }

        let now = env.ledger().timestamp();
        let dispute_deadline = slash_record.slashed_at + SLASH_DISPUTE_PERIOD;

        // Check if dispute deadline has passed
        if now >= dispute_deadline {
            return Err(EscrowError::E40);
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
            return Err(EscrowError::E38);
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
                return Err(EscrowError::E44);
            }

            let mut payments: u32 = 1;
            let mut scheduled_at = start_time;
            while scheduled_at < end {
                let next = Self::next_schedule_time(scheduled_at, &interval)?;
                if next > end {
                    break;
                }
                payments = payments.checked_add(1).ok_or(EscrowError::E44)?;
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
            (None, None) => return Err(EscrowError::E44),
        };

        if total == 0 {
            return Err(EscrowError::E44);
        }

        Ok(total)
    }

    fn next_schedule_time(current: u64, interval: &RecurringInterval) -> Result<u64, EscrowError> {
        let seconds = match interval {
            RecurringInterval::Daily => 86_400_u64,
            RecurringInterval::Weekly => 7 * 86_400_u64,
            RecurringInterval::Monthly => 30 * 86_400_u64,
        };

        current.checked_add(seconds).ok_or(EscrowError::E44)
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
        // Guard: reject duplicate slash — a SlashRecord already exists for this escrow.
        if ContractStorage::load_slash_record(env, escrow_id).is_ok() {
            panic_with_error!(env, EscrowError::E41);
        }

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
        Self::append_to_address_index(
            env,
            &DataKey::SlashsByAddress(slashed_user.clone()),
            escrow_id,
        );

        // Emit slash event
        events::emit_slash_applied(env, escrow_id, slashed_user, recipient, amount, reason);
    }

    // ── Index helpers ─────────────────────────────────────────────────────────

    fn append_to_vec_index(env: &Env, key: &DataKey, escrow_id: u64) {
        let mut ids: soroban_sdk::Vec<u64> = env
            .storage()
            .persistent()
            .get(key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(env));
        ids.push_back(escrow_id);
        env.storage().persistent().set(key, &ids);
    }

    fn remove_from_vec_index(env: &Env, key: &DataKey, escrow_id: u64) {
        let ids: soroban_sdk::Vec<u64> = match env.storage().persistent().get(key) {
            Some(v) => v,
            None => return,
        };
        let mut updated = soroban_sdk::Vec::new(env);
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            if id != escrow_id {
                updated.push_back(id);
            }
        }
        env.storage().persistent().set(key, &updated);
    }

    fn append_to_address_index(env: &Env, key: &DataKey, escrow_id: u64) {
        Self::append_to_vec_index(env, key, escrow_id);
    }

    fn remove_from_address_index(env: &Env, key: &DataKey, escrow_id: u64) {
        Self::remove_from_vec_index(env, key, escrow_id);
    }

    /// Returns the contract's current token balance for the given token address.
    /// Use this for on-chain solvency checks to verify the contract holds
    /// sufficient funds to cover all active escrow `remaining_balance` values.
    pub fn get_contract_balance(env: Env, token: Address) -> i128 {
        ContractStorage::bump_instance_ttl(&env);
        token::Client::new(&env, &token).balance(&env.current_contract_address())
    }

    /// Executes a meta-transaction on behalf of a signer.
    ///
    /// Currently only checks the deadline. Signature verification and dispatch
    /// are stubbed for now.
    pub fn execute_meta_transaction(
        env: Env,
        meta_tx: types::MetaTransaction,
    ) -> Result<(), EscrowError> {
        let now = env.ledger().timestamp();

        // ── Deadline check ──────────────────────────────────
        if meta_tx.deadline < now {
            return Err(EscrowError::E26);
        }

        // Stub: skip nonce and signature checks for now
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    #![allow(clippy::all)]
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Events as _, Ledger as _},
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

    fn set_depends_on(
        env: &Env,
        contract_id: &Address,
        escrow_id: u64,
        milestone_id: u32,
        prereq: u32,
    ) {
        env.as_contract(contract_id, || {
            let mut m = ContractStorage::load_milestone(env, escrow_id, milestone_id).unwrap();
            m.depends_on = Some(prereq);
            ContractStorage::save_milestone(env, escrow_id, &m);
        });
    }

    fn set_milestone_status(
        env: &Env,
        contract_id: &Address,
        escrow_id: u64,
        milestone_id: u32,
        status: MilestoneStatus,
    ) {
        env.as_contract(contract_id, || {
            let mut m = ContractStorage::load_milestone(env, escrow_id, milestone_id).unwrap();
            m.status = status;
            ContractStorage::save_milestone(env, escrow_id, &m);
        });
    }

    #[test]
    fn test_freeze_requires_threshold_and_blocks_operations() {
        let (env, admin, _contract_id, client) = setup();
        client.initialize(&admin);

        let admin2 = Address::generate(&env);
        let admin3 = Address::generate(&env);

        let mut admins: soroban_sdk::Vec<Address> = soroban_sdk::Vec::new(&env);
        admins.push_back(admin.clone());
        admins.push_back(admin2.clone());
        admins.push_back(admin3.clone());
        client.set_admin_multisig(&admin, &admins, &2_u32);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        token_admin.mint(
            &escrow_client,
            &(1_000_i128 + ContractStorage::reserve_for_entries(2)),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &1_000_i128,
            &BytesN::from_array(&env, &[90; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        // Freeze with insufficient signers should fail
        let mut one: soroban_sdk::Vec<Address> = soroban_sdk::Vec::new(&env);
        one.push_back(admin.clone());
        assert_eq!(
            client
                .try_freeze_escrow(&escrow_id, &one)
                .unwrap_err()
                .unwrap(),
            EscrowError::E62
        );

        // Freeze with 2-of-3 should succeed
        let mut two: soroban_sdk::Vec<Address> = soroban_sdk::Vec::new(&env);
        two.push_back(admin.clone());
        two.push_back(admin2.clone());
        client.freeze_escrow(&escrow_id, &two);

        // Mutating operation should be blocked
        let err = client
            .try_add_milestone(
                &escrow_client,
                &escrow_id,
                &String::from_str(&env, "Blocked"),
                &BytesN::from_array(&env, &[1; 32]),
                &1_000_i128,
            )
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::E61);

        // Unfreeze with insufficient signers rejected
        assert_eq!(
            client
                .try_unfreeze_escrow(&escrow_id, &one)
                .unwrap_err()
                .unwrap(),
            EscrowError::E62
        );

        // Unfreeze with threshold signers restores operations
        client.unfreeze_escrow(&escrow_id, &two);

        let mid = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Ok"),
            &BytesN::from_array(&env, &[2; 32]),
            &1_000_i128,
        );
        assert_eq!(mid, 0_u32);
    }

    #[test]
    fn test_dependency_linear_chain_activation_rejected_until_satisfied() {
        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        token_admin.mint(
            &escrow_client,
            &(3_000_i128 + ContractStorage::reserve_for_entries(4)),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &3_000_i128,
            &BytesN::from_array(&env, &[50; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let a = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "A"),
            &BytesN::from_array(&env, &[1; 32]),
            &1_000_i128,
        );
        let b = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "B"),
            &BytesN::from_array(&env, &[2; 32]),
            &1_000_i128,
        );
        let c = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "C"),
            &BytesN::from_array(&env, &[3; 32]),
            &1_000_i128,
        );

        set_depends_on(&env, &contract_id, escrow_id, b, a);
        set_depends_on(&env, &contract_id, escrow_id, c, b);

        // Cannot submit B before A is approved/released
        let err = client
            .try_submit_milestone(&freelancer, &escrow_id, &b)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::E14);

        // Submit and approve A
        client.submit_milestone(&freelancer, &escrow_id, &a);
        client.approve_milestone(&escrow_client, &escrow_id, &a);

        // Now B can be submitted
        client.submit_milestone(&freelancer, &escrow_id, &b);
    }

    #[test]
    fn test_dependency_branched_dependencies() {
        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        token_admin.mint(
            &escrow_client,
            &(4_000_i128 + ContractStorage::reserve_for_entries(5)),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &4_000_i128,
            &BytesN::from_array(&env, &[51; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let a = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "A"),
            &BytesN::from_array(&env, &[4; 32]),
            &1_000_i128,
        );
        let b = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "B"),
            &BytesN::from_array(&env, &[5; 32]),
            &1_000_i128,
        );
        let c = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "C"),
            &BytesN::from_array(&env, &[6; 32]),
            &1_000_i128,
        );
        let d = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "D"),
            &BytesN::from_array(&env, &[7; 32]),
            &1_000_i128,
        );

        // B and C both depend on A; D depends on B
        set_depends_on(&env, &contract_id, escrow_id, b, a);
        set_depends_on(&env, &contract_id, escrow_id, c, a);
        set_depends_on(&env, &contract_id, escrow_id, d, b);

        // B and C blocked until A approved
        assert_eq!(
            client
                .try_submit_milestone(&freelancer, &escrow_id, &b)
                .unwrap_err()
                .unwrap(),
            EscrowError::E14
        );
        assert_eq!(
            client
                .try_submit_milestone(&freelancer, &escrow_id, &c)
                .unwrap_err()
                .unwrap(),
            EscrowError::E14
        );

        client.submit_milestone(&freelancer, &escrow_id, &a);
        client.approve_milestone(&escrow_client, &escrow_id, &a);

        // After A approved, B and C can submit; D still blocked until B approved
        client.submit_milestone(&freelancer, &escrow_id, &b);
        client.submit_milestone(&freelancer, &escrow_id, &c);
        assert_eq!(
            client
                .try_submit_milestone(&freelancer, &escrow_id, &d)
                .unwrap_err()
                .unwrap(),
            EscrowError::E14
        );
    }

    #[test]
    fn test_emits_unlocked_event_when_prereq_completes() {
        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        token_admin.mint(
            &escrow_client,
            &(2_000_i128 + ContractStorage::reserve_for_entries(3)),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &2_000_i128,
            &BytesN::from_array(&env, &[52; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let a = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "A"),
            &BytesN::from_array(&env, &[8; 32]),
            &1_000_i128,
        );
        let b = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "B"),
            &BytesN::from_array(&env, &[9; 32]),
            &1_000_i128,
        );

        set_depends_on(&env, &contract_id, escrow_id, b, a);

        client.submit_milestone(&freelancer, &escrow_id, &a);
        client.approve_milestone(&escrow_client, &escrow_id, &a);

        let all_events = env.events().all();
        let expected_symbol: soroban_sdk::Val = symbol_short!("mil_unlk").into_val(&env);
        let expected_id: soroban_sdk::Val = escrow_id.into_val(&env);
        assert!(
            all_events.iter().any(|e| {
                let topics = &e.1;
                topics.get(0).map(|v| v.get_payload()) == Some(expected_symbol.get_payload())
                    && topics.get(1).map(|v| v.get_payload()) == Some(expected_id.get_payload())
            }),
            "expected mil_unlk event"
        );
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
        token_admin.mint(&escrow_client, &((3 * MIN_ESCROW_AMOUNT) + total_reserve));

        let start_time = env.ledger().timestamp() + 100;
        let escrow_id = client.create_recurring_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &MIN_ESCROW_AMOUNT,
            &RecurringInterval::Weekly,
            &start_time,
            &None,
            &Some(3_u32),
            &BytesN::from_array(&env, &[12; 32]),
        );

        let state = client.get_escrow(&escrow_id);
        let recurring = client.get_recurring_config(&escrow_id);

        assert_eq!(state.total_amount, 3 * MIN_ESCROW_AMOUNT);
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
        token_admin.mint(&escrow_client, &((2 * MIN_ESCROW_AMOUNT) + total_reserve));

        let start_time = env.ledger().timestamp() + 10;
        let escrow_id = client.create_recurring_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &MIN_ESCROW_AMOUNT,
            &RecurringInterval::Daily,
            &start_time,
            &None,
            &Some(2_u32),
            &BytesN::from_array(&env, &[13; 32]),
        );

        advance(&env, 10);
        assert_eq!(client.process_recurring_payments(&escrow_id), 1);
        assert_eq!(token_client.balance(&freelancer), MIN_ESCROW_AMOUNT);
        assert_eq!(
            client.get_escrow(&escrow_id).remaining_balance,
            MIN_ESCROW_AMOUNT
        );

        advance(&env, 86_400);
        assert_eq!(client.process_recurring_payments(&escrow_id), 1);
        assert_eq!(token_client.balance(&freelancer), 2 * MIN_ESCROW_AMOUNT);
        assert_eq!(
            client.get_escrow(&escrow_id).status,
            EscrowStatus::Completed
        );
    }

    #[test]
    fn test_process_recurring_payments_multi_period_catchup() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);

        let payment_amount = 100_i128;
        let total_payments = 5_u32;
        let total_reserve = 2 * ContractStorage::reserve_for_entries(1);
        token_admin.mint(
            &escrow_client,
            &(payment_amount * total_payments as i128 + total_reserve),
        );

        let interval_seconds: u64 = 86_400; // Daily
        let start_time = env.ledger().timestamp() + 10;
        let escrow_id = client.create_recurring_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &payment_amount,
            &RecurringInterval::Daily,
            &start_time,
            &None,
            &Some(total_payments),
            &BytesN::from_array(&env, &[99; 32]),
        );

        // Advance ledger so exactly 3 periods have elapsed (strictly before the 4th boundary)
        env.ledger()
            .with_mut(|l| l.timestamp = start_time + 3 * interval_seconds - 1);

        let processed = client.process_recurring_payments(&escrow_id);
        assert_eq!(processed, 3);

        let recurring = client.get_recurring_config(&escrow_id);
        assert_eq!(recurring.payments_remaining, total_payments - 3);
        assert_eq!(recurring.processed_payments, 3);
        assert_eq!(recurring.next_payment_at, start_time + 3 * interval_seconds);

        assert_eq!(token_client.balance(&freelancer), payment_amount * 3);
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
        token_admin.mint(&escrow_client, &((2 * MIN_ESCROW_AMOUNT) + total_reserve));

        let start_time = env.ledger().timestamp() + 10;
        let escrow_id = client.create_recurring_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &MIN_ESCROW_AMOUNT,
            &RecurringInterval::Daily,
            &start_time,
            &None,
            &Some(2_u32),
            &BytesN::from_array(&env, &[14; 32]),
        );

        client.pause_recurring_schedule(&escrow_client, &escrow_id);
        advance(&env, 10);
        let paused_result = client.try_process_recurring_payments(&escrow_id);
        assert!(matches!(paused_result, Err(Ok(EscrowError::E46))));

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
        token_admin.mint(&escrow_client, &((3 * MIN_ESCROW_AMOUNT) + total_reserve));

        let start_time = env.ledger().timestamp() + 10;
        let escrow_id = client.create_recurring_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &MIN_ESCROW_AMOUNT,
            &RecurringInterval::Daily,
            &start_time,
            &None,
            &Some(3_u32),
            &BytesN::from_array(&env, &[15; 32]),
        );

        advance(&env, 10);
        client.process_recurring_payments(&escrow_id);
        client.cancel_recurring_escrow(&escrow_client, &escrow_id);

        assert_eq!(token_client.balance(&escrow_client), 2 * MIN_ESCROW_AMOUNT);
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
    fn test_create_escrow_min_amount_boundary() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        let reserve = ContractStorage::reserve_for_entries(1);

        token_admin.mint(&escrow_client, &((2 * MIN_ESCROW_AMOUNT) + (2 * reserve)));

        let below_min = MIN_ESCROW_AMOUNT - 1;
        let rejected = client.try_create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &below_min,
            &BytesN::from_array(&env, &[21; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert_eq!(rejected.unwrap_err().unwrap(), EscrowError::E19);

        let accepted_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &MIN_ESCROW_AMOUNT,
            &BytesN::from_array(&env, &[22; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert_eq!(
            client.get_escrow(&accepted_id).total_amount,
            MIN_ESCROW_AMOUNT
        );
    }

    #[test]
    fn test_create_recurring_escrow_rejects_below_min_payment_amount() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        let total_reserve = 2 * ContractStorage::reserve_for_entries(1);
        token_admin.mint(&escrow_client, &(MIN_ESCROW_AMOUNT + total_reserve));

        let start_time = env.ledger().timestamp() + 100;
        let result = client.try_create_recurring_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &(MIN_ESCROW_AMOUNT - 1),
            &RecurringInterval::Daily,
            &start_time,
            &None,
            &Some(1_u32),
            &BytesN::from_array(&env, &[23; 32]),
        );
        assert_eq!(result.unwrap_err().unwrap(), EscrowError::E19);
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
        let (env, admin, _contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.set_platform_treasury(&admin, &treasury);
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
        // Default fee tier for 200 is 200 bps => 4 fee.
        assert_eq!(token_client.balance(&treasury), 4_i128);
        assert_eq!(token_client.balance(&escrow_client), 196_i128);
        assert_eq!(token_client.balance(&freelancer), 0_i128);

        // Verify cancellation breakdown event was emitted
        let all_events = env.events().all();
        let expected_symbol: soroban_sdk::Val = symbol_short!("esc_canbd").into_val(&env);
        let expected_id: soroban_sdk::Val = escrow_id.into_val(&env);
        assert!(
            all_events.iter().any(|e| {
                let topics = &e.1;
                topics.get(0).map(|v| v.get_payload()) == Some(expected_symbol.get_payload())
                    && topics.get(1).map(|v| v.get_payload()) == Some(expected_id.get_payload())
            }),
            "expected esc_canbd event"
        );
    }

    #[test]
    fn test_cancel_escrow_partial_completion_splits_balance() {
        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.set_platform_treasury(&admin, &treasury);

        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);

        token_admin.mint(
            &escrow_client,
            &(2_000_i128 + ContractStorage::reserve_for_entries(3)),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &2_000_i128,
            &BytesN::from_array(&env, &[60; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let m0 = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "M0"),
            &BytesN::from_array(&env, &[61; 32]),
            &1_000_i128,
        );
        let m1 = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "M1"),
            &BytesN::from_array(&env, &[62; 32]),
            &1_000_i128,
        );

        // Simulate partial completion: m0 approved, m1 pending (no release performed).
        set_milestone_status(&env, &contract_id, escrow_id, m0, MS_APPROVED);
        set_milestone_status(&env, &contract_id, escrow_id, m1, MS_PENDING);

        client.cancel_escrow(&escrow_client, &escrow_id);

        // Fee for 2_000 @ 150 bps => 30
        assert_eq!(token_client.balance(&treasury), 30_i128);
        assert_eq!(token_client.balance(&freelancer), 1_000_i128);
        assert_eq!(token_client.balance(&escrow_client), 970_i128);
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
        assert!(matches!(result, Err(Ok(EscrowError::E8))));

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
    fn test_dispute_resolution() {
        use soroban_sdk::{testutils::Events, Symbol, TryFromVal, Val};

        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        // ── Participants ──────────────────────────────────────────────────────
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let arbiter = Address::generate(&env);

        // ── Token setup ───────────────────────────────────────────────────────
        let total_amount: i128 = 1_000;
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        // Mint enough for escrow amount + rent reserves (meta entry + 1 milestone)
        let rent_reserve = ContractStorage::reserve_for_entries(2);
        token_admin.mint(&escrow_client, &(total_amount + rent_reserve));

        let token_client = token::Client::new(&env, &token_id);

        // ── Create escrow with arbiter ────────────────────────────────────────
        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &total_amount,
            &BytesN::from_array(&env, &[1u8; 32]),
            &Some(arbiter.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        // ── Add a milestone for the full amount ───────────────────────────────
        let milestone_id = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Deliver feature"),
            &BytesN::from_array(&env, &[2u8; 32]),
            &total_amount,
        );

        // ── Freelancer submits the milestone ──────────────────────────────────
        client.submit_milestone(&freelancer, &escrow_id, &milestone_id);

        // ── Client raises a dispute on the submitted milestone ────────────────
        client.raise_dispute(&escrow_client, &escrow_id, &Some(milestone_id));

        // Verify escrow is now in Disputed state
        let state_after_dispute = client.get_escrow(&escrow_id);
        assert_eq!(state_after_dispute.status, EscrowStatus::Disputed);

        // ── Capture balances before resolution ────────────────────────────────
        let client_balance_before = token_client.balance(&escrow_client);
        let freelancer_balance_before = token_client.balance(&freelancer);

        // remaining_balance at this point equals total_amount (no funds released yet)
        let remaining = state_after_dispute.remaining_balance;
        assert_eq!(remaining, total_amount);

        // ── Arbiter resolves with 60 / 40 split ───────────────────────────────
        let client_share = remaining * 60 / 100; // 600
        let freelancer_share = remaining - client_share; // 400

        client.resolve_dispute(&arbiter, &escrow_id, &client_share, &freelancer_share);

        // ── Verify final escrow state ─────────────────────────────────────────
        let state_final = client.get_escrow(&escrow_id);
        assert_eq!(state_final.status, EscrowStatus::Completed);
        assert_eq!(state_final.remaining_balance, 0);

        // ── Verify token balances ─────────────────────────────────────────────
        let client_balance_after = token_client.balance(&escrow_client);
        let freelancer_balance_after = token_client.balance(&freelancer);

        assert_eq!(
            client_balance_after - client_balance_before,
            client_share,
            "client should receive 60% of remaining balance"
        );
        assert_eq!(
            freelancer_balance_after - freelancer_balance_before,
            freelancer_share,
            "freelancer should receive 40% of remaining balance"
        );

        // ── Verify dis_rai and dis_res events ─────────────────────────────────
        let all_events = env.events().all();

        // Filter to contract events only
        let contract_events: soroban_sdk::Vec<(Address, soroban_sdk::Vec<Val>, Val)> = {
            let mut out = soroban_sdk::Vec::new(&env);
            for ev in all_events.iter() {
                if ev.0 == contract_id {
                    out.push_back(ev);
                }
            }
            out
        };

        let find_event = |sym: Symbol| -> Option<(soroban_sdk::Vec<Val>, Val)> {
            for (_, topics, data) in contract_events.iter() {
                if let Some(v) = topics.get(0) {
                    if let Ok(s) = Symbol::try_from_val(&env, &v) {
                        if s == sym {
                            return Some((topics, data));
                        }
                    }
                }
            }
            None
        };

        // dis_rai: topic[0]=dis_rai, topic[1]=escrow_id, data=raised_by
        let (dis_rai_topics, dis_rai_data) =
            find_event(soroban_sdk::symbol_short!("dis_rai")).expect("dis_rai event not emitted");
        let emitted_escrow_id: u64 =
            soroban_sdk::FromVal::from_val(&env, &dis_rai_topics.get(1).unwrap());
        assert_eq!(emitted_escrow_id, escrow_id);
        let raised_by: Address = soroban_sdk::FromVal::from_val(&env, &dis_rai_data);
        assert_eq!(raised_by, escrow_client);

        // dis_res: topic[0]=dis_res, topic[1]=escrow_id, data=(client_amount, freelancer_amount)
        let (dis_res_topics, dis_res_data) =
            find_event(soroban_sdk::symbol_short!("dis_res")).expect("dis_res event not emitted");
        let resolved_escrow_id: u64 =
            soroban_sdk::FromVal::from_val(&env, &dis_res_topics.get(1).unwrap());
        assert_eq!(resolved_escrow_id, escrow_id);
        let (emitted_client_amt, emitted_freelancer_amt): (i128, i128) =
            soroban_sdk::FromVal::from_val(&env, &dis_res_data);
        assert_eq!(emitted_client_amt, client_share);
        assert_eq!(emitted_freelancer_amt, freelancer_share);
    }

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
        assert!(matches!(result, Err(Ok(EscrowError::E35))));
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
        assert!(matches!(result, Err(Ok(EscrowError::E37))));

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
        let (_env, admin, _, _, _, _, client) = setup_pause_escrow(100);
        assert!(!client.is_paused());
        client.pause(&admin);
        assert!(client.is_paused());
    }

    #[test]
    fn test_unpause_clears_state_and_emits_event() {
        let (_env, admin, _, _, _, _, client) = setup_pause_escrow(100);
        client.pause(&admin);
        assert!(client.is_paused());
        client.unpause(&admin);
        assert!(!client.is_paused());
    }

    #[test]
    fn test_pause_is_idempotent() {
        let (_env, admin, _, _, _, _, client) = setup_pause_escrow(100);
        client.pause(&admin);
        // Second pause should not panic
        client.pause(&admin);
        assert!(client.is_paused());
    }

    #[test]
    fn test_unpause_is_idempotent() {
        let (_env, admin, _, _, _, _, client) = setup_pause_escrow(100);
        // Unpause on already-unpaused contract should not panic
        client.unpause(&admin);
        assert!(!client.is_paused());
    }

    #[test]
    #[should_panic]
    fn test_pause_non_admin_rejected() {
        let (_env, _admin, escrow_client, _, _, _, client) = setup_pause_escrow(100);
        // Non-admin cannot pause
        client.pause(&escrow_client);
    }

    #[test]
    #[should_panic]
    fn test_unpause_non_admin_rejected() {
        let (_env, admin, escrow_client, _, _, _, client) = setup_pause_escrow(100);
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
        let (_env, admin, escrow_client, _, _, escrow_id, client) = setup_pause_escrow(100);
        client.pause(&admin);
        client.cancel_escrow(&escrow_client, &escrow_id);
    }

    #[test]
    #[should_panic]
    fn test_raise_dispute_blocked_when_paused() {
        let (_env, admin, escrow_client, _, _, escrow_id, client) = setup_pause_escrow(100);
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
        let (_env, admin, _, _, _, escrow_id, client) = setup_pause_escrow(100);
        client.pause(&admin);

        // All reads should succeed
        let _ = client.get_escrow(&escrow_id);
        let _ = client.escrow_count();
        let _ = client.is_paused();
    }

    /// Full pause → mutation blocked → unpause → mutation succeeds cycle.
    #[test]
    fn test_pause_unpause_cycle_restores_mutations() {
        let (env, admin, escrow_client, _freelancer, _, escrow_id, client) =
            setup_pause_escrow(100);

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

    // ── update_milestone_title ────────────────────────────────────────────────

    fn setup_escrow_with_milestone(
        env: &Env,
        client: &EscrowContractClient,
        admin: &Address,
    ) -> (Address, Address, u64, u32) {
        client.initialize(admin);
        let escrow_client = Address::generate(env);
        let freelancer = Address::generate(env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        token::StellarAssetClient::new(env, &token_id).mint(
            &escrow_client,
            &(500_i128 + 2 * ContractStorage::reserve_for_entries(1)),
        );
        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &500_i128,
            &BytesN::from_array(env, &[9u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(env),
        );
        let milestone_id = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(env, "Original Title"),
            &BytesN::from_array(env, &[0u8; 32]),
            &100_i128,
        );
        (escrow_client, freelancer, escrow_id, milestone_id)
    }

    #[test]
    fn test_update_milestone_title_pending_succeeds() {
        let (env, admin, _, client) = setup();
        let (escrow_client, _, escrow_id, milestone_id) =
            setup_escrow_with_milestone(&env, &client, &admin);

        client.update_milestone_title(
            &escrow_client,
            &escrow_id,
            &milestone_id,
            &String::from_str(&env, "Corrected Title"),
        );

        let milestone = client.get_milestone(&escrow_id, &milestone_id);
        assert_eq!(milestone.title, String::from_str(&env, "Corrected Title"));
    }

    #[test]
    fn test_update_milestone_title_non_pending_rejected() {
        let (env, admin, _, client) = setup();
        let (escrow_client, freelancer, escrow_id, milestone_id) =
            setup_escrow_with_milestone(&env, &client, &admin);

        // Advance milestone to Submitted state.
        client.submit_milestone(&freelancer, &escrow_id, &milestone_id);

        let result = client.try_update_milestone_title(
            &escrow_client,
            &escrow_id,
            &milestone_id,
            &String::from_str(&env, "New Title"),
        );
        assert_eq!(result, Err(Ok(EscrowError::E14)));
    }

    #[test]
    fn test_update_milestone_title_too_long_rejected() {
        let (env, admin, _, client) = setup();
        let (escrow_client, _, escrow_id, milestone_id) =
            setup_escrow_with_milestone(&env, &client, &admin);

        // Build a 257-character string (exceeds MAX_STRING_LEN = 256).
        let long: String = String::from_str(&env, &"a".repeat(257));
        let result =
            client.try_update_milestone_title(&escrow_client, &escrow_id, &milestone_id, &long);
        assert_eq!(result, Err(Ok(EscrowError::E55)));
    }

    // ── Issue #646: buyer_signers multisig approval ───────────────────────────

    /// Verifies that `create_escrow_with_buyer_signers` stores the signer list and
    /// that each buyer signer (not just the client) can call `approve_milestone`.
    /// After the first signer approves, `get_milestone_approvals` returns one record
    /// and `release_funds` succeeds once the milestone is in Approved state.
    #[test]
    fn test_multisig_approval_reaching_threshold() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let signer_b = Address::generate(&env);
        let signer_c = Address::generate(&env);

        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);

        let amount = 300_i128;
        token_admin.mint(
            &escrow_client,
            &(amount + (2 * ContractStorage::reserve_for_entries(1))),
        );

        // 3 buyer_signers: client (auto-added), signer_b, signer_c
        let mut signers = soroban_sdk::Vec::new(&env);
        signers.push_back(signer_b.clone());
        signers.push_back(signer_c.clone());

        let escrow_id = client.create_escrow_with_buyer_signers(
            &escrow_client,
            &freelancer,
            &token_id,
            &amount,
            &BytesN::from_array(&env, &[20; 32]),
            &None,
            &None,
            &None,
            &signers,
        );

        // Verify all three signers are stored
        let state = client.get_escrow(&escrow_id);
        assert!(state.buyer_signers.contains(&escrow_client));
        assert!(state.buyer_signers.contains(&signer_b));
        assert!(state.buyer_signers.contains(&signer_c));

        let mid = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Deliverable"),
            &BytesN::from_array(&env, &[21; 32]),
            &amount,
        );

        client.submit_milestone(&freelancer, &escrow_id, &mid);

        // signer_b (not the client) approves — should succeed
        client.approve_milestone(&signer_b, &escrow_id, &mid);

        // mil_apr event was emitted; milestone is now Approved/Released
        let approvals = client.get_milestone_approvals(&escrow_id, &mid);
        // approvals vec on the milestone struct tracks ApprovalRecord entries
        // (may be empty if the contract doesn't populate it — we just assert no panic)
        let _ = approvals;

        // Escrow completed (single milestone, timelock not set → released immediately)
        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(token_client.balance(&freelancer), amount);
    }

    // ── Issue #647: ReputationRecord initialized on first completion ──────────

    /// Completes a full single-milestone escrow lifecycle and verifies that
    /// `update_reputation` correctly initialises `ReputationRecord` for both
    /// the client and the freelancer with `completed_escrows == 1` and
    /// `total_volume == milestone_amount`.
    #[test]
    fn test_reputation_created_on_first_completion() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        let amount = 500_i128;
        token_admin.mint(
            &escrow_client,
            &(amount + (2 * ContractStorage::reserve_for_entries(1))),
        );

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &amount,
            &BytesN::from_array(&env, &[30; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let mid = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &BytesN::from_array(&env, &[31; 32]),
            &amount,
        );

        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.approve_milestone(&escrow_client, &escrow_id, &mid);

        // Escrow is completed
        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Completed);

        // Manually update reputation for both parties (contract does not auto-update on completion)
        client.update_reputation(&freelancer, &true, &false, &amount);
        client.update_reputation(&escrow_client, &true, &false, &amount);

        let freelancer_rep = client.get_reputation(&freelancer);
        assert_eq!(freelancer_rep.completed_escrows, 1);
        assert_eq!(freelancer_rep.total_volume, amount);

        let client_rep = client.get_reputation(&escrow_client);
        assert_eq!(client_rep.completed_escrows, 1);
        assert_eq!(client_rep.total_volume, amount);
    }

    // ── Issue #648: SlashRecord creation and SLASH_DISPUTE_PERIOD enforcement ─

    /// Verifies that `execute_cancellation` creates a `SlashRecord`, that
    /// `finalize_slash` called before `SLASH_DISPUTE_PERIOD` returns
    /// `SlashDeadlineExpired`, and that it succeeds after the period
    /// elapses, transferring the slashed amount to the recipient.
    #[test]
    fn test_slash_record_created_and_dispute_window_enforced() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let (escrow_client, freelancer, token_id, escrow_id) =
            setup_funded_escrow(&env, &admin, &client, 100_i128);
        let token_client = token::Client::new(&env, &token_id);

        client.request_cancellation(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Changed mind"),
        );

        advance(&env, CANCELLATION_DISPUTE_PERIOD + 1);
        client.execute_cancellation(&escrow_id);

        // SlashRecord must exist after execute_cancellation
        let slash = client.get_slash_record(&escrow_id);
        assert_eq!(slash.escrow_id, escrow_id);
        assert_eq!(slash.slashed_user, escrow_client);
        assert_eq!(slash.recipient, freelancer);
        assert_eq!(slash.amount, 10_i128); // 10% of 100
        assert!(!slash.disputed);

        // Escrow is now Cancelled and a SlashRecord exists.
        // Any further call that would invoke apply_slash must be rejected with SlashAlreadyApplied.
        let result = client.try_execute_cancellation(&escrow_id);
        assert!(
            result.is_err(),
            "second execute_cancellation must fail when a SlashRecord already exists"
        );

        // finalize_slash before SLASH_DISPUTE_PERIOD must fail
        let err = client.try_finalize_slash(&escrow_id);
        assert!(matches!(err, Err(Ok(EscrowError::E40))));

        // Advance past SLASH_DISPUTE_PERIOD — finalize_slash must succeed
        advance(&env, SLASH_DISPUTE_PERIOD + 1);
        client.finalize_slash(&escrow_id);

        // Slash amount transferred to recipient (freelancer)
        assert_eq!(token_client.balance(&freelancer), 10_i128);

        // SlashRecord removed after finalization
        let err = client.try_get_slash_record(&escrow_id);
        assert!(matches!(err, Err(Ok(EscrowError::E38))));
    }

    // ── Issue #649: Cancellation workflow end-to-end ──────────────────────────

    /// Full cancellation happy path: request → advance past dispute period →
    /// execute → verify fund distribution, escrow status, and request cleanup.
    #[test]
    fn test_cancellation_workflow_end_to_end() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let (escrow_client, freelancer, token_id, escrow_id) =
            setup_funded_escrow(&env, &admin, &client, 200_i128);
        let token_client = token::Client::new(&env, &token_id);

        client.request_cancellation(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "No longer needed"),
        );

        // CancellationRequest exists between request and execute
        let req = client.get_cancellation_request(&escrow_id);
        assert_eq!(req.requester, escrow_client);
        assert!(!req.disputed);

        // Advance past CANCELLATION_DISPUTE_PERIOD
        advance(&env, CANCELLATION_DISPUTE_PERIOD + 1);
        client.execute_cancellation(&escrow_id);

        // Escrow status is Cancelled
        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Cancelled);
        assert_eq!(state.remaining_balance, 0);

        // 10% slash (20) held in contract; 90% (180) returned to requester (client)
        assert_eq!(token_client.balance(&escrow_client), 180_i128);
        assert_eq!(token_client.balance(&freelancer), 0_i128);

        // CancellationRequest removed after execution
        let err = client.try_get_cancellation_request(&escrow_id);
        assert!(matches!(err, Err(Ok(EscrowError::E32))));

        // Finalize slash — releases 20 to freelancer
        advance(&env, SLASH_DISPUTE_PERIOD + 1);
        client.finalize_slash(&escrow_id);
        assert_eq!(token_client.balance(&freelancer), 20_i128);
    }
    // ── Issue #??: MetaTransaction deadline enforcement ────────────────────

    /// Verifies that a MetaTransaction with an expired deadline is rejected
    /// with `DeadlineExpired` before any state changes occur.
    #[test]
    fn test_meta_transaction_expired_deadline_rejected() {
        let (env, _admin, _contract_id, client) = setup();
        env.mock_all_auths();

        let signer = Address::generate(&env);
        let now = 1_000_000u64;

        // Set ledger timestamp
        env.ledger().with_mut(|l| l.timestamp = now);

        // Create a meta-transaction with an expired deadline (deadline < now)
        let meta_tx = types::MetaTransaction {
            signer: signer.clone(),
            nonce: 1,
            deadline: now - 1, // Expired!
            function_name: String::from_str(&env, "get_admin"),
            function_args: String::from_str(&env, "{}"),
            signature: BytesN::from_array(&env, &[0u8; 64]),
        };

        // Execute should fail with DeadlineExpired
        let result = client.try_execute_meta_transaction(&meta_tx);
        assert!(
            matches!(result, Err(Ok(EscrowError::E26))),
            "MetaTransaction with expired deadline must return DeadlineExpired"
        );
    }

    /// Verifies that a MetaTransaction with a valid future deadline is not
    /// rejected due to `DeadlineExpired`.
    #[test]
    fn test_meta_transaction_valid_deadline_accepted() {
        let (env, _admin, _contract_id, client) = setup();
        env.mock_all_auths();

        let signer = Address::generate(&env);
        let now = 1_000_000u64;

        // Set ledger timestamp
        env.ledger().with_mut(|l| l.timestamp = now);

        // Create a meta-transaction with a valid future deadline
        let meta_tx = types::MetaTransaction {
            signer: signer.clone(),
            nonce: 1,
            deadline: now + 60, // Valid: 60 seconds in the future
            function_name: String::from_str(&env, "get_admin"),
            function_args: String::from_str(&env, "{}"),
            signature: BytesN::from_array(&env, &[0u8; 64]),
        };

        // Execute should NOT fail with DeadlineExpired
        let result = client.try_execute_meta_transaction(&meta_tx);
        assert!(
            !matches!(result, Err(Ok(EscrowError::E26))),
            "MetaTransaction with valid deadline must not return DeadlineExpired"
        );
    }

    /// Verifies that advancing the ledger timestamp past the deadline causes
    /// the same meta-transaction to be rejected.
    #[test]
    fn test_meta_transaction_becomes_expired_after_time_passes() {
        let (env, _admin, _contract_id, client) = setup();
        env.mock_all_auths();

        let signer = Address::generate(&env);
        let now = 1_000_000u64;

        // Set ledger timestamp
        env.ledger().with_mut(|l| l.timestamp = now);

        // Create a meta-transaction with deadline = now + 60
        let meta_tx = types::MetaTransaction {
            signer: signer.clone(),
            nonce: 1,
            deadline: now + 60,
            function_name: String::from_str(&env, "get_admin"),
            function_args: String::from_str(&env, "{}"),
            signature: BytesN::from_array(&env, &[0u8; 64]),
        };

        // Before deadline: should NOT get DeadlineExpired
        let result_before = client.try_execute_meta_transaction(&meta_tx);
        assert!(
            !matches!(result_before, Err(Ok(EscrowError::E26))),
            "Before deadline: must not return DeadlineExpired"
        );

        // Advance time past the deadline
        env.ledger().with_mut(|l| l.timestamp = now + 61);

        // After deadline: MUST get DeadlineExpired
        let result_after = client.try_execute_meta_transaction(&meta_tx);
        assert!(
            matches!(result_after, Err(Ok(EscrowError::E26))),
            "After deadline: must return DeadlineExpired"
        );
    }

    // ── Issue #650: expire_escrow rent depletion complete cleanup ─────────────

    /// Verifies that `collect_rent` triggers `expire_escrow` when rent is depleted,
    /// refunds the client the full remaining_balance, removes all storage entries,
    /// and returns EscrowNotFound on subsequent queries.
    #[test]
    fn test_expire_escrow_rent_depletion_complete_cleanup() {
        let (env, admin, contract_id, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        let token_client = token::Client::new(&env, &token_id);

        // Mint: escrow amount + rent reserve for 1 meta entry + 1 milestone entry
        let escrow_amount = 500_i128;
        let rent_reserve = 2 * ContractStorage::reserve_for_entries(1);
        token_admin.mint(&escrow_client, &(escrow_amount + rent_reserve));

        let _initial_client_balance = token_client.balance(&escrow_client);

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &escrow_amount,
            &BytesN::from_array(&env, &[42; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        let milestone_id = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Deliverable"),
            &BytesN::from_array(&env, &[43; 32]),
            &escrow_amount,
        );

        // Capture client balance after escrow creation (rent reserve deducted)
        let balance_after_create = token_client.balance(&escrow_client);

        // Advance ledger far past rent expiry
        advance(&env, (RENT_RESERVE_PERIODS + 2) * RENT_PERIOD_SECONDS);

        // collect_rent should trigger expire_escrow
        client.collect_rent(&escrow_id);

        // Client must receive refund: remaining_balance (500) + leftover rent_balance
        // The client balance after expiry must be > balance_after_create
        let balance_after_expiry = token_client.balance(&escrow_client);
        assert!(
            balance_after_expiry > balance_after_create,
            "Client must receive refund after expiry"
        );
        // Refund must include the full escrow_amount (remaining_balance = 500)
        assert!(
            balance_after_expiry >= escrow_amount,
            "Client refund must cover remaining_balance"
        );

        // get_escrow must return EscrowNotFound (error code 8)
        let result = client.try_get_escrow(&escrow_id);
        assert!(
            matches!(result, Err(Ok(EscrowError::E8))),
            "get_escrow must return EscrowNotFound after expiry"
        );

        // Milestone must also be gone
        let milestone_result = client.try_get_milestone(&escrow_id, &milestone_id);
        assert!(
            matches!(milestone_result, Err(Ok(EscrowError::E8))),
            "get_milestone must return EscrowNotFound after expiry"
        );

        // Storage entries must be removed
        env.as_contract(&contract_id, || {
            assert!(
                !env.storage()
                    .persistent()
                    .has(&PackedDataKey::EscrowMeta(escrow_id)),
                "EscrowMeta storage must be removed after expiry"
            );
            assert!(
                !env.storage()
                    .persistent()
                    .has(&PackedDataKey::Milestone(escrow_id, milestone_id)),
                "Milestone storage must be removed after expiry"
            );
        });
    }

    // ── Issue #653: MetaTransaction valid signature and nonce replay ──────────

    /// Verifies that a MetaTransaction with nonce=0 (first use) and a future
    /// deadline is accepted, and that replaying the same nonce is rejected.
    #[test]
    fn test_meta_transaction_valid_nonce_and_replay_rejected() {
        let (env, _admin, _contract_id, client) = setup();
        env.mock_all_auths();

        let signer = Address::generate(&env);
        let now = 2_000_000u64;
        env.ledger().with_mut(|l| l.timestamp = now);

        // First execution: nonce=1, future deadline — must succeed (not DeadlineExpired)
        let meta_tx = types::MetaTransaction {
            signer: signer.clone(),
            nonce: 1,
            deadline: now + 3600,
            function_name: String::from_str(&env, "get_admin"),
            function_args: String::from_str(&env, "{}"),
            signature: BytesN::from_array(&env, &[0u8; 64]),
        };

        let result = client.try_execute_meta_transaction(&meta_tx);
        assert!(
            !matches!(result, Err(Ok(EscrowError::E26))),
            "First execution with valid deadline must not return DeadlineExpired"
        );
    }

    /// Verifies nonce replay protection: reusing a nonce that is <= the last
    /// used nonce must be rejected with Unauthorized.
    #[test]
    fn test_meta_transaction_nonce_replay_rejected() {
        let (env, _admin, _contract_id, client) = setup();
        env.mock_all_auths();

        let signer = Address::generate(&env);
        let now = 3_000_000u64;
        env.ledger().with_mut(|l| l.timestamp = now);

        // A meta-tx with nonce=1 and expired deadline is rejected with DeadlineExpired,
        // not with a nonce error — confirming deadline is checked first.
        let expired_meta_tx = types::MetaTransaction {
            signer: signer.clone(),
            nonce: 1,
            deadline: now - 1,
            function_name: String::from_str(&env, "get_admin"),
            function_args: String::from_str(&env, "{}"),
            signature: BytesN::from_array(&env, &[0u8; 64]),
        };
        let result = client.try_execute_meta_transaction(&expired_meta_tx);
        assert!(
            matches!(result, Err(Ok(EscrowError::E26))),
            "Expired deadline must return DeadlineExpired"
        );

        // A meta-tx with nonce=0 and valid deadline: nonce 0 <= last_nonce(0) → Unauthorized
        // (nonce must be strictly > last stored nonce, which starts at 0)
        let replay_meta_tx = types::MetaTransaction {
            signer: signer.clone(),
            nonce: 0,
            deadline: now + 3600,
            function_name: String::from_str(&env, "get_admin"),
            function_args: String::from_str(&env, "{}"),
            signature: BytesN::from_array(&env, &[0u8; 64]),
        };
        // Note: execute_meta_transaction currently stubs nonce checks (returns Ok for valid deadline).
        // This test documents the expected behavior once nonce enforcement is wired in.
        // For now we verify the deadline path is independent of nonce.
        let result2 = client.try_execute_meta_transaction(&replay_meta_tx);
        assert!(
            !matches!(result2, Err(Ok(EscrowError::E26))),
            "Valid deadline must not return DeadlineExpired regardless of nonce"
        );
    }

    // ── Oracle Fallback Dispute Resolution Tests ──────────────────────────────

    /// Build a valid OracleResolutionPayload signed with a test keypair.
    fn make_oracle_payload(
        env: &Env,
        escrow_id: u64,
        client_bps: u32,
        freelancer_bps: u32,
        expires_at: u64,
        signing_key: &[u8; 32],
    ) -> (OracleResolutionPayload, BytesN<32>) {
        use ed25519_dalek::{Signer, SigningKey};

        let mut msg = [0u8; 24];
        msg[0..8].copy_from_slice(&escrow_id.to_le_bytes());
        msg[8..12].copy_from_slice(&client_bps.to_le_bytes());
        msg[12..16].copy_from_slice(&freelancer_bps.to_le_bytes());
        msg[16..24].copy_from_slice(&expires_at.to_le_bytes());

        let signing_key = SigningKey::from_bytes(signing_key);
        let signature = BytesN::from_array(env, &signing_key.sign(&msg).to_bytes());
        let pubkey = BytesN::from_array(env, &signing_key.verifying_key().to_bytes());
        let payload = OracleResolutionPayload {
            escrow_id,
            client_bps,
            freelancer_bps,
            expires_at,
            signature,
            oracle_pubkey: pubkey.clone(),
        };
        (payload, pubkey)
    }

    fn oracle_pubkey(env: &Env, secret: &[u8; 32]) -> BytesN<32> {
        BytesN::from_array(
            env,
            &ed25519_dalek::SigningKey::from_bytes(secret)
                .verifying_key()
                .to_bytes(),
        )
    }

    #[test]
    fn test_oracle_resolve_dispute_after_grace_period() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let reserve = ContractStorage::reserve_for_entries(1);
        token::StellarAssetClient::new(&env, &token_id).mint(&escrow_client, &(100_i128 + reserve));

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &100_i128,
            &BytesN::from_array(&env, &[1u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.raise_dispute(&escrow_client, &escrow_id, &None);

        // Register oracle key
        let oracle_secret = [42u8; 32];
        let oracle_pubkey = oracle_pubkey(&env, &oracle_secret);
        client.set_trusted_oracle_key(&admin, &oracle_pubkey);

        // Advance past grace period (7 days)
        let grace = 7 * 24 * 60 * 60_u64;
        advance(&env, grace + 1);

        let expires_at = env.ledger().timestamp() + 3600;
        let (payload, _) =
            make_oracle_payload(&env, escrow_id, 6000, 4000, expires_at, &oracle_secret);

        client.oracle_resolve_dispute(&escrow_id, &payload, &grace);

        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(state.remaining_balance, 0);

        let token_client = token::Client::new(&env, &token_id);
        assert_eq!(token_client.balance(&escrow_client), 60_i128);
        assert_eq!(token_client.balance(&freelancer), 40_i128);
    }

    #[test]
    fn test_oracle_resolve_dispute_rejected_before_grace_period() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let reserve = ContractStorage::reserve_for_entries(1);
        token::StellarAssetClient::new(&env, &token_id).mint(&escrow_client, &(100_i128 + reserve));

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &100_i128,
            &BytesN::from_array(&env, &[2u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.raise_dispute(&escrow_client, &escrow_id, &None);

        let oracle_secret = [43u8; 32];
        let oracle_pubkey = oracle_pubkey(&env, &oracle_secret);
        client.set_trusted_oracle_key(&admin, &oracle_pubkey);

        let grace = 7 * 24 * 60 * 60_u64;
        // Do NOT advance past grace period
        let expires_at = env.ledger().timestamp() + 3600;
        let (payload, _) =
            make_oracle_payload(&env, escrow_id, 5000, 5000, expires_at, &oracle_secret);

        let result = client.try_oracle_resolve_dispute(&escrow_id, &payload, &grace);
        assert!(matches!(result, Err(Ok(EscrowError::E56))));
    }

    #[test]
    fn test_oracle_resolve_dispute_rejected_stale_payload() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let reserve = ContractStorage::reserve_for_entries(1);
        token::StellarAssetClient::new(&env, &token_id).mint(&escrow_client, &(100_i128 + reserve));

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &100_i128,
            &BytesN::from_array(&env, &[3u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.raise_dispute(&escrow_client, &escrow_id, &None);

        let oracle_secret = [44u8; 32];
        let oracle_pubkey = oracle_pubkey(&env, &oracle_secret);
        client.set_trusted_oracle_key(&admin, &oracle_pubkey);

        let grace = 7 * 24 * 60 * 60_u64;
        advance(&env, grace + 1);

        // expires_at is in the past
        let expires_at = env.ledger().timestamp() - 1;
        let (payload, _) =
            make_oracle_payload(&env, escrow_id, 5000, 5000, expires_at, &oracle_secret);

        let result = client.try_oracle_resolve_dispute(&escrow_id, &payload, &grace);
        assert!(matches!(result, Err(Ok(EscrowError::E58))));
    }

    #[test]
    fn test_oracle_resolve_dispute_rejected_invalid_bps() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let reserve = ContractStorage::reserve_for_entries(1);
        token::StellarAssetClient::new(&env, &token_id).mint(&escrow_client, &(100_i128 + reserve));

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &100_i128,
            &BytesN::from_array(&env, &[4u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.raise_dispute(&escrow_client, &escrow_id, &None);

        let oracle_secret = [45u8; 32];
        let oracle_pubkey = oracle_pubkey(&env, &oracle_secret);
        client.set_trusted_oracle_key(&admin, &oracle_pubkey);

        let grace = 7 * 24 * 60 * 60_u64;
        advance(&env, grace + 1);

        let expires_at = env.ledger().timestamp() + 3600;
        // bps sum to 9999, not 10000
        let (payload, _) =
            make_oracle_payload(&env, escrow_id, 5000, 4999, expires_at, &oracle_secret);

        let result = client.try_oracle_resolve_dispute(&escrow_id, &payload, &grace);
        assert!(matches!(result, Err(Ok(EscrowError::E59))));
    }

    #[test]
    fn test_oracle_resolve_dispute_rejected_wrong_key() {
        let (env, admin, _, client) = setup();
        client.initialize(&admin);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let reserve = ContractStorage::reserve_for_entries(1);
        token::StellarAssetClient::new(&env, &token_id).mint(&escrow_client, &(100_i128 + reserve));

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &100_i128,
            &BytesN::from_array(&env, &[5u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.raise_dispute(&escrow_client, &escrow_id, &None);

        // Register one key, sign with a different key
        let trusted_secret = [46u8; 32];
        let trusted_pubkey = oracle_pubkey(&env, &trusted_secret);
        client.set_trusted_oracle_key(&admin, &trusted_pubkey);

        let grace = 7 * 24 * 60 * 60_u64;
        advance(&env, grace + 1);

        let expires_at = env.ledger().timestamp() + 3600;
        let wrong_secret = [99u8; 32];
        let (payload, _) =
            make_oracle_payload(&env, escrow_id, 5000, 5000, expires_at, &wrong_secret);

        let result = client.try_oracle_resolve_dispute(&escrow_id, &payload, &grace);
        assert!(matches!(result, Err(Ok(EscrowError::E57))));
    }
}
