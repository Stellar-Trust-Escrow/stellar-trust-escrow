#[cfg(test)]
mod timelock_enforcement_tests {
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

    /// Shared escrow + milestone setup: create escrow, start timelock, add/submit/approve milestone.
    /// Returns (escrow_id, milestone_id, start_timestamp).
    fn setup_approved_milestone_with_timelock(
        env: &Env,
        admin: &Address,
        client: &EscrowContractClient,
        duration: u64,
    ) -> (u64, u32, u64) {
        let client_addr = Address::generate(env);
        let freelancer = Address::generate(env);
        let amount = 500_i128;
        let token = register_token(env, admin, &client_addr, amount + 60);

        let start_ts: u64 = 1_000;
        env.ledger().with_mut(|l| l.timestamp = start_ts);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &amount,
            &BytesN::from_array(env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(env),
        );

        client.start_timelock(&client_addr, &escrow_id, &duration);

        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(env, "Work"),
            &BytesN::from_array(env, &[2; 32]),
            &amount,
        );
        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        (escrow_id, mid, start_ts)
    }

    /// release_funds must return TimelockNotExpired when called before
    /// start_ledger + duration_ledger elapses.
    #[test]
    fn test_timelock_prevents_early_release() {
        let (env, admin, _contract_id, client) = setup();
        let duration: u64 = 3_600;
        let (escrow_id, mid, start_ts) =
            setup_approved_milestone_with_timelock(&env, &admin, &client, duration);

        // One second before expiry — non-admin caller.
        env.ledger()
            .with_mut(|l| l.timestamp = start_ts + duration - 1);
        let result = client.try_release_funds(&Address::generate(&env), &escrow_id, &mid);
        assert!(
            matches!(result, Err(Ok(EscrowError::TimelockNotExpired))),
            "release_funds must return TimelockNotExpired before timelock elapses"
        );
    }

    /// release_funds must succeed and emit tl_rel when called at or after
    /// start_ledger + duration_ledger.
    #[test]
    fn test_timelock_allows_release_after_duration() {
        let (env, admin, contract_id, client) = setup();
        let duration: u64 = 3_600;
        let (escrow_id, mid, start_ts) =
            setup_approved_milestone_with_timelock(&env, &admin, &client, duration);

        // Advance to exactly expiry + 1.
        env.ledger()
            .with_mut(|l| l.timestamp = start_ts + duration + 1);

        client.release_funds(&Address::generate(&env), &escrow_id, &mid);

        // Verify tl_rel event was emitted.
        let tl_rel_sym = soroban_sdk::symbol_short!("tl_rel");
        let tl_rel_event = env.events().all().iter().find(|(addr, topics, _)| {
            *addr == contract_id
                && topics
                    .get(0)
                    .map(|v| {
                        Symbol::try_from_val(&env, &v)
                            .map(|s| s == tl_rel_sym)
                            .unwrap_or(false)
                    })
                    .unwrap_or(false)
        });
        assert!(tl_rel_event.is_some(), "tl_rel event must be emitted on release");

        // Verify tl_start event was emitted with correct escrow_id.
        let tl_start_sym = soroban_sdk::symbol_short!("tl_start");
        let tl_start_event = env.events().all().iter().find(|(addr, topics, _)| {
            *addr == contract_id
                && topics
                    .get(0)
                    .map(|v| {
                        Symbol::try_from_val(&env, &v)
                            .map(|s| s == tl_start_sym)
                            .unwrap_or(false)
                    })
                    .unwrap_or(false)
        });
        assert!(tl_start_event.is_some(), "tl_start event must be emitted on start_timelock");
    }

    /// start_timelock called a second time on the same escrow must return
    /// TimelockAlreadyActive (52).
    #[test]
    fn test_timelock_already_active_on_second_start() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 500 + 60);

        env.ledger().with_mut(|l| l.timestamp = 1_000);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500_i128,
            &BytesN::from_array(&env, &[5; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.start_timelock(&client_addr, &escrow_id, &3_600_u64);

        let result = client.try_start_timelock(&client_addr, &escrow_id, &3_600_u64);
        assert!(
            matches!(result, Err(Ok(EscrowError::TimelockAlreadyActive))),
            "second start_timelock must return TimelockAlreadyActive"
        );
    }
}
