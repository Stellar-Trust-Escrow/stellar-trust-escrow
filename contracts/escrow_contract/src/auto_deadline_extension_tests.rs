#[cfg(test)]
mod auto_deadline_extension_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError, AUTO_DEADLINE_EXTENSION_SECONDS};

    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Address, BytesN, Env,
    };

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
    fn test_auto_deadline_extension_on_submit() {
        let (env, admin, _, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &escrow_client, 1000);

        let total_amount = 1000;
        let brief_hash = BytesN::from_array(&env, &[0u8; 32]);

        // Set deadline to now + 3 days (less than 7 days)
        let now = env.ledger().timestamp();
        let deadline = now + 3 * 24 * 60 * 60; // 3 days

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token,
            &total_amount,
            &brief_hash,
            &None::<Address>,
            &Some(deadline),
            &None::<u64>,
        );

        // Add a milestone
        client.add_milestone(&escrow_client, &escrow_id, &"Test Milestone".into(), &500, &BytesN::from_array(&env, &[1u8; 32]));

        // Submit milestone - should trigger extension
        client.submit_milestone(&freelancer, &escrow_id, &0);

        // Check deadline was extended
        let meta = client.get_escrow_meta(&escrow_id);
        let expected_new_deadline = now + AUTO_DEADLINE_EXTENSION_SECONDS;
        assert_eq!(meta.deadline, Some(expected_new_deadline));
    }

    #[test]
    fn test_no_extension_when_sufficient_time() {
        let (env, admin, _, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &escrow_client, 1000);

        let total_amount = 1000;
        let brief_hash = BytesN::from_array(&env, &[0u8; 32]);

        // Set deadline to now + 10 days (more than 7 days)
        let now = env.ledger().timestamp();
        let deadline = now + 10 * 24 * 60 * 60; // 10 days

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token,
            &total_amount,
            &brief_hash,
            &None::<Address>,
            &Some(deadline),
            &None::<u64>,
        );

        // Add a milestone
        client.add_milestone(&escrow_client, &escrow_id, &"Test Milestone".into(), &500, &BytesN::from_array(&env, &[1u8; 32]));

        // Submit milestone - should not trigger extension
        client.submit_milestone(&freelancer, &escrow_id, &0);

        // Check deadline unchanged
        let meta = client.get_escrow_meta(&escrow_id);
        assert_eq!(meta.deadline, Some(deadline));
    }

    #[test]
    fn test_no_extension_past_lock_time() {
        let (env, admin, _, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &escrow_client, 1000);

        let total_amount = 1000;
        let brief_hash = BytesN::from_array(&env, &[0u8; 32]);

        // Set deadline to now + 3 days, lock_time to now + 5 days
        let now = env.ledger().timestamp();
        let deadline = now + 3 * 24 * 60 * 60; // 3 days
        let lock_time = now + 5 * 24 * 60 * 60; // 5 days

        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token,
            &total_amount,
            &brief_hash,
            &None::<Address>,
            &Some(deadline),
            &Some(lock_time),
        );

        // Add a milestone
        client.add_milestone(&escrow_client, &escrow_id, &"Test Milestone".into(), &500, &BytesN::from_array(&env, &[1u8; 32]));

        // Submit milestone - should not extend because new_deadline > lock_time
        client.submit_milestone(&freelancer, &escrow_id, &0);

        // Check deadline unchanged
        let meta = client.get_escrow_meta(&escrow_id);
        assert_eq!(meta.deadline, Some(deadline));
    }

    #[test]
    fn test_no_extension_for_none_deadline() {
        let (env, admin, _, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &escrow_client, 1000);

        let total_amount = 1000;
        let brief_hash = BytesN::from_array(&env, &[0u8; 32]);

        // No deadline
        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token,
            &total_amount,
            &brief_hash,
            &None::<Address>,
            &None::<u64>,
            &None::<u64>,
        );

        // Add a milestone
        client.add_milestone(&escrow_client, &escrow_id, &"Test Milestone".into(), &500, &BytesN::from_array(&env, &[1u8; 32]));

        // Submit milestone - no extension
        client.submit_milestone(&freelancer, &escrow_id, &0);

        // Check still none
        let meta = client.get_escrow_meta(&escrow_id);
        assert_eq!(meta.deadline, None);
    }
}