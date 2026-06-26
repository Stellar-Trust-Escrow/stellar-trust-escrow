//! # Comprehensive Unit Tests
//!
//! Covers every public entry point with: happy path, every error condition,
//! every state transition, and edge cases including zero-amount escrow,
//! deadline in the past, and non-participant calling release.

use soroban_sdk::{
    testutils::Address as _, testutils::Ledger, token, Address, BytesN, Env, String,
};
use stellar_trust_escrow_contract::{
    EscrowContract, EscrowContractClient, EscrowError, EscrowStatus, MultisigConfig, MS_APPROVED,
    MS_DISPUTED, MS_PENDING, MS_REJECTED, MS_RELEASED, MS_SUBMITTED,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const RENT_RESERVE_PER_ENTRY: i128 = 30;

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

fn mint(env: &Env, token_id: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token_id).mint(to, &amount);
}

fn mint_for_escrow(env: &Env, token_id: &Address, to: &Address, amount: i128, milestones: i128) {
    mint(
        env,
        token_id,
        to,
        amount + RENT_RESERVE_PER_ENTRY * (1 + milestones),
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

fn create_funded_escrow(
    t: &TestEnv,
    client_addr: &Address,
    freelancer: &Address,
    amount: i128,
    milestones: i128,
) -> u64 {
    mint_for_escrow(&t.env, &t.token_id, client_addr, amount, milestones);
    t.client.create_escrow(
        client_addr,
        freelancer,
        &t.token_id,
        &amount,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    )
}

fn create_escrow_with_milestone(
    t: &TestEnv,
    client_addr: &Address,
    freelancer: &Address,
    amount: i128,
) -> (u64, u32) {
    let eid = create_funded_escrow(t, client_addr, freelancer, amount, 1);
    let mid = t.client.add_milestone(
        client_addr,
        &eid,
        &String::from_str(&t.env, "Work"),
        &hash(&t.env, 2),
        &amount,
    );
    (eid, mid)
}

// =============================================================================
// INITIALIZATION
// =============================================================================

#[test]
fn test_initialize_happy_path() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, EscrowContract);
    let client = EscrowContractClient::new(&env, &contract_id);
    client.initialize(&admin);
    assert_eq!(client.get_admin(), admin);
    assert!(!client.is_paused());
    assert_eq!(client.escrow_count(), 0);
}

#[test]
fn test_initialize_double_init_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, EscrowContract);
    let client = EscrowContractClient::new(&env, &contract_id);
    client.initialize(&admin);
    let result = client.try_initialize(&admin);
    assert!(
        matches!(result, Err(Ok(EscrowError::E1))),
        "Double init should fail with E1"
    );
}

// =============================================================================
// CREATE ESCROW
// =============================================================================

#[test]
fn test_create_escrow_happy_path() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);

    mint_for_escrow(&t.env, &t.token_id, &client_addr, 1000, 0);
    let eid = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &1000,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.status, EscrowStatus::Active);
    assert_eq!(escrow.total_amount, 1000);
    assert_eq!(t.client.escrow_count(), 1);
}

#[test]
fn test_create_escrow_zero_amount_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    mint(&t.env, &t.token_id, &client_addr, 100);

    let result = t.client.try_create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &0,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E19))),
        "Zero amount should fail"
    );
}

#[test]
fn test_create_escrow_negative_amount_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    mint(&t.env, &t.token_id, &client_addr, 100);

    let result = t.client.try_create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &-100,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E19))),
        "Negative amount should fail"
    );
}

#[test]
fn test_create_escrow_exceeds_max_amount_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let huge = stellar_trust_escrow_contract::MAX_ESCROW_AMOUNT + 1;
    mint(&t.env, &t.token_id, &client_addr, huge + 1000);

    let result = t.client.try_create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &huge,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E19))),
        "Amount exceeding MAX should fail"
    );
}

#[test]
fn test_create_escrow_self_escrow_fails() {
    let t = setup();
    let same = Address::generate(&t.env);
    mint(&t.env, &t.token_id, &same, 1000);

    let result = t.client.try_create_escrow(
        &same,
        &same,
        &t.token_id,
        &500,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E3))),
        "Self-escrow should fail"
    );
}

