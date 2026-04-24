//! # Contract Events
//!
//! Helper functions for emitting structured events from the escrow contract.
//! Events are indexed by the backend `escrowIndexer` service to keep the
//! database in sync without requiring direct contract reads.
//!
//! Event topics follow the pattern: `(event_name, primary_identifier)`
//! Event data carries the payload relevant to that event type.

#![allow(dead_code)]

use soroban_sdk::{symbol_short, Address, Env};

/// Emitted when a new escrow is created and funds are locked.
///
/// # Arguments
/// * `escrow_id` - The newly assigned escrow ID
/// * `client`    - The client's address
/// * `freelancer`- The freelancer's address
/// * `amount`    - Total locked amount
pub fn emit_escrow_created(
    env: &Env,
    escrow_id: u64,
    client: &Address,
    freelancer: &Address,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("esc_crt"), escrow_id),
        (client.clone(), freelancer.clone(), amount),
    );
}

/// Emitted when a new milestone is added to an escrow.
///
/// # Arguments
/// * `escrow_id`    - The escrow this milestone belongs to
/// * `milestone_id` - The new milestone's ID
/// * `amount`       - Funds allocated to this milestone
pub fn emit_milestone_added(env: &Env, escrow_id: u64, milestone_id: u32, amount: i128) {
    env.events().publish(
        (symbol_short!("mil_add"), escrow_id),
        (milestone_id, amount),
    );
}

/// Emitted when a freelancer submits work on a milestone.
///
/// # Arguments
/// * `escrow_id`    - The escrow ID
/// * `milestone_id` - The submitted milestone
/// * `freelancer`   - Freelancer's address
pub fn emit_milestone_submitted(
    env: &Env,
    escrow_id: u64,
    milestone_id: u32,
    freelancer: &Address,
) {
    env.events().publish(
        (symbol_short!("mil_sub"), escrow_id),
        (milestone_id, freelancer.clone()),
    );
}

/// Emitted when a client approves a milestone submission.
///
/// # Arguments
/// * `escrow_id`    - The escrow ID
/// * `milestone_id` - The approved milestone
/// * `amount`       - Amount being released
pub fn emit_milestone_approved(env: &Env, escrow_id: u64, milestone_id: u32, amount: i128) {
    env.events().publish(
        (symbol_short!("mil_apr"), escrow_id),
        (milestone_id, amount),
    );
}

/// Emitted when a multisig approver records a vote; escrow may still be below threshold.
///
/// * `accrued_weight` — running sum of weights after this vote
/// * `threshold`      — configured threshold for final approval
pub fn emit_multisig_approval_recorded(
    env: &Env,
    escrow_id: u64,
    milestone_id: u32,
    signer: &Address,
    accrued_weight: u32,
    threshold: u32,
) {
    env.events().publish(
        (symbol_short!("msig_apr"), escrow_id),
        (milestone_id, signer.clone(), accrued_weight, threshold),
    );
}

/// Emitted when a client rejects a milestone submission, returning it to Pending.
///
/// # Arguments
/// * `escrow_id`    - The escrow ID
/// * `milestone_id` - The rejected milestone
/// * `client`       - Client's address
pub fn emit_milestone_rejected(env: &Env, escrow_id: u64, milestone_id: u32, client: &Address) {
    env.events().publish(
        (symbol_short!("mil_rej"), escrow_id),
        (milestone_id, client.clone()),
    );
}

/// Emitted when a dispute is raised on a specific milestone.
///
/// # Arguments
/// * `escrow_id`    - The escrow ID
/// * `milestone_id` - The disputed milestone
/// * `raised_by`    - Address of the party raising the dispute
pub fn emit_milestone_disputed(env: &Env, escrow_id: u64, milestone_id: u32, raised_by: &Address) {
    env.events().publish(
        (symbol_short!("mil_dis"), escrow_id),
        (milestone_id, raised_by.clone()),
    );
}

/// Emitted when funds are released to the freelancer for an approved milestone.
///
/// # Arguments
/// * `escrow_id`  - The escrow ID
/// * `to`         - Recipient (freelancer) address
/// * `amount`     - Amount released
pub fn emit_funds_released(env: &Env, escrow_id: u64, to: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("funds_rel"), escrow_id),
        (to.clone(), amount),
    );
}

/// Emitted when all milestones are approved and the escrow is completed.
///
/// # Arguments
/// * `escrow_id` - The completed escrow ID
///
/// Added to fix STE-03: indexer needs this event to update escrow status.
pub fn emit_escrow_completed(env: &Env, escrow_id: u64) {
    env.events()
        .publish((symbol_short!("esc_done"), escrow_id), ());
}

