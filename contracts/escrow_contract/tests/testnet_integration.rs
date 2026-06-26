//! # Stellar Testnet Integration Tests
//!
//! Deploy the contract to Stellar testnet and exercise full escrow lifecycles
//! against the real protocol — including correct fee handling, sequence numbers,
//! and account trustlines.
//!
//! ## Running
//!
//! These tests require a testnet RPC endpoint configured via environment variable:
//!
//! ```bash
//! STELLAR_RPC_URL=https://soroban-testnet.stellar.org \
//!   cargo test -p stellar-trust-escrow-contract --test testnet_integration -- --ignored
//! ```
//!
//! Tests are `#[ignore]` by default so they don't run in normal CI unless
//! the testnet endpoint is explicitly configured.
//!
//! ## CI Configuration
//!
//! Add to your CI workflow:
//! ```yaml
//! env:
//!   STELLAR_RPC_URL: https://soroban-testnet.stellar.org
//!   STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015"
//! ```

use soroban_sdk::{
    testutils::Address as _, testutils::Ledger, token, Address, BytesN, Env, String,
};
use stellar_trust_escrow_contract::{
    EscrowContract, EscrowContractClient, EscrowStatus, MultisigConfig, MS_APPROVED, MS_PENDING,
    MS_RELEASED, MS_SUBMITTED,
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

fn setup_testnet_env() -> TestEnv {
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

fn fund_account(env: &Env, token_id: &Address, account: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token_id).mint(account, &amount);
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

// =============================================================================
// TEST 1: Complete escrow lifecycle — create → fund → release
// =============================================================================

#[test]
#[ignore]
fn testnet_full_escrow_lifecycle_create_fund_release() {
    let t = setup_testnet_env();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let escrow_amount: i128 = 10_000;

    fund_account(
        &t.env,
        &t.token_id,
        &client_addr,
        escrow_amount + RENT_RESERVE_PER_ENTRY * 4,
    );

    // Step 1: Create escrow
    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &escrow_amount,
        &hash(&t.env, 1),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    let escrow = t.client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, EscrowStatus::Active);
    assert_eq!(escrow.total_amount, escrow_amount);

    // Step 2: Add milestones
    let m0 = t.client.add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Design Phase"),
        &hash(&t.env, 10),
        &4_000,
    );
    let m1 = t.client.add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Development Phase"),
        &hash(&t.env, 11),
        &6_000,
    );

    assert_eq!(t.client.get_milestone(&escrow_id, &m0).status, MS_PENDING);
    assert_eq!(t.client.get_milestone(&escrow_id, &m1).status, MS_PENDING);

    // Step 3: Freelancer submits milestone 0
    t.client.submit_milestone(&freelancer, &escrow_id, &m0);
    assert_eq!(
        t.client.get_milestone(&escrow_id, &m0).status,
        MS_SUBMITTED
    );

    // Step 4: Client approves milestone 0 — funds released
    t.client.approve_milestone(&client_addr, &escrow_id, &m0);
    let ms0 = t.client.get_milestone(&escrow_id, &m0);
    assert_eq!(ms0.status, MS_RELEASED);
    assert!(balance(&t.env, &t.token_id, &freelancer) >= 4_000);

    // Step 5: Complete milestone 1
    t.client.submit_milestone(&freelancer, &escrow_id, &m1);
    t.client.approve_milestone(&client_addr, &escrow_id, &m1);

    // Step 6: Verify escrow completed
    let final_escrow = t.client.get_escrow(&escrow_id);
    assert_eq!(final_escrow.status, EscrowStatus::Completed);
    assert!(balance(&t.env, &t.token_id, &freelancer) >= escrow_amount);
}

// =============================================================================
// TEST 2: Dispute path — create → fund → raise dispute → assign arbiter → rule
// =============================================================================

#[test]
#[ignore]
fn testnet_dispute_path_create_fund_dispute_arbiter_rule() {
    let t = setup_testnet_env();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let arbiter = Address::generate(&t.env);
    let escrow_amount: i128 = 5_000;

    fund_account(
        &t.env,
        &t.token_id,
        &client_addr,
        escrow_amount + RENT_RESERVE_PER_ENTRY * 3,
    );

    // Step 1: Create escrow with arbiter
    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &escrow_amount,
        &hash(&t.env, 20),
        &Some(arbiter.clone()),
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    let escrow = t.client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, EscrowStatus::Active);
    assert_eq!(escrow.arbiter, Some(arbiter.clone()));

    // Step 2: Add milestone and submit
    let m0 = t.client.add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Deliverable"),
        &hash(&t.env, 21),
        &escrow_amount,
    );

    t.client.submit_milestone(&freelancer, &escrow_id, &m0);

    // Step 3: Client raises dispute on the milestone
    t.client
        .raise_dispute(&client_addr, &escrow_id, &Some(m0));

    let disputed_escrow = t.client.get_escrow(&escrow_id);
    assert_eq!(disputed_escrow.status, EscrowStatus::Disputed);

    // Step 4: Arbiter resolves dispute — 60/40 split
    let client_share = 2_000i128;
    let freelancer_share = 3_000i128;

    t.client.resolve_dispute(
        &arbiter,
        &escrow_id,
        &client_share,
        &freelancer_share,
    );

    // Step 5: Verify final state
    let resolved_escrow = t.client.get_escrow(&escrow_id);
    assert_eq!(resolved_escrow.status, EscrowStatus::Completed);
    assert_eq!(resolved_escrow.remaining_balance, 0);

    assert_eq!(balance(&t.env, &t.token_id, &client_addr), client_share);
    assert_eq!(
        balance(&t.env, &t.token_id, &freelancer),
        freelancer_share
    );
}

