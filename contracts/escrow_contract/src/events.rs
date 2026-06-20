//! # Contract Events
//!
//! Helper functions for emitting structured events from the escrow contract.
//! Events are indexed by the backend `escrowIndexer` service to keep the
//! database in sync without requiring direct contract reads.
//!
//! Event topics follow the pattern: `(event_name, primary_identifier)`
//! Event data carries the payload relevant to that event type.
//!
//! All topic name constants live in [`event_names`] — edit that module to
//! rename or add topics.

#![allow(dead_code)]

use soroban_sdk::{symbol_short, Address, Env};

use crate::event_names as ev;

pub fn emit_escrow_created(
    env: &Env,
    escrow_id: u64,
    client: &Address,
    freelancer: &Address,
    amount: i128,
) {
    env.events().publish(
        (ev::ESCROW_CREATED, escrow_id),
        (client.clone(), freelancer.clone(), amount),
    );
}

pub fn emit_milestone_added(env: &Env, escrow_id: u64, milestone_id: u32, amount: i128) {
    env.events()
        .publish((ev::MILESTONE_ADDED, escrow_id), (milestone_id, amount));
}

pub fn emit_milestone_submitted(
    env: &Env,
    escrow_id: u64,
    milestone_id: u32,
    freelancer: &Address,
) {
    env.events().publish(
        (ev::MILESTONE_SUBMITTED, escrow_id),
        (milestone_id, freelancer.clone()),
    );
}

pub fn emit_milestone_approved(env: &Env, escrow_id: u64, milestone_id: u32, amount: i128) {
    env.events()
        .publish((ev::MILESTONE_APPROVED, escrow_id), (milestone_id, amount));
}

pub fn emit_multisig_approval_recorded(
    env: &Env,
    escrow_id: u64,
    milestone_id: u32,
    signer: &Address,
    accrued_weight: u32,
    threshold: u32,
) {
    env.events().publish(
        (ev::MULTISIG_APPROVAL_RECORDED, escrow_id),
        (milestone_id, signer.clone(), accrued_weight, threshold),
    );
}

pub fn emit_milestone_rejected(env: &Env, escrow_id: u64, milestone_id: u32, client: &Address) {
    env.events().publish(
        (ev::MILESTONE_REJECTED, escrow_id),
        (milestone_id, client.clone()),
    );
}

pub fn emit_milestone_disputed(env: &Env, escrow_id: u64, milestone_id: u32, raised_by: &Address) {
    env.events().publish(
        (ev::MILESTONE_DISPUTED, escrow_id),
        (milestone_id, raised_by.clone()),
    );
}

pub fn emit_funds_released(env: &Env, escrow_id: u64, to: &Address, amount: i128) {
    env.events()
        .publish((ev::FUNDS_RELEASED, escrow_id), (to.clone(), amount));
}

pub fn emit_escrow_completed(env: &Env, escrow_id: u64) {
    env.events().publish((ev::ESCROW_COMPLETED, escrow_id), ());
}

pub fn emit_recurring_schedule_created(
    env: &Env,
    escrow_id: u64,
    payment_amount: i128,
    total_payments: u32,
    next_payment_at: u64,
) {
    env.events().publish(
        (ev::RECURRING_SCHEDULE_CREATED, escrow_id),
        (payment_amount, total_payments, next_payment_at),
    );
}

pub fn emit_vesting_schedule_created(
    env: &Env,
    escrow_id: u64,
    cliff_seconds: u64,
    duration_seconds: u64,
    monthly_amount: i128,
    final_amount: i128,
) {
    env.events().publish(
        (ev::VESTING_SCHEDULE_CREATED, escrow_id),
        (
            cliff_seconds,
            duration_seconds,
            monthly_amount,
            final_amount,
        ),
    );
}

pub fn emit_recurring_payments_processed(
    env: &Env,
    escrow_id: u64,
    processed_count: u32,
    total_released: i128,
    next_payment_at: Option<u64>,
) {
    env.events().publish(
        (ev::RECURRING_PAYMENTS_PROCESSED, escrow_id),
        (processed_count, total_released, next_payment_at),
    );
}

pub fn emit_recurring_schedule_paused(env: &Env, escrow_id: u64, paused_by: &Address) {
    env.events().publish(
        (ev::RECURRING_SCHEDULE_PAUSED, escrow_id),
        paused_by.clone(),
    );
}

pub fn emit_recurring_schedule_resumed(
    env: &Env,
    escrow_id: u64,
    resumed_by: &Address,
    next_payment_at: u64,
) {
    env.events().publish(
        (ev::RECURRING_SCHEDULE_RESUMED, escrow_id),
        (resumed_by.clone(), next_payment_at),
    );
}

