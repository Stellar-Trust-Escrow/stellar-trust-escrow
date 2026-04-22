use soroban_sdk::{symbol_short, Address, BytesN, Env};

pub fn emit_batch_escrow_created(env: &Env, escrow_id: u64, client: &Address, freelancer: &Address, amount: i128) {
    env.events().publish((symbol_short!("bat_crt"), escrow_id), (client.clone(), freelancer.clone(), amount));
}
pub fn emit_batch_completed(env: &Env, count: u32, total_amount: i128) {
    env.events().publish((symbol_short!("bat_done"),), (count, total_amount));
}
pub fn emit_fee_collected(env: &Env, escrow_id: u64, token: &Address, amount: i128) {
    env.events().publish((symbol_short!("fee_col"), escrow_id), (token.clone(), amount));
}
pub fn emit_fee_distributed(env: &Env, token: &Address, total: i128) {
    env.events().publish((symbol_short!("fee_dis"),), (token.clone(), total));
}
pub fn emit_fee_emergency_withdrawn(env: &Env, token: &Address, amount: i128, to: &Address) {
    env.events().publish((symbol_short!("fee_emg"),), (token.clone(), amount, to.clone()));
}
pub fn emit_dispute_opened(env: &Env, escrow_id: u64, voting_closes_at: u64) {
    env.events().publish((symbol_short!("arb_opn"), escrow_id), voting_closes_at);
}
pub fn emit_vote_cast(env: &Env, escrow_id: u64, voter: &Address, stake: u64, for_client: bool) {
    env.events().publish((symbol_short!("arb_vot"), escrow_id), (voter.clone(), stake, for_client));
}
pub fn emit_dispute_resolved(env: &Env, escrow_id: u64, client_wins: bool) {
    env.events().publish((symbol_short!("arb_res"), escrow_id), client_wins);
}
pub fn emit_voter_slashed(env: &Env, escrow_id: u64, voter: &Address, stake: u64) {
    env.events().publish((symbol_short!("arb_slh"), escrow_id), (voter.clone(), stake));
}
pub fn emit_upgrade_queued(env: &Env, new_wasm_hash: &BytesN<32>, executable_after: u64) {
    env.events().publish((symbol_short!("upg_que"),), (new_wasm_hash.clone(), executable_after));
}
pub fn emit_upgrade_executed(env: &Env, new_wasm_hash: &BytesN<32>) {
    env.events().publish((symbol_short!("upg_exe"),), new_wasm_hash.clone());
}
pub fn emit_upgrade_cancelled(env: &Env) {
    env.events().publish((symbol_short!("upg_can"),), ());
}
