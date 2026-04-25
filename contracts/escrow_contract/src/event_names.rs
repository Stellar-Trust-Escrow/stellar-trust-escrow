//! # Event Topic Name Constants
//!
//! Central registry of all `symbol_short!` event topic names used by the
//! escrow contract.  Defining them here as `pub const` makes the full topic
//! namespace visible in one place, prevents accidental duplication, and
//! catches typos at compile time rather than at runtime.
//!
//! Each constant maps 1-to-1 to a `symbol_short!` call that previously
//! appeared inline in `events.rs`.

use soroban_sdk::{symbol_short, Symbol};

// ── Escrow lifecycle ──────────────────────────────────────────────────────────

pub const ESCROW_CREATED: Symbol = symbol_short!("esc_crt");
pub const ESCROW_COMPLETED: Symbol = symbol_short!("esc_done");
pub const ESCROW_CANCELLED: Symbol = symbol_short!("esc_can");

// ── Milestones ────────────────────────────────────────────────────────────────

pub const MILESTONE_ADDED: Symbol = symbol_short!("mil_add");
pub const MILESTONE_SUBMITTED: Symbol = symbol_short!("mil_sub");
pub const MILESTONE_APPROVED: Symbol = symbol_short!("mil_apr");
pub const MILESTONE_REJECTED: Symbol = symbol_short!("mil_rej");
pub const MILESTONE_DISPUTED: Symbol = symbol_short!("mil_dis");
pub const MILESTONE_TITLE_UPDATED: Symbol = symbol_short!("mil_tup");
pub const MILESTONE_REJECTED_WITH_REASON: Symbol = symbol_short!("mil_rej_r");
pub const MAX_MILESTONES_SET: Symbol = symbol_short!("mil_cap");

// ── Multisig ──────────────────────────────────────────────────────────────────

pub const MULTISIG_APPROVAL_RECORDED: Symbol = symbol_short!("msig_apr");

// ── Funds ─────────────────────────────────────────────────────────────────────

pub const FUNDS_RELEASED: Symbol = symbol_short!("funds_rel");
pub const RENT_WITHDRAWN: Symbol = symbol_short!("rent_out");

// ── Recurring payments ────────────────────────────────────────────────────────

pub const RECURRING_SCHEDULE_CREATED: Symbol = symbol_short!("rec_crt");
pub const RECURRING_PAYMENTS_PROCESSED: Symbol = symbol_short!("rec_pay");
pub const RECURRING_SCHEDULE_PAUSED: Symbol = symbol_short!("rec_pau");
pub const RECURRING_SCHEDULE_RESUMED: Symbol = symbol_short!("rec_res");
pub const RECURRING_SCHEDULE_CANCELLED: Symbol = symbol_short!("rec_can");

// ── Disputes ──────────────────────────────────────────────────────────────────

pub const DISPUTE_RAISED: Symbol = symbol_short!("dis_rai");
pub const DISPUTE_RESOLVED: Symbol = symbol_short!("dis_res");

// ── Cancellations ─────────────────────────────────────────────────────────────

pub const CANCELLATION_REQUESTED: Symbol = symbol_short!("can_req");
pub const CANCELLATION_APPROVED: Symbol = symbol_short!("can_apr");
pub const CANCELLATION_EXECUTED: Symbol = symbol_short!("can_exe");

// ── Slashing ──────────────────────────────────────────────────────────────────

pub const SLASH_APPLIED: Symbol = symbol_short!("slsh_app");
pub const SLASH_DISPUTED: Symbol = symbol_short!("slsh_dis");
pub const SLASH_DISPUTE_RESOLVED: Symbol = symbol_short!("slsh_res");

// ── Time locks ────────────────────────────────────────────────────────────────

pub const TIMELOCK_STARTED: Symbol = symbol_short!("tl_start");
pub const TIMELOCK_RELEASED: Symbol = symbol_short!("tl_rel");
pub const LOCK_TIME_EXPIRED: Symbol = symbol_short!("lock_exp");
pub const LOCK_TIME_EXTENDED: Symbol = symbol_short!("lock_ext");

// ── Roles ─────────────────────────────────────────────────────────────────────

pub const CLIENT_ROLE_TRANSFERRED: Symbol = symbol_short!("cl_role");
pub const ARBITER_UPDATED: Symbol = symbol_short!("arb_upd");

// ── Reputation ────────────────────────────────────────────────────────────────

pub const REPUTATION_UPDATED: Symbol = symbol_short!("rep_upd");

// ── Admin / contract state ────────────────────────────────────────────────────

pub const ADMIN_INITIALIZED: Symbol = symbol_short!("adm_init");
pub const CONTRACT_PAUSED: Symbol = symbol_short!("paused");
pub const CONTRACT_UNPAUSED: Symbol = symbol_short!("unpaused");
