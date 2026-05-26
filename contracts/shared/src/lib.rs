//! # Shared Constants — StellarTrustEscrow
//!
//! Common constants and configuration shared across all contracts in the
//! StellarTrustEscrow workspace.

#![no_std]
#![deny(warnings)]

use soroban_sdk::{Env, IntoVal, Val};

// ── TTL constants ─────────────────────────────────────────────────────────────

/// Bump instance storage TTL when remaining ledgers fall below this threshold.
pub const INSTANCE_TTL_THRESHOLD: u32 = 5_000;

/// Extend instance storage TTL to this value on bump.
pub const INSTANCE_TTL_EXTEND_TO: u32 = 50_000;

/// Bump persistent storage TTL when remaining ledgers fall below this threshold.
pub const PERSISTENT_TTL_THRESHOLD: u32 = 5_000;

/// Extend persistent storage TTL to this value on bump.
pub const PERSISTENT_TTL_EXTEND_TO: u32 = 50_000;

/// Bump instance TTL using shared config constants.
#[inline]
pub fn bump_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

/// Bump persistent TTL using shared config constants.
#[inline]
pub fn bump_persistent_ttl<K>(env: &Env, key: &K)
where
    K: IntoVal<Env, Val>,
{
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);
}

// ── Escrow limits ─────────────────────────────────────────────────────────────

/// Maximum number of milestones per escrow.
pub const MAX_MILESTONES: u32 = 50;

/// Maximum number of buyer signers per escrow.
pub const MAX_BUYER_SIGNERS: u32 = 3;

/// Required approvals from buyer signers (2-of-N).
pub const REQUIRED_BUYER_APPROVALS: u32 = 2;

// ── Timing constants ──────────────────────────────────────────────────────────

/// Dispute window for cancellation requests (~6 days at 5 s/ledger).
pub const CANCELLATION_DISPUTE_PERIOD: u64 = 120_960;

/// Dispute window for slash records (~6 days).
pub const SLASH_DISPUTE_PERIOD: u64 = 51_840;

/// Slash penalty as a percentage of remaining balance.
pub const SLASH_PERCENTAGE: u64 = 10;

// ── Storage rent ──────────────────────────────────────────────────────────────

/// One rent period in seconds (1 day).
pub const RENT_PERIOD_SECONDS: u64 = 86_400;

/// Number of periods to reserve rent for upfront.
pub const RENT_RESERVE_PERIODS: u64 = 30;

/// Rent cost per storage entry per period (in token base units).
pub const RENT_PER_ENTRY_PER_PERIOD: i128 = 1;
