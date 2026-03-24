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
pub fn emit_milestone_disputed(
    env: &Env,
    escrow_id: u64,
    milestone_id: u32,
    raised_by: &Address,
) {
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
