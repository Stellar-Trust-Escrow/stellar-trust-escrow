#[cfg(test)]
mod split_escrow_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError, EscrowStatus};

    use soroban_sdk::{
        testutils::Address as _,
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
    fn test_split_escrow_success() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1000);
        let total_amount = 1000;
        let brief_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);

        // Create escrow
        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &total_amount,
            &brief_hash,
            &None::<Address>,
            &None::<u64>,
            &None::<u64>,
        );

        // Add a milestone to allocate some funds
        client.add_milestone(&client_addr, &escrow_id, &"Milestone 1", &500, &None::<soroban_sdk::Vec<u8>>);

        // Split unallocated balance (500)
        let split_amount = 200;
        let new_brief_hash = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);
        let (child1, child2) = client.split_escrow(&client_addr, &escrow_id, &split_amount, &new_brief_hash);

        // Check child escrows exist
        let child1_meta = client.get_escrow_meta(&child1);
        let child2_meta = client.get_escrow_meta(&child2);

        assert_eq!(child1_meta.total_amount, split_amount);
        assert_eq!(child2_meta.total_amount, 300); // 500 - 200
        assert_eq!(child1_meta.client, client_addr);
        assert_eq!(child1_meta.freelancer, freelancer);
        assert_eq!(child1_meta.token, token);
        assert_eq!(child2_meta.client, client_addr);
        assert_eq!(child2_meta.freelancer, freelancer);
        assert_eq!(child2_meta.token, token);

        // Parent remains active
        let parent_meta = client.get_escrow_meta(&escrow_id);
        assert_eq!(parent_meta.status, EscrowStatus::Active);
        assert_eq!(parent_meta.remaining_balance, 500); // allocated 500, total 1000
    }

    #[test]
    fn test_split_escrow_invalid_amount() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1000);
        let total_amount = 1000;
        let brief_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &total_amount,
            &brief_hash,
            &None::<Address>,
            &None::<u64>,
            &None::<u64>,
        );

        // Try to split more than unallocated
        let result = client.try_split_escrow(&client_addr, &escrow_id, &1500, &brief_hash);
        assert!(result.is_err());
        assert_eq!(result.err().unwrap(), EscrowError::InvalidSplitAmount);

        // Try to split zero
        let result = client.try_split_escrow(&client_addr, &escrow_id, &0, &brief_hash);
        assert!(result.is_err());
        assert_eq!(result.err().unwrap(), EscrowError::InvalidSplitAmount);
    }

    #[test]
    fn test_split_escrow_unauthorized() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let other = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1000);
        let total_amount = 1000;
        let brief_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &total_amount,
            &brief_hash,
            &None::<Address>,
            &None::<u64>,
            &None::<u64>,
        );

        // Try to split with only one auth (simulate by not mocking freelancer auth)
        env.mock_auths(&[soroban_sdk::testutils::MockAuth {
            address: &client_addr,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &client.contract_id,
                fn_name: "split_escrow",
                args: (client_addr.clone(), escrow_id, 100_i128, brief_hash.clone()).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        let result = client.try_split_escrow(&client_addr, &escrow_id, &100, &brief_hash);
        assert!(result.is_err()); // Should fail due to missing freelancer auth
    }
}