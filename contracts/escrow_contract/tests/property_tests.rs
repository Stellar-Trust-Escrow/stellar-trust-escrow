//! # Property-Based Tests
//!
//! Uses proptest to verify financial invariants that must hold for all inputs:
//! - Total funds released + fees always equals total funds deposited
//! - An escrow can never be released more than once (no double-release)
//! - State transitions only move forward (no invalid predecessor states)
//! - Only participants can trigger state changes affecting their escrow

use proptest::prelude::*;
use soroban_sdk::{
    testutils::Address as _, testutils::Ledger, token, Address, BytesN, Env, String,
};
use stellar_trust_escrow_contract::{
    EscrowContract, EscrowContractClient, EscrowError, EscrowStatus, MultisigConfig, MS_APPROVED,
    MS_PENDING, MS_RELEASED, MS_SUBMITTED,
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

fn balance(env: &Env, token_id: &Address, addr: &Address) -> i128 {
    token::Client::new(env, token_id).balance(addr)
}

fn hash(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

fn no_multisig(env: &Env) -> MultisigConfig {
    MultisigConfig {
        approvers: soroban_sdk::Vec::new(env),
        weights: soroban_sdk::Vec::new(env),
        threshold: 0,
    }
}

// =============================================================================
// INVARIANT 1: Conservation of funds
// Total funds released + fees + remaining == total deposited
// =============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(30))]

    #[test]
    fn prop_funds_conservation_on_full_lifecycle(
        total_amount in 100i128..100_000,
        m1_pct in 10u32..90,
    ) {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let milestones: i128 = 2;

        let extra = RENT_RESERVE_PER_ENTRY * (1 + milestones);
        mint(&t.env, &t.token_id, &client_addr, total_amount + extra);

        let initial_total = balance(&t.env, &t.token_id, &client_addr);

        let eid = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &total_amount,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let m1_amount = (total_amount * i128::from(m1_pct)) / 100;
        let m2_amount = total_amount - m1_amount;

        if m1_amount <= 0 || m2_amount <= 0 {
            return Ok(());
        }

        let mid0 = t.client.add_milestone(
            &client_addr,
            &eid,
            &String::from_str(&t.env, "M1"),
            &hash(&t.env, 2),
            &m1_amount,
        );
        let mid1 = t.client.add_milestone(
            &client_addr,
            &eid,
            &String::from_str(&t.env, "M2"),
            &hash(&t.env, 3),
            &m2_amount,
        );

        t.client.submit_milestone(&freelancer, &eid, &mid0);
        t.client.approve_milestone(&client_addr, &eid, &mid0);

        t.client.submit_milestone(&freelancer, &eid, &mid1);
        t.client.approve_milestone(&client_addr, &eid, &mid1);

        let client_bal = balance(&t.env, &t.token_id, &client_addr);
        let freelancer_bal = balance(&t.env, &t.token_id, &freelancer);
        let contract_bal = balance(&t.env, &t.token_id, &t.contract_id);
        let admin_bal = balance(&t.env, &t.token_id, &t.admin);

        // All money accounted for: client + freelancer + contract + admin(fees) == initial
        prop_assert_eq!(
            client_bal + freelancer_bal + contract_bal + admin_bal,
            initial_total,
            "Funds conservation violated: {} + {} + {} + {} != {}",
            client_bal, freelancer_bal, contract_bal, admin_bal, initial_total
        );
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(30))]

    #[test]
    fn prop_funds_conservation_on_cancel(
        total_amount in 100i128..50_000,
    ) {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);

        let extra = RENT_RESERVE_PER_ENTRY;
        mint(&t.env, &t.token_id, &client_addr, total_amount + extra);

        let initial_total = balance(&t.env, &t.token_id, &client_addr);

        let eid = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &total_amount,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        t.client.cancel_escrow(&client_addr, &eid);

        let client_bal = balance(&t.env, &t.token_id, &client_addr);
        let freelancer_bal = balance(&t.env, &t.token_id, &freelancer);
        let contract_bal = balance(&t.env, &t.token_id, &t.contract_id);
        let admin_bal = balance(&t.env, &t.token_id, &t.admin);

        prop_assert_eq!(
            client_bal + freelancer_bal + contract_bal + admin_bal,
            initial_total,
            "Funds conservation violated on cancel"
        );
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(30))]

    #[test]
    fn prop_funds_conservation_on_dispute_resolve(
        total_amount in 100i128..50_000,
        client_pct in 0u32..100,
    ) {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);

        let extra = RENT_RESERVE_PER_ENTRY;
        mint(&t.env, &t.token_id, &client_addr, total_amount + extra);
        let initial_total = balance(&t.env, &t.token_id, &client_addr);

        let eid = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &total_amount,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        t.client.raise_dispute(&client_addr, &eid, &None);

        let client_amount = (total_amount * i128::from(client_pct)) / 100;
        let freelancer_amount = total_amount - client_amount;

        t.client.resolve_dispute(
            &t.admin,
            &eid,
            &client_amount,
            &freelancer_amount,
        );

        let client_bal = balance(&t.env, &t.token_id, &client_addr);
        let freelancer_bal = balance(&t.env, &t.token_id, &freelancer);
        let contract_bal = balance(&t.env, &t.token_id, &t.contract_id);
        let admin_bal = balance(&t.env, &t.token_id, &t.admin);

        prop_assert_eq!(
            client_bal + freelancer_bal + contract_bal + admin_bal,
            initial_total,
            "Funds conservation violated on dispute resolve"
        );
    }
}

