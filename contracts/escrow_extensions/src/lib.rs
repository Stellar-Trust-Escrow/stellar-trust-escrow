//! # StellarTrust Escrow Extensions
//!
//! Four capability extensions built on top of the core `EscrowContract`.
//! This crate is deployed as a **separate contract** and does not modify
//! the core escrow contract's storage or logic.
//!
//! ## Feature Subsystems
//!
//! ### 1. Batch Escrow Creation ([`EscrowExtensions::create_batch`])
//! Creates up to [`MAX_BATCH_SIZE`] (10) escrows atomically in a single
//! transaction. All parameter validation runs before any storage write,
//! guaranteeing all-or-nothing semantics. A single `require_auth` covers
//! the entire batch, reducing per-escrow overhead significantly compared
//! to N sequential `create_escrow` calls.
//!
//! ### 2. Protocol Fee Collection ([`EscrowExtensions::collect_fee`], [`EscrowExtensions::distribute_fees`])
//! Collects a configurable protocol fee (0–[`MAX_FEE_BPS`] = 2%) on each
//! escrow release. Fees accumulate per token in `FeeBalance` persistent
//! storage and are distributed to registered recipients via
//! `distribute_fees`. An emergency withdrawal path is available to the
//! admin via `emergency_withdraw_fees`.
//!
//! ### 3. On-Chain Dispute Arbitration ([`EscrowExtensions::open_dispute`], [`EscrowExtensions::cast_vote`], [`EscrowExtensions::resolve_dispute`])
//! Opens a [`VOTING_WINDOW_SECONDS`] (7-day) voting window for disputed
//! escrows. Reputation holders stake tokens and vote using quadratic
//! weighting (`weight = floor(sqrt(stake))`). Resolution requires a 51%
//! weighted majority. Voters on the losing side are slashed (via
//! `arb_slh` events) when dissent exceeds 90% of total weight.
//!
//! ### 4. Proxy Upgradeability ([`EscrowExtensions::queue_upgrade`], [`EscrowExtensions::execute_upgrade`])
//! Queues a WASM upgrade with a mandatory [`UPGRADE_DELAY_SECONDS`]
//! (24-hour) delay for transparency. The admin must sign both the queue
//! and execute calls. Soroban upgrades replace only the executable —
//! all persistent storage is preserved. A pending upgrade can be
//! cancelled before execution via `cancel_upgrade`.
//!
//! ## Key Constants
//!
//! | Constant | Value | Meaning |
//! |----------|-------|---------|
//! | [`MAX_BATCH_SIZE`] | 10 | Maximum escrows per `create_batch` call. |
//! | [`MAX_FEE_BPS`] | 200 | Maximum protocol fee in basis points (2%). |
//! | [`VOTING_WINDOW_SECONDS`] | 604_800 | Dispute voting window (7 days). |
//! | [`UPGRADE_DELAY_SECONDS`] | 86_400 | Mandatory upgrade delay (24 hours). |
//! | [`SLASH_DISSENT_THRESHOLD_BPS`] | 9_000 | Losing-side dissent % that triggers voter slashing (90%). |
//!
//! ## Relationship to `EscrowContract`
//!
//! `EscrowExtensions` is a standalone contract. It does not share storage
//! with `EscrowContract` and cannot call its internal functions directly.
//! The batch creation feature maintains its own escrow ID counter in
//! instance storage. In production, the two contracts are coordinated
//! off-chain or via a relayer.
//! Four new capabilities added on top of the core escrow contract:
//!
//! ## 1. Batch Escrow Creation (#519)
//! `create_batch(client, escrows: Vec<BatchEscrowParams>) → Vec<u64>`
//! - Accepts up to MAX_BATCH_SIZE (10) escrow params in one transaction
//! - Atomic: if any single creation fails the whole call reverts
//! - Emits individual `bat_crt` events per escrow + one `bat_done` summary
//! - Gas savings: one auth check, one counter read, N token transfers
//!
//! ## 2. Protocol Fee Collection (#518)
//! `collect_fee(escrow_id, token, gross_amount) → (net, fee)`
//! - Configurable fee in basis points (0–200, i.e. 0–2 %)
//! - Fee collected only on successful release
//! - Multi-recipient distribution with per-recipient share_bps
//! - Emergency withdrawal for admin
//! - Historical tracking via FeeBalance per token
//!
//! ## 3. On-Chain Dispute Arbitration (#516)
//! `open_dispute / cast_vote / resolve_dispute`
//! - 7-day voting window (VOTING_WINDOW_SECONDS)
//! - Quadratic voting: weight = floor(sqrt(stake))
//! - 51 % weighted threshold for resolution
//! - Slashing: voters on losing side when dissent > 90 % lose their stake
//!
//! ## 4. Proxy Upgradeability (#517)
//! `queue_upgrade / execute_upgrade / cancel_upgrade`
//! - 24-hour mandatory delay (UPGRADE_DELAY_SECONDS)
//! - Admin-only; emits events for transparency
//! - State is preserved (Soroban upgrades only replace WASM)

