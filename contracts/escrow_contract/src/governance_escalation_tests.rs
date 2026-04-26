//! Tests for escalate_dispute_to_governance functionality (Issue #706)

#[cfg(test)]
mod governance_escalation_tests {
    use soroban_sdk::{
        testutils::{Address as _},
        token, Address, BytesN, Env,
    };

    use crate::{EscrowContract, EscrowContractClient, EscrowStatus, MultisigConfig};

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

    // Test 1: Set and get governance contract address
    #[test]
    fn test_set_and_get_governance_contract() {
        let (env, admin, _contract_id, client) = setup();
        let governance_contract = Address::generate(&env);

        // Initially not set
        assert!(client.get_governance_contract().is_none());

        // Admin sets it
        client.set_governance_contract(&admin, &governance_contract);

        // Verify it's set
        let retrieved = client.get_governance_contract();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap(), governance_contract);
    }

    // Test 2: Escalate dispute fails when escrow is not disputed
    #[test]
    fn test_escalate_fails_when_not_disputed() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);
        let governance_contract = Address::generate(&env);

        // Set governance contract
        client.set_governance_contract(&admin, &governance_contract);

        // Create escrow (active, not disputed)
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

        // Try to escalate (should fail because not disputed)
        let result = client.try_escalate_dispute_to_governance(&client_addr, &escrow_id);
        assert!(result.is_err(), "Should fail when escrow is not disputed");
    }

    // Test 3: Escalate dispute fails when escrow is below threshold
    #[test]
    fn test_escalate_fails_when_below_threshold() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1_000);
        let governance_contract = Address::generate(&env);

        // Set governance contract
        client.set_governance_contract(&admin, &governance_contract);

        // Create small escrow (below HIGH_VALUE_THRESHOLD)
        let brief_hash = BytesN::from_array(&env, &[1; 32]);
        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &1_000_i128,
            &brief_hash,
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        // Raise dispute
        client.raise_dispute(&client_addr, &escrow_id, &None);

        // Try to escalate (should fail because below threshold)
        let result = client.try_escalate_dispute_to_governance(&client_addr, &escrow_id);
        assert!(
            result.is_err(),
            "Should fail when escrow is below HIGH_VALUE_THRESHOLD"
        );
    }

    // Test 4: Escalate dispute fails for unauthorized caller
    #[test]
    fn test_escalate_fails_for_unauthorized_caller() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let unauthorized = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 100_000_000_000i128);
        let governance_contract = Address::generate(&env);

        // Set governance contract
        client.set_governance_contract(&admin, &governance_contract);

        // Create high-value escrow
        let brief_hash = BytesN::from_array(&env, &[1; 32]);
        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &100_000_000_000i128, // Above HIGH_VALUE_THRESHOLD
            &brief_hash,
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        // Raise dispute
        client.raise_dispute(&client_addr, &escrow_id, &None);

        // Try to escalate as unauthorized party
        let result =
            client.try_escalate_dispute_to_governance(&unauthorized, &escrow_id);
        assert!(
            result.is_err(),
            "Should fail for unauthorized caller"
        );
    }

    // Test 5: Verify HIGH_VALUE_THRESHOLD constant
    #[test]
    fn test_high_value_threshold_constant() {
        // 1000 XLM = 10,000,000,000 stroops
        assert_eq!(crate::HIGH_VALUE_THRESHOLD, 10_000_000_000i128);
    }
}
