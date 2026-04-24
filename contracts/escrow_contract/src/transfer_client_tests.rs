#[cfg(test)]
#[allow(clippy::module_inception)]
mod transfer_client_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn setup() -> (Env, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, client)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(env, &token_id.address());
        sac.mint(recipient, &amount);
        token_id.address()
    }

    fn create_escrow(
        env: &Env,
        client: &EscrowContractClient,
        escrow_client: &Address,
        freelancer: &Address,
        arbiter: Option<Address>,
    ) -> u64 {
        let admin = Address::generate(env);
        let token = register_token(env, &admin, escrow_client, 1000);
        client.create_escrow(
            escrow_client,
            freelancer,
            &token,
            &500,
            &BytesN::from_array(env, &[1; 32]),
            &arbiter,
            &None,
            &None,
            &None,
            &no_multisig(env),
        )
    }

    #[test]
    fn test_transfer_client_role_success() {
        let (env, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let new_client = Address::generate(&env);

        let escrow_id = create_escrow(&env, &client, &escrow_client, &freelancer, None);

        client.transfer_client_role(&escrow_id, &new_client);

        let escrow = client.get_escrow(&escrow_id);
        assert_eq!(escrow.client, new_client);
    }

    #[test]
    fn test_transfer_client_role_rejects_same_as_freelancer() {
        let (env, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let escrow_id = create_escrow(&env, &client, &escrow_client, &freelancer, None);

        let result = client.try_transfer_client_role(&escrow_id, &freelancer);
        assert!(
            matches!(result, Err(Ok(EscrowError::Unauthorized))),
            "Should reject new_client == freelancer"
        );
    }

    #[test]
    fn test_transfer_client_role_rejects_same_as_arbiter() {
        let (env, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let arbiter = Address::generate(&env);

        let escrow_id = create_escrow(
            &env,
            &client,
            &escrow_client,
            &freelancer,
            Some(arbiter.clone()),
        );

        let result = client.try_transfer_client_role(&escrow_id, &arbiter);
        assert!(
            matches!(result, Err(Ok(EscrowError::Unauthorized))),
            "Should reject new_client == arbiter"
        );
    }

    #[test]
    fn test_transfer_client_role_rejects_non_active_escrow() {
        let (env, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let new_client = Address::generate(&env);

        let escrow_id = create_escrow(&env, &client, &escrow_client, &freelancer, None);

        // Cancel the escrow to make it non-Active
        client.cancel_escrow(&escrow_client, &escrow_id);

        let result = client.try_transfer_client_role(&escrow_id, &new_client);
        assert!(
            matches!(result, Err(Ok(EscrowError::EscrowNotActive))),
            "Should reject transfer on non-Active escrow"
        );
    }
}
