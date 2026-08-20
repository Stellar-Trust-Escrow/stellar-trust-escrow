use soroban_sdk::{Address, Env, Symbol};

pub fn emit_bonded(env: &Env, arbiter: Address, amount: i128) {
    let topics = (Symbol::new(env, "arbiter_bonded"), arbiter);
    env.events().publish(topics, amount);
}

pub fn emit_unbonded(env: &Env, arbiter: Address, amount: i128) {
    let topics = (Symbol::new(env, "arbiter_unbonded"), arbiter);
    env.events().publish(topics, amount);
}

pub fn emit_slashed(
    env: &Env,
    arbiter: Address,
    escrow_id: u64,
    amount_burned: i128,
    new_balance: i128,
) {
    let topics = (Symbol::new(env, "arbiter_slashed"), arbiter);
    env.events()
        .publish(topics, (escrow_id, amount_burned, new_balance));
}

pub fn emit_suspended(env: &Env, arbiter: Address) {
    let topics = (Symbol::new(env, "arbiter_suspended"), arbiter);
    env.events().publish(topics, ());
}

pub fn emit_appeal_opened(env: &Env, appeal_id: u64, appellant: Address, escrow_id: u64) {
    let topics = (Symbol::new(env, "appeal_opened"),);
    env.events()
        .publish(topics, (appeal_id, appellant, escrow_id));
}

pub fn emit_appeal_dismissed(env: &Env, appeal_id: u64) {
    let topics = (Symbol::new(env, "appeal_dismissed"),);
    env.events().publish(topics, appeal_id);
}
