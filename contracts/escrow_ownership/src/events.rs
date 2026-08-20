use soroban_sdk::{symbol_short, Address, Env};

pub fn ownership_registered(env: &Env, escrow_id: u64, owner: &Address) {
    env.events()
        .publish((symbol_short!("own_reg"), escrow_id), owner.clone());
}

pub fn transfer_offered(env: &Env, escrow_id: u64, from: &Address, to: &Address) {
    env.events().publish(
        (symbol_short!("own_off"), escrow_id),
        (from.clone(), to.clone()),
    );
}

pub fn transfer_accepted(env: &Env, escrow_id: u64, from: &Address, to: &Address) {
    env.events().publish(
        (symbol_short!("own_acc"), escrow_id),
        (from.clone(), to.clone()),
    );
}

pub fn transfer_cancelled(env: &Env, escrow_id: u64, by: &Address) {
    env.events()
        .publish((symbol_short!("own_can"), escrow_id), by.clone());
}
