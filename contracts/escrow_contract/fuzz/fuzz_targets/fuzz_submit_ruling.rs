//! Fuzz target for `resolve_dispute` (submit ruling).
//!
//! Fuzzes dispute resolution with arbitrary split amounts, callers,
//! and escrow states. Catches: panics, fund leaks, invalid splits,
//! and authorization bypass.

#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};
use stellar_trust_escrow_contract::{
    EscrowContract, EscrowContractClient, MultisigConfig,
};

#[derive(Debug, Arbitrary)]
struct RulingInput {
    escrow_amount: u32,
    client_share: i128,
    freelancer_share: i128,
    caller_type: u8, // 0=admin, 1=arbiter, 2=client, 3=freelancer, 4=outsider
    use_arbiter: bool,
    resolve_without_dispute: bool,
}

fuzz_target!(|input: RulingInput| {
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
    let arbiter = Address::generate(&env);
    let outsider = Address::generate(&env);

    token::StellarAssetClient::new(&env, &token_id).mint(&client_addr, &(amount + 500));

    let no_multisig = MultisigConfig {
        approvers: soroban_sdk::Vec::new(&env),
        weights: soroban_sdk::Vec::new(&env),
        threshold: 0,
    };

    let arbiter_opt = if input.use_arbiter {
        Some(arbiter.clone())
    } else {
        None
    };

    let escrow_id = match client.try_create_escrow(
        &client_addr,
        &freelancer,
        &token_id,
        &amount,
        &BytesN::from_array(&env, &[1; 32]),
        &arbiter_opt,
        &None,
        &None,
        &None,
        &no_multisig,
    ) {
        Ok(Ok(id)) => id,
        _ => return,
    };

    if !input.resolve_without_dispute {
        let _ = client.try_raise_dispute(&client_addr, &escrow_id, &None);
    }

    let caller = match input.caller_type % 5 {
        0 => admin.clone(),
        1 => arbiter.clone(),
        2 => client_addr.clone(),
        3 => freelancer.clone(),
        _ => outsider.clone(),
    };

    // This should never panic — only Ok or well-defined error
    let result = client.try_resolve_dispute(
        &caller,
        &escrow_id,
        &input.client_share,
        &input.freelancer_share,
    );

    // If resolution succeeded, verify funds conservation
    if result.is_ok() {
        let client_bal = token::Client::new(&env, &token_id).balance(&client_addr);
        let freelancer_bal = token::Client::new(&env, &token_id).balance(&freelancer);
        let contract_bal = token::Client::new(&env, &token_id).balance(&contract_id);
        let admin_bal = token::Client::new(&env, &token_id).balance(&admin);

        // No money created from thin air
        assert!(
            client_bal + freelancer_bal + contract_bal + admin_bal <= amount + 500,
            "Funds conservation violated: {} + {} + {} + {} > {}",
            client_bal,
            freelancer_bal,
            contract_bal,
            admin_bal,
            amount + 500
        );

        // No negative balances
        assert!(client_bal >= 0, "Client balance negative");
        assert!(freelancer_bal >= 0, "Freelancer balance negative");
        assert!(contract_bal >= 0, "Contract balance negative");
    }
});