/// Emitted when a recurring payment schedule is configured for an escrow.
pub fn emit_recurring_schedule_created(
    env: &Env,
    escrow_id: u64,
    payment_amount: i128,
    total_payments: u32,
    next_payment_at: u64,
) {
    env.events().publish(
        (symbol_short!("rec_crt"), escrow_id),
        (payment_amount, total_payments, next_payment_at),
    );
}

/// Emitted when one or more recurring payments are processed.
pub fn emit_recurring_payments_processed(
    env: &Env,
    escrow_id: u64,
    processed_count: u32,
    total_released: i128,
    next_payment_at: Option<u64>,
) {
    env.events().publish(
        (symbol_short!("rec_pay"), escrow_id),
        (processed_count, total_released, next_payment_at),
    );
}

/// Emitted when a recurring schedule is paused.
pub fn emit_recurring_schedule_paused(env: &Env, escrow_id: u64, paused_by: &Address) {
    env.events()
        .publish((symbol_short!("rec_pau"), escrow_id), paused_by.clone());
}

/// Emitted when a recurring schedule is resumed.
pub fn emit_recurring_schedule_resumed(
    env: &Env,
    escrow_id: u64,
    resumed_by: &Address,
    next_payment_at: u64,
) {
    env.events().publish(
        (symbol_short!("rec_res"), escrow_id),
        (resumed_by.clone(), next_payment_at),
    );
}

/// Emitted when a recurring schedule is cancelled.
pub fn emit_recurring_schedule_cancelled(
    env: &Env,
    escrow_id: u64,
    cancelled_by: &Address,
    refunded_amount: i128,
) {
    env.events().publish(
        (symbol_short!("rec_can"), escrow_id),
        (cancelled_by.clone(), refunded_amount),
    );
}

/// Emitted when an escrow is cancelled and remaining funds returned to client.
///
/// # Arguments
/// * `escrow_id`         - The escrow ID
/// * `returned_amount`   - Amount returned to the client
pub fn emit_escrow_cancelled(env: &Env, escrow_id: u64, returned_amount: i128) {
    env.events()
        .publish((symbol_short!("esc_can"), escrow_id), returned_amount);
}

/// Emitted when a dispute is raised on an escrow.
///
/// # Arguments
/// * `escrow_id`   - The escrow ID
/// * `raised_by`   - Address of the party raising the dispute
/// * `reason_hash` - IPFS hash of the dispute reason document
pub fn emit_dispute_raised(env: &Env, escrow_id: u64, raised_by: &Address) {
    env.events()
        .publish((symbol_short!("dis_rai"), escrow_id), raised_by.clone());
}

/// Emitted when a dispute is resolved and funds are distributed.
///
/// # Arguments
/// * `escrow_id`           - The escrow ID
/// * `client_amount`       - Amount returned to client
/// * `freelancer_amount`   - Amount sent to freelancer
pub fn emit_dispute_resolved(
    env: &Env,
    escrow_id: u64,
    client_amount: i128,
    freelancer_amount: i128,
) {
    env.events().publish(
        (symbol_short!("dis_res"), escrow_id),
        (client_amount, freelancer_amount),
    );
}

/// Emitted when a user's reputation score is updated.
///
/// # Arguments
/// * `address`   - The user whose reputation changed
/// * `new_score` - Their updated total reputation score
pub fn emit_reputation_updated(env: &Env, address: &Address, new_score: u64) {
    env.events()
        .publish((symbol_short!("rep_upd"),), (address.clone(), new_score));
}

/// Emitted when a time lock expires on an escrow.
///
/// # Arguments
/// * `escrow_id` - The escrow ID
/// * `lock_time` - The timestamp when the lock expired
pub fn emit_lock_time_expired(env: &Env, escrow_id: u64, lock_time: u64) {
    env.events()
        .publish((symbol_short!("lock_exp"), escrow_id), lock_time);
}

/// Emitted when a time lock is extended.
///
/// # Arguments
/// * `escrow_id`       - The escrow ID
/// * `old_lock_time`  - The previous lock time
/// * `new_lock_time`  - The new lock time
/// * `extended_by`     - Address of the party that extended the lock
pub fn emit_timelock_started(env: &Env, escrow_id: u64, duration_ledger: u64, start_ledger: u64) {
    env.events().publish(
        (symbol_short!("tl_start"), escrow_id),
        (duration_ledger, start_ledger),
    );
}

pub fn emit_timelock_released(env: &Env, escrow_id: u64, released_ledger: u64) {
    env.events()
        .publish((symbol_short!("tl_rel"), escrow_id), released_ledger);
}

pub fn emit_lock_time_extended(
    env: &Env,
    escrow_id: u64,
    old_lock_time: u64,
    new_lock_time: u64,
    extended_by: &Address,
) {
    env.events().publish(
        (symbol_short!("lock_ext"), escrow_id),
        (old_lock_time, new_lock_time, extended_by.clone()),
    );
}

