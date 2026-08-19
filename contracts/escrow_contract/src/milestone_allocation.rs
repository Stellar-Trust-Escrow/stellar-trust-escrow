#![allow(unused)]

use soroban_sdk::{contracttype, Address, Env, Symbol, Vec, symbol_short};

// Storage key prefixes
const ALLOC_KEY: Symbol = symbol_short!("ALLOC");
const RELEASED_KEY: Symbol = symbol_short!("MIL_REL");
const RESIDUAL_KEY: Symbol = symbol_short!("RESIDUAL");

/// Per-milestone fund allocation expressed in basis points.
///
/// The sum of all `percentage_bps` values across an escrow's allocations
/// must equal exactly 10000 (100%).
#[contracttype]
#[derive(Clone, Debug)]
pub struct MilestoneAllocation {
    /// Identifies which milestone this allocation belongs to.
    pub milestone_id: u32,
    /// Fraction of total escrow funds allocated to this milestone, in basis points.
    /// 10000 bps == 100%, 2500 bps == 25%.
    pub percentage_bps: u32,
}

/// Stores the allocation schedule for an escrow.
///
/// Validates that allocations sum to exactly 10000 bps before persisting.
/// Replaces any previously stored allocation schedule for this escrow.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - Identifier of the escrow to configure allocations for.
/// * `allocations` - List of `MilestoneAllocation` entries that must sum to 10000 bps.
pub fn set_allocations(env: &Env, escrow_id: u64, allocations: Vec<MilestoneAllocation>) {
    if !validate_allocations(&allocations) {
        panic!("milestone allocations must sum to exactly 10000 bps");
    }

    let alloc_key = (ALLOC_KEY, escrow_id);
    env.storage().persistent().set(&alloc_key, &allocations);

    env.events().publish(
        (symbol_short!("alloc"), symbol_short!("set")),
        (escrow_id, allocations.len()),
    );
}

/// Pure validation function — checks that allocation basis points sum to exactly 10000.
///
/// Milestone IDs need not be contiguous, but the total percentage must represent
/// exactly 100% of escrow funds.
///
/// # Arguments
/// * `allocations` - The list of allocations to validate.
///
/// # Returns
/// `true` if the sum of `percentage_bps` fields equals 10000, `false` otherwise.
pub fn validate_allocations(allocations: &Vec<MilestoneAllocation>) -> bool {
    let mut total: u32 = 0;
    for i in 0..allocations.len() {
        let alloc = allocations.get(i).unwrap();
        total = total.saturating_add(alloc.percentage_bps);
    }
    total == 10_000
}

/// Calculates the payout amount for a specific milestone.
///
/// Looks up the configured allocation for `milestone_id` and returns
/// `total_amount * percentage_bps / 10000`. Uses checked arithmetic to
/// prevent overflow on large escrow amounts.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow whose allocations to look up.
/// * `milestone_id` - Which milestone's payout to compute.
/// * `total_amount` - The total escrow balance in token's smallest unit.
///
/// # Returns
/// The amount to pay out for this milestone.
///
/// # Panics
/// Panics if no allocation schedule is set or the milestone_id is not found.
pub fn get_release_amount(env: &Env, escrow_id: u64, milestone_id: u32, total_amount: i128) -> i128 {
    let alloc_key = (ALLOC_KEY, escrow_id);
    let allocations: Vec<MilestoneAllocation> = env
        .storage()
        .persistent()
        .get(&alloc_key)
        .expect("no allocation schedule found for escrow");

    for i in 0..allocations.len() {
        let alloc = allocations.get(i).unwrap();
        if alloc.milestone_id == milestone_id {
            return total_amount
                .checked_mul(alloc.percentage_bps as i128)
                .expect("amount multiplication overflow")
                .checked_div(10_000)
                .expect("amount division error");
        }
    }

    panic!("milestone_id not found in allocation schedule");
}