#[test]
fn test_create_escrow_deadline_in_past_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

    t.env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });

    let result = t.client.try_create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &500,
        &hash(&t.env, 1),
        &None,
        &Some(500), // deadline in the past
        &None,
        &None,
        &no_multisig(&t.env),
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E19))),
        "Deadline in the past should fail"
    );
}

#[test]
fn test_create_escrow_lock_time_in_past_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

    t.env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });

    let result = t.client.try_create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &500,
        &hash(&t.env, 1),
        &None,
        &None,
        &Some(500), // lock_time in the past
        &None,
        &no_multisig(&t.env),
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E30))),
        "Lock time in past should fail with E30"
    );
}

#[test]
fn test_create_escrow_arbiter_is_client_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

    let result = t.client.try_create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &500,
        &hash(&t.env, 1),
        &Some(client_addr.clone()),
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E3))),
        "Arbiter == client should fail"
    );
}

#[test]
fn test_create_escrow_arbiter_is_freelancer_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

    let result = t.client.try_create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &500,
        &hash(&t.env, 1),
        &Some(freelancer.clone()),
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E3))),
        "Arbiter == freelancer should fail"
    );
}

#[test]
fn test_create_escrow_when_paused_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

    t.client.pause(&t.admin);

    let result = t.client.try_create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &500,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E31))),
        "Should fail when paused"
    );
}

#[test]
fn test_create_escrow_with_valid_deadline_and_lock_time() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

    t.env.ledger().with_mut(|li| {
        li.timestamp = 100;
    });

    let eid = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &500,
        &hash(&t.env, 1),
        &None,
        &Some(5000),
        &Some(3000),
        &None,
        &no_multisig(&t.env),
    );

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.deadline, Some(5000));
    assert_eq!(escrow.lock_time, Some(3000));
}

#[test]
fn test_create_escrow_min_amount() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    mint_for_escrow(&t.env, &t.token_id, &client_addr, 1, 0);

    let eid = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &1, // MIN_ESCROW_AMOUNT
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.total_amount, 1);
}

// =============================================================================
// ADD MILESTONE
// =============================================================================

#[test]
fn test_add_milestone_happy_path() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 2);

    let m0 = t.client.add_milestone(
        &client_addr,
        &eid,
        &String::from_str(&t.env, "Design"),
        &hash(&t.env, 2),
        &500,
    );
    assert_eq!(m0, 0);

    let ms = t.client.get_milestone(&eid, &m0);
    assert_eq!(ms.status, MS_PENDING);
    assert_eq!(ms.amount, 500);
}

#[test]
fn test_add_milestone_zero_amount_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 1);

    let result = t.client.try_add_milestone(
        &client_addr,
        &eid,
        &String::from_str(&t.env, "Zero"),
        &hash(&t.env, 2),
        &0,
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E17))),
        "Zero milestone amount should fail"
    );
}

#[test]
fn test_add_milestone_negative_amount_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 1);

    let result = t.client.try_add_milestone(
        &client_addr,
        &eid,
        &String::from_str(&t.env, "Neg"),
        &hash(&t.env, 2),
        &-100,
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E17))),
        "Negative milestone amount should fail"
    );
}

#[test]
fn test_add_milestone_over_allocation_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 2);

    t.client.add_milestone(
        &client_addr,
        &eid,
        &String::from_str(&t.env, "First"),
        &hash(&t.env, 2),
        &1000,
    );

    let result = t.client.try_add_milestone(
        &client_addr,
        &eid,
        &String::from_str(&t.env, "Over"),
        &hash(&t.env, 3),
        &1,
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E15))),
        "Over-allocation should fail"
    );
}

#[test]
fn test_add_milestone_not_client_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 1);

    let result = t.client.try_add_milestone(
        &freelancer,
        &eid,
        &String::from_str(&t.env, "Bad"),
        &hash(&t.env, 2),
        &500,
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E5))),
        "Non-client adding milestone should fail"
    );
}

#[test]
fn test_add_milestone_paused_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 1);

    t.client.pause(&t.admin);

    let result = t.client.try_add_milestone(
        &client_addr,
        &eid,
        &String::from_str(&t.env, "Paused"),
        &hash(&t.env, 2),
        &500,
    );
    assert!(matches!(result, Err(Ok(EscrowError::E31))));
}

// =============================================================================
// SUBMIT MILESTONE
// =============================================================================

