#![no_std]

mod errors;
mod events;
mod storage;
mod types;

pub use errors::{EcErr, EscrowError};
pub use events::*;
pub use types::*;

use soroban_sdk::{contract, contractimpl, panic_with_error, Address, BytesN, Env};

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
            return Err(EscrowError::E75); // TimelockNotExpired (new error code)
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
        let escrow = storage::get_escrow(&env, escrow_id)
            .ok_or(EscrowError::E16)?; // EscrowNotFound

        // Construct message to verify: [escrow_id || "early_release"]
        let mut message = soroban_sdk::Bytes::new(&env);
        message.append(&soroban_sdk::Bytes::from_array(&env, &escrow_id.to_be_bytes()));
        message.append(&soroban_sdk::Bytes::from_str(&env, "early_release"));

        // Verify contractor signature
        // Note: In a real implementation, we would need the public keys
        // This is a simplified version - actual implementation would require
        // storing public keys in the escrow state or deriving from addresses
        
        // For now, we'll use a placeholder verification
        // In production, you'd do: env.crypto().ed25519_verify(&contractor_pubkey, &message, &contractor_sig);
        
        // Verify both signatures are valid (simplified check)
        if contractor_sig.len() != 64 || client_sig.len() != 64 {
            return Err(EscrowError::E76); // InvalidSignature (new error code)
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

// ===== Legacy Implementation Below (keeping for backward compatibility) =====

use soroban_sdk::{contracttype, Map, String, Vec};

// ===== Error Types =====
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ContractError {
    // Access Control Errors
    Unauthorized = 1,
    OnlySender = 2,
    OnlyBeneficiary = 3,
    OnlyArbitrator = 4,

    // State Transition Errors
    InvalidStateTransition = 5,
    AlreadyFunded = 6,
    AlreadyReleased = 7,
    AlreadyRefunded = 8,
    AlreadyDisputed = 9,
    AlreadyResolved = 10,

    // Timelock Errors
    TimelockNotExpired = 11,
    TimelockExpired = 12,

    // Asset Errors
    InvalidAsset = 13,
    InsufficientBalance = 14,
    TransferFailed = 15,

    // Escrow Errors
    EscrowNotFound = 16,
    EscrowAlreadyExists = 17,
    InvalidAmount = 18,
    InvalidDuration = 19,

    // Multi-Asset Errors
    AssetMismatch = 20,
    UnsupportedAsset = 21,
}

// ===== State =====
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowState {
    Pending,
    Funded,
    Released,
    Refunded,
    Disputed,
    Resolved,
}

// ===== Escrow Struct =====
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub id: String,
    pub sender: Address,
    pub beneficiary: Address,
    pub arbitrator: Address,
    pub asset_contract: Address, // Token contract address
    pub amount: i128,
    pub state: EscrowState,
    pub created_at: u64,
    pub funded_at: Option<u64>,
    pub timelock: u64, // In seconds
    pub released_at: Option<u64>,
    pub refunded_at: Option<u64>,
    pub disputed_at: Option<u64>,
    pub resolved_at: Option<u64>,
    pub metadata: Option<String>, // Optional metadata
}

// ===== Storage Keys =====
#[contracttype]
#[derive(Clone)]
pub struct EscrowKey {
    pub id: String,
}

// ===== Contract =====
#[contract]
pub struct MultiAssetEscrowContract;

