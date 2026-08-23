#![cfg(test)]

use super::*;
use soroban_sdk::{symbol_short, testutils::Address as _, Address, Env};

fn setup() -> (
    Env,
    Address,
    Address,
    ReferralRegistryContractClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ReferralRegistryContract);
    let escrow_contract_addr = Address::generate(&env);
    let client = ReferralRegistryContractClient::new(&env, &contract_id);
    client.init(&escrow_contract_addr);
    (env, contract_id, escrow_contract_addr, client)
}

#[test]
fn register_code_and_get_code() {
    let (env, _id, _escrow, client) = setup();
    let referrer = Address::generate(&env);
    let code = symbol_short!("ALICE1");

    client.register_code(&referrer, &code);
    assert_eq!(client.get_code(&referrer), Some(code));
}

#[test]
#[should_panic]
fn duplicate_code_is_rejected() {
    let (env, _id, _escrow, client) = setup();
    let referrer_a = Address::generate(&env);
    let referrer_b = Address::generate(&env);
    let code = symbol_short!("SAME");

    client.register_code(&referrer_a, &code);
    // referrer_b tries to register a code someone else already owns -> CodeTaken
    client.register_code(&referrer_b, &code);
}

#[test]
#[should_panic]
fn second_code_for_same_referrer_is_rejected() {
    let (env, _id, _escrow, client) = setup();
    let referrer = Address::generate(&env);

    client.register_code(&referrer, &symbol_short!("FIRST"));
    // Max 1 code per address -> AlreadyRegistered
    client.register_code(&referrer, &symbol_short!("SECOND"));
}

#[test]
fn bind_referral_by_authorised_escrow_contract() {
    let (env, _id, _escrow, client) = setup();
    let referrer = Address::generate(&env);
    let code = symbol_short!("BOBCODE");
    client.register_code(&referrer, &code);

    client.bind_referral(&42u64, &code);

    assert_eq!(client.get_referrer(&42u64), Some(referrer));
}

#[test]
#[should_panic]
fn bind_referral_fails_for_unknown_code() {
    let (_env, _id, _escrow, client) = setup();
    // No code was ever registered -> UnknownCode
    client.bind_referral(&99u64, &symbol_short!("GHOST"));
}

#[test]
#[should_panic]
fn bind_referral_fails_when_escrow_already_has_one() {
    let (env, _id, _escrow, client) = setup();
    let referrer_a = Address::generate(&env);
    let referrer_b = Address::generate(&env);
    let code_a = symbol_short!("CODEA");
    let code_b = symbol_short!("CODEB");

    client.register_code(&referrer_a, &code_a);
    client.register_code(&referrer_b, &code_b);

    client.bind_referral(&7u64, &code_a);
    // escrow 7 already has a referral bound -> AlreadyBound
    client.bind_referral(&7u64, &code_b);
}

#[test]
fn get_referrer_returns_none_when_unbound() {
    let (_env, _id, _escrow, client) = setup();
    assert_eq!(client.get_referrer(&123u64), None);
}

#[test]
fn get_code_returns_none_for_unregistered_address() {
    let (env, _id, _escrow, client) = setup();
    let someone = Address::generate(&env);
    assert_eq!(client.get_code(&someone), None);
}

#[test]
#[should_panic]
fn double_init_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, ReferralRegistryContract);
    let escrow_contract_addr = Address::generate(&env);
    let client = ReferralRegistryContractClient::new(&env, &contract_id);
    client.init(&escrow_contract_addr);
    client.init(&escrow_contract_addr);
}
