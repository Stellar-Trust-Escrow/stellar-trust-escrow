#[cfg(test)]
#[allow(clippy::module_inception)]
mod pause_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError, EscrowStatus, MilestoneStatus};
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

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
    fn test_existing_operations_work_when_paused() {
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
        );

        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Test"),
            &BytesN::from_array(&env, &[2; 32]),
            &1000,
        );

        client.pause(&admin);

        // Submit milestone should work
        client.submit_milestone(&freelancer, &escrow_id, &mid);
        let milestone = client.get_milestone(&escrow_id, &mid);
        assert_eq!(milestone.status, MilestoneStatus::Submitted);

        // Approve milestone should work
        client.approve_milestone(&client_addr, &escrow_id, &mid);
        let milestone = client.get_milestone(&escrow_id, &mid);
        assert_eq!(milestone.status, MilestoneStatus::Approved);

        let escrow = client.get_escrow(&escrow_id);
        assert_eq!(escrow.status, EscrowStatus::Completed);
    }
}
