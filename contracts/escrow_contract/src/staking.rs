//! Freelancer Performance Staking
//!
//! Enables freelancers to deposit a configurable stake that can be slashed
//! if disputes are resolved against them.

use soroban_sdk::{token, Address, Env};

use crate::{ContractStorage, EscrowError};

/// Deposit the required freelancer stake and activate the escrow.
///
/// The freelancer must transfer the required stake amount before calling this.
/// Upon success, the escrow transitions from Pending to Active.
pub fn deposit_stake_and_activate(
    env: &Env,
    escrow_id: u64,
    freelancer: &Address,
) -> Result<(), EscrowError> {
    freelancer.require_auth();
    let mut meta = ContractStorage::load_escrow_meta_with_rent(env, escrow_id)?;

    // Validate the freelancer
    if *freelancer != meta.freelancer {
        return Err(EscrowError::E3);
    }

    // Check if stake is already deposited
    let stake_key = crate::DataKey::FreelancerStake(escrow_id);
    let already_deposited: bool = env
        .storage()
        .persistent()
        .get(&stake_key)
        .unwrap_or(false);

    if already_deposited {
        return Err(EscrowError::E19); // Reuse existing error for "stake already deposited"
    }

    // Load the required stake amount
    let stake_amount = meta.required_freelancer_stake;

    // Transfer stake from freelancer to contract
    token::Client::new(env, &meta.token).transfer(
        freelancer,
        &env.current_contract_address(),
        &stake_amount,
    );

    // Mark stake as deposited
    env.storage().persistent().set(&stake_key, &true);

    // Transition to Active status
    meta.stake_deposited = true;
    ContractStorage::save_escrow_meta(env, &meta);

    Ok(())
}

/// Return the full stake to the freelancer on escrow completion.
pub fn return_stake_on_completion(
    env: &Env,
    meta: &crate::EscrowMeta,
) -> Result<(), EscrowError> {
    if meta.required_freelancer_stake == 0 {
        return Ok(());
    }

    // Transfer stake back to freelancer
    token::Client::new(env, &meta.token).transfer(
        &env.current_contract_address(),
        &meta.freelancer,
        &meta.required_freelancer_stake,
    );

    Ok(())
}

/// Slash a portion of the stake and transfer it to the client.
/// Used when a dispute is resolved in favor of the client.
///
/// The slash amount is typically a percentage of the required stake.
pub fn slash_stake_to_client(
    env: &Env,
    meta: &crate::EscrowMeta,
    slash_percentage: u32, // 0-100
) -> Result<(), EscrowError> {
    if meta.required_freelancer_stake == 0 || !meta.stake_deposited {
        return Ok(());
    }

    if slash_percentage == 0 {
        return Ok(());
    }

    if slash_percentage > 100 {
        return Err(EscrowError::E19);
    }

    let slash_amount = (meta.required_freelancer_stake as u128 * slash_percentage as u128 / 100) as i128;

    if slash_amount > 0 {
        token::Client::new(env, &meta.token).transfer(
            &env.current_contract_address(),
            &meta.client,
            &slash_amount,
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests are integrated with the main test suite in lib.rs
}
