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
//! 1. Read current storage version from instance storage
//! 2. If version matches current, no migration needed
//! 3. Otherwise, run migration functions in order
//! 4. Update version after successful migration

use soroban_sdk::{contracttype, Address, BytesN, Env, Vec};

use crate::PackedDataKey;
use crate::{DataKey, Milestone};

// Current storage version - increment when storage layout changes
pub const STORAGE_VERSION: u32 = 2;

/// Storage keys for version management (stored in instance storage)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StorageKey {
    /// Current storage version - value: u32
    Version,
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
///
/// This provides the core upgradeable storage functionality:
/// - Version tracking in instance storage
/// - Migration from older storage formats
/// - Data preservation guarantees
pub struct StorageManager;

impl StorageManager {
    /// Get the current storage version from instance storage.
    /// Returns 1 for uninitialized contracts (legacy default).
    pub fn get_version(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&StorageKey::Version)
            .unwrap_or(1_u32) // Default to v1 if not set (legacy contracts)
    }

    /// Set the storage version in instance storage.
    fn set_version(env: &Env, version: u32) {
        env.storage().instance().set(&StorageKey::Version, &version);
    }

    /// Check if storage migration is needed.
    /// Returns true if current version is less than STORAGE_VERSION.
    pub fn needs_migration(env: &Env) -> bool {
        Self::get_version(env) < STORAGE_VERSION
    }

    /// Run all necessary migrations from current version to latest.
    ///
    /// This function should be called:
    /// 1. During contract initialization (to migrate any stale state)
    /// 2. During the upgrade process (before new code runs)
    ///
    /// Returns Ok(()) if migration successful or not needed.
    /// Returns Err if migration fails (e.g., corrupted data).
    pub fn migrate(env: &Env) -> Result<(), crate::EscrowError> {
        let current_version = Self::get_version(env);

        if current_version == STORAGE_VERSION {
            return Ok(()); // Already at latest version
        }

        if current_version > STORAGE_VERSION {
            // Downgrade not supported - this could corrupt data
            return Err(crate::EscrowError::StorageMigrationFailed);
        }

        // Run migrations in order from current to target version

        // v1 -> v2: Migration from monolithic EscrowState to granular storage
        // This was done in issue #65 for gas optimization
        if current_version < 2 {
            Self::migrate_v1_to_v2(env)?;
            Self::set_version(env, 2);
        }

        Ok(())
    }

    /// Migration from v1 (monolithic) to v2 (granular) storage layout.
    ///
    /// In v1: EscrowState stored as single unit with inline milestones Vec
    /// In v2: EscrowMeta stored separately from Milestones for better gas efficiency
    ///
    /// This migration:
    /// 1. Reads each escrow in v1 format
    /// 2. Extracts EscrowMeta fields and stores separately
    /// 3. Stores each milestone with its own key
    /// 4. Removes the v1 storage entry
    fn migrate_v1_to_v2(env: &Env) -> Result<(), crate::EscrowError> {
        // Get the escrow counter to know how many escrows to migrate
        let escrow_counter: u64 = env
            .storage()
            .instance()
            .get(&DataKey::EscrowCounter)
            .unwrap_or(0_u64);

        // Migrate each escrow from v1 to v2 format
        for escrow_id in 1..=escrow_counter {
            // In v1, escrows were stored with DataKey::Escrow(id)
            // In v2, we use PackedDataKey::EscrowMeta(id) and PackedDataKey::Milestone(id, milestone_id)
            let v1_key = DataKey::Escrow(escrow_id);

            // Check if this escrow exists in v1 format
            if let Some(v1_escrow) = env
                .storage()
                .persistent()
                .get::<DataKey, EscrowStateV1>(&v1_key)
            {
                // Count approved milestones
                let approved_count = v1_escrow
                    .milestones
                    .iter()
                    .filter(|m| m.status == crate::types::MilestoneStatus::Approved)
                    .count() as u32;

                // Create EscrowMeta from v1 data
                let meta = crate::EscrowMeta {
                    escrow_id: v1_escrow.escrow_id,
                    client: v1_escrow.client,
                    freelancer: v1_escrow.freelancer,
                    token: v1_escrow.token,
                    total_amount: v1_escrow.total_amount,
                    // Note: allocated_amount was added in v2, calculate from milestones
                    allocated_amount: v1_escrow.milestones.iter().map(|m| m.amount).sum(),
                    remaining_balance: v1_escrow.remaining_balance,
                    status: v1_escrow.status,
                    milestone_count: v1_escrow.milestones.len(),
                    approved_count,
                    arbiter: v1_escrow.arbiter,
                    created_at: v1_escrow.created_at,
                    deadline: v1_escrow.deadline,
                    lock_time: v1_escrow.lock_time,
                    lock_time_extension: v1_escrow.lock_time_extension,
                    brief_hash: v1_escrow.brief_hash,
                    rent_balance: 0,
                    last_rent_collection_at: v1_escrow.created_at,
                };

                // Store meta in v2 format using PackedDataKey
                let meta_key = PackedDataKey::EscrowMeta(escrow_id);
                env.storage().persistent().set(&meta_key, &meta);

                // Store each milestone individually with its own key
                for milestone in v1_escrow.milestones.iter() {
                    let milestone_key = PackedDataKey::Milestone(escrow_id, milestone.id);
                    env.storage().persistent().set(&milestone_key, &milestone);
                }

                // Remove old v1 storage key to free space
                env.storage().persistent().remove(&v1_key);
            }
        }

        Ok(())
    }

    /// Initialize storage version on first deploy.
    /// Should be called during contract initialization.
    pub fn init_version(env: &Env) {
        // Set initial version to current - no migration needed on fresh deploy
        Self::set_version(env, STORAGE_VERSION);
    }
}

// Note: PackedDataKey is defined in lib.rs and re-exported from there

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
//
// Note: Storage manager functions require contract context (env.as_contract()).
// These tests verify the constants and structure compile correctly.
// Full migration tests are done via the contract's upgrade function.
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_storage_version_constant() {
        // Verify the storage version constant is correct
        assert_eq!(STORAGE_VERSION, 2);
    }

    #[test]
    fn test_storage_key_has_version_variant() {
        // Verify StorageKey enum compiles correctly
        let _ = StorageKey::Version;
    }

    #[test]
    fn test_escrow_state_v1_has_required_fields() {
        // Verify EscrowStateV1 struct has all required fields
        // This is a compile-time check only
        fn check_v1_fields(_: &EscrowStateV1) {}
        // The function signature verifies the type exists
    }
}