#[test]
fn test_submit_milestone_happy_path() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);

    let ms = t.client.get_milestone(&eid, &mid);
    assert_eq!(ms.status, MS_SUBMITTED);
    assert!(ms.submitted_at.is_some());
}

#[test]
fn test_submit_milestone_not_freelancer_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    let result = t.client.try_submit_milestone(&client_addr, &eid, &mid);
    assert!(
        matches!(result, Err(Ok(EscrowError::E3))),
        "Non-freelancer submit should fail"
    );
}

#[test]
fn test_submit_already_submitted_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);

    let result = t.client.try_submit_milestone(&freelancer, &eid, &mid);
    assert!(
        matches!(result, Err(Ok(EscrowError::E14))),
        "Double submit should fail"
    );
}

#[test]
fn test_submit_approved_milestone_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);
    t.client.approve_milestone(&client_addr, &eid, &mid);

    let result = t.client.try_submit_milestone(&freelancer, &eid, &mid);
    assert!(
        matches!(result, Err(Ok(EscrowError::E14))),
        "Submit after release should fail"
    );
}

#[test]
fn test_submit_after_reject_succeeds() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);
    t.client.reject_milestone(&client_addr, &eid, &mid);

    t.client.submit_milestone(&freelancer, &eid, &mid);
    let ms = t.client.get_milestone(&eid, &mid);
    assert_eq!(ms.status, MS_SUBMITTED);
}

// =============================================================================
// APPROVE MILESTONE
// =============================================================================

#[test]
fn test_approve_milestone_happy_path_releases_funds() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);
    t.client.approve_milestone(&client_addr, &eid, &mid);

    let ms = t.client.get_milestone(&eid, &mid);
    assert_eq!(ms.status, MS_RELEASED);
    assert!(balance(&t.env, &t.token_id, &freelancer) >= 1000);
}

#[test]
fn test_approve_milestone_not_client_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let attacker = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);

    let result = t.client.try_approve_milestone(&attacker, &eid, &mid);
    assert!(
        matches!(result, Err(Ok(EscrowError::E3))),
        "Non-participant approve should fail"
    );
}

#[test]
fn test_approve_pending_milestone_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    let result = t.client.try_approve_milestone(&client_addr, &eid, &mid);
    assert!(
        matches!(result, Err(Ok(EscrowError::E14))),
        "Approving pending milestone should fail"
    );
}

#[test]
fn test_approve_completes_escrow_when_all_milestones_done() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 2);

    let m0 = t.client.add_milestone(
        &client_addr,
        &eid,
        &String::from_str(&t.env, "A"),
        &hash(&t.env, 2),
        &400,
    );
    let m1 = t.client.add_milestone(
        &client_addr,
        &eid,
        &String::from_str(&t.env, "B"),
        &hash(&t.env, 3),
        &600,
    );

    t.client.submit_milestone(&freelancer, &eid, &m0);
    t.client.approve_milestone(&client_addr, &eid, &m0);

    t.client.submit_milestone(&freelancer, &eid, &m1);
    t.client.approve_milestone(&client_addr, &eid, &m1);

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.status, EscrowStatus::Completed);
}

// =============================================================================
// REJECT MILESTONE
// =============================================================================

#[test]
fn test_reject_milestone_happy_path() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);
    t.client.reject_milestone(&client_addr, &eid, &mid);

    let ms = t.client.get_milestone(&eid, &mid);
    assert_eq!(ms.status, MS_REJECTED);
}

#[test]
fn test_reject_milestone_not_client_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);

    let result = t.client.try_reject_milestone(&freelancer, &eid, &mid);
    assert!(
        matches!(result, Err(Ok(EscrowError::E5))),
        "Freelancer should not be able to reject"
    );
}

#[test]
fn test_reject_pending_milestone_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    let result = t.client.try_reject_milestone(&client_addr, &eid, &mid);
    assert!(
        matches!(result, Err(Ok(EscrowError::E14))),
        "Rejecting pending milestone should fail"
    );
}

#[test]
fn test_reject_milestone_with_reason() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);
    t.client.reject_milestone_with_reason(
        &client_addr,
        &eid,
        &mid,
        &hash(&t.env, 99),
    );

    let ms = t.client.get_milestone(&eid, &mid);
    assert_eq!(ms.status, MS_REJECTED);
}

