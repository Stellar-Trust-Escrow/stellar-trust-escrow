use soroban_sdk::{Address, BytesN, Env};

use crate::event_names as ev;

// ── Batch ─────────────────────────────────────────────────────────────────────

pub fn emit_batch_escrow_created(
    env: &Env,
    escrow_id: u64,
    client: &Address,
    freelancer: &Address,
    amount: i128,
) {
    env.events().publish(
        (ev::BATCH_ESCROW_CREATED, escrow_id),
        (client.clone(), freelancer.clone(), amount),
    );
}

pub fn emit_batch_completed(env: &Env, count: u32, total_amount: i128) {
    env.events()
        .publish((ev::BATCH_COMPLETED,), (count, total_amount));
}

// ── Fees ──────────────────────────────────────────────────────────────────────

pub fn emit_fee_collected(env: &Env, escrow_id: u64, token: &Address, amount: i128) {
    env.events().publish(
        (ev::FEE_COLLECTED, escrow_id),
        (token.clone(), amount),
    );
}

pub fn emit_fee_distributed(env: &Env, token: &Address, total: i128) {
    env.events()
        .publish((ev::FEE_DISTRIBUTED,), (token.clone(), total));
}

pub fn emit_fee_emergency_withdrawn(env: &Env, token: &Address, amount: i128, to: &Address) {
    env.events().publish(
        (ev::FEE_EMERGENCY_WITHDRAWN,),
        (token.clone(), amount, to.clone()),
    );
}

// ── Arbitration ───────────────────────────────────────────────────────────────

pub fn emit_dispute_opened(env: &Env, escrow_id: u64, voting_closes_at: u64) {
    env.events()
        .publish((ev::DISPUTE_OPENED, escrow_id), voting_closes_at);
}

pub fn emit_vote_cast(env: &Env, escrow_id: u64, voter: &Address, stake: u64, for_client: bool) {
    env.events().publish(
        (ev::VOTE_CAST, escrow_id),
        (voter.clone(), stake, for_client),
    );
}

pub fn emit_dispute_resolved(env: &Env, escrow_id: u64, client_wins: bool) {
    env.events()
        .publish((ev::DISPUTE_RESOLVED, escrow_id), client_wins);
}

pub fn emit_voter_slashed(env: &Env, escrow_id: u64, voter: &Address, stake: u64) {
    env.events().publish(
        (ev::VOTER_SLASHED, escrow_id),
        (voter.clone(), stake),
    );
}

// ── Upgrade ───────────────────────────────────────────────────────────────────

pub fn emit_upgrade_queued(env: &Env, new_wasm_hash: &BytesN<32>, executable_after: u64) {
    env.events().publish(
        (ev::UPGRADE_QUEUED,),
        (new_wasm_hash.clone(), executable_after),
    );
}

pub fn emit_upgrade_executed(env: &Env, new_wasm_hash: &BytesN<32>) {
    env.events()
        .publish((ev::UPGRADE_EXECUTED,), new_wasm_hash.clone());
}

pub fn emit_upgrade_cancelled(env: &Env) {
    env.events().publish((ev::UPGRADE_CANCELLED,), ());
}
