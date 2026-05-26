#[cfg(test)]
mod arbiter_validation_tests {
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
        soroban_sdk::token::StellarAssetClient::new(env, &token_id.address()).mint(recipient, &amount);
        token_id.address()
    }

    #[test]
    fn test_create_escrow_rejects_client_as_arbiter() {
        let (env, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let admin = Address::generate(&env);
        let token = register_token(&env, &admin, &escrow_client, 1000);

        let result = client.try_create_escrow(
            &escrow_client,
            &freelancer,
            &token,
            &500,
            &BytesN::from_array(&env, &[1; 32]),
            &Some(escrow_client.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert!(matches!(result, Err(Ok(EscrowError::Unauthorized))));
    }

    #[test]
    fn test_create_escrow_rejects_freelancer_as_arbiter() {
        let (env, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let admin = Address::generate(&env);
        let token = register_token(&env, &admin, &escrow_client, 1000);

        let result = client.try_create_escrow(
            &escrow_client,
            &freelancer,
            &token,
            &500,
            &BytesN::from_array(&env, &[1; 32]),
            &Some(freelancer.clone()),
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert!(matches!(result, Err(Ok(EscrowError::Unauthorized))));
    }

    #[test]
    fn test_create_escrow_none_arbiter_passes() {
        let (env, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let admin = Address::generate(&env);
        let token = register_token(&env, &admin, &escrow_client, 1000);

        let result = client.try_create_escrow(
            &escrow_client,
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
        assert!(result.is_ok());
    }

    #[test]
    fn test_create_escrow_with_buyer_signers_rejects_client_as_arbiter() {
        let (env, client) = setup();
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let admin = Address::generate(&env);
        let token = register_token(&env, &admin, &escrow_client, 1000);
        let signers = soroban_sdk::vec![&env, escrow_client.clone()];

        let result = client.try_create_escrow_with_buyer_signers(
            &escrow_client,
            &freelancer,
            &token,
            &500,
            &BytesN::from_array(&env, &[1; 32]),
            &Some(escrow_client.clone()),
            &None,
            &None,
            &signers,
        );
        assert!(matches!(result, Err(Ok(EscrowError::Unauthorized))));
    }
}
