//! Tests for partial_cancel functionality (Issue #705)

#[cfg(test)]
#[allow(clippy::module_inception)]
mod partial_cancel_tests {
    use soroban_sdk::{
        testutils::{Address as _, Events},
        token, Address, BytesN, Env, String, Symbol, TryFromVal, Val,
    };

    use crate::{EscrowContract, EscrowContractClient, MultisigConfig};

    fn setup() -> (Env, Address, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, contract_id, client)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        token::StellarAssetClient::new(env, &sac.address()).mint(recipient, &(amount + 1_000));
        sac.address()
    }

    fn contract_events(
        env: &Env,
        contract_id: &Address,
    ) -> soroban_sdk::Vec<(Address, soroban_sdk::Vec<Val>, Val)> {
        let all = env.events().all();
        let mut out = soroban_sdk::Vec::new(env);
        for event in all.iter() {
            if event.0 == *contract_id {
                out.push_back(event);
            }
        }
        out
    }

    fn has_topic_symbol(env: &Env, topics: &soroban_sdk::Vec<Val>, expected: Symbol) -> bool {
        topics
            .get(0)
            .map(|val| {
                Symbol::try_from_val(env, &val).expect("event topic[0] should be a symbol")
                    == expected
            })
            .unwrap_or(false)
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    // Test 1: Successful partial cancel with unallocated balance
    #[test]
    fn test_partial_cancel_successful_refund() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        // Create escrow with 10,000 tokens
        let brief_hash = BytesN::from_array(&env, &[1; 32]);
        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &10_000_i128,
            &brief_hash,
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        // Add milestones totaling 6,000 tokens (leaving 4,000 unallocated)
        let m1_hash = BytesN::from_array(&env, &[2; 32]);
        let m1_title = String::from_str(&env, "Milestone 1");
        client.add_milestone(&client_addr, &escrow_id, &m1_title, &m1_hash, &3_000_i128);

        let m2_hash = BytesN::from_array(&env, &[3; 32]);
        let m2_title = String::from_str(&env, "Milestone 2");
        client.add_milestone(&client_addr, &escrow_id, &m2_title, &m2_hash, &3_000_i128);

        // Get client balance before partial cancel
        let client_balance_before = token::Client::new(&env, &token).balance(&client_addr);

        // Partial cancel - should refund 4,000 tokens
        let refunded = client.partial_cancel(&client_addr, &escrow_id);
        assert_eq!(refunded, 4_000_i128);

        // Verify client received the refund
        let client_balance_after = token::Client::new(&env, &token).balance(&client_addr);
        assert_eq!(client_balance_after - client_balance_before, 4_000_i128);

        // Verify event was emitted
        let events = contract_events(&env, &contract_id);
        let found = events
            .iter()
            .any(|(_, t, _)| has_topic_symbol(&env, &t, soroban_sdk::symbol_short!("prt_can")));
        assert!(found, "partial cancellation event not emitted");

        // Verify escrow is still active
        let escrow = client.get_escrow(&escrow_id);
        assert_eq!(
            escrow.status,
            crate::EscrowStatus::Active,
            "Escrow should remain active after partial cancel"
        );
        assert_eq!(escrow.remaining_balance, 6_000_i128);
    }

    // Test 2: Partial cancel with no unallocated balance
    #[test]
    fn test_partial_cancel_no_unallocated_balance() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        // Create escrow with 10,000 tokens
        let brief_hash = BytesN::from_array(&env, &[1; 32]);
        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &10_000_i128,
            &brief_hash,
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        // Add milestones totaling exactly 10,000 tokens (no unallocated)
        let m1_hash = BytesN::from_array(&env, &[2; 32]);
        let m1_title = String::from_str(&env, "Milestone 1");
        client.add_milestone(&client_addr, &escrow_id, &m1_title, &m1_hash, &5_000_i128);

        let m2_hash = BytesN::from_array(&env, &[3; 32]);
        let m2_title = String::from_str(&env, "Milestone 2");
        client.add_milestone(&client_addr, &escrow_id, &m2_title, &m2_hash, &5_000_i128);

        // Partial cancel - should return 0
        let refunded = client.partial_cancel(&client_addr, &escrow_id);
        assert_eq!(refunded, 0_i128);

        // Verify no tokens were transferred
        let escrow = client.get_escrow(&escrow_id);
        assert_eq!(escrow.remaining_balance, 10_000_i128);
    }

    // Test 3: Partial cancel with auth failure (non-client caller)
    #[test]
    fn test_partial_cancel_auth_failure() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        // Create escrow
        let brief_hash = BytesN::from_array(&env, &[1; 32]);
        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &10_000_i128,
            &brief_hash,
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        // Try to partial cancel as freelancer (should fail)
        let result = client.try_partial_cancel(&freelancer, &escrow_id);
        assert!(
            result.is_err(),
            "Freelancer should not be able to partial cancel"
        );
    }

    // Test 4: Partial cancel on non-active escrow
    #[test]
    fn test_partial_cancel_non_active_escrow() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        // Create escrow
        let brief_hash = BytesN::from_array(&env, &[1; 32]);
        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &10_000_i128,
            &brief_hash,
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        // Cancel the escrow first
        client.cancel_escrow(&client_addr, &escrow_id);

        // Try to partial cancel (should fail because escrow is not active)
        let result = client.try_partial_cancel(&client_addr, &escrow_id);
        assert!(result.is_err(), "Cannot partial cancel non-active escrow");
    }

    // Test 5: Partial cancel with no milestones (full balance unallocated)
    #[test]
    fn test_partial_cancel_no_milestones() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        // Create escrow with no milestones
        let brief_hash = BytesN::from_array(&env, &[1; 32]);
        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &10_000_i128,
            &brief_hash,
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        // Partial cancel - should refund entire balance
        let refunded = client.partial_cancel(&client_addr, &escrow_id);
        assert_eq!(refunded, 10_000_i128);

        // Verify remaining balance is 0
        let escrow = client.get_escrow(&escrow_id);
        assert_eq!(escrow.remaining_balance, 0_i128);
    }
}
