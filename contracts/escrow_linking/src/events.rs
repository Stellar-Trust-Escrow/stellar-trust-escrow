use soroban_sdk::{Env, Symbol};

pub fn emit_parent_registered(env: &Env, parent_id: u64, child_count: u32) {
    let topics = (Symbol::new(env, "ParentEscrowRegistered"), parent_id);
    env.events().publish(topics, child_count);
}

pub fn emit_child_completed(env: &Env, parent_id: u64, child_id: u64, remaining: u32) {
    let topics = (Symbol::new(env, "ChildCompleted"), parent_id, child_id);
    env.events().publish(topics, remaining);
}

pub fn emit_parent_auto_completed(env: &Env, parent_id: u64) {
    let topics = (Symbol::new(env, "ParentAutoCompleted"), parent_id);
    env.events().publish(topics, parent_id);
}
