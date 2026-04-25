#[cfg(test)]
#[allow(clippy::module_inception)]
mod pause_tests {
    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, EscrowStatus, MultisigConfig, MS_PENDING,
    };

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }
    use soroban_sdk::{testutils::{Address as _, Events}, Address, BytesN, Env, String, Symbol, TryFromVal};

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
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(env, &token_id.address());
        sac.mint(recipient, &amount);
        token_id.address()
    }

    #[test]
    fn test_pause_unpause_admin_only() {
        let (env, admin, _, client) = setup();
        let non_admin = Address::generate(&env);

        // Non-admin cannot pause
        let result = client.try_pause(&non_admin);
        assert!(result.is_err());
        assert!(!client.is_paused());

        // Admin can pause
        client.pause(&admin);
        assert!(client.is_paused());

        // Non-admin cannot unpause
        let result = client.try_unpause(&non_admin);
        assert!(result.is_err());
        assert!(client.is_paused());

        // Admin can unpause
        client.unpause(&admin);
        assert!(!client.is_paused());
    }

    #[test]
    fn test_create_escrow_fails_when_paused() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1030);

        client.pause(&admin);

        let result = client.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "Should fail with ContractPaused error"
        );
    }

    #[test]
    fn test_add_milestone_fails_when_paused() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1030);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &1000,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.pause(&admin);

        let result = client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Test"),
            &BytesN::from_array(&env, &[2; 32]),
            &500,
        );

        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "Should fail with ContractPaused error"
        );
    }

    #[test]
    fn test_mutations_blocked_when_paused() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_addr = register_token(&env, &admin, &client_addr, 1060);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token_addr,
            &1000,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Test"),
            &BytesN::from_array(&env, &[2; 32]),
            &1000,
        );

        client.pause(&admin);

        // submit_milestone must be blocked
        let result = client.try_submit_milestone(&freelancer, &escrow_id, &mid);
        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "submit_milestone should fail with ContractPaused"
        );

        // approve_milestone must be blocked
        let result = client.try_approve_milestone(&client_addr, &escrow_id, &mid);
        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "approve_milestone should fail with ContractPaused"
        );

        // View functions must still work
        let milestone = client.get_milestone(&escrow_id, &mid);
        assert_eq!(milestone.status, MS_PENDING);

        let escrow = client.get_escrow(&escrow_id);
        assert_eq!(escrow.status, EscrowStatus::Active);
    }

    #[test]
    fn test_pause_unpause_restores_add_milestone() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_addr = register_token(&env, &admin, &client_addr, 2000);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token_addr,
            &1000,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.pause(&admin);
        assert!(client.is_paused());

        let result = client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Test"),
            &BytesN::from_array(&env, &[2; 32]),
            &500,
        );
        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "Should fail with ContractPaused error"
        );

        client.unpause(&admin);
        assert!(!client.is_paused());

        client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Test2"),
            &BytesN::from_array(&env, &[3; 32]),
            &500,
        );

        let events = env.events().all();
        let mut has_paused = false;
        let mut has_unpaused = false;

        for event in events.iter() {
            let topics = event.1;
            if topics.len() > 0 {
                if let Ok(sym) = Symbol::try_from_val(&env, &topics.get_unchecked(0)) {
                    if sym == soroban_sdk::symbol_short!("paused") {
                        has_paused = true;
                    } else if sym == soroban_sdk::symbol_short!("unpaused") {
                        has_unpaused = true;
                    }
                }
            }
        }

        assert!(has_paused, "paused event must be emitted");
        assert!(has_unpaused, "unpaused event must be emitted");
    }
}