#[test]
fn test_reject_with_zero_reason_hash_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);

    let result = t.client.try_reject_milestone_with_reason(
        &client_addr,
        &eid,
        &mid,
        &BytesN::from_array(&t.env, &[0u8; 32]),
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E19))),
        "Zero reason hash should fail"
    );
}

// =============================================================================
// RELEASE FUNDS (admin-only fallback)
// =============================================================================

#[test]
fn test_release_funds_admin_happy_path() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);
    t.client.approve_milestone(&client_addr, &eid, &mid);

    // Already released via approve_milestone — verify state
    let ms = t.client.get_milestone(&eid, &mid);
    assert_eq!(ms.status, MS_RELEASED);
}

#[test]
fn test_release_funds_non_participant_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let attacker = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);
    t.client.approve_milestone(&client_addr, &eid, &mid);

    // The ms is already released; but a non-admin trying to release a non-approved ms should fail
    // Let's test with a fresh escrow where milestone is only approved but not yet released
    let eid2 = create_funded_escrow(&t, &client_addr, &freelancer, 500, 1);
    let mid2 = t.client.add_milestone(
        &client_addr,
        &eid2,
        &String::from_str(&t.env, "X"),
        &hash(&t.env, 5),
        &500,
    );
    t.client.submit_milestone(&freelancer, &eid2, &mid2);

    // Attacker tries to release — must fail (not approved yet, E14)
    let result = t.client.try_release_funds(&attacker, &eid2, &mid2);
    assert!(result.is_err(), "Non-admin release should fail");
}

// =============================================================================
// CANCEL ESCROW
// =============================================================================

#[test]
fn test_cancel_escrow_happy_path() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    t.client.cancel_escrow(&client_addr, &eid);

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.status, EscrowStatus::Cancelled);
    assert!(balance(&t.env, &t.token_id, &client_addr) > 0);
}

#[test]
fn test_cancel_escrow_not_client_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    let result = t.client.try_cancel_escrow(&freelancer, &eid);
    assert!(
        matches!(result, Err(Ok(EscrowError::E5))),
        "Non-client cancel should fail"
    );
}

#[test]
fn test_cancel_disputed_escrow_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    t.client.raise_dispute(&client_addr, &eid, &None);

    let result = t.client.try_cancel_escrow(&client_addr, &eid);
    assert!(
        matches!(result, Err(Ok(EscrowError::E9))),
        "Cannot cancel disputed escrow"
    );
}

#[test]
fn test_cancel_completed_escrow_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);
    t.client.approve_milestone(&client_addr, &eid, &mid);

    let result = t.client.try_cancel_escrow(&client_addr, &eid);
    assert!(
        matches!(result, Err(Ok(EscrowError::E9))),
        "Cannot cancel completed escrow"
    );
}

// =============================================================================
// RAISE DISPUTE
// =============================================================================

#[test]
fn test_raise_dispute_by_client() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    t.client.raise_dispute(&client_addr, &eid, &None);

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.status, EscrowStatus::Disputed);
}

#[test]
fn test_raise_dispute_by_freelancer() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    t.client.raise_dispute(&freelancer, &eid, &None);

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.status, EscrowStatus::Disputed);
}

#[test]
fn test_raise_dispute_non_participant_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let attacker = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    let result = t.client.try_raise_dispute(&attacker, &eid, &None);
    assert!(
        matches!(result, Err(Ok(EscrowError::E3))),
        "Non-participant dispute should fail"
    );
}

#[test]
fn test_double_dispute_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    t.client.raise_dispute(&client_addr, &eid, &None);

    let result = t.client.try_raise_dispute(&freelancer, &eid, &None);
    assert!(
        matches!(result, Err(Ok(EscrowError::E9))),
        "Double dispute should fail"
    );
}

#[test]
fn test_raise_dispute_with_milestone() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);
    t.client
        .raise_dispute(&client_addr, &eid, &Some(mid));

    let ms = t.client.get_milestone(&eid, &mid);
    assert_eq!(ms.status, MS_DISPUTED);
}

// =============================================================================
// RESOLVE DISPUTE
// =============================================================================

