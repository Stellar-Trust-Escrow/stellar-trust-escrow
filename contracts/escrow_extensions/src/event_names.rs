//! # Event Topic Name Constants
//!
//! Central registry of all event topic names used by the escrow extensions contract.

#![allow(dead_code)]

use soroban_sdk::{symbol_short, Symbol};

// ── Batch events ──────────────────────────────────────────────────────────────

/// Batch escrow created event
pub const BATCH_ESCROW_CREATED: Symbol = symbol_short!("batch_cr");

/// Batch milestone approved event  
pub const BATCH_MILESTONE_APPROVED: Symbol = symbol_short!("batch_ap");

/// Batch funds released event
pub const BATCH_FUNDS_RELEASED: Symbol = symbol_short!("batch_rel");

/// Batch operation completed event
pub const BATCH_COMPLETED: Symbol = symbol_short!("batch_ok");

// ── Fee events ────────────────────────────────────────────────────────────────

/// Platform fee collected event
pub const FEE_COLLECTED: Symbol = symbol_short!("fee_col");

/// Fee tier updated event
pub const FEE_TIER_UPDATED: Symbol = symbol_short!("fee_upd");

/// Fee distributed event
pub const FEE_DISTRIBUTED: Symbol = symbol_short!("fee_dist");

/// Emergency fee withdrawal event
pub const FEE_EMERGENCY_WITHDRAWN: Symbol = symbol_short!("fee_emrg");

// ── Dispute events ────────────────────────────────────────────────────────────

/// Arbiter assigned event
pub const ARBITER_ASSIGNED: Symbol = symbol_short!("arb_asgn");

/// Dispute resolved event
pub const DISPUTE_RESOLVED: Symbol = symbol_short!("disp_res");

/// Dispute opened event
pub const DISPUTE_OPENED: Symbol = symbol_short!("disp_opn");

/// Vote cast event
pub const VOTE_CAST: Symbol = symbol_short!("vote_cst");

/// Voter slashed event
pub const VOTER_SLASHED: Symbol = symbol_short!("vtr_slsh");

// ── Proxy events ──────────────────────────────────────────────────────────────

/// Contract upgraded event
pub const CONTRACT_UPGRADED: Symbol = symbol_short!("upgrd");

/// Admin changed event
pub const ADMIN_CHANGED: Symbol = symbol_short!("adm_chg");

/// Upgrade queued event
pub const UPGRADE_QUEUED: Symbol = symbol_short!("upg_que");

/// Upgrade executed event
pub const UPGRADE_EXECUTED: Symbol = symbol_short!("upg_exec");

/// Upgrade cancelled event
pub const UPGRADE_CANCELLED: Symbol = symbol_short!("upg_canc");
