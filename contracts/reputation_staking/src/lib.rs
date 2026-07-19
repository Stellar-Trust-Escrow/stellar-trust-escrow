#![no_std]

mod errors;
mod events;
mod storage;
mod types;

use errors::StakingError;
use soroban_sdk::{panic_with_error, Address, BytesN, Env};
use types::*;

pub fn initialize(
    env: Env,
    _admin: Address,
    min_bond_amount: i128,
    slash_bps: u32,
    cooldown_ledgers: u32,
) {
    let config = StakingConfig {
        min_bond_amount,
        slash_bps,
        cooldown_ledgers,
    };
    storage::set_config(&env, config);
}

pub fn bond(env: Env, arbiter: Address, amount: i128, token: Address) {
    arbiter.require_auth();
    let config = storage::get_config(&env);
    if amount < config.min_bond_amount {
        panic_with_error!(&env, StakingError::InsufficientBond);
    }
    let current = storage::get_bond(&env, &arbiter).unwrap_or(BondRecord {
        amount: 0,
        token: token.clone(),
        bonded_at_ledger: 0,
        last_action_ledger: 0,
        suspended: false,
    });
    let new_amount = current.amount + amount;
    let record = BondRecord {
        amount: new_amount,
        token,
        bonded_at_ledger: env.ledger().sequence(),
        last_action_ledger: env.ledger().sequence(),
        suspended: false,
    };
    storage::set_bond(&env, &arbiter, &record);
    events::emit_bonded(&env, arbiter, amount);
}

pub fn unbond(env: Env, arbiter: Address, amount: i128) {
    arbiter.require_auth();
    let config = storage::get_config(&env);
    let active = storage::get_active_disputes(&env, &arbiter);
    if active > 0 {
        panic_with_error!(&env, StakingError::ActiveDisputesPending);
    }
    let Some(current) = storage::get_bond(&env, &arbiter) else {
        panic_with_error!(&env, StakingError::NotEligibleArbiter);
    };
    let ledger = env.ledger().sequence();
    if ledger < current.last_action_ledger + config.cooldown_ledgers {
        panic_with_error!(&env, StakingError::CooldownActive);
    }
    if amount > current.amount {
        panic_with_error!(&env, StakingError::InvalidAmount);
    }
    let new_amount = current.amount - amount;
    let mut record = current;
    record.amount = new_amount;
    record.last_action_ledger = ledger;
    storage::set_bond(&env, &arbiter, &record);
    events::emit_unbonded(&env, arbiter, amount);
}

pub fn is_eligible_arbiter(env: Env, arbiter: Address) -> bool {
    let config = storage::get_config(&env);
    match storage::get_bond(&env, &arbiter) {
        Some(record) => record.amount >= config.min_bond_amount && !record.suspended,
        None => false,
    }
}

pub fn slash(env: Env, admin: Address, arbiter: Address, escrow_id: u64, reason_hash: BytesN<32>) {
    admin.require_auth();
    let config = storage::get_config(&env);
    let Some(current) = storage::get_bond(&env, &arbiter) else {
        panic_with_error!(&env, StakingError::NotEligibleArbiter);
    };
    let slash_amount = (current.amount * config.slash_bps as i128) / 10000;
    let amount_burned = if slash_amount > 0 { slash_amount } else { 1 };
    let new_balance = current.amount - amount_burned;
    let suspended = new_balance < config.min_bond_amount;
    let record = BondRecord {
        amount: new_balance,
        suspended,
        ..current
    };
    storage::set_bond(&env, &arbiter, &record);
    let slash_record = SlashRecord {
        escrow_id,
        amount_slashed: amount_burned,
        reason_hash,
        ledger: env.ledger().sequence(),
    };
    storage::add_slash_record(&env, &arbiter, slash_record);
    events::emit_slashed(&env, arbiter.clone(), escrow_id, amount_burned, new_balance);
    if suspended {
        events::emit_suspended(&env, arbiter);
    }
}

pub fn appeal_ruling(env: Env, appellant: Address, escrow_id: u64, evidence_hash: BytesN<32>) {
    appellant.require_auth();
    let appeal_id = storage::increment_appeal_id(&env);
    let record = AppealRecord {
        appellant,
        escrow_id,
        evidence_hash,
        opened_at: env.ledger().sequence(),
        resolved: false,
    };
    storage::set_appeal(&env, appeal_id, &record);
    events::emit_appeal_opened(&env, appeal_id, record.appellant, escrow_id);
}

pub fn dismiss_appeal(env: Env, admin: Address, appeal_id: u64, _reason_hash: BytesN<32>) {
    admin.require_auth();
    let Some(mut appeal) = storage::get_appeal(&env, appeal_id) else {
        panic_with_error!(&env, StakingError::AppealNotFound);
    };
    if appeal.resolved {
        panic_with_error!(&env, StakingError::AppealAlreadyResolved);
    }
    appeal.resolved = true;
    storage::set_appeal(&env, appeal_id, &appeal);
    events::emit_appeal_dismissed(&env, appeal_id);
}
