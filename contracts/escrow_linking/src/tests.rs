#![cfg(test)]

use super::*;
use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, Env, Vec};

#[contract]
pub struct MockCoreContract;

#[contractimpl]
impl MockCoreContract {
    pub fn force_complete_escrow(_env: Env, _escrow_id: u64) {
        // Do nothing, just simulate success
    }
}

#[test]
fn test_register_parent_escrow() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, EscrowLinkingContract);
    let client = EscrowLinkingContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let core_contract = env.register_contract(None, MockCoreContract);

    client.init(&core_contract);

    let mut children = Vec::new(&env);
    children.push_back(1);
    children.push_back(2);

    client.register_parent_escrow(&admin, &100, &children);

    let status = client.get_parent_status(&100);
    assert_eq!(status.total, 2);
    assert_eq!(status.completed, 0);
    assert!(!status.all_done);
}

#[test]
fn test_too_many_children() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, EscrowLinkingContract);
    let client = EscrowLinkingContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let core_contract = env.register_contract(None, MockCoreContract);

    client.init(&core_contract);

    let mut children = Vec::new(&env);
    for i in 0..21 {
        children.push_back(i);
    }

    let result = client.try_register_parent_escrow(&admin, &100, &children);
    assert_eq!(result.unwrap_err().unwrap(), LinkError::TooManyChildren);
}

#[test]
fn test_already_linked() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, EscrowLinkingContract);
    let client = EscrowLinkingContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let core_contract = env.register_contract(None, MockCoreContract);

    client.init(&core_contract);

    let mut children = Vec::new(&env);
    children.push_back(1);

    client.register_parent_escrow(&admin, &100, &children);

    let result = client.try_register_parent_escrow(&admin, &101, &children);
    assert_eq!(result.unwrap_err().unwrap(), LinkError::AlreadyLinked);
}

#[test]
#[should_panic]
fn test_notify_child_completed_unauthorized() {
    let env = Env::default();
    let contract_id = env.register_contract(None, EscrowLinkingContract);
    let client = EscrowLinkingContractClient::new(&env, &contract_id);
    let core_contract = env.register_contract(None, MockCoreContract);

    client.init(&core_contract);

    // This should panic because auth is not mocked
    client.notify_child_completed(&1);
}

#[test]
fn test_notify_child_completed_idempotent() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, EscrowLinkingContract);
    let client = EscrowLinkingContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let core_contract = env.register_contract(None, MockCoreContract);

    client.init(&core_contract);

    let mut children = Vec::new(&env);
    children.push_back(1);
    children.push_back(2);

    client.register_parent_escrow(&admin, &100, &children);

    client.notify_child_completed(&1);
    let status1 = client.get_parent_status(&100);
    assert_eq!(status1.completed, 1);

    // Duplicate notification
    client.notify_child_completed(&1);
    let status2 = client.get_parent_status(&100);
    assert_eq!(status2.completed, 1);
}

#[test]
fn test_notify_all_children_complete() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, EscrowLinkingContract);
    let client = EscrowLinkingContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let core_contract = env.register_contract(None, MockCoreContract);

    client.init(&core_contract);

    let mut children = Vec::new(&env);
    children.push_back(1);
    children.push_back(2);

    client.register_parent_escrow(&admin, &100, &children);

    client.notify_child_completed(&1);
    let status1 = client.get_parent_status(&100);
    assert!(!status1.all_done);

    client.notify_child_completed(&2);
    let status2 = client.get_parent_status(&100);
    assert_eq!(status2.completed, 2);
    assert!(status2.all_done);
}