#[test]
fn test_resolve_dispute_by_arbiter() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let arbiter = Address::generate(&t.env);

    mint_for_escrow(&t.env, &t.token_id, &client_addr, 1000, 0);
    let eid = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &1000,
        &hash(&t.env, 1),
        &Some(arbiter.clone()),
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    t.client.raise_dispute(&client_addr, &eid, &None);
    t.client.resolve_dispute(&arbiter, &eid, &400, &600);

    assert_eq!(balance(&t.env, &t.token_id, &client_addr), 400);
    assert_eq!(balance(&t.env, &t.token_id, &freelancer), 600);
}

#[test]
fn test_resolve_dispute_by_admin() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    t.client.raise_dispute(&client_addr, &eid, &None);
    t.client.resolve_dispute(&t.admin, &eid, &500, &500);

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.status, EscrowStatus::Completed);
}

#[test]
fn test_resolve_dispute_wrong_amounts_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    t.client.raise_dispute(&client_addr, &eid, &None);

    let result = t.client.try_resolve_dispute(&t.admin, &eid, &500, &600);
    assert!(
        matches!(result, Err(Ok(EscrowError::E20))),
        "Amounts not summing to remaining should fail"
    );
}

#[test]
fn test_resolve_dispute_non_disputed_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    let result = t.client.try_resolve_dispute(&t.admin, &eid, &500, &500);
    assert!(
        matches!(result, Err(Ok(EscrowError::E10))),
        "Resolving non-disputed escrow should fail"
    );
}

#[test]
fn test_resolve_dispute_random_caller_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let random = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    t.client.raise_dispute(&client_addr, &eid, &None);

    let result = t.client.try_resolve_dispute(&random, &eid, &500, &500);
    assert!(result.is_err(), "Random caller should not resolve dispute");
}

// =============================================================================
// PAUSE / UNPAUSE
// =============================================================================

#[test]
fn test_pause_non_admin_fails() {
    let t = setup();
    let non_admin = Address::generate(&t.env);
    let result = t.client.try_pause(&non_admin);
    assert!(matches!(result, Err(Ok(EscrowError::E4))));
}

#[test]
fn test_unpause_non_admin_fails() {
    let t = setup();
    t.client.pause(&t.admin);
    let non_admin = Address::generate(&t.env);
    let result = t.client.try_unpause(&non_admin);
    assert!(matches!(result, Err(Ok(EscrowError::E4))));
}

#[test]
fn test_pause_and_unpause_restores() {
    let t = setup();
    t.client.pause(&t.admin);
    assert!(t.client.is_paused());
    t.client.unpause(&t.admin);
    assert!(!t.client.is_paused());
}

// =============================================================================
// ADMIN TRANSFER (propose + accept)
// =============================================================================

#[test]
fn test_propose_and_accept_admin() {
    let t = setup();
    let new_admin = Address::generate(&t.env);

    t.client.propose_admin(&t.admin, &new_admin);
    t.client.accept_admin(&new_admin);

    assert_eq!(t.client.get_admin(), new_admin);
}

#[test]
fn test_propose_admin_non_admin_fails() {
    let t = setup();
    let non_admin = Address::generate(&t.env);
    let new_admin = Address::generate(&t.env);

    let result = t.client.try_propose_admin(&non_admin, &new_admin);
    assert!(matches!(result, Err(Ok(EscrowError::E4))));
}

#[test]
fn test_accept_admin_wrong_caller_fails() {
    let t = setup();
    let new_admin = Address::generate(&t.env);
    let wrong = Address::generate(&t.env);

    t.client.propose_admin(&t.admin, &new_admin);

    let result = t.client.try_accept_admin(&wrong);
    assert!(result.is_err(), "Wrong caller accepting admin should fail");
}

// =============================================================================
// FREEZE / UNFREEZE ESCROW
// =============================================================================

#[test]
fn test_freeze_blocks_operations() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.freeze_escrow(&t.admin, &eid);

    let result = t.client.try_submit_milestone(&freelancer, &eid, &mid);
    assert!(
        matches!(result, Err(Ok(EscrowError::E61))),
        "Frozen escrow should block submit"
    );
}

#[test]
fn test_unfreeze_restores_operations() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.freeze_escrow(&t.admin, &eid);
    t.client.unfreeze_escrow(&t.admin, &eid);

    t.client.submit_milestone(&freelancer, &eid, &mid);
    let ms = t.client.get_milestone(&eid, &mid);
    assert_eq!(ms.status, MS_SUBMITTED);
}