// =============================================================================
// INVARIANT 2: No double-release
// An escrow milestone can never be released more than once
// =============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(20))]

    #[test]
    fn prop_no_double_release(
        total_amount in 100i128..50_000,
    ) {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);

        let extra = RENT_RESERVE_PER_ENTRY * 2;
        mint(&t.env, &t.token_id, &client_addr, total_amount + extra);

        let eid = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &total_amount,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let mid = t.client.add_milestone(
            &client_addr,
            &eid,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &total_amount,
        );

        t.client.submit_milestone(&freelancer, &eid, &mid);
        t.client.approve_milestone(&client_addr, &eid, &mid);

        let ms = t.client.get_milestone(&eid, &mid);
        prop_assert_eq!(ms.status, MS_RELEASED);

        // Trying to submit again should fail (milestone is already released)
        let result = t.client.try_submit_milestone(&freelancer, &eid, &mid);
        prop_assert!(
            result.is_err(),
            "Should not be able to resubmit a released milestone"
        );

        // Trying to approve again should fail (escrow completed)
        let result = t.client.try_approve_milestone(&client_addr, &eid, &mid);
        prop_assert!(
            result.is_err(),
            "Should not be able to re-approve a released milestone"
        );
    }
}

// =============================================================================
// INVARIANT 3: State transitions only move forward
// No state can be reached from an invalid predecessor
// =============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(20))]

    #[test]
    fn prop_no_backward_state_transitions(
        total_amount in 100i128..50_000,
    ) {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);

        let extra = RENT_RESERVE_PER_ENTRY * 2;
        mint(&t.env, &t.token_id, &client_addr, total_amount + extra);

        let eid = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &total_amount,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        // Active -> Disputed
        t.client.raise_dispute(&client_addr, &eid, &None);
        let escrow = t.client.get_escrow(&eid);
        prop_assert_eq!(escrow.status, EscrowStatus::Disputed);

        // Cannot go back to Active by raising dispute again
        let result = t.client.try_raise_dispute(&freelancer, &eid, &None);
        prop_assert!(result.is_err(), "Cannot re-dispute");

        // Disputed -> Completed (via resolve)
        t.client.resolve_dispute(&t.admin, &eid, &(total_amount / 2), &(total_amount - total_amount / 2));
        let escrow = t.client.get_escrow(&eid);
        prop_assert_eq!(escrow.status, EscrowStatus::Completed);

        // Cannot cancel completed
        let result = t.client.try_cancel_escrow(&client_addr, &eid);
        prop_assert!(result.is_err(), "Cannot cancel completed escrow");

        // Cannot dispute completed
        let result = t.client.try_raise_dispute(&client_addr, &eid, &None);
        prop_assert!(result.is_err(), "Cannot dispute completed escrow");
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(20))]

    #[test]
    fn prop_cancelled_is_terminal(
        total_amount in 100i128..50_000,
    ) {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);

        let extra = RENT_RESERVE_PER_ENTRY;
        mint(&t.env, &t.token_id, &client_addr, total_amount + extra);

        let eid = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &total_amount,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        t.client.cancel_escrow(&client_addr, &eid);
        let escrow = t.client.get_escrow(&eid);
        prop_assert_eq!(escrow.status, EscrowStatus::Cancelled);

        // Cannot dispute cancelled
        let result = t.client.try_raise_dispute(&client_addr, &eid, &None);
        prop_assert!(result.is_err(), "Cannot dispute cancelled escrow");

        // Cannot cancel again
        let result = t.client.try_cancel_escrow(&client_addr, &eid);
        prop_assert!(result.is_err(), "Cannot cancel already cancelled escrow");
    }
}

