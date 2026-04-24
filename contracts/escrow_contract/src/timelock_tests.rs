#[cfg(test)]
#[allow(clippy::module_inception)]
mod timelock_tests {
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

    /// Creates escrow + one milestone, starts a timelock, submits and approves
    /// the milestone (leaving it MS_APPROVED), then returns everything needed
    /// for release_funds tests.
    fn setup_approved_milestone(
        env: &Env,
        admin: &Address,
        client: &EscrowContractClient,
        duration: u64,
    ) -> (Address, Address, Address, u64, u32) {
        let client_addr = Address::generate(env);
        let freelancer = Address::generate(env);
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();
        // Mint: total_amount + 30 (create rent) + 30 (milestone rent).
        token::StellarAssetClient::new(env, &token).mint(&client_addr, &(100 + 30 + 30));

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &100_i128,
            &BytesN::from_array(env, &[1; 32]),
            &None,
            &None,
            &None,
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

        // Start timelock — milestone will become MS_APPROVED (not MS_RELEASED) on approve.
        client.start_timelock(&client_addr, &escrow_id, &duration);

        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        (client_addr, freelancer, token, escrow_id, mid)
    }

    /// release_funds must return TimelockNotExpired when called before the
    /// timelock duration has elapsed (non-admin caller).
    #[test]
    fn test_timelock_prevents_early_release() {
        let (env, admin, _contract_id, client) = setup();
        let duration = 100_u64;
        let (client_addr, _freelancer, _token, escrow_id, mid) =
            setup_approved_milestone(&env, &admin, &client, duration);

        // Still within the timelock window — non-admin caller must be blocked.
        let result = client.try_release_funds(&client_addr, &escrow_id, &mid);
        assert!(
            matches!(result, Err(Ok(EscrowError::TimelockNotExpired))),
            "expected TimelockNotExpired before timelock elapses"
        );
    }

    /// release_funds must succeed once timestamp >= start + duration, and
    /// tl_start / tl_rel events must both be emitted.
    #[test]
    fn test_timelock_allows_release_after_duration() {
        let (env, admin, contract_id, client) = setup();
        let duration = 100_u64;
        let start = env.ledger().timestamp();
        let (_client_addr, freelancer, token, escrow_id, mid) =
            setup_approved_milestone(&env, &admin, &client, duration);

        // Advance past expiry: start + duration + 1.
        env.ledger().set_timestamp(start + duration + 1);

        client.release_funds(&admin, &escrow_id, &mid);

        // Freelancer received the funds.
        assert_eq!(
            token::Client::new(&env, &token).balance(&freelancer),
            100_i128,
            "freelancer must receive funds after timelock expires"
        );

        let all_events = env.events().all();

        // tl_start was emitted.
        assert!(
            all_events.iter().any(|(addr, topics, _)| {
                addr == contract_id
                    && has_topic_symbol(&env, &topics, symbol_short!("tl_start"))
            }),
            "tl_start event must be emitted"
        );

        // tl_rel was emitted by check_timelock_expired inside release_funds.
        assert!(
            all_events.iter().any(|(addr, topics, _)| {
                addr == contract_id
                    && has_topic_symbol(&env, &topics, symbol_short!("tl_rel"))
            }),
            "tl_rel event must be emitted on timelock expiry"
        );
    }

    /// Calling start_timelock a second time must return TimelockAlreadyActive.
    #[test]
    fn test_timelock_already_active_on_second_start() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token = sac.address();
        token::StellarAssetClient::new(&env, &token).mint(&client_addr, &(100 + 30));

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &100_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.start_timelock(&client_addr, &escrow_id, &100_u64);

        let result = client.try_start_timelock(&client_addr, &escrow_id, &100_u64);
        assert!(
            matches!(result, Err(Ok(EscrowError::TimelockAlreadyActive))),
            "expected TimelockAlreadyActive on second start_timelock"
        );
    }
}