/// Emitted when the contract is paused.
pub fn emit_contract_paused(env: &Env, admin: &Address) {
    env.events()
        .publish((symbol_short!("paused"),), admin.clone());
}

/// Emitted when the contract is unpaused.
pub fn emit_contract_unpaused(env: &Env, admin: &Address) {
    env.events()
        .publish((symbol_short!("unpaused"),), admin.clone());
}

/// Emitted when a cancellation is executed after the dispute period.
///
/// # Arguments
/// * `escrow_id`      - The escrow ID
/// * `client_amount`  - Amount returned to the requester
/// * `slash_amount`   - Amount slashed as penalty
pub fn emit_cancellation_executed(
    env: &Env,
    escrow_id: u64,
    client_amount: i128,
    slash_amount: i128,
) {
    env.events().publish(
        (symbol_short!("can_exe"), escrow_id),
        (client_amount, slash_amount),
    );
}

/// Emitted when the counterparty approves a pending cancellation request.
pub fn emit_cancellation_approved(env: &Env, escrow_id: u64, approver: &Address) {
    env.events()
        .publish((symbol_short!("can_apr"), escrow_id), approver.clone());
}

/// Emitted when a cancellation is requested.
pub fn emit_cancellation_requested(
    env: &Env,
    escrow_id: u64,
    requester: &Address,
    reason: &soroban_sdk::String,
    dispute_deadline: u64,
) {
    env.events().publish(
        (symbol_short!("can_req"), escrow_id),
        (requester.clone(), reason.clone(), dispute_deadline),
    );
}

/// Emitted when a slash is applied to a user.
pub fn emit_slash_applied(
    env: &Env,
    escrow_id: u64,
    slashed_user: &Address,
    recipient: &Address,
    amount: i128,
    reason: &soroban_sdk::String,
) {
    env.events().publish(
        (symbol_short!("slsh_app"), escrow_id),
        (
            slashed_user.clone(),
            recipient.clone(),
            amount,
            reason.clone(),
        ),
    );
}

/// Emitted when a slash is disputed.
pub fn emit_slash_disputed(env: &Env, escrow_id: u64, disputer: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("slsh_dis"), escrow_id),
        (disputer.clone(), amount),
    );
}

/// Emitted when a slash dispute is resolved.
pub fn emit_slash_dispute_resolved(env: &Env, escrow_id: u64, upheld: bool, amount: i128) {
    env.events()
        .publish((symbol_short!("slsh_res"), escrow_id), (upheld, amount));
}

/// Emitted when the client role is transferred to a new address.
///
/// # Arguments
/// * `escrow_id`   - The escrow ID
/// * `old_client`  - The previous client address
/// * `new_client`  - The new client address
pub fn emit_client_role_transferred(
    env: &Env,
    escrow_id: u64,
    old_client: &Address,
    new_client: &Address,
) {
    env.events().publish(
        (symbol_short!("cl_role"), escrow_id),
        (old_client.clone(), new_client.clone()),
    );
}

/// Emitted when a client updates a pending milestone's title.
///
/// # Arguments
/// * `escrow_id`    - The escrow ID
/// * `milestone_id` - The milestone whose title was updated
/// * `new_title`    - The corrected title
pub fn emit_milestone_title_updated(
    env: &Env,
    escrow_id: u64,
    milestone_id: u32,
    new_title: &soroban_sdk::String,
) {
    env.events().publish(
        (symbol_short!("mil_tup"), escrow_id),
        (milestone_id, new_title.clone()),
    );
}

/// Emitted when the contract is initialized with an admin address.
pub fn emit_admin_initialized(env: &Env, admin: &Address) {
    env.events()
        .publish((symbol_short!("adm_init"),), admin.clone());
}

/// Emitted when the admin updates the maximum milestone cap.
pub fn emit_max_milestones_set(env: &Env, new_max: u32) {
    env.events().publish((symbol_short!("mil_cap"),), new_max);
}

/// Emitted when a milestone is rejected with an IPFS reason hash.
pub fn emit_milestone_rejected_with_reason(
    env: &Env,
    escrow_id: u64,
    milestone_id: u32,
    client: &Address,
    reason_hash: &soroban_sdk::BytesN<32>,
) {
    env.events().publish(
        (symbol_short!("mil_rej_r"), escrow_id),
        (milestone_id, client.clone(), reason_hash.clone()),
    );
}

/// Emitted when a client withdraws excess rent overpayment.
pub fn emit_rent_withdrawn(env: &Env, escrow_id: u64, recipient: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("rent_out"), escrow_id),
        (recipient.clone(), amount),
    );
}

/// Emitted when the arbiter is updated on an escrow.
pub fn emit_arbiter_updated(env: &Env, escrow_id: u64, new_arbiter: &Option<Address>) {
    env.events()
        .publish((symbol_short!("arb_upd"), escrow_id), new_arbiter.clone());
}
