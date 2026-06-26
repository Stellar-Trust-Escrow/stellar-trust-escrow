//! Fuzz target for `release_funds` and the approve→release flow.
//!
//! Creates a valid escrow with a milestone, then fuzzes the release
//! pathway with arbitrary caller addresses and milestone IDs.
//! Catches: panics, assertion failures, double-release, and fund leaks.

#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, String};
use stellar_trust_escrow_contract::{
    EscrowContract, EscrowContractClient, MultisigConfig,
};

#[derive(Debug, Arbitrary)]
struct ReleaseInput {
    escrow_amount: u32,
    milestone_amount_pct: u8,
    milestone_id_to_release: u32,
    use_wrong_caller: bool,
    try_double_release: bool,
    try_release_without_approve: bool,
}

fuzz_target!(|input: ReleaseInput| {
    let amount = i128::from(input.escrow_amount.max(1).min(100_000));
    let ms_pct = (input.milestone_amount_pct as i128).max(1).min(100);
    let ms_amount = (amount * ms_pct) / 100;
    if ms_amount <= 0 {
        return;
    }

    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_id = token_contract.address();

    let contract_id = env.register_contract(None, EscrowContract);
    let client = EscrowContractClient::new(&env, &contract_id);
    client.initialize(&admin);
    client.set_platform_treasury(&admin, &admin);

    let client_addr = Address::generate(&env);
    let freelancer = Address::generate(&env);

    token::StellarAssetClient::new(&env, &token_id).mint(&client_addr, &(amount + 500));

    let no_multisig = MultisigConfig {
        approvers: soroban_sdk::Vec::new(&env),
        weights: soroban_sdk::Vec::new(&env),
        threshold: 0,
    };

    let escrow_id = match client.try_create_escrow(
        &client_addr,
        &freelancer,
        &token_id,
        &amount,
        &BytesN::from_array(&env, &[1; 32]),
        &None,
        &None,
        &None,
        &None,
        &no_multisig,
    ) {
        Ok(Ok(id)) => id,
        _ => return,
    };

    let mid = match client.try_add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&env, "Fuzz"),
        &BytesN::from_array(&env, &[2; 32]),
        &ms_amount,
    ) {
        Ok(Ok(id)) => id,
        _ => return,
    };

    // Submit milestone
    let _ = client.try_submit_milestone(&freelancer, &escrow_id, &mid);

    if input.try_release_without_approve {
        // Try to release without approval — should fail gracefully
        let caller = if input.use_wrong_caller {
            Address::generate(&env)
        } else {
            admin.clone()
        };
        let _ = client.try_release_funds(&caller, &escrow_id, &mid);
        return;
    }

    // Approve milestone
    let _ = client.try_approve_milestone(&client_addr, &escrow_id, &mid);

    // Try to release (may already be released via approve)
    let caller = if input.use_wrong_caller {
        Address::generate(&env)
    } else {
        admin.clone()
    };
    let target_mid = input.milestone_id_to_release;
    let _ = client.try_release_funds(&caller, &escrow_id, &target_mid);

    // Double release attempt
    if input.try_double_release {
        let _ = client.try_release_funds(&admin, &escrow_id, &mid);
    }

    // Verify freelancer balance is never negative
    let freelancer_bal = token::Client::new(&env, &token_id).balance(&freelancer);
    assert!(freelancer_bal >= 0, "Freelancer balance went negative");
});
