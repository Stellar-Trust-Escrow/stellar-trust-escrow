#![no_std]

pub mod errors;
pub mod event_names;
#[allow(dead_code)]
mod events;
pub mod types;

pub use errors::ExtError;
pub use types::{ArbitrationDispute, BatchEscrowParams, DataKey, FeeRecipient, PendingUpgrade};

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Vec};

#[allow(clippy::manual_div_ceil)]
pub fn isqrt(n: u64) -> u64 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

#[contract]
pub struct EscrowExtensions;

#[contractimpl]
impl EscrowExtensions {
    pub fn initialize(_env: Env, _admin: Address, _fee_bps: u32) -> Result<(), ExtError> {
        panic!("stub")
    }

    pub fn create_batch(
        _env: Env,
        _client: Address,
        _params: Vec<types::BatchEscrowParams>,
    ) -> Result<Vec<u64>, ExtError> {
        panic!("stub")
    }

    pub fn batch_escrow_count(_env: Env) -> Result<u32, ExtError> {
        panic!("stub")
    }

    pub fn collect_fee(
        _env: Env,
        _escrow_id: u64,
        _token: Address,
        _gross: i128,
    ) -> Result<(i128, i128), ExtError> {
        panic!("stub")
    }

    pub fn set_fee_bps(_env: Env, _admin: Address, _fee_bps: u32) -> Result<(), ExtError> {
        panic!("stub")
    }

    pub fn set_fee_recipients(
        _env: Env,
        _admin: Address,
        _recipients: Vec<types::FeeRecipient>,
    ) -> Result<(), ExtError> {
        panic!("stub")
    }

    pub fn distribute_fees(_env: Env, _token: Address) -> Result<i128, ExtError> {
        panic!("stub")
    }

    pub fn emergency_withdraw_fees(
        _env: Env,
        _admin: Address,
        _token: Address,
        _recipient: Address,
    ) -> Result<i128, ExtError> {
        panic!("stub")
    }

    pub fn get_fee_balance(_env: Env, _token: Address) -> Result<i128, ExtError> {
        panic!("stub")
    }

    pub fn open_dispute(_env: Env, _escrow_id: u64) -> Result<(), ExtError> {
        panic!("stub")
    }

    pub fn cast_vote(
        _env: Env,
        _voter: Address,
        _escrow_id: u64,
        _stake: u64,
        _for_client: bool,
    ) -> Result<(), ExtError> {
        panic!("stub")
    }

    pub fn get_dispute(_env: Env, _escrow_id: u64) -> Result<types::ArbitrationDispute, ExtError> {
        panic!("stub")
    }

    pub fn resolve_dispute(_env: Env, _escrow_id: u64) -> Result<bool, ExtError> {
        panic!("stub")
    }

    pub fn queue_upgrade(_env: Env, _admin: Address, _hash: BytesN<32>) -> Result<u64, ExtError> {
        panic!("stub")
    }

    pub fn cancel_upgrade(_env: Env, _admin: Address) -> Result<(), ExtError> {
        panic!("stub")
    }

    pub fn get_pending_upgrade(_env: Env) -> Result<Option<types::PendingUpgrade>, ExtError> {
        panic!("stub")
    }

    pub fn execute_upgrade(_env: Env, _admin: Address) -> Result<(), ExtError> {
        panic!("stub")
    }
}

// Tests disabled — all methods are stubs (panic!("stub")).
// Re-enable once implementations land.
// #[cfg(test)]
// mod tests;
