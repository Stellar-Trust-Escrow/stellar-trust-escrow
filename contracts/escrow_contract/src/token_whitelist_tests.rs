#[cfg(test)]
mod token_whitelist_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError};

    use soroban_sdk::{
        testutils::Address as _,
        Address, Env,
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
    fn test_add_remove_approved_token_admin_only() {
        let (env, admin, _, client) = setup();
        let non_admin = Address::generate(&env);
        let token = register_token(&env, &admin, &admin, 1000);

        // Non-admin cannot add token
        let result = client.try_add_approved_token(&non_admin, &token);
        assert!(result.is_err());

        // Admin can add token
        client.add_approved_token(&admin, &token);

        // Non-admin cannot remove token
        let result = client.try_remove_approved_token(&non_admin, &token);
        assert!(result.is_err());

        // Admin can remove token
        client.remove_approved_token(&admin, &token);
    }

    #[test]
    fn test_set_token_whitelist_enabled_admin_only() {
        let (env, admin, _, client) = setup();
        let non_admin = Address::generate(&env);

        // Non-admin cannot enable whitelist
        let result = client.try_set_token_whitelist_enabled(&non_admin, &true);
        assert!(result.is_err());

        // Admin can enable
        client.set_token_whitelist_enabled(&admin, &true);

        // Admin can disable
        client.set_token_whitelist_enabled(&admin, &false);
    }

    #[test]
    fn test_whitelist_enforcement() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let approved_token = register_token(&env, &admin, &client_addr, 1000);
        let unapproved_token = register_token(&env, &admin, &client_addr, 1000);
        let amount = 100;
        let brief_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);

        // Enable whitelist
        client.set_token_whitelist_enabled(&admin, &true);

        // Add approved token
        client.add_approved_token(&admin, &approved_token);

        // Create escrow with approved token should succeed
        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &approved_token,
            &amount,
            &brief_hash,
            &None::<Address>,
            &None::<u64>,
            &None::<u64>,
        );
        assert!(escrow_id > 0);

        // Create escrow with unapproved token should fail
        let result = client.try_create_escrow(
            &client_addr,
            &freelancer,
            &unapproved_token,
            &amount,
            &brief_hash,
            &None::<Address>,
            &None::<u64>,
            &None::<u64>,
        );
        assert!(result.is_err());
        assert_eq!(result.err().unwrap(), EscrowError::TokenNotApproved);

        // Disable whitelist
        client.set_token_whitelist_enabled(&admin, &false);

        // Now unapproved token should work
        let escrow_id2 = client.create_escrow(
            &client_addr,
            &freelancer,
            &unapproved_token,
            &amount,
            &brief_hash,
            &None::<Address>,
            &None::<u64>,
            &None::<u64>,
        );
        assert!(escrow_id2 > escrow_id);
    }
}