#![no_std]

mod errors;
mod events;
mod types;

pub use errors::ExtError;
pub use types::{
    ArbitrationDispute, BatchEscrowParams, DataKey, FeeBalance, FeeRecipient, PendingUpgrade, Vote,
};

use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env, Vec};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum number of escrows that can be created in a single `create_batch` call.
pub const MAX_BATCH_SIZE: u32 = 10;

/// Maximum protocol fee in basis points. 200 bps = 2%.
pub const MAX_FEE_BPS: u32 = 200;

/// Duration of the on-chain dispute voting window in seconds (7 days).
pub const VOTING_WINDOW_SECONDS: u64 = 604_800;

/// Mandatory delay between `queue_upgrade` and `execute_upgrade` in seconds (24 hours).
pub const UPGRADE_DELAY_SECONDS: u64 = 86_400;

/// Dissent threshold in basis points above which losing voters are slashed (90%).
const SLASH_DISSENT_THRESHOLD_BPS: u64 = 9_000;
/// Maximum escrows per batch call.
const MAX_BATCH_SIZE: u32 = 10;

/// Maximum protocol fee: 200 bps = 2 %.
const MAX_FEE_BPS: u32 = 200;

/// 7-day voting window in seconds (7 * 24 * 3600).
const VOTING_WINDOW_SECONDS: u64 = 604_800;

/// 24-hour upgrade delay in seconds.
const UPGRADE_DELAY_SECONDS: u64 = 86_400;

/// Dissent threshold for slashing: if losing side > 90 % of total weight,
/// slash losing voters.
const SLASH_DISSENT_THRESHOLD_BPS: u64 = 9_000; // 90 %

// ── TTL ───────────────────────────────────────────────────────────────────────
const INSTANCE_TTL_THRESHOLD: u32 = 5_000;
const INSTANCE_TTL_EXTEND_TO: u32 = 50_000;
const PERSISTENT_TTL_THRESHOLD: u32 = 5_000;
const PERSISTENT_TTL_EXTEND_TO: u32 = 50_000;

// ── Storage helpers ───────────────────────────────────────────────────────────

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

fn bump_persistent<K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &K) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);
}

fn require_admin(env: &Env, caller: &Address) -> Result<(), ExtError> {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(ExtError::NotInitialized)?;
    if *caller != admin {
        return Err(ExtError::AdminOnly);
    }
    Ok(())
}

/// Integer square root via Newton's method — no floating point, overflow-safe.
// ── isqrt helper (integer square root for quadratic voting) ───────────────────

