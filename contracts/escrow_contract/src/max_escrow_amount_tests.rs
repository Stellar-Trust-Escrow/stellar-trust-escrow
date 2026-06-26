#[cfg(test)]
#[allow(clippy::module_inception)]
mod max_escrow_amount_tests {
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, MultisigConfig, MAX_ESCROW_AMOUNT,
        MIN_ESCROW_AMOUNT,
    };

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        EscrowContractClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let contract_id = env.register_contract(None, EscrowContract);
        let contract = EscrowContractClient::new(&env, &contract_id);
        contract.initialize(&admin);

        (env, admin, client_addr, freelancer, contract)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(env, &token_id.address());
        sac.mint(recipient, &amount);
        token_id.address()
    }

    fn hash32(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[1u8; 32])
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    #[test]
    fn test_create_escrow_at_max_amount_accepted() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, MAX_ESCROW_AMOUNT + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &MAX_ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert!(
            result.is_ok(),
            "expected Ok at MAX_ESCROW_AMOUNT, got {result:?}"
        );
    }

    #[test]
    fn test_create_escrow_above_max_amount_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let over = MAX_ESCROW_AMOUNT + 1;
        let token = register_token(&env, &admin, &client_addr, over + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &over,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert_eq!(result, Err(Ok(EscrowError::E19)));
    }

    #[test]
    fn test_create_escrow_zero_amount_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &0,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert_eq!(result, Err(Ok(EscrowError::E19)));
    }

    #[test]
    fn test_create_escrow_at_min_amount_accepted() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, MIN_ESCROW_AMOUNT + 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &MIN_ESCROW_AMOUNT,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert!(
            result.is_ok(),
            "expected Ok at MIN_ESCROW_AMOUNT, got {result:?}"
        );
    }

    #[test]
    fn test_create_escrow_below_min_amount_rejected() {
        let (env, admin, client_addr, freelancer, contract) = setup();
        let token = register_token(&env, &admin, &client_addr, 1_000_000);

        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &(MIN_ESCROW_AMOUNT - 1),
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert_eq!(result, Err(Ok(EscrowError::E19)));
    }

    #[test]
    fn test_set_escrow_limits_enforced_on_create() {
        let (env, admin, client_addr, freelancer, contract) = setup();

        contract.set_escrow_limits(&admin, &1_000, &5_000);

        let token = register_token(&env, &admin, &client_addr, 10_000_000);

        // below new min
        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert_eq!(result, Err(Ok(EscrowError::E19)));

        // above new max
        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &5_001,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert_eq!(result, Err(Ok(EscrowError::E19)));

        // at new max boundary
        let result = contract.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &5_000,
            &hash32(&env),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        assert!(
            result.is_ok(),
            "expected Ok at new max boundary, got {result:?}"
        );
    }

    #[test]
    fn test_set_escrow_limits_invalid_inputs_rejected() {
        let (_env, admin, _client_addr, _freelancer, contract) = setup();

        // min > max
        assert_eq!(
            contract.try_set_escrow_limits(&admin, &5_000, &1_000),
            Err(Ok(EscrowError::E19))
        );

        // zero min
        assert_eq!(
            contract.try_set_escrow_limits(&admin, &0, &1_000),
            Err(Ok(EscrowError::E19))
        );

        // negative min
        assert_eq!(
            contract.try_set_escrow_limits(&admin, &-1, &1_000),
            Err(Ok(EscrowError::E19))
        );
    }

    #[test]
    fn test_set_escrow_limits_non_admin_rejected() {
        let (_env, _admin, client_addr, _freelancer, contract) = setup();

        let result = contract.try_set_escrow_limits(&client_addr, &1_000, &5_000);
        assert!(result.is_err());
    }
}
