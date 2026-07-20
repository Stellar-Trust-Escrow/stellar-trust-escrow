#![no_std]

mod errors;
mod events;
mod storage;

#[cfg(test)]
mod tests;

use errors::OwnershipError;
use soroban_sdk::{contract, contractimpl, Address, Env};
use storage::{
    clear_pending, get_escrow_contract, get_owner, get_pending, set_escrow_contract, set_owner,
    set_pending,
};

#[contract]
pub struct EscrowOwnershipContract;

#[contractimpl]
impl EscrowOwnershipContract {
    /// One-time initialisation: records which contract address is allowed to call `register`.
    pub fn init(env: Env, escrow_contract: Address) {
        if get_escrow_contract(&env).is_some() {
            panic!("already initialised");
        }
        set_escrow_contract(&env, &escrow_contract);
    }

    /// Register ownership for a newly created escrow.
    /// Only the authorised escrow_contract may call this.
    pub fn register(
        env: Env,
        escrow_id: u64,
        initial_owner: Address,
    ) -> Result<(), OwnershipError> {
        let allowed = get_escrow_contract(&env).ok_or(OwnershipError::Unauthorized)?;
        allowed.require_auth();

        if get_owner(&env, escrow_id).is_some() {
            return Err(OwnershipError::AlreadyRegistered);
        }

        set_owner(&env, escrow_id, &initial_owner);
        events::ownership_registered(&env, escrow_id, &initial_owner);
        Ok(())
    }

    /// Current owner initiates a transfer to new_owner.
    pub fn offer_transfer(
        env: Env,
        current_owner: Address,
        escrow_id: u64,
        new_owner: Address,
    ) -> Result<(), OwnershipError> {
        current_owner.require_auth();

        let owner = get_owner(&env, escrow_id).ok_or(OwnershipError::NotFound)?;
        if owner != current_owner {
            return Err(OwnershipError::NotOwner);
        }

        set_pending(&env, escrow_id, &new_owner);
        events::transfer_offered(&env, escrow_id, &current_owner, &new_owner);
        Ok(())
    }

    /// Pending recipient confirms the transfer, completing ownership change.
    pub fn accept_transfer(
        env: Env,
        new_owner: Address,
        escrow_id: u64,
    ) -> Result<(), OwnershipError> {
        new_owner.require_auth();

        let pending = get_pending(&env, escrow_id).ok_or(OwnershipError::NoPendingTransfer)?;
        if pending != new_owner {
            return Err(OwnershipError::NotPendingRecipient);
        }

        let old_owner = get_owner(&env, escrow_id).ok_or(OwnershipError::NotFound)?;
        set_owner(&env, escrow_id, &new_owner);
        clear_pending(&env, escrow_id);
        events::transfer_accepted(&env, escrow_id, &old_owner, &new_owner);
        Ok(())
    }

    /// Current owner cancels a pending transfer offer.
    pub fn cancel_transfer(
        env: Env,
        current_owner: Address,
        escrow_id: u64,
    ) -> Result<(), OwnershipError> {
        current_owner.require_auth();

        let owner = get_owner(&env, escrow_id).ok_or(OwnershipError::NotFound)?;
        if owner != current_owner {
            return Err(OwnershipError::NotOwner);
        }

        clear_pending(&env, escrow_id);
        events::transfer_cancelled(&env, escrow_id, &current_owner);
        Ok(())
    }

    /// Returns the current client-rights holder for escrow_id.
    pub fn get_owner(env: Env, escrow_id: u64) -> Result<Address, OwnershipError> {
        get_owner(&env, escrow_id).ok_or(OwnershipError::NotFound)
    }

    /// Returns the pending new owner, or None if no offer is active.
    pub fn pending_transfer(env: Env, escrow_id: u64) -> Option<Address> {
        get_pending(&env, escrow_id)
    }
}