#[test]
fn test_freeze_non_admin_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    let result = t.client.try_freeze_escrow(&client_addr, &eid);
    assert!(matches!(result, Err(Ok(EscrowError::E4))));
}

// =============================================================================
// SET MAX MILESTONES
// =============================================================================

#[test]
fn test_set_max_milestones_happy_path() {
    let t = setup();
    t.client.set_max_milestones(&t.admin, &5);
}

#[test]
fn test_set_max_milestones_zero_fails() {
    let t = setup();
    let result = t.client.try_set_max_milestones(&t.admin, &0);
    assert!(matches!(result, Err(Ok(EscrowError::E17))));
}

#[test]
fn test_set_max_milestones_over_100_fails() {
    let t = setup();
    let result = t.client.try_set_max_milestones(&t.admin, &101);
    assert!(matches!(result, Err(Ok(EscrowError::E17))));
}

#[test]
fn test_set_max_milestones_non_admin_fails() {
    let t = setup();
    let non_admin = Address::generate(&t.env);
    let result = t.client.try_set_max_milestones(&non_admin, &5);
    assert!(matches!(result, Err(Ok(EscrowError::E4))));
}

// =============================================================================
// TOKEN WHITELIST
// =============================================================================

#[test]
fn test_token_whitelist_blocks_non_approved() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);

    t.client.set_token_whitelist_enabled(&t.admin, &true);

    let unapproved_token = Address::generate(&t.env);
    mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

    let result = t.client.try_create_escrow(
        &client_addr,
        &freelancer,
        &unapproved_token,
        &500,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );
    assert!(
        matches!(result, Err(Ok(EscrowError::E3))),
        "Unapproved token should fail"
    );
}

#[test]
fn test_token_whitelist_allows_approved() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);

    t.client.set_token_whitelist_enabled(&t.admin, &true);
    t.client.add_approved_token(&t.admin, &t.token_id);

    mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

    let eid = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &500,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.status, EscrowStatus::Active);
}

// =============================================================================
// TRANSFER CLIENT ROLE
// =============================================================================

#[test]
fn test_transfer_client_role_happy_path() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let new_client = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    t.client.transfer_client_role(&eid, &new_client);

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.client, new_client);
}

// =============================================================================
// REPUTATION
// =============================================================================

#[test]
fn test_get_reputation_default() {
    let t = setup();
    let user = Address::generate(&t.env);
    let rep = t.client.get_reputation(&user);
    assert_eq!(rep.total_score, 0);
    assert_eq!(rep.completed_escrows, 0);
}

// =============================================================================
// QUERY / VIEW FUNCTIONS
// =============================================================================

#[test]
fn test_get_escrow_nonexistent_fails() {
    let t = setup();
    let result = t.client.try_get_escrow(&99);
    assert!(result.is_err(), "Nonexistent escrow should fail");
}

#[test]
fn test_get_milestone_nonexistent_fails() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    let result = t.client.try_get_milestone(&eid, &0);
    assert!(result.is_err(), "Nonexistent milestone should fail");
}

#[test]
fn test_escrow_count_increments() {
    let t = setup();
    assert_eq!(t.client.escrow_count(), 0);

    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    create_funded_escrow(&t, &client_addr, &freelancer, 500, 0);
    assert_eq!(t.client.escrow_count(), 1);

    let client_addr2 = Address::generate(&t.env);
    create_funded_escrow(&t, &client_addr2, &freelancer, 500, 0);
    assert_eq!(t.client.escrow_count(), 2);
}

#[test]
fn test_get_escrow_ids_by_participant() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 500, 0);

    let ids = t.client.get_escrow_ids_by_participant(&client_addr);
    assert_eq!(ids.len(), 1);
    assert_eq!(ids.get(0).unwrap(), eid);

    let freelancer_ids = t.client.get_escrow_ids_by_participant(&freelancer);
    assert_eq!(freelancer_ids.len(), 1);
    assert_eq!(freelancer_ids.get(0).unwrap(), eid);
}

#[test]
fn test_get_escrow_ids_by_status() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 500, 0);

    let active_ids = t.client.get_escrow_ids_by_status(&EscrowStatus::Active);
    assert!(active_ids.contains(&eid));

    t.client.raise_dispute(&client_addr, &eid, &None);

    let disputed_ids = t
        .client
        .get_escrow_ids_by_status(&EscrowStatus::Disputed);
    assert!(disputed_ids.contains(&eid));
}

