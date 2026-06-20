//! # Insurance Contract Events
//!
//! Topics follow the same pattern as the escrow contract:
//! `(event_name, primary_identifier)`

use soroban_sdk::{symbol_short, Address, Env};

/// Emitted when tokens are contributed to the fund.
/// topic: (ins_dep, contributor)  data: amount
pub fn emit_contributed(env: &Env, contributor: &Address, amount: i128) {
    env.events()
        .publish((symbol_short!("ins_dep"), contributor.clone()), amount);
}

/// Emitted when a new claim is submitted.
/// topic: (ins_clm, claim_id)  data: (claimant, amount)
pub fn emit_claim_submitted(env: &Env, claim_id: u32, claimant: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("ins_clm"), claim_id),
        (claimant.clone(), amount),
    );
}

/// Emitted when a governor casts a vote.
/// topic: (ins_vot, claim_id)  data: (governor, approve)
pub fn emit_vote_cast(env: &Env, claim_id: u32, governor: &Address, approve: bool) {
    env.events().publish(
        (symbol_short!("ins_vot"), claim_id),
        (governor.clone(), approve),
    );
}

/// Emitted when a claim is approved by governance.
/// topic: (ins_apr, claim_id)  data: amount
pub fn emit_claim_approved(env: &Env, claim_id: u32, amount: i128) {
    env.events()
        .publish((symbol_short!("ins_apr"), claim_id), amount);
}

/// Emitted when a claim is rejected by governance.
/// topic: (ins_rej, claim_id)  data: ()
pub fn emit_claim_rejected(env: &Env, claim_id: u32) {
    env.events()
        .publish((symbol_short!("ins_rej"), claim_id), ());
}

/// Emitted when an approved claim is paid out.
/// topic: (ins_pay, claim_id)  data: (claimant, amount)
pub fn emit_payout(env: &Env, claim_id: u32, claimant: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("ins_pay"), claim_id),
        (claimant.clone(), amount),
    );
}

/// Emitted when a claimant withdraws their pending claim.
/// topic: (ins_wdr, claim_id)  data: claimant
pub fn emit_claim_withdrawn(env: &Env, claim_id: u32, claimant: &Address) {
    env.events()
        .publish((symbol_short!("ins_wdr"), claim_id), claimant.clone());
}

/// Emitted when a governor is added.
/// topic: (ins_gov,)  data: governor
pub fn emit_governor_added(env: &Env, governor: &Address) {
    env.events()
        .publish((symbol_short!("ins_gov"),), governor.clone());
}

/// Emitted when a governor is removed.
/// topic: (ins_grm,)  data: governor
pub fn emit_governor_removed(env: &Env, governor: &Address) {
    env.events()
        .publish((symbol_short!("ins_grm"),), governor.clone());
}

/// Emitted when tokens are staked.
pub fn emit_staked(env: &Env, staker: &Address, amount: i128) {
    env.events()
        .publish((symbol_short!("ins_stk"), staker.clone()), amount);
}

/// Emitted when tokens are unstaked.
pub fn emit_unstaked(env: &Env, staker: &Address, amount: i128) {
    env.events()
        .publish((symbol_short!("ins_ust"), staker.clone()), amount);
}

/// Emitted when yield is claimed.
pub fn emit_yield_claimed(env: &Env, staker: &Address, amount: i128) {
    env.events()
        .publish((symbol_short!("ins_yld"), staker.clone()), amount);
}

/// Emitted when platform fees are added to the yield pool.
pub fn emit_fee_added(env: &Env, amount: i128) {
    env.events().publish((symbol_short!("ins_fee"),), amount);
}

/// Emitted when a slash proposal is submitted.
pub fn emit_slash_proposed(env: &Env, slash_id: u32, proposer: &Address, slash_bps: u32) {
    env.events().publish(
        (symbol_short!("ins_slp"), slash_id),
        (proposer.clone(), slash_bps),
    );
}

/// Emitted when a slash is executed.
pub fn emit_slash_executed(env: &Env, slash_id: u32, slash_bps: u32, slashed: i128) {
    env.events()
        .publish((symbol_short!("ins_sle"), slash_id), (slash_bps, slashed));
}