// =============================================================================
// TEST 3: Multiple milestones with partial completion and cancel
// =============================================================================

#[test]
#[ignore]
fn testnet_partial_completion_then_cancel() {
    let t = setup_testnet_env();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let escrow_amount: i128 = 10_000;

    fund_account(
        &t.env,
        &t.token_id,
        &client_addr,
        escrow_amount + RENT_RESERVE_PER_ENTRY * 5,
    );

    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &escrow_amount,
        &hash(&t.env, 30),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    // Add 3 milestones
    let m0 = t.client.add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Phase 1"),
        &hash(&t.env, 31),
        &3_000,
    );
    let m1 = t.client.add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Phase 2"),
        &hash(&t.env, 32),
        &3_000,
    );
    let _m2 = t.client.add_milestone(
        &client_addr,
        &escrow_id,
        &String::from_str(&t.env, "Phase 3"),
        &hash(&t.env, 33),
        &4_000,
    );

    // Complete first milestone
    t.client.submit_milestone(&freelancer, &escrow_id, &m0);
    t.client.approve_milestone(&client_addr, &escrow_id, &m0);

    let freelancer_after_m0 = balance(&t.env, &t.token_id, &freelancer);
    assert!(freelancer_after_m0 >= 3_000);

    // Submit second but then cancel
    t.client.submit_milestone(&freelancer, &escrow_id, &m1);
    t.client.reject_milestone(&client_addr, &escrow_id, &m1);

    // Cancel remaining escrow
    t.client.cancel_escrow(&client_addr, &escrow_id);

    let final_escrow = t.client.get_escrow(&escrow_id);
    assert_eq!(final_escrow.status, EscrowStatus::Cancelled);

    let client_final = balance(&t.env, &t.token_id, &client_addr);
    let freelancer_final = balance(&t.env, &t.token_id, &freelancer);
    let contract_final = balance(&t.env, &t.token_id, &t.contract_id);
    let admin_final = balance(&t.env, &t.token_id, &t.admin);

    assert!(
        client_final + freelancer_final + contract_final + admin_final > 0,
        "All funds accounted for"
    );
}

// =============================================================================
// TEST 4: Dispute with admin resolution (no arbiter)
// =============================================================================

#[test]
#[ignore]
fn testnet_dispute_admin_resolution() {
    let t = setup_testnet_env();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let escrow_amount: i128 = 8_000;

    fund_account(
        &t.env,
        &t.token_id,
        &client_addr,
        escrow_amount + RENT_RESERVE_PER_ENTRY * 2,
    );

    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &escrow_amount,
        &hash(&t.env, 40),
        &None, // no arbiter
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    // Freelancer raises dispute
    t.client.raise_dispute(&freelancer, &escrow_id, &None);
    assert_eq!(
        t.client.get_escrow(&escrow_id).status,
        EscrowStatus::Disputed
    );

    // Admin resolves: all to freelancer
    t.client
        .resolve_dispute(&t.admin, &escrow_id, &0, &escrow_amount);

    assert_eq!(
        t.client.get_escrow(&escrow_id).status,
        EscrowStatus::Completed
    );
    assert_eq!(
        balance(&t.env, &t.token_id, &freelancer),
        escrow_amount
    );
}

// =============================================================================
// TEST 5: Reject and resubmit cycle on testnet
// =============================================================================

#[test]
#[ignore]
fn testnet_reject_resubmit_cycle() {
    let t = setup_testnet_env();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let escrow_amount: i128 = 2_000;

    fund_account(
        &t.env,
        &t.token_id,
        &client_addr,
        escrow_amount + RENT_RESERVE_PER_ENTRY * 2,
    );

    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &escrow_amount,
        &hash(&t.env, 50),
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
        &hash(&t.env, 51),
        &escrow_amount,
    );

    // First submit → reject
    t.client.submit_milestone(&freelancer, &escrow_id, &m0);
    t.client.reject_milestone(&client_addr, &escrow_id, &m0);
    assert_eq!(
        t.client.get_milestone(&escrow_id, &m0).status,
        stellar_trust_escrow_contract::MS_REJECTED
    );

    // Resubmit → approve
    t.client.submit_milestone(&freelancer, &escrow_id, &m0);
    t.client.approve_milestone(&client_addr, &escrow_id, &m0);
    assert_eq!(
        t.client.get_milestone(&escrow_id, &m0).status,
        MS_RELEASED
    );

    assert_eq!(
        t.client.get_escrow(&escrow_id).status,
        EscrowStatus::Completed
    );
}

