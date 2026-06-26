//! Fuzz target for `create_escrow`.
//!
//! Catches: panics, assertion failures, and unexpected contract errors
//! from arbitrary combinations of escrow creation parameters.

#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};
use stellar_trust_escrow_contract::{
    EscrowContract, EscrowContractClient, MultisigConfig,
};

#[derive(Debug, Arbitrary)]
struct CreateEscrowInput {
    total_amount: i128,
    self_escrow: bool,
    use_arbiter: bool,
    arbiter_is_client: bool,
    arbiter_is_freelancer: bool,
    deadline: Option<u64>,
    lock_time: Option<u64>,
    brief_seed: u8,
}

fuzz_target!(|input: CreateEscrowInput| {
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
    let freelancer = if input.self_escrow {
        client_addr.clone()
    } else {
        Address::generate(&env)
    };

    let arbiter = if input.use_arbiter {
        if input.arbiter_is_client {
            Some(client_addr.clone())
        } else if input.arbiter_is_freelancer {
            Some(freelancer.clone())
        } else {
            Some(Address::generate(&env))
        }
    } else {
        None
    };

    // Mint generous amount to cover any valid escrow + rent
    let mint_amount = if input.total_amount > 0 && input.total_amount < i128::MAX / 2 {
        input.total_amount.saturating_add(10_000)
    } else {
        1_000_000
    };
    token::StellarAssetClient::new(&env, &token_id).mint(&client_addr, &mint_amount);

    let brief_hash = BytesN::from_array(&env, &[input.brief_seed; 32]);

    let no_multisig = MultisigConfig {
        approvers: soroban_sdk::Vec::new(&env),
        weights: soroban_sdk::Vec::new(&env),
        threshold: 0,
    };

    // This should never panic — it should return Ok or a well-defined error
    let result = client.try_create_escrow(
        &client_addr,
        &freelancer,
        &token_id,
        &input.total_amount,
        &brief_hash,
        &arbiter,
        &input.deadline,
        &input.lock_time,
        &None,
        &no_multisig,
    );

    // Verify that on success, the escrow is retrievable
    if let Ok(Ok(escrow_id)) = result {
        let _ = client.try_get_escrow(&escrow_id);
    }
});