/// Releases the allocated funds for a milestone to a recipient.
///
/// Computes the payout via `get_release_amount`, marks the milestone as released,
/// and emits a release event. In a production implementation, this would invoke
/// a token transfer from the escrow's holding to the recipient.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow to release from.
/// * `milestone_id` - The milestone to release.
/// * `total_amount` - Total escrow balance used to compute the payout.
/// * `recipient` - Address to receive the payout.
///
/// # Panics
/// Panics if the milestone has already been released or is not in the schedule.
pub fn release_milestone(
    env: &Env,
    escrow_id: u64,
    milestone_id: u32,
    total_amount: i128,
    recipient: Address,
) {
    // Check not already released
    let released_key = (RELEASED_KEY, escrow_id, milestone_id);
    let already_released: bool = env
        .storage()
        .persistent()
        .get(&released_key)
        .unwrap_or(false);
    if already_released {
        panic!("milestone has already been released");
    }

    let payout = get_release_amount(env, escrow_id, milestone_id, total_amount);

    // In production: token_client.transfer(&env.current_contract_address(), &recipient, &payout);

    // Mark milestone as released
    env.storage().persistent().set(&released_key, &true);

    // Accumulate released amounts for residual calculation
    let residual_key = (RESIDUAL_KEY, escrow_id);
    let released_so_far: i128 = env
        .storage()
        .persistent()
        .get(&residual_key)
        .unwrap_or(0i128);
    let new_total = released_so_far
        .checked_add(payout)
        .expect("released total overflow");
    env.storage().persistent().set(&residual_key, &new_total);

    env.events().publish(
        (symbol_short!("alloc"), symbol_short!("released")),
        (escrow_id, milestone_id, payout, recipient),
    );
}

/// Returns the unclaimed residual after all released milestones.
///
/// Computes `total_amount - sum(released milestone payouts)`. A non-zero
/// residual can arise from integer division rounding across milestones.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow to check.
/// * `total_amount` - Total original escrow balance.
///
/// # Returns
/// Remaining unclaimed balance after all released payouts.
pub fn get_residual(env: &Env, escrow_id: u64, total_amount: i128) -> i128 {
    let residual_key = (RESIDUAL_KEY, escrow_id);
    let released: i128 = env
        .storage()
        .persistent()
        .get(&residual_key)
        .unwrap_or(0i128);
    total_amount
        .checked_sub(released)
        .expect("residual underflow")
        .max(0)
}

/// Transfers any residual balance to a recipient after all milestones are released.
///
/// Validates that all milestones have been released before allowing residual claim,
/// then computes and transfers the remaining balance. Marks the residual as fully
/// claimed by setting a zero record.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow whose residual to claim.
/// * `recipient` - Address to receive the residual funds.
/// * `total_amount` - Total original escrow balance used to compute the residual.
///
/// # Panics
/// Panics if not all milestones have been released yet.
pub fn claim_residual(env: &Env, escrow_id: u64, recipient: Address, total_amount: i128) {
    // Verify all milestones are released
    let alloc_key = (ALLOC_KEY, escrow_id);
    let allocations: Vec<MilestoneAllocation> = env
        .storage()
        .persistent()
        .get(&alloc_key)
        .expect("no allocation schedule found for escrow");

    for i in 0..allocations.len() {
        let alloc = allocations.get(i).unwrap();
        let released_key = (RELEASED_KEY, escrow_id, alloc.milestone_id);
        let released: bool = env
            .storage()
            .persistent()
            .get(&released_key)
            .unwrap_or(false);
        if !released {
            panic!("not all milestones have been released; cannot claim residual");
        }
    }

    let residual = get_residual(env, escrow_id, total_amount);
    if residual == 0 {
        // Nothing to claim — emit event and return
        env.events().publish(
            (symbol_short!("alloc"), symbol_short!("res_zero")),
            escrow_id,
        );
        return;
    }

    // In production: token_client.transfer(&env.current_contract_address(), &recipient, &residual);

    // Mark residual as claimed by zeroing the released accumulator
    let residual_key = (RESIDUAL_KEY, escrow_id);
    env.storage().persistent().set(&residual_key, &total_amount);

    env.events().publish(
        (symbol_short!("alloc"), symbol_short!("res_claim")),
        (escrow_id, residual, recipient),
    );
}

/// Returns the full allocation schedule for an escrow.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow to query.
///
/// # Returns
/// Vec of `MilestoneAllocation` entries; empty if no schedule has been set.
pub fn get_allocations(env: &Env, escrow_id: u64) -> Vec<MilestoneAllocation> {
    let alloc_key = (ALLOC_KEY, escrow_id);
    env.storage()
        .persistent()
        .get(&alloc_key)
        .unwrap_or(Vec::new(env))
}

/// Checks whether a specific milestone has been released.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow to check.
/// * `milestone_id` - The milestone to check.
///
/// # Returns
/// `true` if `release_milestone` has been called for this milestone.
pub fn is_milestone_released(env: &Env, escrow_id: u64, milestone_id: u32) -> bool {
    let released_key = (RELEASED_KEY, escrow_id, milestone_id);
    env.storage()
        .persistent()
        .get(&released_key)
        .unwrap_or(false)
}
