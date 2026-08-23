#![no_std]

mod errors;
mod events;
mod storage;

#[cfg(test)]
mod tests;

use errors::ReferralError;
use soroban_sdk::{contract, contractimpl, Address, Env, Symbol};
use storage::{
    get_code_for_referrer, get_escrow_contract, get_owner_of_code, get_referrer, set_code,
    set_escrow_contract, set_referrer,
};

#[contract]
pub struct ReferralRegistryContract;

#[contractimpl]
impl ReferralRegistryContract {
    /// One-time initialisation: records which contract address is allowed to
    /// call `bind_referral` (the main escrow contract, at escrow creation
    /// time). Mirrors the auth pattern used by EscrowOwnershipContract.
    pub fn init(env: Env, escrow_contract: Address) {
        if get_escrow_contract(&env).is_some() {
            panic!("already initialised");
        }
        set_escrow_contract(&env, &escrow_contract);
    }

    /// Registers a unique referral code linked to a Stellar address.
    /// Codes are globally unique; max 1 code per address.
    pub fn register_code(env: Env, referrer: Address, code: Symbol) -> Result<(), ReferralError> {
        referrer.require_auth();

        if get_code_for_referrer(&env, &referrer).is_some() {
            return Err(ReferralError::AlreadyRegistered);
        }
        if get_owner_of_code(&env, &code).is_some() {
            return Err(ReferralError::CodeTaken);
        }

        set_code(&env, &referrer, &code);
        events::code_registered(&env, &referrer, &code);
        Ok(())
    }

    /// Called at escrow creation by the authorised escrow contract. Records
    /// (escrow_id -> referrer_address) on-chain. Fails if the escrow already
    /// has a referral bound, or if the code isn't registered to anyone.
    pub fn bind_referral(env: Env, escrow_id: u64, code: Symbol) -> Result<(), ReferralError> {
        let escrow_contract = get_escrow_contract(&env).ok_or(ReferralError::UnknownCode)?;
        escrow_contract.require_auth();

        if get_referrer(&env, escrow_id).is_some() {
            return Err(ReferralError::AlreadyBound);
        }

        let referrer = get_owner_of_code(&env, &code).ok_or(ReferralError::UnknownCode)?;

        set_referrer(&env, escrow_id, &referrer);
        events::referral_bound(&env, escrow_id, &referrer, &code);
        Ok(())
    }

    /// View: returns the referrer bound to an escrow, if any.
    pub fn get_referrer(env: Env, escrow_id: u64) -> Option<Address> {
        get_referrer(&env, escrow_id)
    }

    /// View: returns the referral code registered to an address, if any.
    pub fn get_code(env: Env, referrer: Address) -> Option<Symbol> {
        get_code_for_referrer(&env, &referrer)
    }
}