pub fn emit_recurring_schedule_cancelled(
    env: &Env,
    escrow_id: u64,
    cancelled_by: &Address,
    refunded_amount: i128,
) {
    env.events().publish(
        (ev::RECURRING_SCHEDULE_CANCELLED, escrow_id),
        (cancelled_by.clone(), refunded_amount),
    );
}

pub fn emit_escrow_cancelled(env: &Env, escrow_id: u64, returned_amount: i128) {
    env.events()
        .publish((ev::ESCROW_CANCELLED, escrow_id), returned_amount);
}

pub fn emit_dispute_raised(env: &Env, escrow_id: u64, raised_by: &Address) {
    env.events()
        .publish((ev::DISPUTE_RAISED, escrow_id), raised_by.clone());
}

pub fn emit_dispute_resolved(
    env: &Env,
    escrow_id: u64,
    client_amount: i128,
    freelancer_amount: i128,
) {
    env.events().publish(
        (ev::DISPUTE_RESOLVED, escrow_id),
        (client_amount, freelancer_amount),
    );
}

pub fn emit_dispute_timeout_claimed(
    env: &Env,
    escrow_id: u64,
    claimed_by: &Address,
    client_amount: i128,
    freelancer_amount: i128,
) {
    env.events().publish(
        (ev::DISPUTE_TIMEOUT_CLAIMED, escrow_id),
        (claimed_by.clone(), client_amount, freelancer_amount),
    );
}

pub fn emit_reputation_updated(env: &Env, address: &Address, new_score: u64) {
    env.events()
        .publish((ev::REPUTATION_UPDATED,), (address.clone(), new_score));
}

pub fn emit_lock_time_expired(env: &Env, escrow_id: u64, lock_time: u64) {
    env.events()
        .publish((ev::LOCK_TIME_EXPIRED, escrow_id), lock_time);
}

pub fn emit_timelock_started(env: &Env, escrow_id: u64, duration_ledger: u64, start_ledger: u64) {
    env.events().publish(
        (ev::TIMELOCK_STARTED, escrow_id),
        (duration_ledger, start_ledger),
    );
}

pub fn emit_timelock_released(env: &Env, escrow_id: u64, released_ledger: u64) {
    env.events()
        .publish((ev::TIMELOCK_RELEASED, escrow_id), released_ledger);
}

pub fn emit_lock_time_extended(
    env: &Env,
    escrow_id: u64,
    old_lock_time: u64,
    new_lock_time: u64,
    extended_by: &Address,
) {
    env.events().publish(
        (ev::LOCK_TIME_EXTENDED, escrow_id),
        (old_lock_time, new_lock_time, extended_by.clone()),
    );
}

pub fn emit_contract_paused(env: &Env, admin: &Address) {
    env.events().publish((ev::CONTRACT_PAUSED,), admin.clone());
}

pub fn emit_contract_unpaused(env: &Env, admin: &Address) {
    env.events()
        .publish((ev::CONTRACT_UNPAUSED,), admin.clone());
}

pub fn emit_cancellation_executed(
    env: &Env,
    escrow_id: u64,
    client_amount: i128,
    slash_amount: i128,
) {
    env.events().publish(
        (ev::CANCELLATION_EXECUTED, escrow_id),
        (client_amount, slash_amount),
    );
}

pub fn emit_cancellation_approved(env: &Env, escrow_id: u64, approver: &Address) {
    env.events()
        .publish((ev::CANCELLATION_APPROVED, escrow_id), approver.clone());
}

pub fn emit_cancellation_requested(
    env: &Env,
    escrow_id: u64,
    requester: &Address,
    reason: &soroban_sdk::String,
    dispute_deadline: u64,
) {
    env.events().publish(
        (ev::CANCELLATION_REQUESTED, escrow_id),
        (requester.clone(), reason.clone(), dispute_deadline),
    );
}

pub fn emit_slash_applied(
    env: &Env,
    escrow_id: u64,
    slashed_user: &Address,
    recipient: &Address,
    amount: i128,
    reason: &soroban_sdk::String,
) {
    env.events().publish(
        (ev::SLASH_APPLIED, escrow_id),
        (
            slashed_user.clone(),
            recipient.clone(),
            amount,
            reason.clone(),
        ),
    );
}

pub fn emit_slash_disputed(env: &Env, escrow_id: u64, disputer: &Address, amount: i128) {
    env.events()
        .publish((ev::SLASH_DISPUTED, escrow_id), (disputer.clone(), amount));
}

pub fn emit_slash_dispute_resolved(env: &Env, escrow_id: u64, upheld: bool, amount: i128) {
    env.events()
        .publish((ev::SLASH_DISPUTE_RESOLVED, escrow_id), (upheld, amount));
}

