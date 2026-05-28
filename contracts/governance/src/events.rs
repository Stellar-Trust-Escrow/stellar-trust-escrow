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

// ── Jury Voting Pool Events ───────────────────────────────────────────────────

pub fn emit_jury_pool_created(
    env: &Env,
    pool_id: u64,
    escrow_id: u64,
    milestone_id: u64,
    voting_end: u64,
) {
    env.events().publish(
        (symbol_short!("jury_new"), pool_id),
        (escrow_id, milestone_id, voting_end),
    );
}

pub fn emit_jury_vote_cast(
    env: &Env,
    pool_id: u64,
    voter: &Address,
    locked_tokens: i128,
    for_client: bool,
) {
    env.events().publish(
        (symbol_short!("jury_vot"), pool_id),
        (voter.clone(), locked_tokens, for_client),
    );
}

pub fn emit_jury_pool_resolved(
    env: &Env,
    pool_id: u64,
    client_wins: bool,
    weight_for_client: i128,
    weight_for_freelancer: i128,
    total_locked: i128,
) {
    env.events().publish(
        (symbol_short!("jury_res"), pool_id),
        (
            client_wins,
            weight_for_client,
            weight_for_freelancer,
            total_locked,
        ),
    );
}

pub fn emit_jury_funds_distributed(
    env: &Env,
    pool_id: u64,
    recipient: &Address,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("jury_pay"), pool_id),
        (recipient.clone(), amount),
    );
}