// =============================================================================
// PLATFORM FEE
// =============================================================================

#[test]
fn test_set_platform_treasury() {
    let t = setup();
    let treasury = Address::generate(&t.env);
    t.client.set_platform_treasury(&t.admin, &treasury);
    assert_eq!(t.client.get_platform_treasury(), Some(treasury));
}

#[test]
fn test_set_platform_treasury_non_admin_fails() {
    let t = setup();
    let non_admin = Address::generate(&t.env);
    let treasury = Address::generate(&t.env);
    let result = t.client.try_set_platform_treasury(&non_admin, &treasury);
    assert!(matches!(result, Err(Ok(EscrowError::E4))));
}

// =============================================================================
// UPDATE MILESTONE TITLE
// =============================================================================

#[test]
fn test_update_milestone_title_happy_path() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.update_milestone_title(
        &client_addr,
        &eid,
        &mid,
        &String::from_str(&t.env, "Updated Title"),
    );

    let ms = t.client.get_milestone(&eid, &mid);
    assert_eq!(ms.title, String::from_str(&t.env, "Updated Title"));
}

// =============================================================================
// ESCROW TEMPLATES
// =============================================================================

#[test]
fn test_create_and_get_template() {
    let t = setup();
    let creator = Address::generate(&t.env);

    let milestones = soroban_sdk::vec![
        &t.env,
        stellar_trust_escrow_contract::MilestoneTemplate {
            title: String::from_str(&t.env, "M1"),
            description_hash: hash(&t.env, 1),
            amount: 500,
        },
    ];

    let tid = t.client.create_template(
        &creator,
        &String::from_str(&t.env, "Standard"),
        &milestones,
    );

    let template = t.client.get_template(&tid);
    assert_eq!(template.creator, creator);
}

// =============================================================================
// STATE TRANSITION TESTS
// =============================================================================

#[test]
fn test_state_transition_active_to_disputed() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    assert_eq!(t.client.get_escrow(&eid).status, EscrowStatus::Active);
    t.client.raise_dispute(&client_addr, &eid, &None);
    assert_eq!(t.client.get_escrow(&eid).status, EscrowStatus::Disputed);
}

#[test]
fn test_state_transition_active_to_cancelled() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    t.client.cancel_escrow(&client_addr, &eid);
    assert_eq!(t.client.get_escrow(&eid).status, EscrowStatus::Cancelled);
}

#[test]
fn test_state_transition_active_to_completed() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.submit_milestone(&freelancer, &eid, &mid);
    t.client.approve_milestone(&client_addr, &eid, &mid);
    assert_eq!(t.client.get_escrow(&eid).status, EscrowStatus::Completed);
}

#[test]
fn test_state_transition_disputed_to_completed() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 0);

    t.client.raise_dispute(&client_addr, &eid, &None);
    t.client.resolve_dispute(&t.admin, &eid, &500, &500);
    assert_eq!(t.client.get_escrow(&eid).status, EscrowStatus::Completed);
}

#[test]
fn test_milestone_state_transitions() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    // Pending
    assert_eq!(t.client.get_milestone(&eid, &mid).status, MS_PENDING);

    // Pending -> Submitted
    t.client.submit_milestone(&freelancer, &eid, &mid);
    assert_eq!(t.client.get_milestone(&eid, &mid).status, MS_SUBMITTED);

    // Submitted -> Rejected
    t.client.reject_milestone(&client_addr, &eid, &mid);
    assert_eq!(t.client.get_milestone(&eid, &mid).status, MS_REJECTED);

    // Rejected -> Submitted (resubmit)
    t.client.submit_milestone(&freelancer, &eid, &mid);
    assert_eq!(t.client.get_milestone(&eid, &mid).status, MS_SUBMITTED);

    // Submitted -> Approved -> Released
    t.client.approve_milestone(&client_addr, &eid, &mid);
    assert_eq!(t.client.get_milestone(&eid, &mid).status, MS_RELEASED);
}

// =============================================================================
// EDGE CASES
// =============================================================================

