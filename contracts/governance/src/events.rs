use soroban_sdk::{symbol_short, Address, Env};

pub fn emit_proposal_created(env: &Env, proposal_id: u64, proposer: &Address) {
    env.events()
        .publish((symbol_short!("prop_new"), proposal_id), proposer.clone());
}

pub fn emit_vote_cast(env: &Env, proposal_id: u64, voter: &Address, support: bool, power: i128) {
    env.events().publish(
        (symbol_short!("vote_cast"), proposal_id),
        (voter.clone(), support, power),
    );
}

pub fn emit_proposal_queued(env: &Env, proposal_id: u64, executable_at: u64) {
    env.events()
        .publish((symbol_short!("prop_que"), proposal_id), executable_at);
}

pub fn emit_proposal_executed(env: &Env, proposal_id: u64) {
    env.events()
        .publish((symbol_short!("prop_exe"), proposal_id), ());
}

pub fn emit_proposal_cancelled(env: &Env, proposal_id: u64, by: &Address) {
    env.events()
        .publish((symbol_short!("prop_can"), proposal_id), by.clone());
}

pub fn emit_proposal_defeated(env: &Env, proposal_id: u64) {
    env.events()
        .publish((symbol_short!("prop_def"), proposal_id), ());
}
