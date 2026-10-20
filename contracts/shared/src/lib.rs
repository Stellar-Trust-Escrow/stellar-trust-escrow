//! # Shared Constants — StellarTrustEscrow
//!
//! Common constants and configuration shared across all contracts in the
//! StellarTrustEscrow workspace.

#![no_std]
#![deny(warnings)]

use soroban_sdk::{Env, IntoVal, Val};

pub mod auth;

// ── TTL constants ─────────────────────────────────────────────────────────────
//
// Issue #770 — ledger-time, fee, and transaction-size assumptions behind the
// numbers below, recorded next to the implementation so a future change to
// either can be checked against the reasoning that picked them.
//
// ## Ledger-time assumption
//
// Soroban ledgers close roughly every 5 seconds on mainnet (the same
// assumption behind the common `DAY_IN_LEDGERS = 17_280` constant). At that
// rate:
//   - `*_TTL_THRESHOLD` (5,000 ledgers)  ≈ 25,000s  ≈ ~6.9 hours
//   - `*_TTL_EXTEND_TO` (50,000 ledgers) ≈ 250,000s ≈ ~2.9 days
//
// So a bump fires once remaining TTL drops under ~7 hours, and resets the
// entry to live for roughly another ~2.9 days from that point.
//
// ## Why threshold < extend_to, and by how much
//
// The ~7h/~2.9d gap is the safety margin: as long as an entry is touched by
// `bump_*_ttl` at least once every ~2.9 days, it never reaches zero TTL. The
// ~7h threshold window exists so a bump isn't deferred to the last possible
// ledger — it still has slack if a bump transaction is delayed or fails.
// An entry that goes untouched for longer than ~2.9 days (no read/write that
// calls `bump_*_ttl` on it) is the one real risk: it gets archived and
// requires an explicit, separately-feed restore (`RestoreFootprintOp`)
// before it's readable again. Entries under active use are not expected to
// hit this — every documented read/write path bumps on the way through.
//
// ## Fee / transaction-size assumption
//
// `extend_ttl` is a storage operation: it adds to the transaction's ledger
// footprint and its resource fee, same as any other storage read/write.
// Bumping is conditional on the threshold check above rather than
// unconditional on every call, so the extra fee is paid roughly once per
// ~7-hour window of activity per entry, not on every single transaction
// that touches it. A contract calling `bump_*_ttl` on many keys in one
// transaction (e.g. a batch operation) multiplies this footprint linearly
// per key — keep batch sizes bounded (see `MAX_MILESTONES` below) so a
// single transaction's resource fee stays predictable.

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