/// Integer square root via Newton's method — no floating point.
fn isqrt(n: u64) -> u64 {
    if n == 0 {
        return 0;
    }
    // Start estimate: avoid overflow by shifting right
    let mut x = n;
    let mut y = (x >> 1).saturating_add(1);
    while y < x {
        x = y;
        y = (x.saturating_add(n / x)) / 2;
    }
    x
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowExtensions;

#[contractimpl]
impl EscrowExtensions {
    // ── Initialization ────────────────────────────────────────────────────────

    /// Initializes the extensions contract with an admin address and initial fee.
    ///
    /// Must be called once before any other function. `fee_bps` must be ≤ [`MAX_FEE_BPS`].
    /// Initializes the extensions contract.
    ///
    /// # Arguments
    /// * `admin`    — admin address
    /// * `fee_bps`  — initial protocol fee in basis points (0–200)
    pub fn initialize(env: Env, admin: Address, fee_bps: u32) -> Result<(), ExtError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ExtError::AlreadyInitialized);
        }
        if fee_bps > MAX_FEE_BPS {
            return Err(ExtError::FeeTooHigh);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        env.storage()
            .instance()
            .set(&DataKey::FeeRecipients, &Vec::<FeeRecipient>::new(&env));
        bump_instance(&env);
        Ok(())
    }

    // ── #519 Batch Escrow Creation ────────────────────────────────────────────

    /// Creates up to [`MAX_BATCH_SIZE`] escrows atomically in a single transaction.
    ///
    /// All parameter validation runs before any storage write or token transfer,
    /// ensuring all-or-nothing atomicity. A single `require_auth` on `client`
    /// covers the entire batch. Emits one `bat_crt` event per escrow and one
    /// `bat_done` summary event.
    ///
    /// # Errors
    /// - [`ExtError::BatchEmpty`] — `escrows` is empty.
    /// - [`ExtError::BatchTooLarge`] — `escrows.len() > MAX_BATCH_SIZE`.
    /// - [`ExtError::BatchItemInvalid`] — any item has `total_amount <= 0` or a past deadline.
    /// Creates up to MAX_BATCH_SIZE escrows atomically in a single transaction.
    ///
    /// All escrows share the same `client` and are created with the same token.
    /// If any single escrow fails validation the entire call reverts (Soroban
    /// panics unwind all state changes within a transaction).
    ///
    /// # Gas savings
    /// - Single `require_auth` for the client
    /// - Single ledger timestamp read
    /// - N token transfers (unavoidable) but only one auth overhead
    ///
    /// # Returns
    /// Vec of assigned escrow IDs in the same order as the input params.
    pub fn create_batch(
        env: Env,
        client: Address,
        escrows: Vec<BatchEscrowParams>,
    ) -> Result<Vec<u64>, ExtError> {
        client.require_auth();

        let count = escrows.len();
        if count == 0 {
            return Err(ExtError::BatchEmpty);
        }
        if count > MAX_BATCH_SIZE {
            return Err(ExtError::BatchTooLarge);
        }

        let now = env.ledger().timestamp();

        // ── Validate all params before touching storage ───────────────────────
        // This ensures atomicity: we fail fast before any state changes.
        for i in 0..count {
            let p = escrows.get(i).unwrap();
            if p.total_amount <= 0 {
                return Err(ExtError::BatchItemInvalid);
            }
            if let Some(dl) = p.deadline {
                if dl <= now {
                    return Err(ExtError::BatchItemInvalid);
                }
            }
        }

        let batch_counter_key = DataKey::StorageVersion;
        // ── Read and reserve escrow IDs atomically ────────────────────────────
        let start_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::StorageVersion) // reuse as a simple counter seed
            .unwrap_or(0_u64);
        // We use a dedicated batch counter stored in instance storage.
        // In production this would call into the core escrow contract's
        // counter; here we maintain our own for the extension contract.
        let batch_counter_key = DataKey::StorageVersion; // repurposed as escrow counter
        let base_id: u64 = env
            .storage()
            .instance()
            .get(&batch_counter_key)
            .unwrap_or(0_u64);
        env.storage()
            .instance()
            .set(&batch_counter_key, &(base_id + u64::from(count)));
        let _ = start_id; // suppress unused warning

        let mut ids = Vec::new(&env);
        let mut total_batch_amount: i128 = 0;

        for i in 0..count {
            let p = escrows.get(i).unwrap();
            let escrow_id = base_id + u64::from(i);

            // Transfer tokens from client to this contract
            token::Client::new(&env, &p.token).transfer(
                &client,
                &env.current_contract_address(),
                &p.total_amount,
            );

            total_batch_amount = total_batch_amount
                .checked_add(p.total_amount)
                .ok_or(ExtError::BatchItemInvalid)?;

            events::emit_batch_escrow_created(&env, escrow_id, &client, &p.freelancer, p.total_amount);
            events::emit_batch_escrow_created(
                &env,
                escrow_id,
                &client,
                &p.freelancer,
                p.total_amount,
            );
            ids.push_back(escrow_id);
        }

        events::emit_batch_completed(&env, count, total_batch_amount);
        bump_instance(&env);
        Ok(ids)
    }

    /// Returns the total number of escrows created via `create_batch`.
    /// Returns the current batch counter (total escrows created via batch).
    pub fn batch_escrow_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::StorageVersion)
            .unwrap_or(0)
    }

    // ── #518 Protocol Fee Collection ──────────────────────────────────────────

    /// Sets the protocol fee in basis points. Admin only. Max [`MAX_FEE_BPS`] (2%).
    /// Sets the protocol fee in basis points. Admin only. Max 200 (2 %).
    pub fn set_fee_bps(env: Env, caller: Address, fee_bps: u32) -> Result<(), ExtError> {
        caller.require_auth();
        require_admin(&env, &caller)?;
        if fee_bps > MAX_FEE_BPS {
            return Err(ExtError::FeeTooHigh);
        }
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        bump_instance(&env);
        Ok(())
    }

    /// Sets fee recipients. Shares must sum to exactly 10_000 bps (100%).
    /// Sets the fee recipients. Shares must sum to 10_000 bps (100 %).
    pub fn set_fee_recipients(
        env: Env,
        caller: Address,
        recipients: Vec<FeeRecipient>,
    ) -> Result<(), ExtError> {
        caller.require_auth();
        require_admin(&env, &caller)?;

        let total: u32 = recipients.iter().map(|r| r.share_bps).sum();
        if total != 10_000 {
            return Err(ExtError::InvalidRecipient);
        }
        env.storage().instance().set(&DataKey::FeeRecipients, &recipients);

        env.storage()
            .instance()
            .set(&DataKey::FeeRecipients, &recipients);
        bump_instance(&env);
        Ok(())
    }

    /// Deducts the protocol fee from `gross_amount` and accumulates it in `FeeBalance`.
    ///
    /// Returns `(net_amount, fee_amount)`. Call this on every successful milestone
    /// release. If `fee_bps == 0` the gross amount is returned unchanged.
    /// Collects the protocol fee from a gross release amount.
    ///
    /// Called by the escrow contract (or relayer) on successful milestone release.
    /// Accumulates the fee in `FeeBalance` for later distribution.
    ///
    /// # Returns
    /// `(net_amount, fee_amount)` — net is what the freelancer receives.
    pub fn collect_fee(
        env: Env,
        escrow_id: u64,
        token: Address,
        gross_amount: i128,
    ) -> Result<(i128, i128), ExtError> {
        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0);
        if fee_bps == 0 || gross_amount <= 0 {
            return Ok((gross_amount, 0));
        }
        let fee_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::FeeBps)
            .unwrap_or(0);

        if fee_bps == 0 || gross_amount <= 0 {
            return Ok((gross_amount, 0));
        }

        let fee = gross_amount
            .checked_mul(i128::from(fee_bps))
            .ok_or(ExtError::InvalidFeeBps)?
            / 10_000;
        let net = gross_amount - fee;

        let net = gross_amount - fee;

        // Accumulate fee
        let key = DataKey::FeeBalance(token.clone());
        let prev: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let new_balance = prev.checked_add(fee).ok_or(ExtError::InvalidFeeBps)?;
        env.storage().persistent().set(&key, &new_balance);
        bump_persistent(&env, &key);

        events::emit_fee_collected(&env, escrow_id, &token, fee);
        Ok((net, fee))
    }

    /// Distributes all accumulated fees for `token` to registered recipients.
    ///
    /// Returns the total amount distributed. Any dust from integer division
    /// remains in `FeeBalance`.
    /// Distributes accumulated fees for a token to all configured recipients.
    pub fn distribute_fees(env: Env, token: Address) -> Result<i128, ExtError> {
        let key = DataKey::FeeBalance(token.clone());
        let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if balance <= 0 {
            return Err(ExtError::NoFeesAccumulated);
        }

        let recipients: Vec<FeeRecipient> = env
            .storage()
            .instance()
            .get(&DataKey::FeeRecipients)
            .unwrap_or_else(|| Vec::new(&env));
        let token_client = token::Client::new(&env, &token);
        let mut distributed: i128 = 0;
        for r in recipients.iter() {
            let share = balance.checked_mul(i128::from(r.share_bps)).unwrap_or(0) / 10_000;

        let token_client = token::Client::new(&env, &token);
        let mut distributed: i128 = 0;

        for r in recipients.iter() {
            let share = balance
                .checked_mul(i128::from(r.share_bps))
                .unwrap_or(0)
                / 10_000;
            if share > 0 {
                token_client.transfer(&env.current_contract_address(), &r.address, &share);
                distributed += share;
            }
        }
        let dust = balance - distributed;
        env.storage().persistent().set(&key, &dust);
        bump_persistent(&env, &key);

        // Clear balance (any dust stays due to integer division)
        let dust = balance - distributed;
        env.storage().persistent().set(&key, &dust);
        bump_persistent(&env, &key);

        events::emit_fee_distributed(&env, &token, distributed);
        Ok(distributed)
    }

    /// Emergency withdrawal of all accumulated fees for `token` to `to`. Admin only.
    /// Emergency withdrawal of all accumulated fees for a token. Admin only.
    pub fn emergency_withdraw_fees(
        env: Env,
        caller: Address,
        token: Address,
        to: Address,
    ) -> Result<i128, ExtError> {
        caller.require_auth();
        require_admin(&env, &caller)?;

        let key = DataKey::FeeBalance(token.clone());
        let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if balance <= 0 {
            return Err(ExtError::NoFeesAccumulated);
        }
        token::Client::new(&env, &token).transfer(&env.current_contract_address(), &to, &balance);
        env.storage().persistent().set(&key, &0_i128);
        bump_persistent(&env, &key);

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &to,
            &balance,
        );
        env.storage().persistent().set(&key, &0_i128);
        bump_persistent(&env, &key);

        events::emit_fee_emergency_withdrawn(&env, &token, balance, &to);
        Ok(balance)
    }

    /// Returns the current protocol fee in basis points.
    pub fn get_fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0)
    }

    /// Returns the accumulated fee balance for `token`.
    pub fn get_fee_balance(env: Env, token: Address) -> i128 {
        env.storage().persistent().get(&DataKey::FeeBalance(token)).unwrap_or(0)
    /// Returns the current fee in basis points.
    pub fn get_fee_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::FeeBps)
            .unwrap_or(0)
    }

    /// Returns the accumulated fee balance for a token.
    pub fn get_fee_balance(env: Env, token: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::FeeBalance(token))
            .unwrap_or(0)
    }

    // ── #516 On-Chain Dispute Arbitration ─────────────────────────────────────

    /// Opens a [`VOTING_WINDOW_SECONDS`]-long arbitration window for `escrow_id`.
    ///
    /// Anyone can call this for an escrow that is in Disputed state.
    /// Emits `arb_opn`. Reverts with [`ExtError::DisputeAlreadyExists`] if
    /// a dispute record already exists for this escrow.
    /// Opens an on-chain arbitration window for a disputed escrow.
    ///
    /// Anyone can open arbitration for an escrow that is in Disputed state.
    /// Voting runs for VOTING_WINDOW_SECONDS (7 days).
    pub fn open_dispute(env: Env, escrow_id: u64) -> Result<(), ExtError> {
        let key = DataKey::Dispute(escrow_id);
        if env.storage().persistent().has(&key) {
            return Err(ExtError::DisputeAlreadyExists);
        }
        let now = env.ledger().timestamp();
        let closes_at = now + VOTING_WINDOW_SECONDS;

        let now = env.ledger().timestamp();
        let closes_at = now + VOTING_WINDOW_SECONDS;

        let dispute = ArbitrationDispute {
            escrow_id,
            voting_opens_at: now,
            voting_closes_at: closes_at,
            weight_for_client: 0,
            weight_for_freelancer: 0,
            total_stake: 0,
            votes: Vec::new(&env),
            resolved: false,
            client_wins: None,
        };
        env.storage().persistent().set(&key, &dispute);
        bump_persistent(&env, &key);

        env.storage().persistent().set(&key, &dispute);
        bump_persistent(&env, &key);

        events::emit_dispute_opened(&env, escrow_id, closes_at);
        Ok(())
    }

    /// Casts a quadratic-weighted vote on an open arbitration dispute.
    ///
    /// Voting weight = `floor(sqrt(stake))`. Each address may vote exactly once.
    /// `for_client = true` votes in favour of the client; `false` favours the freelancer.
    ///
    /// # Errors
    /// - [`ExtError::DisputeNotFound`] — no dispute record for `escrow_id`.
    /// - [`ExtError::VotingWindowClosed`] — voting period has ended.
    /// - [`ExtError::AlreadyVoted`] — `voter` has already cast a vote.
    /// - [`ExtError::InsufficientStake`] — `stake == 0`.
    /// Cast a vote on an open arbitration dispute.
    ///
    /// Voting weight = floor(sqrt(stake)) — quadratic voting.
    /// Each address can vote only once per dispute.
    ///
    /// # Arguments
    /// * `voter`      — must `require_auth()`
    /// * `escrow_id`  — the disputed escrow
    /// * `stake`      — reputation points committed (burned on slash)
    /// * `for_client` — true = vote for client, false = vote for freelancer
    pub fn cast_vote(
        env: Env,
        voter: Address,
        escrow_id: u64,
        stake: u64,
        for_client: bool,
    ) -> Result<(), ExtError> {
        voter.require_auth();
        if stake == 0 {
            return Err(ExtError::InsufficientStake);
        }

        if stake == 0 {
            return Err(ExtError::InsufficientStake);
        }

        let key = DataKey::Dispute(escrow_id);
        let mut dispute: ArbitrationDispute = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ExtError::DisputeNotFound)?;
        let now = env.ledger().timestamp();
        if now > dispute.voting_closes_at || dispute.resolved {
            return Err(ExtError::VotingWindowClosed);
        }

        let now = env.ledger().timestamp();
        if now > dispute.voting_closes_at {
            return Err(ExtError::VotingWindowClosed);
        }
        if dispute.resolved {
            return Err(ExtError::VotingWindowClosed);
        }

        // Check for duplicate vote
        for v in dispute.votes.iter() {
            if v.voter == voter {
                return Err(ExtError::AlreadyVoted);
            }
        }

        let weight = isqrt(stake);
        if weight == 0 {
            return Err(ExtError::InvalidVoteWeight);
        }
        if for_client {
            dispute.weight_for_client = dispute.weight_for_client.checked_add(weight).ok_or(ExtError::InvalidVoteWeight)?;
        } else {
            dispute.weight_for_freelancer = dispute.weight_for_freelancer.checked_add(weight).ok_or(ExtError::InvalidVoteWeight)?;
        }
        dispute.total_stake = dispute.total_stake.checked_add(stake).ok_or(ExtError::InvalidVoteWeight)?;
        dispute.votes.push_back(Vote { voter: voter.clone(), stake, for_client, cast_at: now });
        env.storage().persistent().set(&key, &dispute);
        bump_persistent(&env, &key);

        if for_client {
            dispute.weight_for_client = dispute
                .weight_for_client
                .checked_add(weight)
                .ok_or(ExtError::InvalidVoteWeight)?;
        } else {
            dispute.weight_for_freelancer = dispute
                .weight_for_freelancer
                .checked_add(weight)
                .ok_or(ExtError::InvalidVoteWeight)?;
        }

        dispute.total_stake = dispute
            .total_stake
            .checked_add(stake)
            .ok_or(ExtError::InvalidVoteWeight)?;

        dispute.votes.push_back(Vote {
            voter: voter.clone(),
            stake,
            for_client,
            cast_at: now,
        });

        env.storage().persistent().set(&key, &dispute);
        bump_persistent(&env, &key);

        events::emit_vote_cast(&env, escrow_id, &voter, stake, for_client);
        Ok(())
    }

    /// Resolves a dispute after the voting window closes.
    ///
    /// Client wins if `weight_for_client / total_weight >= 51%`. Voters on the
    /// losing side are slashed (via `arb_slh` events) when their side's weight
    /// exceeds [`SLASH_DISSENT_THRESHOLD_BPS`] (90%) of total weight.
    /// Returns `true` if the client wins, `false` if the freelancer wins.
    ///
    /// # Errors
    /// - [`ExtError::VotingWindowOpen`] — voting period has not yet ended.
    /// - [`ExtError::QuorumNotReached`] — no votes were cast.
    /// Resolution rules:
    /// - Client wins if `weight_for_client / total_weight >= 51 %`
    /// - Freelancer wins otherwise
    /// - Slashing: if losing side > 90 % of total weight, losing voters
    ///   are flagged (actual stake deduction handled by reputation contract)
    ///
    /// Anyone can call this after the window closes.
    pub fn resolve_dispute(env: Env, escrow_id: u64) -> Result<bool, ExtError> {
        let key = DataKey::Dispute(escrow_id);
        let mut dispute: ArbitrationDispute = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ExtError::DisputeNotFound)?;

        let now = env.ledger().timestamp();
        if now <= dispute.voting_closes_at {
            return Err(ExtError::VotingWindowOpen);
        }
        if dispute.resolved {
            return Ok(dispute.client_wins.unwrap_or(false));
        }
        let total_weight = dispute.weight_for_client + dispute.weight_for_freelancer;
        if total_weight == 0 {
            return Err(ExtError::QuorumNotReached);
        }
        let client_wins = dispute.weight_for_client * 100 / total_weight >= 51;
        dispute.resolved = true;
        dispute.client_wins = Some(client_wins);
        let losing_weight = if client_wins { dispute.weight_for_freelancer } else { dispute.weight_for_client };
        if losing_weight * 10_000 / total_weight > SLASH_DISSENT_THRESHOLD_BPS {
            for v in dispute.votes.iter() {
                if v.for_client != client_wins {
            // Already resolved — return cached result
            return Ok(dispute.client_wins.unwrap_or(false));
        }

        let total_weight = dispute.weight_for_client + dispute.weight_for_freelancer;
        if total_weight == 0 {
            // No votes cast — default to no resolution (admin must intervene)
            return Err(ExtError::QuorumNotReached);
        }

        // 51 % threshold
        let client_wins =
            dispute.weight_for_client * 100 / total_weight >= 51;

        dispute.resolved = true;
        dispute.client_wins = Some(client_wins);

        // ── Slashing ──────────────────────────────────────────────────────────
        // If the losing side's weight > 90 % of total, slash losing voters.
        let losing_weight = if client_wins {
            dispute.weight_for_freelancer
        } else {
            dispute.weight_for_client
        };

        let slash = losing_weight * 10_000 / total_weight > SLASH_DISSENT_THRESHOLD_BPS;

        if slash {
            for v in dispute.votes.iter() {
                let voted_losing = v.for_client != client_wins;
                if voted_losing {
                    events::emit_voter_slashed(&env, escrow_id, &v.voter, v.stake);
                }
            }
        }
        env.storage().persistent().set(&key, &dispute);
        bump_persistent(&env, &key);

        env.storage().persistent().set(&key, &dispute);
        bump_persistent(&env, &key);

        events::emit_dispute_resolved(&env, escrow_id, client_wins);
        Ok(client_wins)
    }

    /// Returns the current state of an arbitration dispute.
    pub fn get_dispute(env: Env, escrow_id: u64) -> Result<ArbitrationDispute, ExtError> {
        env.storage().persistent().get(&DataKey::Dispute(escrow_id)).ok_or(ExtError::DisputeNotFound)
        env.storage()
            .persistent()
            .get(&DataKey::Dispute(escrow_id))
            .ok_or(ExtError::DisputeNotFound)
    }

    // ── #517 Proxy Upgradeability ─────────────────────────────────────────────

    /// Queues a contract upgrade with a mandatory [`UPGRADE_DELAY_SECONDS`] delay.
    ///
    /// The new WASM must be uploaded to the network before calling this.
    /// Returns the earliest timestamp at which `execute_upgrade` may be called.
    /// Admin only. Reverts with [`ExtError::UpgradeAlreadyPending`] if a
    /// pending upgrade already exists.
    /// Queues a contract upgrade with a mandatory 24-hour delay.
    ///
    /// The new WASM must be uploaded to the network before calling this.
    /// Admin only.
    pub fn queue_upgrade(
        env: Env,
        caller: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<u64, ExtError> {
        caller.require_auth();
        require_admin(&env, &caller)?;
        if env.storage().instance().has(&DataKey::PendingUpgrade) {
            return Err(ExtError::UpgradeAlreadyPending);
        }
        let now = env.ledger().timestamp();
        let executable_after = now + UPGRADE_DELAY_SECONDS;

        if env.storage().instance().has(&DataKey::PendingUpgrade) {
            return Err(ExtError::UpgradeAlreadyPending);
        }

        let now = env.ledger().timestamp();
        let executable_after = now + UPGRADE_DELAY_SECONDS;

        let pending = PendingUpgrade {
            new_wasm_hash: new_wasm_hash.clone(),
            queued_at: now,
            executable_after,
            queued_by: caller,
        };
        env.storage().instance().set(&DataKey::PendingUpgrade, &pending);
        bump_instance(&env);

        env.storage()
            .instance()
            .set(&DataKey::PendingUpgrade, &pending);
        bump_instance(&env);

        events::emit_upgrade_queued(&env, &new_wasm_hash, executable_after);
        Ok(executable_after)
    }

    /// Executes a previously queued upgrade after the delay has elapsed.
    ///
    /// Replaces the contract WASM while preserving all persistent storage.
    /// Admin only. Reverts with [`ExtError::UpgradeDelayNotElapsed`] if
    /// called before `executable_after`.
    pub fn execute_upgrade(env: Env, caller: Address) -> Result<(), ExtError> {
        caller.require_auth();
        require_admin(&env, &caller)?;
    /// Admin only. Soroban upgrades replace only the WASM — all storage
    /// (escrows, reputation, counters) is preserved.
    pub fn execute_upgrade(env: Env, caller: Address) -> Result<(), ExtError> {
        caller.require_auth();
        require_admin(&env, &caller)?;

        let pending: PendingUpgrade = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrade)
            .ok_or(ExtError::NoPendingUpgrade)?;
        if env.ledger().timestamp() < pending.executable_after {
            return Err(ExtError::UpgradeDelayNotElapsed);
        }
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        events::emit_upgrade_executed(&env, &pending.new_wasm_hash);
        env.deployer().update_current_contract_wasm(pending.new_wasm_hash);
        Ok(())
    }

    /// Cancels a pending upgrade before it is executed. Admin only.
    pub fn cancel_upgrade(env: Env, caller: Address) -> Result<(), ExtError> {
        caller.require_auth();
        require_admin(&env, &caller)?;
        if !env.storage().instance().has(&DataKey::PendingUpgrade) {
            return Err(ExtError::NoPendingUpgrade);
        }
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        bump_instance(&env);

        let now = env.ledger().timestamp();
        if now < pending.executable_after {
            return Err(ExtError::UpgradeDelayNotElapsed);
        }

        env.storage().instance().remove(&DataKey::PendingUpgrade);

        events::emit_upgrade_executed(&env, &pending.new_wasm_hash);

        // Execute the WASM upgrade — replaces contract logic, preserves storage
        env.deployer()
            .update_current_contract_wasm(pending.new_wasm_hash);

        Ok(())
    }

    /// Cancels a pending upgrade. Admin only.
    pub fn cancel_upgrade(env: Env, caller: Address) -> Result<(), ExtError> {
        caller.require_auth();
        require_admin(&env, &caller)?;

        if !env.storage().instance().has(&DataKey::PendingUpgrade) {
            return Err(ExtError::NoPendingUpgrade);
        }

        env.storage().instance().remove(&DataKey::PendingUpgrade);
        bump_instance(&env);

        events::emit_upgrade_cancelled(&env);
        Ok(())
    }

    /// Returns the pending upgrade record, if any.
    /// Returns the pending upgrade, if any.
    pub fn get_pending_upgrade(env: Env) -> Option<PendingUpgrade> {
        env.storage().instance().get(&DataKey::PendingUpgrade)
    }
}

mod tests;