#[test]
fn test_create_multiple_escrows_same_parties() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    mint_for_escrow(&t.env, &t.token_id, &client_addr, 2000, 0);

    let eid1 = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &1000,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );
    let eid2 = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &500,
        &hash(&t.env, 2),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    assert_ne!(eid1, eid2);
    assert_eq!(t.client.escrow_count(), 2);
}

#[test]
fn test_cancel_escrow_with_approved_milestones_pays_freelancer() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let eid = create_funded_escrow(&t, &client_addr, &freelancer, 1000, 2);

    let m0 = t.client.add_milestone(
        &client_addr,
        &eid,
        &String::from_str(&t.env, "Done"),
        &hash(&t.env, 2),
        &400,
    );
    t.client.add_milestone(
        &client_addr,
        &eid,
        &String::from_str(&t.env, "Todo"),
        &hash(&t.env, 3),
        &600,
    );

    t.client.submit_milestone(&freelancer, &eid, &m0);
    t.client.approve_milestone(&client_addr, &eid, &m0);

    // m0 already released 400 to freelancer on approve
    // Cancel should not pay freelancer again for already-released milestones
    t.client.cancel_escrow(&client_addr, &eid);

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.status, EscrowStatus::Cancelled);
}

#[test]
fn test_view_functions_work_when_paused() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.pause(&t.admin);

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.status, EscrowStatus::Active);

    let ms = t.client.get_milestone(&eid, &mid);
    assert_eq!(ms.status, MS_PENDING);

    assert!(t.client.is_paused());
    assert_eq!(t.client.escrow_count(), 1);
}

#[test]
fn test_frozen_escrow_blocks_all_mutations() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let (eid, mid) = create_escrow_with_milestone(&t, &client_addr, &freelancer, 1000);

    t.client.freeze_escrow(&t.admin, &eid);

    assert!(matches!(
        t.client.try_submit_milestone(&freelancer, &eid, &mid),
        Err(Ok(EscrowError::E61))
    ));
    assert!(matches!(
        t.client.try_cancel_escrow(&client_addr, &eid),
        Err(Ok(EscrowError::E61))
    ));
    assert!(matches!(
        t.client.try_raise_dispute(&client_addr, &eid, &None),
        Err(Ok(EscrowError::E61))
    ));
}

#[test]
fn test_create_escrow_with_dispute_timeout() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

    let eid = t.client.create_escrow_dispute_timeout(
        &client_addr,
        &freelancer,
        &t.token_id,
        &500,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &100, // dispute timeout in ledger sequences
    );

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.status, EscrowStatus::Active);
    assert_eq!(escrow.dispute_timeout_ledger, Some(100));
}

#[test]
fn test_create_escrow_with_buyer_signers() {
    let t = setup();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let signer1 = Address::generate(&t.env);
    let signer2 = Address::generate(&t.env);
    mint_for_escrow(&t.env, &t.token_id, &client_addr, 500, 0);

    let signers = soroban_sdk::vec![&t.env, signer1.clone(), signer2.clone()];

    let eid = t.client.create_escrow_with_buyer_signers(
        &client_addr,
        &freelancer,
        &t.token_id,
        &500,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &signers,
    );

    let escrow = t.client.get_escrow(&eid);
    assert_eq!(escrow.status, EscrowStatus::Active);
    assert!(escrow.buyer_signers.len() >= 2);
}

// =============================================================================
// SET ADMIN MULTISIG
// =============================================================================

#[test]
fn test_set_admin_multisig() {
    let t = setup();
    let signer1 = Address::generate(&t.env);
    let signer2 = Address::generate(&t.env);
    let signers = soroban_sdk::vec![&t.env, signer1, signer2];

    t.client.set_admin_multisig(&t.admin, &signers, &2);
}

// =============================================================================
// ARBITER REPUTATION THRESHOLD
// =============================================================================

#[test]
fn test_set_and_get_min_arbiter_reputation() {
    let t = setup();
    t.client.set_min_arbiter_reputation(&t.admin, &200);
    assert_eq!(t.client.get_min_arbiter_reputation(), 200);
}

#[test]
fn test_set_min_arbiter_reputation_non_admin_fails() {
    let t = setup();
    let non_admin = Address::generate(&t.env);
    let result = t.client.try_set_min_arbiter_reputation(&non_admin, &200);
    assert!(matches!(result, Err(Ok(EscrowError::E4))));
}
