#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, EscrowOwnershipContract);
    let escrow_contract_addr = Address::generate(&env);
    let client = EscrowOwnershipContractClient::new(&env, &contract_id);
    client.init(&escrow_contract_addr);
    (env, contract_id, escrow_contract_addr)
}

#[test]
fn register_and_get_owner() {
    let (env, contract_id, _escrow_contract) = setup();
    let client = EscrowOwnershipContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);

    client.register(&1u64, &owner);
    assert_eq!(client.get_owner(&1u64), owner);
}

#[test]
fn offer_and_accept_transfer() {
    let (env, contract_id, _) = setup();
    let client = EscrowOwnershipContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    client.register(&2u64, &owner);
    client.offer_transfer(&owner, &2u64, &new_owner);
    assert_eq!(client.pending_transfer(&2u64), Some(new_owner.clone()));

    client.accept_transfer(&new_owner, &2u64);
    assert_eq!(client.get_owner(&2u64), new_owner);
    assert_eq!(client.pending_transfer(&2u64), None);
}

#[test]
fn cancel_transfer() {
    let (env, contract_id, _) = setup();
    let client = EscrowOwnershipContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    client.register(&3u64, &owner);
    client.offer_transfer(&owner, &3u64, &new_owner);
    client.cancel_transfer(&owner, &3u64);
    assert_eq!(client.pending_transfer(&3u64), None);
    assert_eq!(client.get_owner(&3u64), owner);
}

#[test]
#[should_panic]
fn wrong_recipient_cannot_accept() {
    let (env, contract_id, _) = setup();
    let client = EscrowOwnershipContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let intended = Address::generate(&env);
    let interloper = Address::generate(&env);

    client.register(&4u64, &owner);
    client.offer_transfer(&owner, &4u64, &intended);
    client.accept_transfer(&interloper, &4u64);
}

#[test]
#[should_panic]
fn non_owner_cannot_offer() {
    let (env, contract_id, _) = setup();
    let client = EscrowOwnershipContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);

    client.register(&5u64, &owner);
    client.offer_transfer(&attacker, &5u64, &attacker);
}

#[test]
#[should_panic]
fn double_register_fails() {
    let (env, contract_id, _) = setup();
    let client = EscrowOwnershipContractClient::new(&env, &contract_id);
    let owner = Address::generate(&env);

    client.register(&6u64, &owner);
    client.register(&6u64, &owner);
}
