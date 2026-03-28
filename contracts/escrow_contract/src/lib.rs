//! # StellarTrustEscrow — Soroban Smart Contract
//!
//! Milestone-based escrow with on-chain reputation on the Stellar network.
//!
//! ## Gas Optimizations (Issue #65)
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
//! ## Security Audit Checklist
//!
//! The following checklist should be used when reviewing and auditing the smart contract:
//!
//! 1. **Reentrancy**: Check for potential reentrancy vulnerabilities in the contract.
//! 2. **Unprotected functions**: Verify that all functions are properly protected with access modifiers.
//! 3. **Unvalidated inputs**: Ensure that all inputs are validated and sanitized to prevent potential attacks.
//! 4. **Use of unsafe functions**: Review the use of unsafe functions and ensure they are properly handled.
//! 5. **Error handling**: Verify that the contract properly handles errors and exceptions.
//! 6. **Testing**: Ensure that the contract has been thoroughly tested, including edge cases and potential attack vectors.
//!
#![no_std]
#![allow(clippy::too_many_arguments)]

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
pub use types::{DataKey, EscrowState, EscrowStatus, Milestone, MilestoneStatus, ReputationRecord};

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
    pub(crate) arbiter: Option<Address>,
    pub(crate) created_at: u64,
    pub(crate) deadline: Option<u64>,
    /// Optional lock time (ledger timestamp) - funds locked until this time.
    pub(crate) lock_time: Option<u64>,
    /// Optional extension deadline for the lock time.
    pub(crate) lock_time_extension: Option<u64>,
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
            .get::<Address>(&DataKey::Admin)
            .ok_or(EscrowError::StorageError)?;
        if admin != *caller {
            return Err(EscrowError::Unauthorized);
        }
        Ok(())
    }
}