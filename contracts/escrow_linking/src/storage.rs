use crate::types::{DataKey, ParentEscrowRecord};
use soroban_sdk::{Address, Env};
use stellar_trust_shared::{bump_instance_ttl, bump_persistent_ttl};

pub fn get_parent_record(env: &Env, parent_id: u64) -> Option<ParentEscrowRecord> {
    let key = DataKey::ParentRecord(parent_id);
    let record = env.storage().persistent().get(&key);
    if record.is_some() {
        bump_persistent_ttl(env, &key);
    }
    record
}

pub fn set_parent_record(env: &Env, parent_id: u64, record: &ParentEscrowRecord) {
    let key = DataKey::ParentRecord(parent_id);
    env.storage().persistent().set(&key, record);
    bump_persistent_ttl(env, &key);
}

pub fn get_child_to_parent(env: &Env, child_id: u64) -> Option<u64> {
    let key = DataKey::ChildToParent(child_id);
    let parent_id = env.storage().persistent().get(&key);
    if parent_id.is_some() {
        bump_persistent_ttl(env, &key);
    }
    parent_id
}

pub fn set_child_to_parent(env: &Env, child_id: u64, parent_id: u64) {
    let key = DataKey::ChildToParent(child_id);
    env.storage().persistent().set(&key, &parent_id);
    bump_persistent_ttl(env, &key);
}

pub fn is_child_completed(env: &Env, child_id: u64) -> bool {
    let key = DataKey::ChildCompleted(child_id);
    let completed = env.storage().persistent().get(&key).unwrap_or(false);
    if completed {
        bump_persistent_ttl(env, &key);
    }
    completed
}

pub fn set_child_completed(env: &Env, child_id: u64) {
    let key = DataKey::ChildCompleted(child_id);
    env.storage().persistent().set(&key, &true);
    bump_persistent_ttl(env, &key);
}

pub fn get_core_contract(env: &Env) -> Option<Address> {
    let addr = env.storage().instance().get(&DataKey::CoreContractAddress);
    if addr.is_some() {
        bump_instance_ttl(env);
    }
    addr
}

pub fn set_core_contract(env: &Env, addr: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::CoreContractAddress, addr);
    bump_instance_ttl(env);
}
