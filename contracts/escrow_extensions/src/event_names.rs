//! # Event Topic Name Constants — Extensions
//!
//! Central registry of all `symbol_short!` event topic names used by the
//! escrow extensions contract (batch, fees, arbitration, upgrades).

use soroban_sdk::{symbol_short, Symbol};

// ── Batch ─────────────────────────────────────────────────────────────────────

pub const BATCH_ESCROW_CREATED: Symbol = symbol_short!("bat_crt");
pub const BATCH_COMPLETED: Symbol = symbol_short!("bat_done");

// ── Fees ──────────────────────────────────────────────────────────────────────

pub const FEE_COLLECTED: Symbol = symbol_short!("fee_col");
pub const FEE_DISTRIBUTED: Symbol = symbol_short!("fee_dis");
pub const FEE_EMERGENCY_WITHDRAWN: Symbol = symbol_short!("fee_emg");

// ── Arbitration ───────────────────────────────────────────────────────────────

pub const DISPUTE_OPENED: Symbol = symbol_short!("arb_opn");
pub const VOTE_CAST: Symbol = symbol_short!("arb_vot");
pub const DISPUTE_RESOLVED: Symbol = symbol_short!("arb_res");
pub const VOTER_SLASHED: Symbol = symbol_short!("arb_slh");

// ── Upgrade ───────────────────────────────────────────────────────────────────

pub const UPGRADE_QUEUED: Symbol = symbol_short!("upg_que");
pub const UPGRADE_EXECUTED: Symbol = symbol_short!("upg_exe");
pub const UPGRADE_CANCELLED: Symbol = symbol_short!("upg_can");
