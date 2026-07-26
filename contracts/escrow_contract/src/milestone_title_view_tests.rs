#[cfg(test)]
#[allow(clippy::module_inception)]
mod milestone_title_view_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};
    use soroban_sdk::{
        testutils::Address as _, Address, BytesN, Env, String,
    };

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn setup() -> (Env, Address, Address, Address, u64, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(&env, &token_id.address());
        sac.mint(&client_addr, &10_000);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token_id.address(),
            &1000,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        (env, admin, client_addr, freelancer, escrow_id, client)
    }

    #[test]
    fn test_title_stored_and_retrieved() {
        let (env, _admin, client_addr, _freelancer, escrow_id, client) = setup();

        let milestone_id = client.create_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Design mockups"),
            &BytesN::from_array(&env, &[2; 32]),
            &500,
        );

        let title = client.get_milestone_title(&escrow_id, &milestone_id);
        assert_eq!(title, String::from_str(&env, "Design mockups"));
    }

    #[test]
    fn test_too_long_title_rejected() {
        let (env, _admin, client_addr, _freelancer, escrow_id, client) = setup();

        let long_title = String::from_str(&env, &"a".repeat(65));

        let result = client.try_create_milestone(
            &client_addr,
            &escrow_id,
            &long_title,
            &BytesN::from_array(&env, &[2; 32]),
            &500,
        );

        assert!(matches!(
            result,
            Err(Ok(EscrowError::MilestoneTitleTooLong))
        ));
    }

    #[test]
    fn test_empty_title_allowed() {
        let (env, _admin, client_addr, _freelancer, escrow_id, client) = setup();

        let milestone_id = client.create_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, ""),
            &BytesN::from_array(&env, &[2; 32]),
            &500,
        );

        let title = client.get_milestone_title(&escrow_id, &milestone_id);
        assert_eq!(title, String::from_str(&env, ""));
    }
}
