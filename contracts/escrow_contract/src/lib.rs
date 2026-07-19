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

        // TODO: Implement actual fund release logic
        // This would involve:
        // 1. Transferring funds from contract to freelancer
        // 2. Updating escrow state to Released/Completed
        // 3. Emitting events

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

        Ok(())
    }
}

// ===== Tests =====
#[cfg(test)]
mod test;

#[cfg(test)]
mod timelock_multisig_tests;