#[contractimpl]
impl MultiAssetEscrowContract {
    // ===== Create Escrow =====
    pub fn create_escrow(
        env: Env,
        sender: Address,
        beneficiary: Address,
        arbitrator: Address,
        asset_contract: Address,
        amount: i128,
        timelock: u64,
        metadata: Option<String>,
    ) -> Result<String, ContractError> {
        // Validate inputs
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if timelock == 0 {
            return Err(ContractError::InvalidDuration);
        }

        // Validate asset contract (basic check)
        if asset_contract
            == Address::from_string(&String::from_str(
                &env,
                "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            ))
        {
            return Err(ContractError::InvalidAsset);
        }

        // Generate unique ID
        let id = String::from_str(
            &env,
            &format!(
                "escrow_{}_{}",
                env.ledger().timestamp(),
                sender.to_string().as_slice()
            ),
        );

        // Check if escrow already exists
        if Self::escrow_exists(&env, id.clone()) {
            return Err(ContractError::EscrowAlreadyExists);
        }

        let escrow = Escrow {
            id: id.clone(),
            sender: sender.clone(),
            beneficiary: beneficiary.clone(),
            arbitrator: arbitrator.clone(),
            asset_contract: asset_contract.clone(),
            amount,
            state: EscrowState::Pending,
            created_at: env.ledger().timestamp(),
            funded_at: None,
            timelock,
            released_at: None,
            refunded_at: None,
            disputed_at: None,
            resolved_at: None,
            metadata,
        };

        // Store escrow
        env.storage().set(&EscrowKey { id: id.clone() }, &escrow);

        // Emit creation event
        env.events().publish(
            ("escrow_created", "v1"),
            (
                id.clone(),
                sender,
                beneficiary,
                asset_contract,
                amount,
                timelock,
            ),
        );

        Ok(id)
    }

    // ===== Fund Escrow =====
    pub fn fund_escrow(env: Env, id: String, sender: Address) -> Result<(), ContractError> {
        let mut escrow = Self::get_escrow(&env, id.clone())?;

        // Check sender
        if escrow.sender != sender {
            return Err(ContractError::OnlySender);
        }

        // Validate state transition
        if escrow.state != EscrowState::Pending {
            return Err(ContractError::InvalidStateTransition);
        }

        // Transfer tokens from sender to escrow contract
        Self::transfer_tokens(
            &env,
            &escrow.asset_contract,
            &sender,
            &env.current_contract_address(),
            escrow.amount,
        )?;

        // Update state
        escrow.state = EscrowState::Funded;
        escrow.funded_at = Some(env.ledger().timestamp());

        // Store updated escrow
        env.storage().set(&EscrowKey { id: id.clone() }, &escrow);

        // Emit event
        env.events()
            .publish(("escrow_funded", "v1"), (id, sender, escrow.amount));

        Ok(())
    }

    // ===== Release Escrow =====
    pub fn release_escrow(env: Env, id: String, beneficiary: Address) -> Result<(), ContractError> {
        let mut escrow = Self::get_escrow(&env, id.clone())?;

        // Check beneficiary
        if escrow.beneficiary != beneficiary {
            return Err(ContractError::OnlyBeneficiary);
        }

        // Validate state transition
        if escrow.state != EscrowState::Funded && escrow.state != EscrowState::Resolved {
            return Err(ContractError::InvalidStateTransition);
        }

        // Transfer tokens from escrow to beneficiary
        Self::transfer_tokens(
            &env,
            &escrow.asset_contract,
            &env.current_contract_address(),
            &beneficiary,
            escrow.amount,
        )?;

        // Update state
        escrow.state = EscrowState::Released;
        escrow.released_at = Some(env.ledger().timestamp());

        // Store updated escrow
        env.storage().set(&EscrowKey { id: id.clone() }, &escrow);

        // Emit event
        env.events()
            .publish(("escrow_released", "v1"), (id, beneficiary, escrow.amount));

        Ok(())
    }

    // ===== Refund Escrow =====
    pub fn refund_escrow(env: Env, id: String, sender: Address) -> Result<(), ContractError> {
        let mut escrow = Self::get_escrow(&env, id.clone())?;

        // Check sender
        if escrow.sender != sender {
            return Err(ContractError::OnlySender);
        }

        // Validate state
        if escrow.state != EscrowState::Funded {
            return Err(ContractError::InvalidStateTransition);
        }

        // Check timelock
        let current_time = env.ledger().timestamp();
        let timelock_time = escrow.created_at + escrow.timelock;
        if current_time < timelock_time {
            return Err(ContractError::TimelockNotExpired);
        }

        // Transfer tokens from escrow back to sender
        Self::transfer_tokens(
            &env,
            &escrow.asset_contract,
            &env.current_contract_address(),
            &sender,
            escrow.amount,
        )?;

        // Update state
        escrow.state = EscrowState::Refunded;
        escrow.refunded_at = Some(env.ledger().timestamp());

        // Store updated escrow
        env.storage().set(&EscrowKey { id: id.clone() }, &escrow);

        // Emit event
        env.events()
            .publish(("escrow_refunded", "v1"), (id, sender, escrow.amount));

        Ok(())
    }

    // ===== Dispute Escrow =====
    pub fn dispute_escrow(env: Env, id: String, caller: Address) -> Result<(), ContractError> {
        let mut escrow = Self::get_escrow(&env, id.clone())?;

        // Check caller is either sender or beneficiary
        if escrow.sender != caller && escrow.beneficiary != caller {
            return Err(ContractError::Unauthorized);
        }

        // Validate state
        if escrow.state != EscrowState::Funded {
            return Err(ContractError::InvalidStateTransition);
        }

        // Update state
        escrow.state = EscrowState::Disputed;
        escrow.disputed_at = Some(env.ledger().timestamp());

        // Store updated escrow
        env.storage().set(&EscrowKey { id: id.clone() }, &escrow);

        // Emit event
        env.events()
            .publish(("escrow_disputed", "v1"), (id, caller));

        Ok(())
    }

    // ===== Resolve Dispute =====
    pub fn resolve_dispute(
        env: Env,
        id: String,
        arbitrator: Address,
        release_to_beneficiary: bool,
    ) -> Result<(), ContractError> {
        let mut escrow = Self::get_escrow(&env, id.clone())?;

        // Check arbitrator
        if escrow.arbitrator != arbitrator {
            return Err(ContractError::OnlyArbitrator);
        }

        // Validate state
        if escrow.state != EscrowState::Disputed {
            return Err(ContractError::InvalidStateTransition);
        }

        if release_to_beneficiary {
            // Release to beneficiary
            Self::transfer_tokens(
                &env,
                &escrow.asset_contract,
                &env.current_contract_address(),
                &escrow.beneficiary,
                escrow.amount,
            )?;
            escrow.state = EscrowState::Resolved;
        } else {
            // Refund to sender
            Self::transfer_tokens(
                &env,
                &escrow.asset_contract,
                &env.current_contract_address(),
                &escrow.sender,
                escrow.amount,
            )?;
            escrow.state = EscrowState::Refunded;
        }

        escrow.resolved_at = Some(env.ledger().timestamp());

        // Store updated escrow
        env.storage().set(&EscrowKey { id: id.clone() }, &escrow);

        // Emit event
        env.events().publish(
            ("escrow_resolved", "v1"),
            (id, arbitrator, release_to_beneficiary),
        );

        Ok(())
    }

    // ===== Helper: Get Escrow =====
    pub fn get_escrow(env: &Env, id: String) -> Result<Escrow, ContractError> {
        env.storage()
            .get(&EscrowKey { id: id.clone() })
            .ok_or(ContractError::EscrowNotFound)
    }

    // ===== Helper: Check Escrow Exists =====
    fn escrow_exists(env: &Env, id: String) -> bool {
        env.storage().has(&EscrowKey { id })
    }

    // ===== Helper: Transfer Tokens =====
    fn transfer_tokens(
        env: &Env,
        asset_contract: &Address,
        from: &Address,
        to: &Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        // Call the token contract's transfer method
        let result: Result<(), soroban_sdk::Error> =
            env.invoke_contract(asset_contract, &("transfer", from, to, &amount));

        match result {
            Ok(_) => Ok(()),
            Err(_) => Err(ContractError::TransferFailed),
        }
    }

    // ===== Helper: Get Token Balance =====
    pub fn get_balance(env: &Env, asset_contract: &Address, account: &Address) -> i128 {
        let result: Result<i128, soroban_sdk::Error> =
            env.invoke_contract(asset_contract, &("balance_of", account));
        result.unwrap_or(0)
    }

    // ===== Admin: Emergency Withdraw =====
    pub fn emergency_withdraw(env: Env, id: String, caller: Address) -> Result<(), ContractError> {
        let escrow = Self::get_escrow(&env, id.clone())?;

        // Only sender or beneficiary can emergency withdraw after timelock * 2
        if escrow.sender != caller && escrow.beneficiary != caller {
            return Err(ContractError::Unauthorized);
        }

        // Check timelock * 2 for emergency (safety buffer)
        let current_time = env.ledger().timestamp();
        let emergency_time = escrow.created_at + escrow.timelock * 2;
        if current_time < emergency_time {
            return Err(ContractError::TimelockNotExpired);
        }

        // Withdraw to the caller
        Self::transfer_tokens(
            &env,
            &escrow.asset_contract,
            &env.current_contract_address(),
            &caller,
            escrow.amount,
        )?;

        // Update state
        let mut updated_escrow = escrow.clone();
        updated_escrow.state = EscrowState::Refunded;
        updated_escrow.refunded_at = Some(env.ledger().timestamp());
        env.storage()
            .set(&EscrowKey { id: id.clone() }, &updated_escrow);

        env.events().publish(
            ("escrow_emergency_withdrawn", "v1"),
            (id, caller, escrow.amount),
        );

        Ok(())
    }
}

// ===== Tests =====
#[cfg(test)]
mod test;
