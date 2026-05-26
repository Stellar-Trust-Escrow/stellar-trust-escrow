//! Tests for MIN_ARBITER_REPUTATION_SCORE check (Issue #704)

#[cfg(test)]
#[allow(clippy::module_inception)]
mod arbiter_reputation_tests {
    use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};

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

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn give_reputation(client: &EscrowContractClient, address: &Address, completed: u32) {
        // Update reputation to give the address a score
        client.update_reputation(address, &true, &false, &1000_i128);
        // Call multiple times to build up score if needed
        for _ in 1..completed {
            client.update_reputation(address, &true, &false, &1000_i128);
        }
    }

    // Test 1: Arbiter with sufficient reputation (should pass)
    #[test]
    fn test_arbiter_with_sufficient_reputation() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let arbiter = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        // Give arbiter sufficient reputation (score >= 100)
        give_reputation(&client, &arbiter, 15);

        // Verify arbiter has sufficient reputation
        let arbiter_rep = client.get_reputation(&arbiter);
        assert!(arbiter_rep.total_score >= 100);

        // Create escrow with this arbiter (should succeed)
        let brief_hash = BytesN::from_array(&env, &[1; 32]);
        let result = client.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &10_000_i128,
            &brief_hash,
            &Some(arbiter),
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert!(
            result.is_ok(),
            "Should accept arbiter with sufficient reputation"
        );
    }

    // Test 2: Arbiter with insufficient reputation (should fail)
    #[test]
    fn test_arbiter_with_insufficient_reputation() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let arbiter = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        // Give arbiter low reputation (score < 100)
        give_reputation(&client, &arbiter, 5);

        // Verify arbiter has insufficient reputation
        let arbiter_rep = client.get_reputation(&arbiter);
        assert!(arbiter_rep.total_score < 100);

        // Create escrow with this arbiter (should fail)
        let brief_hash = BytesN::from_array(&env, &[1; 32]);
        let result = client.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &10_000_i128,
            &brief_hash,
            &Some(arbiter),
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert!(
            result.is_err(),
            "Should reject arbiter with insufficient reputation"
        );
    }

    // Test 3: No arbiter (should pass without reputation check)
    #[test]
    fn test_no_arbiter_bypasses_check() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        // Create escrow without arbiter (should succeed)
        let brief_hash = BytesN::from_array(&env, &[1; 32]);
        let result = client.try_create_escrow(
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
        assert!(result.is_ok(), "Should allow escrow without arbiter");
    }

    // Test 4: Admin can change minimum reputation threshold
    #[test]
    fn test_admin_can_set_min_reputation() {
        let (_env, admin, _contract_id, client) = setup();

        // Check default value
        let default_min = client.get_min_arbiter_reputation();
        assert_eq!(default_min, 100);

        // Admin changes threshold to 200
        client.set_min_arbiter_reputation(&admin, &200);

        // Verify new value
        let new_min = client.get_min_arbiter_reputation();
        assert_eq!(new_min, 200);
    }

    // Test 5: Arbiter passes with old threshold but fails with new higher threshold
    #[test]
    fn test_arbiter_fails_after_threshold_increase() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let arbiter = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        // Give arbiter reputation of 150 (passes default 100 threshold)
        give_reputation(&client, &arbiter, 15);

        // Create escrow with default threshold (should succeed)
        let brief_hash = BytesN::from_array(&env, &[1; 32]);
        let result1 = client.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &10_000_i128,
            &brief_hash,
            &Some(arbiter.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert!(result1.is_ok(), "Should pass with default threshold");

        // Admin increases threshold to 200
        client.set_min_arbiter_reputation(&admin, &200);

        // Create another escrow (should now fail)
        let client_addr2 = Address::generate(&env);
        let token2 = register_token(&env, &admin, &client_addr2, 10_000);
        let result2 = client.try_create_escrow(
            &client_addr2,
            &freelancer,
            &token2,
            &10_000_i128,
            &brief_hash,
            &Some(arbiter),
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert!(result2.is_err(), "Should fail after threshold increase");
    }
}
