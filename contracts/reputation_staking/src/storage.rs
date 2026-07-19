use crate::types::*;
use soroban_sdk::{Address, Env, Vec};

pub fn get_config(env: &Env) -> StakingConfig {
    env.storage()
        .instance()
        .get(&DataKey::StakingConfig)
        .unwrap_or(StakingConfig {
            min_bond_amount: 1000,
            slash_bps: 500,
            cooldown_ledgers: 100,
        })
}

pub fn set_config(env: &Env, config: StakingConfig) {
    env.storage()
        .instance()
        .set(&DataKey::StakingConfig, &config);
}

pub fn get_bond(env: &Env, arbiter: &Address) -> Option<BondRecord> {
    env.storage()
        .persistent()
        .get(&DataKey::Bond(arbiter.clone()))
}

pub fn set_bond(env: &Env, arbiter: &Address, record: &BondRecord) {
    env.storage()
        .persistent()
        .set(&DataKey::Bond(arbiter.clone()), record);
}

pub fn get_active_disputes(env: &Env, arbiter: &Address) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::ActiveDisputeCount(arbiter.clone()))
        .unwrap_or(0)
}

#[allow(dead_code)]
pub fn set_active_disputes(env: &Env, arbiter: &Address, count: u32) {
    env.storage()
        .persistent()
        .set(&DataKey::ActiveDisputeCount(arbiter.clone()), &count);
}

pub fn get_slash_history(env: &Env, arbiter: &Address) -> Vec<SlashRecord> {
    env.storage()
        .persistent()
        .get(&DataKey::SlashHistory(arbiter.clone()))
        .unwrap_or(Vec::new(env))
}

pub fn add_slash_record(env: &Env, arbiter: &Address, record: SlashRecord) {
    let mut history = get_slash_history(env, arbiter);
    history.push_back(record);
    env.storage()
        .persistent()
        .set(&DataKey::SlashHistory(arbiter.clone()), &history);
}

pub fn get_appeal(env: &Env, appeal_id: u64) -> Option<AppealRecord> {
    env.storage().persistent().get(&DataKey::Appeal(appeal_id))
}

pub fn set_appeal(env: &Env, appeal_id: u64, record: &AppealRecord) {
    env.storage()
        .persistent()
        .set(&DataKey::Appeal(appeal_id), record);
}

pub fn get_next_appeal_id(env: &Env) -> u64 {
    let key = DataKey::Appeal(0);
    env.storage().instance().get(&key).unwrap_or(0)
}

pub fn increment_appeal_id(env: &Env) -> u64 {
    let next = get_next_appeal_id(env) + 1;
    env.storage().instance().set(&DataKey::Appeal(0), &next);
    next
}
