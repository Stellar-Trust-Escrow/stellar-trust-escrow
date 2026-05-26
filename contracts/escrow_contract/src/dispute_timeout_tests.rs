#[cfg(test)]
#[allow(clippy::module_inception)]
mod dispute_timeout_tests {
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token, Address, BytesN, Env,
    };

    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        token::StellarAssetClient::new(env, &sac.address()).mint(recipient, &amount);
        sac.address()
    }

    #[test]
    fn test_raise_dispute_records_start_ledger() {
        let (env, admin, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1060);

        env.ledger().with_mut(|l| {
            l.timestamp = 1_000;
            l.sequence_number = 25;
        });

        let escrow_id = client.create_escrow_with_dispute_timeout(
            &client_addr,
            &freelancer,
            &token,
            &1000,
            &BytesN::from_array(&env, &[7; 32]),
            &None,
            &None,
            &None,
            &Some(5),
            &None,
            &no_multisig(&env),
        );

        client.raise_dispute(&client_addr, &escrow_id, &None);
        let meta = client.get_escrow_meta(&escrow_id);
        assert_eq!(meta.dispute_timeout, Some(5));
        assert_eq!(meta.dispute_start_ledger, Some(25));
    }

    #[test]
    fn test_claim_dispute_timeout_blocks_early_and_succeeds_after_timeout() {
        let (env, admin, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1060);
        let token_client = token::Client::new(&env, &token);

        env.ledger().with_mut(|l| {
            l.timestamp = 1_000;
            l.sequence_number = 50;
        });

        let escrow_id = client.create_escrow_with_dispute_timeout(
            &client_addr,
            &freelancer,
            &token,
            &1000,
            &BytesN::from_array(&env, &[8; 32]),
            &None,
            &None,
            &None,
            &Some(4),
            &None,
            &no_multisig(&env),
        );

        client.raise_dispute(&freelancer, &escrow_id, &None);

        env.ledger().with_mut(|l| l.sequence_number = 53);
        let early = client.try_claim_dispute_timeout(&client_addr, &escrow_id);
        assert!(matches!(early, Err(Ok(EscrowError::LockTimeNotExpired))));

        env.ledger().with_mut(|l| l.sequence_number = 54);
        client.claim_dispute_timeout(&client_addr, &escrow_id);

        let meta = client.get_escrow_meta(&escrow_id);
        assert_eq!(meta.remaining_balance, 0);
        assert_eq!(token_client.balance(&client_addr), 500);
        assert_eq!(token_client.balance(&freelancer), 500);
    }
}