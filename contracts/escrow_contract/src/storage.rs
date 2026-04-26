//! # Upgradeable Storage
//!
//! This module provides storage isolation for safe contract upgrades.
//! It manages storage versioning and migration to prevent data corruption
//! during contract upgrades.
//!
//! ## Storage Layout
//!
//! The contract uses two storage areas:
//!
//! 1. **Instance Storage**: Used for admin, pause state, escrow counter, and
//!    storage version. This data persists across upgrades.
//!
//! 2. **Persistent Storage**: Used for escrow meta, milestones, reputation,
//!    cancellation requests, and slash records. This data IS versioned.
//!
//! ## Version History
//!
//! - Version 1 (v1): Initial storage layout - escrow data stored with
//!   milestones inline in the EscrowState struct.
//! - Version 2 (v2): Granular storage - EscrowMeta stored separately from
//!   individual Milestones for better gas efficiency (see issue #65).
//!
//! ## Migration Strategy
//!
//! When upgrading:
//! 1. Read current storage version from instance storage.
//! 2. If version matches current, no migration needed.
//! 3. Otherwise, run migration functions in order.
//! 4. For large datasets, migration uses a MigrationCursor to process in batches.
//! 5. Update version only after all batches are complete.

use soroban_sdk::{contracttype, Address, BytesN, Env, Vec};

use crate::PackedDataKey;
use crate::{DataKey, Milestone, OptionalTimelock, MS_APPROVED, MS_RELEASED, MS_SUBMITTED};

/// Current storage version - increment when storage layout changes
pub const STORAGE_VERSION: u32 = 2;

/// Maximum number of escrows to process in a single migration transaction
/// to stay within Soroban's ledger entry limits (typically 64 entries).
pub const MAX_MIGRATION_BATCH: u32 = 20;

/// Storage keys for version management (stored in instance storage)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StorageKey {
    /// Current storage version - value: u32
    Version,
    /// Last processed escrow ID for multi-transaction migration - value: u64
    MigrationCursor,
}

/// Legacy v1 escrow state format for migration reference.
/// In v1, EscrowState stored milestones inline as a Vec.
#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowStateV1 {
    pub escrow_id: u64,
    pub client: Address,
    pub freelancer: Address,
    pub token: Address,
    pub total_amount: i128,
    pub remaining_balance: i128,
    pub status: crate::types::EscrowStatus,
    pub milestones: Vec<Milestone>,
    pub arbiter: Option<Address>,
    pub created_at: u64,
    pub deadline: Option<u64>,
    pub lock_time: Option<u64>,
    pub lock_time_extension: Option<u64>,
    pub brief_hash: BytesN<32>,
}

/// Storage manager for handling versioned storage access and migrations.
pub struct StorageManager;

