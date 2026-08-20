#![allow(unused)]

//! On-chain Arbiter Performance Registry
//!
//! Tracks win/loss ratios and reputation scores for arbiters participating in
//! dispute resolution. Scores decay when an arbiter is inactive for more than
//! 5 000 ledgers to encourage active participation.

use soroban_sdk::{contracttype, Address, Env};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug)]
pub enum ArbiterKey {
    Record(Address),
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Persistent record stored for every registered arbiter.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ArbiterRecord {
    /// Arbiter's Stellar address.
    pub address: Address,
    /// Number of disputes where this arbiter's ruling was upheld.
    pub wins: u32,
    /// Number of disputes where this arbiter's ruling was overturned.
    pub losses: u32,
    /// Total disputes this arbiter has participated in.
    pub total_disputes: u32,
    /// The ledger sequence number when this arbiter last took an action.
    pub last_active_ledger: u32,
    /// Composite reputation score (starts at 0, increases with wins, decreases with losses/inactivity).
    pub reputation_score: i64,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Ledger gap after which inactivity decay is applied.
const INACTIVITY_THRESHOLD_LEDGERS: u32 = 5_000;
/// Score awarded for each win.
const WIN_SCORE_DELTA: i64 = 10;
/// Score deducted for each loss.
const LOSS_SCORE_DELTA: i64 = 15;
/// Score deducted per inactivity period (each INACTIVITY_THRESHOLD_LEDGERS block).
const INACTIVITY_DECAY_PER_PERIOD: i64 = 5;
/// Minimum reputation score — clamped so score never goes below this.
const MIN_REPUTATION_SCORE: i64 = -1_000;

// ---------------------------------------------------------------------------
// Registry functions
// ---------------------------------------------------------------------------

/// Initialise a fresh arbiter record in persistent storage.
///
/// Safe to call multiple times — subsequent calls are no-ops if the arbiter
/// is already registered.
pub fn register_arbiter(env: &Env, address: Address) {
    let key = ArbiterKey::Record(address.clone());
    if env.storage().persistent().has(&key) {
        return;
    }

    let record = ArbiterRecord {
        address,
        wins: 0,
        losses: 0,
        total_disputes: 0,
        last_active_ledger: env.ledger().sequence(),
        reputation_score: 0,
    };

    env.storage().persistent().set(&key, &record);
}

/// Record the outcome of a dispute for the given arbiter.
///
/// Increments the appropriate win/loss counter, updates `total_disputes`,
/// and adjusts `reputation_score` accordingly.
///
/// # Panics
/// Panics if the arbiter is not registered.
pub fn record_outcome(env: &Env, arbiter: Address, won: bool) {
    let key = ArbiterKey::Record(arbiter.clone());

    let mut record: ArbiterRecord = env
        .storage()
        .persistent()
        .get(&key)
        .expect("arbiter not registered");

    record.total_disputes += 1;
    record.last_active_ledger = env.ledger().sequence();

    if won {
        record.wins += 1;
        record.reputation_score = record
            .reputation_score
            .saturating_add(WIN_SCORE_DELTA);
    } else {
        record.losses += 1;
        record.reputation_score = record
            .reputation_score
            .saturating_sub(LOSS_SCORE_DELTA)
            .max(MIN_REPUTATION_SCORE);
    }

    env.storage().persistent().set(&key, &record);
}

/// Apply inactivity decay to an arbiter's reputation score.
///
/// For every full `INACTIVITY_THRESHOLD_LEDGERS` block that has elapsed since
/// the arbiter was last active, `INACTIVITY_DECAY_PER_PERIOD` points are
/// deducted from their score.  The score is clamped to `MIN_REPUTATION_SCORE`.
///
/// Does nothing if fewer than `INACTIVITY_THRESHOLD_LEDGERS` ledgers have
/// elapsed since `last_active_ledger`.
///
/// # Panics
/// Panics if the arbiter is not registered.
pub fn apply_inactivity_decay(env: &Env, arbiter: Address, current_ledger: u32) {
    let key = ArbiterKey::Record(arbiter.clone());

    let mut record: ArbiterRecord = env
        .storage()
        .persistent()
        .get(&key)
        .expect("arbiter not registered");

    if current_ledger <= record.last_active_ledger {
        return;
    }

    let elapsed = current_ledger - record.last_active_ledger;
    let periods = (elapsed / INACTIVITY_THRESHOLD_LEDGERS) as i64;

    if periods == 0 {
        return;
    }

    let decay = periods.saturating_mul(INACTIVITY_DECAY_PER_PERIOD);
    record.reputation_score = record
        .reputation_score
        .saturating_sub(decay)
        .max(MIN_REPUTATION_SCORE);

    env.storage().persistent().set(&key, &record);
}

/// Return the current reputation score for an arbiter.
///
/// # Panics
/// Panics if the arbiter is not registered.
pub fn get_reputation(env: &Env, arbiter: Address) -> i64 {
    let key = ArbiterKey::Record(arbiter);
    let record: ArbiterRecord = env
        .storage()
        .persistent()
        .get(&key)
        .expect("arbiter not registered");
    record.reputation_score
}

/// Return the full `ArbiterRecord` for an arbiter, or `None` if not registered.
pub fn get_record(env: &Env, arbiter: Address) -> Option<ArbiterRecord> {
    let key = ArbiterKey::Record(arbiter);
    env.storage().persistent().get(&key)
}

/// Determine whether an arbiter meets the minimum reputation threshold.
///
/// Returns `false` if the arbiter is not registered.
pub fn is_eligible(env: &Env, arbiter: Address, min_score: i64) -> bool {
    let key = ArbiterKey::Record(arbiter);
    match env.storage().persistent().get::<_, ArbiterRecord>(&key) {
        Some(record) => record.reputation_score >= min_score,
        None => false,
    }
}
