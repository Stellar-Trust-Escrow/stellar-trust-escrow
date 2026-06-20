//! # Integration Tests — Full Escrow Lifecycle
//!
//! These tests simulate complete user workflows on a mock Stellar ledger
//! using the soroban-sdk test environment. They cover:
//!
//! - Contract initialization
//! - Client depositing funds via create_escrow
//! - Adding milestones
//! - Freelancer submitting work
//! - Client approving milestones and verifying fund release
//! - Raising a dispute and arbiter resolution
//! - Edge cases: unauthorized access, insufficient funds, double-dispute
//!
//! Run with:
//!   cargo test -p stellar-trust-escrow-contract --test integration

use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, String};
use stellar_trust_escrow_contract::{
    EscrowContract, EscrowContractClient, EscrowStatus, MultisigConfig, MS_REJECTED, MS_SUBMITTED,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

struct TestEnv {
    env: Env,
    contract_id: Address,
    client: EscrowContractClient<'static>,
    admin: Address,
    token_id: Address,
}

fn setup() -> TestEnv {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_id = token_contract.address();

    let contract_id = env.register_contract(None, EscrowContract);
    let client = EscrowContractClient::new(&env, &contract_id);
    client.initialize(&admin);
    client.set_platform_treasury(&admin, &admin);

    TestEnv {
        env,
        contract_id,
        client,
        admin,
        token_id,
    }
}

fn mint(env: &Env, _admin: &Address, token_id: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token_id).mint(to, &amount);
}

fn mint_for_escrow(
    env: &Env,
    admin: &Address,
    token_id: &Address,
    to: &Address,
    amount: i128,
    expected_milestones: i128,
) {
    const RENT_RESERVE_PER_ENTRY: i128 = 30;
    mint(
        env,
        admin,
        token_id,
        to,
        amount + RENT_RESERVE_PER_ENTRY * (1 + expected_milestones),
    );
}

fn hash(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

fn balance(env: &Env, token_id: &Address, addr: &Address) -> i128 {
    token::Client::new(env, token_id).balance(addr)
}

fn no_multisig(env: &Env) -> MultisigConfig {
    MultisigConfig {
        approvers: soroban_sdk::Vec::new(env),
        weights: soroban_sdk::Vec::new(env),
        threshold: 0,
    }
}

// ── Test 1: Full happy-path lifecycle ─────────────────────────────────────────

#[test]
fn test_full_escrow_lifecycle() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);

    // Fund client
    mint_for_escrow(&t.env, &t.admin, &t.token_id, &client_addr, 1_000, 2);

    // Create escrow
    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &1_000,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );
    assert_eq!(balance(&t.env, &t.token_id, &client_addr), 60);
    assert_eq!(balance(&t.env, &t.token_id, &t.contract_id), 1_030);

    // Add two milestones
    let m0 = t.client.add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Design"),
        &hash(&t.env, 2),
        &400,
    );
    let m1 = t.client.add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Development"),
        &hash(&t.env, 3),
        &600,
    );

    // Freelancer submits milestone 0
    t.client.submit_milestone(&freelancer, &escrow_id, &m0);
    let ms = t.client.get_milestone(&escrow_id, &m0);
    assert_eq!(ms.status, MS_SUBMITTED);

    // Client approves milestone 0 — funds released
    t.client.approve_milestone(&client_addr, &escrow_id, &m0);
    assert_eq!(balance(&t.env, &t.token_id, &freelancer), 400);
    assert_eq!(balance(&t.env, &t.token_id, &t.contract_id), 690);

    // Freelancer submits and client approves milestone 1
    t.client.submit_milestone(&freelancer, &escrow_id, &m1);
    t.client.approve_milestone(&client_addr, &escrow_id, &m1);
    assert_eq!(balance(&t.env, &t.token_id, &freelancer), 1_000);
    assert_eq!(balance(&t.env, &t.token_id, &t.contract_id), 90);

    // Escrow should be Completed
    let state = t.client.get_escrow(&escrow_id);
    assert_eq!(state.status, EscrowStatus::Completed);
}

// ── Test 2: Dispute and arbiter resolution ────────────────────────────────────