impl StorageManager {
    /// Get the current storage version from instance storage.
    pub fn get_version(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&StorageKey::Version)
            .unwrap_or(1_u32) // Default to v1 if not set
    }

    /// Set the storage version in instance storage.
    fn set_version(env: &Env, version: u32) {
        env.storage().instance().set(&StorageKey::Version, &version);
    }

    /// Check if storage migration is needed.
    pub fn needs_migration(env: &Env) -> bool {
        Self::get_version(env) < STORAGE_VERSION
    }

    /// Run necessary migrations from current version to latest using batching.
    pub fn migrate(env: &Env) -> Result<(), crate::EscrowError> {
        let current_version = Self::get_version(env);

        if current_version == STORAGE_VERSION {
            return Ok(());
        }

        if current_version > STORAGE_VERSION {
            return Err(crate::EscrowError::StorageMigrationFailed);
        }

        // v1 -> v2: Migration from monolithic EscrowState to granular storage
        if current_version < 2 {
            let cursor: u64 = env.storage()
                .instance()
                .get(&StorageKey::MigrationCursor)
                .unwrap_or(0_u64);

            let escrow_counter: u64 = env.storage()
                .instance()
                .get(&DataKey::EscrowCounter)
                .unwrap_or(0_u64);

            if cursor < escrow_counter {
                // Process the next batch
                let start_id = cursor + 1;
                let last_id = Self::migrate_v1_to_v2(env, start_id, MAX_MIGRATION_BATCH)?;

                // Update progress cursor
                env.storage().instance().set(&StorageKey::MigrationCursor, &last_id);

                // Finalize version only when all escrows are migrated
                if last_id >= escrow_counter {
                    Self::set_version(env, 2);
                }
            } else {
                // If no escrows exist or migration was already done but version wasn't set
                Self::set_version(env, 2);
            }
        }

        Ok(())
    }

    /// Migration from v1 to v2 with range-based batching.
    ///
    /// Returns the ID of the last escrow processed in this batch.
    pub fn migrate_v1_to_v2(
        env: &Env, 
        start_id: u64, 
        max_count: u32
    ) -> Result<u64, crate::EscrowError> {
        let escrow_counter: u64 = env.storage()
            .instance()
            .get(&DataKey::EscrowCounter)
            .unwrap_or(0_u64);

        let end_id = core::cmp::min(start_id + (max_count as u64) - 1, escrow_counter);

        for escrow_id in start_id..=end_id {
            let v1_key = DataKey::Escrow(escrow_id);

            if let Some(v1_escrow) = env
                .storage()
                .persistent()
                .get::<DataKey, EscrowStateV1>(&v1_key)
            {
                // Calculate derived counts for v2 meta structure
                let approved_count = v1_escrow.milestones.iter().filter(|m| m.status == crate::MS_APPROVED).count() as u32;
                let released_count = v1_escrow.milestones.iter().filter(|m| m.status == crate::MS_RELEASED).count() as u32;
                let submitted_count = v1_escrow.milestones.iter().filter(|m| m.status == crate::MS_SUBMITTED).count() as u32;

                // Count approved milestones
                let approved_count = v1_escrow
                    .milestones
                    .iter()
                    .filter(|m| m.status == MS_APPROVED)
                    .count() as u32;
                let released_count = v1_escrow
                    .milestones
                    .iter()
                    .filter(|m| m.status == MS_RELEASED)
                    .count() as u32;
                let submitted_count = v1_escrow
                    .milestones
                    .iter()
                    .filter(|m| m.status == MS_SUBMITTED)
                    .count() as u32;

                // Create EscrowMeta from v1 data
                let meta = crate::EscrowMeta {
                    escrow_id: v1_escrow.escrow_id,
                    client: v1_escrow.client,
                    freelancer: v1_escrow.freelancer,
                    token: v1_escrow.token,
                    total_amount: v1_escrow.total_amount,
                    allocated_amount: v1_escrow.milestones.iter().map(|m| m.amount).sum(),
                    remaining_balance: v1_escrow.remaining_balance,
                    status: v1_escrow.status,
                    milestone_count: v1_escrow.milestones.len(),
                    approved_count,
                    released_count,
                    submitted_count,
                    arbiter: v1_escrow.arbiter,
                    buyer_signers: soroban_sdk::Vec::new(env),
                    created_at: v1_escrow.created_at,
                    deadline: v1_escrow.deadline,
                    lock_time: v1_escrow.lock_time,
                    lock_time_extension: v1_escrow.lock_time_extension,
                    timelock: OptionalTimelock::None,
                    brief_hash: v1_escrow.brief_hash,
                    rent_balance: 0,
                    last_rent_collection_at: v1_escrow.created_at,
                };

                // Store meta using PackedDataKey (V2 format)
                env.storage().persistent().set(&PackedDataKey::EscrowMeta(escrow_id), &meta);

                // Store each milestone individually (V2 format)
                for milestone in v1_escrow.milestones.iter() {
                    let milestone_key = PackedDataKey::Milestone(escrow_id, milestone.id);
                    env.storage().persistent().set(&milestone_key, &milestone);
                }

                // Remove the old monolithic V1 entry
                env.storage().persistent().remove(&v1_key);
            }
        }

        Ok(end_id)
    }

    /// Initialize storage version on first deploy.
    pub fn init_version(env: &Env) {
        Self::set_version(env, STORAGE_VERSION);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_storage_version_constant() {
        assert_eq!(STORAGE_VERSION, 2);
    }

    #[test]
    fn test_batch_constant() {
        assert_eq!(MAX_MIGRATION_BATCH, 20);
    }
}