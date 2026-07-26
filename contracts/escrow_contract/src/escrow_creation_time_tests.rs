#[cfg(test)]
#[allow(clippy::module_inception)]
mod escrow_creation_time_tests {
    use crate::{EscrowContract, EscrowContractClient, MultisigConfig};
    use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, BytesN, Env};

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn setup() -> (Env, Address, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        (env, client_addr, freelancer, client)
    }

    #[test]
    fn test_creation_time_set_on_creation() {
        let (env, client_addr, freelancer, client) = setup();
        let token_id = env.register_stellar_asset_contract_v2(client_addr.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(&env, &token_id.address());
        sac.mint(&client_addr, &10_000);

        env.ledger().with_mut(|l| {
            l.sequence_number = 42;
            l.timestamp = 1_700_000_000;
        });

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

        let (ledger, timestamp) = client.get_escrow_creation_time(&escrow_id);
        assert_eq!(ledger, 42);
        assert_eq!(timestamp, 1_700_000_000);
    }

    #[test]
    fn test_view_function_returns_correct_pair() {
        let (env, client_addr, freelancer, client) = setup();
        let token_id = env.register_stellar_asset_contract_v2(client_addr.clone());
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

        let (ledger, timestamp) = client.get_escrow_creation_time(&escrow_id);
        assert_eq!(ledger, env.ledger().sequence());
        assert_eq!(timestamp, env.ledger().timestamp());
    }
}