// =============================================================================
// INVARIANT 4: Only participants can trigger state changes
// =============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(20))]

    #[test]
    fn prop_only_participants_can_act(
        total_amount in 100i128..50_000,
    ) {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        let outsider = Address::generate(&t.env);

        let extra = RENT_RESERVE_PER_ENTRY * 2;
        mint(&t.env, &t.token_id, &client_addr, total_amount + extra);

        let eid = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &total_amount,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let mid = t.client.add_milestone(
            &client_addr,
            &eid,
            &String::from_str(&t.env, "Work"),
            &hash(&t.env, 2),
            &total_amount,
        );

        // Outsider cannot submit milestone
        let result = t.client.try_submit_milestone(&outsider, &eid, &mid);
        prop_assert!(
            matches!(result, Err(Ok(EscrowError::E3))),
            "Outsider should not submit milestone"
        );

        // Outsider cannot add milestone
        let result = t.client.try_add_milestone(
            &outsider,
            &eid,
            &String::from_str(&t.env, "Bad"),
            &hash(&t.env, 3),
            &100,
        );
        prop_assert!(
            matches!(result, Err(Ok(EscrowError::E5))),
            "Outsider should not add milestone"
        );

        // Outsider cannot cancel
        let result = t.client.try_cancel_escrow(&outsider, &eid);
        prop_assert!(
            matches!(result, Err(Ok(EscrowError::E5))),
            "Outsider should not cancel escrow"
        );

        // Outsider cannot raise dispute
        let result = t.client.try_raise_dispute(&outsider, &eid, &None);
        prop_assert!(
            matches!(result, Err(Ok(EscrowError::E3))),
            "Outsider should not raise dispute"
        );

        // Freelancer submits, outsider cannot approve
        t.client.submit_milestone(&freelancer, &eid, &mid);
        let result = t.client.try_approve_milestone(&outsider, &eid, &mid);
        prop_assert!(
            matches!(result, Err(Ok(EscrowError::E3))),
            "Outsider should not approve milestone"
        );

        // Outsider cannot reject
        let result = t.client.try_reject_milestone(&outsider, &eid, &mid);
        prop_assert!(
            matches!(result, Err(Ok(EscrowError::E5))),
            "Outsider should not reject milestone"
        );
    }
}

// =============================================================================
// INVARIANT 5: Milestone amounts always sum to <= total_amount
// =============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(20))]

    #[test]
    fn prop_milestone_allocation_never_exceeds_total(
        total_amount in 1000i128..50_000,
        num_milestones in 2u32..5,
    ) {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);

        let extra = RENT_RESERVE_PER_ENTRY * (1 + i128::from(num_milestones));
        mint(&t.env, &t.token_id, &client_addr, total_amount + extra);

        let eid = t.client.create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &total_amount,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );

        let per_milestone = total_amount / i128::from(num_milestones);
        if per_milestone <= 0 {
            return Ok(());
        }

        let mut allocated = 0i128;
        for i in 0..num_milestones {
            let amount = if i == num_milestones - 1 {
                total_amount - allocated
            } else {
                per_milestone
            };

            if amount <= 0 {
                break;
            }

            t.client.add_milestone(
                &client_addr,
                &eid,
                &String::from_str(&t.env, "M"),
                &hash(&t.env, (i + 2) as u8),
                &amount,
            );
            allocated += amount;
        }

        prop_assert!(allocated <= total_amount, "Allocated {} > total {}", allocated, total_amount);

        // One more should fail
        let result = t.client.try_add_milestone(
            &client_addr,
            &eid,
            &String::from_str(&t.env, "Over"),
            &hash(&t.env, 99),
            &1,
        );
        prop_assert!(result.is_err(), "Should not allocate beyond total");
    }
}

// =============================================================================
// INVARIANT 6: Escrow amount boundaries
// =============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(15))]

    #[test]
    fn prop_invalid_amounts_always_rejected(
        amount in prop::num::i128::ANY.prop_filter("non-positive", |a| *a <= 0),
    ) {
        let t = setup();
        let client_addr = Address::generate(&t.env);
        let freelancer = Address::generate(&t.env);
        mint(&t.env, &t.token_id, &client_addr, 1_000_000);

        let result = t.client.try_create_escrow(
            &client_addr,
            &freelancer,
            &t.token_id,
            &amount,
            &hash(&t.env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&t.env),
        );
        prop_assert!(result.is_err(), "Non-positive amount {} should be rejected", amount);
    }
}
