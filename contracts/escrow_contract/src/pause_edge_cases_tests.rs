#[cfg(test)]
#[allow(clippy::module_inception)]
mod pause_edge_cases_tests {
    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, EscrowStatus, MultisigConfig, MS_PENDING,
    };
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger},
        Address, BytesN, Env, String, Symbol, TryFromVal,
    };

    const UNPAUSE_DELAY: u64 = 172_800;

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
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(env, &token_id.address());
        sac.mint(recipient, &amount);
        token_id.address()
    }

    fn advance_time(env: &Env, seconds: u64) {
        env.ledger().with_mut(|l| l.timestamp += seconds);
    }

    #[test]
    fn test_release_milestone_fails_when_paused() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 2000);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &1000,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Test"),
            &BytesN::from_array(&env, &[2; 32]),
            &1000,
        );

        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.pause(&admin);

        let result = client.try_release_milestone(&client_addr, &escrow_id, &mid, &None);
        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "release_milestone should fail when paused"
        );
    }

    #[test]
    fn test_reject_milestone_fails_when_paused() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 2000);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &1000,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Test"),
            &BytesN::from_array(&env, &[2; 32]),
            &1000,
        );

        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.pause(&admin);

        let result = client.try_reject_milestone(&client_addr, &escrow_id, &mid);
        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "reject_milestone should fail when paused"
        );
    }

    #[test]
    fn test_reclaim_fails_when_paused() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1030);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &1000,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.pause(&admin);

        let result = client.try_reclaim(&client_addr, &escrow_id);
        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "reclaim should fail when paused"
        );
    }

    #[test]
    fn test_cancel_escrow_fails_when_paused() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1030);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &1000,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.pause(&admin);

        let result = client.try_cancel_escrow(&client_addr, &escrow_id);
        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "cancel_escrow should fail when paused"
        );
    }

    #[test]
    fn test_view_functions_work_when_paused() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1030);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &1000,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Test"),
            &BytesN::from_array(&env, &[2; 32]),
            &1000,
        );

        client.pause(&admin);

        let escrow = client.get_escrow(&escrow_id);
        assert_eq!(escrow.status, EscrowStatus::Active);

        let milestone = client.get_milestone(&escrow_id, &mid);
        assert_eq!(milestone.status, MS_PENDING);

        let meta = client.get_escrow_meta(&escrow_id);
        assert_eq!(meta.status, EscrowStatus::Active);
    }

    #[test]
    fn test_pause_can_be_called_multiple_times() {
        let (env, admin, _, client) = setup();

        client.pause(&admin);
        assert!(client.is_paused());

        client.pause(&admin);
        assert!(client.is_paused());
    }

    #[test]
    fn test_unpause_timestamp_is_exactly_48h() {
        let (env, admin, _, client) = setup();

        client.pause(&admin);

        advance_time(&env, 172_799);
        let result = client.try_unpause(&admin);
        assert!(result.is_err(), "Should not allow unpause before exactly 48h");

        advance_time(&env, 1);
        client.unpause(&admin);
        assert!(!client.is_paused());
    }

    #[test]
    fn test_pause_event_is_emitted() {
        let (env, admin, _, client) = setup();

        client.pause(&admin);

        let events = env.events().all();
        let mut found_pause_event = false;

        for event in events.iter() {
            let topics = event.1;
            if !topics.is_empty() {
                if let Ok(sym) = Symbol::try_from_val(&env, &topics.get_unchecked(0)) {
                    if sym == soroban_sdk::symbol_short!("paused") {
                        found_pause_event = true;
                    }
                }
            }
        }

        assert!(found_pause_event, "Pause event must be emitted");
    }

    #[test]
    fn test_unpause_event_is_emitted() {
        let (env, admin, _, client) = setup();

        client.pause(&admin);
        advance_time(&env, UNPAUSE_DELAY);
        client.unpause(&admin);

        let events = env.events().all();
        let mut found_unpause_event = false;

        for event in events.iter() {
            let topics = event.1;
            if !topics.is_empty() {
                if let Ok(sym) = Symbol::try_from_val(&env, &topics.get_unchecked(0)) {
                    if sym == soroban_sdk::symbol_short!("unpaused") {
                        found_unpause_event = true;
                    }
                }
            }
        }

        assert!(found_unpause_event, "Unpause event must be emitted");
    }

    #[test]
    fn test_is_paused_status_persists_across_calls() {
        let (env, admin, _, client) = setup();

        assert!(!client.is_paused());
        client.pause(&admin);
        assert!(client.is_paused());
        assert!(client.is_paused());

        advance_time(&env, UNPAUSE_DELAY);
        client.unpause(&admin);
        assert!(!client.is_paused());
        assert!(!client.is_paused());
    }
}
