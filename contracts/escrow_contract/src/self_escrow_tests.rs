#[cfg(test)]
#[allow(clippy::module_inception)]
mod self_escrow_tests {
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
        soroban_sdk::token::StellarAssetClient::new(env, &token_id.address())
            .mint(recipient, &amount);
        token_id.address()
    }

    #[test]
    fn test_create_escrow_rejects_self_escrow() {
        let (env, client) = setup();
        let same = Address::generate(&env);
        let admin = Address::generate(&env);
        let token = register_token(&env, &admin, &same, 1000);

        let result = client.try_create_escrow(
            &same,
            &same,
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
            matches!(result, Err(Ok(EscrowError::Unauthorized))),
            "create_escrow must reject client == freelancer"
        );
    }

    #[test]
    fn test_create_escrow_with_buyer_signers_rejects_self_escrow() {
        let (env, client) = setup();
        let same = Address::generate(&env);
        let admin = Address::generate(&env);
        let token = register_token(&env, &admin, &same, 1000);
        let signers = soroban_sdk::vec![&env, same.clone()];

        let result = client.try_create_escrow_with_buyer_signers(
            &same,
            &same,
            &token,
            &500,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &signers,
        );
        assert!(
            matches!(result, Err(Ok(EscrowError::Unauthorized))),
            "create_escrow_with_buyer_signers must reject client == freelancer"
        );
    }
}
