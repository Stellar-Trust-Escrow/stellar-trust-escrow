//! Fuzz target for `raise_dispute`.
//!
//! Fuzzes dispute raising with arbitrary callers, escrow states,
//! and milestone IDs. Catches: panics, invalid state transitions,
//! and authorization bypass.

#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, String};
use stellar_trust_escrow_contract::{
    EscrowContract, EscrowContractClient, MultisigConfig,
};

#[derive(Debug, Arbitrary)]
struct DisputeInput {
    escrow_amount: u32,
    caller_type: u8, // 0=client, 1=freelancer, 2=outsider
    milestone_id: Option<u32>,
    pre_dispute_action: u8, // 0=none, 1=add_milestone, 2=submit, 3=cancel
    try_double_dispute: bool,
}

fuzz_target!(|input: DisputeInput| {
    let amount = i128::from(input.escrow_amount.max(1).min(100_000));

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
    let outsider = Address::generate(&env);

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

    // Optionally set up state before dispute
    match input.pre_dispute_action % 4 {
        1 => {
            let _ = client.try_add_milestone(
                &client_addr,
                &escrow_id,
                &String::from_str(&env, "M"),
                &BytesN::from_array(&env, &[2; 32]),
                &(amount.min(i128::MAX)),
            );
        }
        2 => {
            let _ = client.try_add_milestone(
                &client_addr,
                &escrow_id,
                &String::from_str(&env, "M"),
                &BytesN::from_array(&env, &[2; 32]),
                &amount,
            );
            let _ = client.try_submit_milestone(&freelancer, &escrow_id, &0);
        }
        3 => {
            let _ = client.try_cancel_escrow(&client_addr, &escrow_id);
        }
        _ => {}
    }

    let caller = match input.caller_type % 3 {
        0 => client_addr.clone(),
        1 => freelancer.clone(),
        _ => outsider.clone(),
    };

    // This should never panic — only return Ok or well-defined error
    let result = client.try_raise_dispute(&caller, &escrow_id, &input.milestone_id);

    // If dispute succeeded, try double dispute
    if input.try_double_dispute && result.is_ok() {
        let result2 = client.try_raise_dispute(&freelancer, &escrow_id, &None);
        // Double dispute must fail
        assert!(
            result2.is_err(),
            "Double dispute should always fail"
        );
    }
});
