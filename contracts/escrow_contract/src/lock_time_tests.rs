#[cfg(test)]
#[allow(clippy::module_inception)]
mod lock_time_tests {
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger},
        token, Address, BytesN, Env, String, Symbol, TryFromVal,
    };

    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    /// Creates an escrow with a single milestone of `amount`, minting enough
    /// tokens to cover the escrow amount plus rent (30 + 30 per milestone).
    fn make_escrow_with_lock(
        env: &Env,
        admin: &Address,
        client: &EscrowContractClient,
        amount: i128,
        lock_time: u64,
    ) -> (Address, Address, Address, u64, u32) {
        let client_addr = Address::generate(env);
        let freelancer = Address::generate(env);
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = sac.address();
        token::StellarAssetClient::new(env, &token_addr).mint(&client_addr, &(amount + 30 + 30));

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token_addr,
            &amount,
            &BytesN::from_array(env, &[1; 32]),
            &None,
            &None,
            &Some(lock_time),
            &None,
            &no_multisig(env),
        );
        let milestone_id = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(env, "Work"),
            &BytesN::from_array(env, &[2; 32]),
            &amount,
        );
        client.submit_milestone(&freelancer, &escrow_id, &milestone_id);
        (client_addr, freelancer, token_addr, escrow_id, milestone_id)
    }

    /// release_funds (via approve_milestone) must fail with LockTimeNotExpired
    /// when the ledger timestamp is before the lock_time.
    #[test]
    fn test_lock_time_prevents_early_release() {
        let (env, admin, client) = setup();

        env.ledger().set_timestamp(1_000);
        let lock_time: u64 = 5_000;

        let (client_addr, _freelancer, _token, escrow_id, milestone_id) =
            make_escrow_with_lock(&env, &admin, &client, 500, lock_time);

        // One second before expiry — must be rejected.
        env.ledger().set_timestamp(lock_time - 1);

        let err = client
            .try_approve_milestone(&client_addr, &escrow_id, &milestone_id)
            .unwrap_err();
        assert!(
            matches!(err, Ok(EscrowError::LockTimeNotExpired)),
            "expected LockTimeNotExpired before lock expires, got {err:?}"
        );
    }

    /// approve_milestone must succeed after the ledger timestamp advances past
    /// lock_time, immediately release funds (no separate timelock active), and
    /// emit the lock_exp event.
    #[test]
    fn test_lock_time_allows_release_after_expiry() {
        let (env, admin, client) = setup();

        env.ledger().set_timestamp(1_000);
        let lock_time: u64 = 5_000;

        let (client_addr, freelancer, token_addr, escrow_id, milestone_id) =
            make_escrow_with_lock(&env, &admin, &client, 500, lock_time);

        // One second after expiry — approve must succeed and release funds
        // immediately (no separate timelock active, so approve = instant release).
        env.ledger().set_timestamp(lock_time + 1);

        client.approve_milestone(&client_addr, &escrow_id, &milestone_id);

        // Freelancer received the funds.
        let balance = token::Client::new(&env, &token_addr).balance(&freelancer);
        assert_eq!(balance, 500, "freelancer must receive funds after lock expires");

        // lock_exp event must have been emitted.
        let has_lock_exp = env.events().all().iter().any(|(_, topics, _)| {
            topics
                .get(0)
                .map(|v| {
                    Symbol::try_from_val(&env, &v)
                        .map(|s| s == soroban_sdk::symbol_short!("lock_exp"))
                        .unwrap_or(false)
                })
                .unwrap_or(false)
        });
        assert!(has_lock_exp, "lock_exp event must be emitted after lock expires");
    }
}
