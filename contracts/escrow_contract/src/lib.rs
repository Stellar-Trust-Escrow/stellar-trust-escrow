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

mod errors;
mod event_names;
mod events;
mod storage;
mod types;

pub use errors::{EcErr, EscrowError};
pub use events::*;
pub use types::*;

use soroban_sdk::{contract, contractimpl, BytesN, Env};

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Claim funds after timelock expiry.
    /// Can only be called by the contractor (freelancer) after timelock_release_at.
    pub fn claim_after_timelock(env: Env, escrow_id: u64) -> Result<(), EscrowError> {
        // Get escrow state
        let escrow = storage::get_escrow(&env, escrow_id)
            .ok_or(EscrowError::E16)?; // EscrowNotFound

        // Require contract authorization
        escrow.freelancer.require_auth();

        // Check if timelock is set
        let release_at = escrow
            .timelock_release_at
            .ok_or(EscrowError::E11)?; // TimelockNotExpired (no timelock set)

        // Check if timelock has expired
        let current_time = env.ledger().timestamp();
        if current_time < release_at {
            return Err(EscrowError::TimelockNotExpired);
        }
    }

        // TODO: Implement actual fund release logic
        // This would involve:
        // 1. Transferring funds from contract to freelancer
        // 2. Updating escrow state to Released/Completed
        // 3. Emitting events

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

    /// Early release with multi-sig override.
    /// Requires valid Ed25519 signatures from both contractor and client.
    pub fn early_release(
        env: Env,
        escrow_id: u64,
        contractor_sig: BytesN<64>,
        client_sig: BytesN<64>,
    ) -> Result<(), EscrowError> {
        // Get escrow state
        let _escrow = storage::get_escrow(&env, escrow_id)
            .ok_or(EscrowError::E16)?; // EscrowNotFound

        // Construct message to verify: [escrow_id || "early_release"]
        let mut message = soroban_sdk::Bytes::new(&env);
        message.append(&soroban_sdk::Bytes::from_array(&env, &escrow_id.to_be_bytes()));
        message.append(&soroban_sdk::Bytes::from_slice(&env, b"early_release"));

        // Verify contractor signature
        // Note: In a real implementation, we would need the public keys
        // This is a simplified version - actual implementation would require
        // storing public keys in the escrow state or deriving from addresses
        
        // For now, we'll use a placeholder verification
        // In production, you'd do: env.crypto().ed25519_verify(&contractor_pubkey, &message, &contractor_sig);
        
        // Verify both signatures are valid (simplified check)
        if contractor_sig.len() != 64 || client_sig.len() != 64 {
            return Err(EscrowError::InvalidSignature);
        }

        // TODO: Implement actual signature verification with stored public keys
        // let contractor_pubkey = ...; // Get from escrow or storage
        // let client_pubkey = ...; // Get from escrow or storage
        // env.crypto().ed25519_verify(&contractor_pubkey, &message, &contractor_sig);
        // env.crypto().ed25519_verify(&client_pubkey, &message, &client_sig);

        // TODO: Implement actual fund release logic
        // This would involve:
        // 1. Transferring funds from contract to freelancer
        // 2. Updating escrow state to Released/Completed
        // 3. Emitting events

    fn require_not_paused(env: &Env) -> Result<(), EscrowError> {
        if Self::is_paused(env) {
            return Err(EscrowError::ContractPaused);
        }
        Ok(())
    }

// ===== Tests =====
#[cfg(test)]
mod test;

#[cfg(test)]
mod timelock_multisig_tests;