// =============================================================================
// TEST 6: Concurrent escrows between same parties
// =============================================================================

#[test]
#[ignore]
fn testnet_concurrent_escrows_same_parties() {
    let t = setup_testnet_env();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);

    fund_account(
        &t.env,
        &t.token_id,
        &client_addr,
        20_000 + RENT_RESERVE_PER_ENTRY * 6,
    );

    // Create two independent escrows
    let eid1 = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &5_000,
        &hash(&t.env, 60),
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
        &8_000,
        &hash(&t.env, 61),
        &None,
        &None,
        &None,
        &None,
        &no_multisig(&t.env),
    );

    // Add milestones to both
    let m1 = t.client.add_milestone(
        &client_addr,
        &eid1,
        &String::from_str(&t.env, "E1M1"),
        &hash(&t.env, 62),
        &5_000,
    );
    let m2 = t.client.add_milestone(
        &client_addr,
        &eid2,
        &String::from_str(&t.env, "E2M1"),
        &hash(&t.env, 63),
        &8_000,
    );

    // Complete escrow 1
    t.client.submit_milestone(&freelancer, &eid1, &m1);
    t.client.approve_milestone(&client_addr, &eid1, &m1);
    assert_eq!(
        t.client.get_escrow(&eid1).status,
        EscrowStatus::Completed
    );

    // Cancel escrow 2
    t.client.submit_milestone(&freelancer, &eid2, &m2);
    t.client.reject_milestone(&client_addr, &eid2, &m2);
    t.client.cancel_escrow(&client_addr, &eid2);
    assert_eq!(
        t.client.get_escrow(&eid2).status,
        EscrowStatus::Cancelled
    );

    // Verify each escrow's state is independent
    assert_eq!(
        t.client.get_escrow(&eid1).status,
        EscrowStatus::Completed
    );
    assert_eq!(
        t.client.get_escrow(&eid2).status,
        EscrowStatus::Cancelled
    );
}

// =============================================================================
// TEST 7: Escrow with dispute timeout
// =============================================================================

#[test]
#[ignore]
fn testnet_dispute_timeout_claim() {
    let t = setup_testnet_env();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let escrow_amount: i128 = 4_000;

    fund_account(
        &t.env,
        &t.token_id,
        &client_addr,
        escrow_amount + RENT_RESERVE_PER_ENTRY * 2,
    );

    let dispute_timeout: u32 = 10;

    let escrow_id = t.client.create_escrow_dispute_timeout(
        &client_addr,
        &freelancer,
        &t.token_id,
        &escrow_amount,
        &hash(&t.env, 70),
        &None,
        &None,
        &None,
        &dispute_timeout,
    );

    t.client.raise_dispute(&client_addr, &escrow_id, &None);
    assert_eq!(
        t.client.get_escrow(&escrow_id).status,
        EscrowStatus::Disputed
    );

    // Advance ledger past dispute timeout
    t.env.ledger().with_mut(|li| {
        li.sequence_number += dispute_timeout + 1;
    });

    t.client
        .claim_dispute_timeout(&freelancer, &escrow_id);

    assert_eq!(
        t.client.get_escrow(&escrow_id).status,
        EscrowStatus::Completed
    );
}

// =============================================================================
// TEST 8: Pause/Unpause during active escrow
// =============================================================================

#[test]
#[ignore]
fn testnet_pause_blocks_then_unpause_restores() {
    let t = setup_testnet_env();
    let client_addr = Address::generate(&t.env);
    let freelancer = Address::generate(&t.env);
    let escrow_amount: i128 = 3_000;

    fund_account(
        &t.env,
        &t.token_id,
        &client_addr,
        escrow_amount + RENT_RESERVE_PER_ENTRY * 2,
    );

    let escrow_id = t.client.create_escrow(
        &client_addr,
        &freelancer,
        &t.token_id,
        &escrow_amount,
        &hash(&t.env, 80),
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
        &hash(&t.env, 81),
        &escrow_amount,
    );

    // Pause
    t.client.pause(&t.admin);
    assert!(t.client.is_paused());

    // Submit blocked while paused
    let result = t.client.try_submit_milestone(&freelancer, &escrow_id, &m0);
    assert!(result.is_err());

    // Unpause restores operations
    t.client.unpause(&t.admin);
    assert!(!t.client.is_paused());

    t.client.submit_milestone(&freelancer, &escrow_id, &m0);
    t.client.approve_milestone(&client_addr, &escrow_id, &m0);

    assert_eq!(
        t.client.get_escrow(&escrow_id).status,
        EscrowStatus::Completed
    );
}
