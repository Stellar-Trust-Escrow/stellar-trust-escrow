#![no_std]

pub mod errors;
#[allow(dead_code)]
mod events;
pub mod types;

pub use errors::InsuranceError;

use soroban_sdk::{contract, contractimpl, Address, Env, String};

#[contract]
pub struct InsuranceContract;

#[contractimpl]
impl InsuranceContract {
    pub fn initialize(
        _env: Env,
        _admin: Address,
        _token: Address,
        _min_contribution: i128,
        _claim_cap: i128,
        _quorum: u32,
    ) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn contribute(
        _env: Env,
        _contributor: Address,
        _amount: i128,
    ) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn submit_claim(
        _env: Env,
        _claimant: Address,
        _description: String,
        _amount: i128,
    ) -> Result<u32, InsuranceError> {
        panic!("stub")
    }

    pub fn withdraw_claim(
        _env: Env,
        _claimant: Address,
        _claim_id: u32,
    ) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn vote(
        _env: Env,
        _governor: Address,
        _claim_id: u32,
        _approve: bool,
    ) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn execute_payout(_env: Env, _claim_id: u32) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn add_governor(
        _env: Env,
        _admin: Address,
        _governor: Address,
    ) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn remove_governor(
        _env: Env,
        _admin: Address,
        _governor: Address,
    ) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn set_claim_cap(_env: Env, _admin: Address, _cap: i128) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn set_quorum(_env: Env, _admin: Address, _quorum: u32) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn get_fund_info(_env: Env) -> Result<types::FundInfo, InsuranceError> {
        panic!("stub")
    }

    pub fn get_claim(_env: Env, _claim_id: u32) -> Result<types::Claim, InsuranceError> {
        panic!("stub")
    }

    pub fn get_contribution(_env: Env, _contributor: Address) -> Result<i128, InsuranceError> {
        panic!("stub")
    }

    pub fn is_governor(_env: Env, _addr: Address) -> Result<bool, InsuranceError> {
        panic!("stub")
    }
}

#[cfg(test)]
mod gas_profiling;