pub fn emit_client_role_transferred(
    env: &Env,
    escrow_id: u64,
    old_client: &Address,
    new_client: &Address,
) {
    env.events().publish(
        (ev::CLIENT_ROLE_TRANSFERRED, escrow_id),
        (old_client.clone(), new_client.clone()),
    );
}

pub fn emit_milestone_title_updated(
    env: &Env,
    escrow_id: u64,
    milestone_id: u32,
    new_title: &soroban_sdk::String,
) {
    env.events().publish(
        (ev::MILESTONE_TITLE_UPDATED, escrow_id),
        (milestone_id, new_title.clone()),
    );
}

pub fn emit_admin_initialized(env: &Env, admin: &Address) {
    env.events()
        .publish((ev::ADMIN_INITIALIZED,), admin.clone());
}

pub fn emit_admin_proposed(env: &Env, current_admin: &Address, pending_admin: &Address) {
    env.events().publish(
        (ev::ADMIN_PROPOSED,),
        (current_admin.clone(), pending_admin.clone()),
    );
}

pub fn emit_admin_changed(env: &Env, old_admin: &Address, new_admin: &Address) {
    env.events()
        .publish((ev::ADMIN_CHANGED,), (old_admin.clone(), new_admin.clone()));
}

pub fn emit_max_milestones_set(env: &Env, new_max: u32) {
    env.events().publish((ev::MAX_MILESTONES_SET,), new_max);
}

pub fn emit_milestone_rejected_with_reason(
    env: &Env,
    escrow_id: u64,
    milestone_id: u32,
    client: &Address,
    reason_hash: &soroban_sdk::BytesN<32>,
) {
    env.events().publish(
        (ev::MILESTONE_REJECTED_WITH_REASON, escrow_id),
        (milestone_id, client.clone(), reason_hash.clone()),
    );
}

pub fn emit_rent_withdrawn(env: &Env, escrow_id: u64, recipient: &Address, amount: i128) {
    env.events()
        .publish((ev::RENT_WITHDRAWN, escrow_id), (recipient.clone(), amount));
}

pub fn emit_arbiter_updated(env: &Env, escrow_id: u64, new_arbiter: &Option<Address>) {
    env.events()
        .publish((ev::ARBITER_UPDATED, escrow_id), new_arbiter.clone());
}

/// Emitted when an NFT-gated escrow is created.
///
/// # Arguments
/// * `escrow_id`    - The newly assigned escrow ID
/// * `nft_contract` - The NFT contract address used for gating
/// * `token_id`     - The NFT token ID that was checked
pub fn emit_nft_gated_escrow_created(
    env: &Env,
    escrow_id: u64,
    nft_contract: &Address,
    token_id: u64,
) {
    env.events().publish(
        (ev::NFT_GATED_ESCROW_CREATED, escrow_id),
        (nft_contract.clone(), token_id),
    );
}

pub fn emit_escrow_split(
    env: &Env,
    parent_escrow_id: u64,
    child_escrow_id_1: u64,
    child_escrow_id_2: u64,
) {
    env.events().publish(
        (ev::ESCROW_SPLIT, parent_escrow_id),
        (child_escrow_id_1, child_escrow_id_2),
    );
}

pub fn emit_deadline_extended(env: &Env, escrow_id: u64, old_deadline: u64, new_deadline: u64) {
    env.events().publish(
        (ev::DEADLINE_EXTENDED, escrow_id),
        (old_deadline, new_deadline),
    );
}

/// Emitted when a partial cancellation is performed.
///
/// # Arguments
/// * `escrow_id` - The escrow ID
/// * `refunded_amount` - The amount refunded to the client
pub fn emit_partial_cancellation(env: &Env, escrow_id: u64, refunded_amount: i128) {
    env.events()
        .publish((symbol_short!("prt_can"), escrow_id), refunded_amount);
}

/// Emitted when a dispute is escalated to governance.
///
/// # Arguments
/// * `escrow_id` - The escrow ID
/// * `initiator` - Who initiated the escalation
/// * `proposal_id` - The governance proposal ID created
/// * `amount` - The escrow amount
pub fn emit_dispute_escalated_to_governance(
    env: &Env,
    escrow_id: u64,
    initiator: &Address,
    proposal_id: u64,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("gov_esc"), escrow_id),
        (initiator.clone(), proposal_id, amount),
    );
}

/// Emitted when a referrer receives a reward from the platform fee.
///
/// # Arguments
/// * `escrow_id` - The escrow ID
/// * `referrer` - The address of the referrer
/// * `amount` - The referral payout amount
pub fn emit_referral_payout(env: &Env, escrow_id: u64, referrer: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("ref_pay"), escrow_id),
        (referrer.clone(), amount),
    );
}
