#[cfg(test)]
#[allow(clippy::module_inception)]
mod lock_time_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};
    use soroban_sdk::{
        symbol_short,
        testutils::{Address as _, Events, Ledger},
        token, Address, BytesN, Env, String, Symbol, TryFromVal, Val,
    };

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
        // Start at a non-zero timestamp so lock_time = now + 3600 is valid.
        env.ledger().set_timestamp(1_000);
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, contract_id, client)
    }

    fn has_topic_symbol(env: &Env, topics: &soroban_sdk::Vec<Val>, sym: Symbol) -> bool {
        topics
            .get(0)
            .map(|v| Symbol::try_from_val(env, &v).expect("symbol") == sym)
            .unwrap_or(false)
    }

    fn make_escrow_with_milestone(
        env: &Env,
        admin: &Address,
        client: &EscrowContractClient,
        lock_time: Option<u64>,
    ) -> (Address, Address, Address, u64, u32) {
        let client_addr = Address::generate(env);
        let freelancer = Address::generate(env);
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();
        token::StellarAssetClient::new(env, &token).mint(&client_addr, &(100 + 30 + 30));
        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &100_i128,
            &BytesN::from_array(env, &[1; 32]),
            &None,
            &None,
            &lock_time,
            &None,
            &no_multisig(env),
        );
        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(env, "Work"),
            &BytesN::from_array(env, &[2; 32]),
            &100_i128,
        );
        (client_addr, freelancer, token, escrow_id, mid)
    }

    /// approve_milestone must return LockTimeNotExpired when lock_time is active.
    #[test]
    fn test_lock_time_prevents_early_release() {
        let (env, admin, _contract_id, client) = setup();
        let lock_time = env.ledger().timestamp() + 3600;
        let (client_addr, freelancer, _token, escrow_id, mid) =
            make_escrow_with_milestone(&env, &admin, &client, Some(lock_time));

        client.submit_milestone(&freelancer, &escrow_id, &mid);

        env.ledger().set_timestamp(lock_time - 1);

        let result = client.try_approve_milestone(&client_addr, &escrow_id, &mid);
        assert!(
            matches!(result, Err(Ok(EscrowError::LockTimeNotExpired))),
            "expected LockTimeNotExpired before lock expires"
        );
    }

    /// After lock_time passes, approve_milestone succeeds and emits lock_exp.
    #[test]
    fn test_lock_time_allows_release_after_expiry() {
        let (env, admin, contract_id, client) = setup();
        let lock_time = env.ledger().timestamp() + 3600;
        let (client_addr, freelancer, token, escrow_id, mid) =
            make_escrow_with_milestone(&env, &admin, &client, Some(lock_time));

        client.submit_milestone(&freelancer, &escrow_id, &mid);

        env.ledger().set_timestamp(lock_time + 1);

        client.approve_milestone(&client_addr, &escrow_id, &mid);

        let lock_exp_count = env
            .events()
            .all()
            .iter()
            .filter(|(addr, topics, _)| {
                addr == &contract_id
                    && has_topic_symbol(&env, &topics, symbol_short!("lock_exp"))
            })
            .count();
        assert_eq!(lock_exp_count, 1, "lock_exp must be emitted exactly once");

        assert_eq!(
            token::Client::new(&env, &token).balance(&freelancer),
            100_i128,
            "freelancer must receive funds after lock expires"
        );
    }
}
