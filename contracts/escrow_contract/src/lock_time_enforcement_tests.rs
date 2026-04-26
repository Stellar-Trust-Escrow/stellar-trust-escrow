#[cfg(test)]
#[allow(clippy::module_inception)]
mod lock_time_enforcement_tests {
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger as _},
        token, Address, BytesN, Env, String, Symbol, TryFromVal,
    };

    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};

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
        (env, admin, contract_id, client)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        token::StellarAssetClient::new(env, &sac.address()).mint(recipient, &amount);
        sac.address()
    }

    /// Verifies that release_funds returns LockTimeNotExpired (28) when the
    /// ledger timestamp is before the escrow's lock_time.
    ///
    /// Setup:
    ///   - timestamp = 1_000, lock_time = 5_000
    ///   - A long timelock keeps the milestone in MS_APPROVED after approve_milestone
    ///     (no immediate release), so release_funds can be reached.
    ///   - Timestamp is rewound to lock_time - 1 before calling release_funds.
    /// A long timelock keeps the milestone in MS_APPROVED after approve_milestone
    /// (no immediate release), so release_funds can be reached.
    /// Timestamp is rewound to lock_time - 1 before calling release_funds.
    #[test]
    fn test_lock_time_prevents_early_release() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let amount = 500_i128;
        // Mint: amount + rent for escrow (30) + rent for 1 milestone (30)
        let token = register_token(&env, &admin, &client_addr, amount + 60);

        // t = 1_000; lock_time = 5_000
        let token = register_token(&env, &admin, &client_addr, amount + 60);

        env.ledger().with_mut(|l| l.timestamp = 1_000);
        let lock_time: u64 = 5_000;

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &amount,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &Some(lock_time),
            &None,
            &no_multisig(&env),
        );

        // Start a long timelock so approve_milestone keeps the milestone in
        // MS_APPROVED (no immediate transfer) rather than releasing it.
        // Long timelock keeps milestone in MS_APPROVED (no immediate release).
        client.start_timelock(&client_addr, &escrow_id, &100_000_u64);

        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &BytesN::from_array(&env, &[2; 32]),
            &amount,
        );
        client.submit_milestone(&freelancer, &escrow_id, &mid);

        // Advance past lock_time so approve_milestone succeeds.
        env.ledger().with_mut(|l| l.timestamp = lock_time + 1);
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        // Rewind to before lock_time — release_funds must fail.
        env.ledger().with_mut(|l| l.timestamp = lock_time - 1);
        let result = client.try_release_funds(&admin, &escrow_id, &mid);
        assert!(
            matches!(result, Err(Ok(EscrowError::LockTimeNotExpired))),
            "release_funds must return LockTimeNotExpired before lock_time expires"
        );
    }

    /// Verifies that release_funds succeeds after the ledger timestamp passes
    /// the escrow's lock_time, and that the lock_exp event is emitted.
    ///
    /// Setup:
    ///   - timestamp = 1_000, lock_time = 5_000
    ///   - A long timelock keeps the milestone in MS_APPROVED after approve_milestone.
    ///   - Admin calls release_funds at timestamp = lock_time + 1 (bypasses timelock,
    ///     lock_time is expired) → succeeds and emits lock_exp event.
    #[test]
    fn test_lock_time_allows_release_after_expiry() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let amount = 500_i128;
        let token = register_token(&env, &admin, &client_addr, amount + 60);

        env.ledger().with_mut(|l| l.timestamp = 1_000);
        let lock_time: u64 = 5_000;

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &amount,
            &BytesN::from_array(&env, &[3; 32]),
            &None,
            &None,
            &Some(lock_time),
            &None,
            &no_multisig(&env),
        );

        client.start_timelock(&client_addr, &escrow_id, &100_000_u64);

        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &BytesN::from_array(&env, &[4; 32]),
            &amount,
        );
        client.submit_milestone(&freelancer, &escrow_id, &mid);

        // Advance past lock_time and approve (milestone stays MS_APPROVED due to timelock).
        env.ledger().with_mut(|l| l.timestamp = lock_time + 1);
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        // Admin calls release_funds — bypasses timelock check, lock_time is expired.
        client.release_funds(&admin, &escrow_id, &mid);

        // Verify freelancer received the funds.
        let token_client = token::Client::new(&env, &token);
        assert_eq!(token_client.balance(&freelancer), amount);

        // Verify lock_exp event was emitted with the correct lock_time value.
        let lock_exp_sym = soroban_sdk::symbol_short!("lock_exp");
        let lock_exp_event = env
            .events()
            .all()
            .iter()
            .find(|(addr, topics, _)| {
                *addr == contract_id
                    && topics
                        .get(0)
                        .map(|v| {
                            Symbol::try_from_val(&env, &v)
                                .map(|s| s == lock_exp_sym)
                                .unwrap_or(false)
                        })
                        .unwrap_or(false)
            });
        assert!(lock_exp_event.is_some(), "lock_exp event must be emitted");

        let (_, _, data) = lock_exp_event.unwrap();
        let emitted_lock_time: u64 = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(emitted_lock_time, lock_time, "lock_exp event must carry the lock_time value");
        env.ledger().with_mut(|l| l.timestamp = lock_time + 1);
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        // Admin bypasses timelock check; lock_time is expired — release succeeds.
        client.release_funds(&admin, &escrow_id, &mid);

        assert_eq!(
            token::Client::new(&env, &token).balance(&freelancer),
            amount
        );

        // Verify lock_exp event was emitted with the correct lock_time value.
        let lock_exp_sym = soroban_sdk::symbol_short!("lock_exp");
        let lock_exp_event = env.events().all().iter().find(|(addr, topics, _)| {
            *addr == contract_id
                && topics
                    .get(0)
                    .map(|v| {
                        Symbol::try_from_val(&env, &v)
                            .map(|s| s == lock_exp_sym)
                            .unwrap_or(false)
                    })
                    .unwrap_or(false)
        });
        assert!(lock_exp_event.is_some(), "lock_exp event must be emitted");
        let (_, _, data) = lock_exp_event.unwrap();
        let emitted: u64 = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(emitted, lock_time);
    }
}