#[test]
fn test_dispute_and_arbiter_resolution() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let arbiter = Address::generate(&t.env);

    mint_for_escrow(&t.env, &t.admin, &t.token_id, &client_addr, 500, 1);

    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &500,
        &hash(&t.env, 10),
        &Some(arbiter.clone()),
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    let m0 = t.client.add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Milestone"),
        &hash(&t.env, 11),
        &500,
    );

    // Freelancer submits, client raises dispute
    t.client.submit_milestone(&freelancer, &escrow_id, &m0);
    t.client.raise_dispute(&client_addr, &escrow_id, &Some(m0));

    let state = t.client.get_escrow(&escrow_id);
    assert_eq!(state.status, EscrowStatus::Disputed);

    // Arbiter resolves: 200 to client, 300 to freelancer
    t.client.resolve_dispute(&arbiter, &escrow_id, &200, &300);

    assert_eq!(balance(&t.env, &t.token_id, &client_addr), 200);
    assert_eq!(balance(&t.env, &t.token_id, &freelancer), 300);
    assert_eq!(balance(&t.env, &t.token_id, &t.contract_id), 60);
}

// ── Test 3: Unauthorized access ───────────────────────────────────────────────

#[test]
fn test_unauthorized_approve_rejected() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let attacker = Address::generate(&t.env);

    mint_for_escrow(&t.env, &t.admin, &t.token_id, &client_addr, 200, 1);

    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &200,
        &hash(&t.env, 20),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );
    let m0 = t.client.add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Work"),
        &hash(&t.env, 21),
        &200,
    );
    t.client.submit_milestone(&freelancer, &escrow_id, &m0);

    // Attacker tries to approve — must fail
    let result = t.client.try_approve_milestone(&attacker, &escrow_id, &m0);
    assert!(result.is_err(), "Attacker should not be able to approve");

    // Funds and prepaid rent must still be in contract
    assert_eq!(balance(&t.env, &t.token_id, &t.contract_id), 260);
}

// ── Test 4: Insufficient funds (amount > deposited) ───────────────────────────

#[test]
fn test_milestone_amount_exceeds_escrow_rejected() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);

    mint_for_escrow(&t.env, &t.admin, &t.token_id, &client_addr, 100, 1);

    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &100,
        &hash(&t.env, 30),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    // Add milestone for 100
    t.client.add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Full"),
        &hash(&t.env, 31),
        &100,
    );

    // Try to add another milestone that would exceed total — must fail
    let result = t.client.try_add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Over"),
        &hash(&t.env, 32),
        &1,
    );
    assert!(result.is_err(), "Over-allocation should be rejected");
}

// ── Test 5: Double dispute rejected ───────────────────────────────────────────

#[test]
fn test_double_dispute_rejected() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);

    mint_for_escrow(&t.env, &t.admin, &t.token_id, &client_addr, 300, 0);

    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &300,
        &hash(&t.env, 40),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    t.client.raise_dispute(&client_addr, &escrow_id, &None);

    // Second dispute must fail
    let result = t.client.try_raise_dispute(&freelancer, &escrow_id, &None);
    assert!(result.is_err(), "Double dispute should be rejected");
}

// ── Test 6: Cancel escrow returns funds ───────────────────────────────────────

#[test]
fn test_cancel_escrow_refunds_client() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);

    mint_for_escrow(&t.env, &t.admin, &t.token_id, &client_addr, 500, 0);

    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &500,
        &hash(&t.env, 50),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    t.client.cancel_escrow(&client_addr, &escrow_id);

    assert_eq!(balance(&t.env, &t.token_id, &client_addr), 490);
    let state = t.client.get_escrow(&escrow_id);
    assert_eq!(state.status, EscrowStatus::Cancelled);
}

// ── Test 7: Reputation default record ────────────────────────────────────────

#[test]
fn test_reputation_default_for_new_address() {
    let t = setup();
    let user = Address::generate(&t.env);
    let rep = t.client.get_reputation(&user);
    assert_eq!(rep.total_score, 0);
    assert_eq!(rep.completed_escrows, 0);
    assert_eq!(rep.disputed_escrows, 0);
}

// ── Test 8: Reject milestone then resubmit ────────────────────────────────────

#[test]
fn test_reject_and_resubmit_milestone() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);

    mint_for_escrow(&t.env, &t.admin, &t.token_id, &client_addr, 200, 1);

    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &200,
        &hash(&t.env, 60),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );
    let m0 = t.client.add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Draft"),
        &hash(&t.env, 61),
        &200,
    );

    t.client.submit_milestone(&freelancer, &escrow_id, &m0);
    t.client.reject_milestone(&client_addr, &escrow_id, &m0);

    let ms = t.client.get_milestone(&escrow_id, &m0);
    assert_eq!(ms.status, MS_REJECTED);

    // Freelancer resubmits
    t.client.submit_milestone(&freelancer, &escrow_id, &m0);
    let ms2 = t.client.get_milestone(&escrow_id, &m0);
    assert_eq!(ms2.status, MS_SUBMITTED);
}
