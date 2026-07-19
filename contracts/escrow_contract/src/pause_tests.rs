#[cfg(test)]
#[allow(clippy::module_inception)]
mod pause_tests {
    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, EscrowStatus, MultisigConfig, MS_PENDING,
    };

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger},
        Address, BytesN, Env, String, Symbol, TryFromVal,
    };

    const UNPAUSE_DELAY: u64 = 172_800;

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
    fn test_pause_unpause_admin_only() {
        let (env, admin, _, client) = setup();
        let non_admin = Address::generate(&env);

        // Non-admin cannot pause
        let result = client.try_pause(&non_admin);
        assert!(result.is_err());
        assert!(!client.is_paused());

        // Admin can pause
        client.pause(&admin);
        assert!(client.is_paused());

        // Non-admin cannot unpause
        let result = client.try_unpause(&non_admin);
        assert!(result.is_err());
        assert!(client.is_paused());

        // Admin cannot unpause before 48h
        let result = client.try_unpause(&admin);
        assert!(result.is_err());
        assert!(client.is_paused());

        // Advance time past 48h
        advance_time(&env, UNPAUSE_DELAY);

        // Admin can unpause after 48h
        client.unpause(&admin);
        assert!(!client.is_paused());
    }

    #[test]
    fn test_create_escrow_fails_when_paused() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1030);

        client.pause(&admin);

        let result = client.try_create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "Should fail with ContractPaused error"
        );
    }

    #[test]
    fn test_add_milestone_fails_when_paused() {
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

        let result = client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Test"),
            &BytesN::from_array(&env, &[2; 32]),
            &500,
        );

        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "Should fail with ContractPaused error"
        );
    }

    #[test]
    fn test_mutations_blocked_when_paused() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_addr = register_token(&env, &admin, &client_addr, 1060);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token_addr,
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

        // submit_milestone must be blocked
        let result = client.try_submit_milestone(&freelancer, &escrow_id, &mid);
        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "submit_milestone should fail with ContractPaused"
        );

        // approve_milestone must be blocked
        let result = client.try_approve_milestone(&client_addr, &escrow_id, &mid);
        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "approve_milestone should fail with ContractPaused"
        );

        // View functions must still work
        let milestone = client.get_milestone(&escrow_id, &mid);
        assert_eq!(milestone.status, MS_PENDING);

        let escrow = client.get_escrow(&escrow_id);
        assert_eq!(escrow.status, EscrowStatus::Active);
    }

    #[test]
    fn test_pause_unpause_restores_add_milestone() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token_addr = register_token(&env, &admin, &client_addr, 2000);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token_addr,
            &1000,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.pause(&admin);
        assert!(client.is_paused());

        let result = client.try_add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Test"),
            &BytesN::from_array(&env, &[2; 32]),
            &500,
        );
        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "Should fail with ContractPaused error"
        );

        // Must wait 48h before unpause
        advance_time(&env, UNPAUSE_DELAY);
        client.unpause(&admin);
        assert!(!client.is_paused());

        client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Test2"),
            &BytesN::from_array(&env, &[3; 32]),
            &500,
        );

        let events = env.events().all();
        let mut has_paused = false;
        let mut has_unpaused = false;

        for event in events.iter() {
            let topics = event.1;
            if !topics.is_empty() {
                if let Ok(sym) = Symbol::try_from_val(&env, &topics.get_unchecked(0)) {
                    if sym == soroban_sdk::symbol_short!("paused") {
                        has_paused = true;
                    } else if sym == soroban_sdk::symbol_short!("unpaused") {
                        has_unpaused = true;
                    }
                }
            }
        }

        assert!(has_paused, "paused event must be emitted");
        assert!(has_unpaused, "unpaused event must be emitted");
    }

    // ── 48-hour delay tests ───────────────────────────────────────────────

    #[test]
    fn test_unpause_rejected_before_48h() {
        let (env, admin, _, client) = setup();

        client.pause(&admin);

        // Advance 23 hours — well short of 48h
        advance_time(&env, 82_800);
        let result = client.try_unpause(&admin);
        assert!(
            matches!(result, Err(Ok(EscrowError::UnpauseTooEarly))),
            "Should fail with UnpauseTooEarly before 48h"
        );
        assert!(client.is_paused());

        // Advance another 24 hours (47h total) — still not enough
        advance_time(&env, 86_400);
        let result = client.try_unpause(&admin);
        assert!(
            matches!(result, Err(Ok(EscrowError::UnpauseTooEarly))),
            "Should fail with UnpauseTooEarly at 47h"
        );
        assert!(client.is_paused());
    }

    #[test]
    fn test_unpause_allowed_after_48h() {
        let (env, admin, _, client) = setup();

        client.pause(&admin);
        assert!(client.is_paused());

        // Advance exactly 48h
        advance_time(&env, UNPAUSE_DELAY);
        client.unpause(&admin);
        assert!(!client.is_paused());
    }

    // ── emergency_withdraw tests ──────────────────────────────────────────

    #[test]
    fn test_emergency_withdraw_requires_paused() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1060);

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

        // Contract is NOT paused — emergency_withdraw must fail
        let result = client.try_emergency_withdraw(&admin, &escrow_id);
        assert!(
            matches!(result, Err(Ok(EscrowError::ContractPaused))),
            "emergency_withdraw on unpaused contract should fail with ContractPaused"
        );
    }

    #[test]
    fn test_emergency_withdraw_requires_admin() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let non_admin = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1060);

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

        // Non-admin must fail with Unauthorized (E4)
        let result = client.try_emergency_withdraw(&non_admin, &escrow_id);
        assert!(
            matches!(result, Err(Ok(EscrowError::E4))),
            "Non-admin calling emergency_withdraw should fail with Unauthorized"
        );
    }

    #[test]
    fn test_emergency_withdraw_sends_to_client() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 2060);

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

        // Verify escrow is active with full balance
        let meta = client.get_escrow_meta(&escrow_id);
        assert_eq!(meta.status, EscrowStatus::Active);
        assert_eq!(meta.remaining_balance, 1000);

        client.pause(&admin);
        client.emergency_withdraw(&admin, &escrow_id);

        // Verify: remaining_balance zeroed, status Cancelled
        let meta = client.get_escrow_meta(&escrow_id);
        assert_eq!(meta.remaining_balance, 0);
        assert_eq!(meta.status, EscrowStatus::Cancelled);

        // Verify EmergencyWithdrawal event emitted
        let events = env.events().all();
        let mut found_emergency_withdrawal = false;
        for event in events.iter() {
            let topics = event.1;
            if !topics.is_empty() {
                if let Ok(sym) = Symbol::try_from_val(&env, &topics.get_unchecked(0)) {
                    if sym == soroban_sdk::symbol_short!("emg_wth") {
                        found_emergency_withdrawal = true;
                    }
                }
            }
        }
        assert!(
            found_emergency_withdrawal,
            "EmergencyWithdrawal event must be emitted"
        );
    }

    #[test]
    fn test_emergency_withdraw_fails_for_completed_escrow() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 3060);

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
            &String::from_str(&env, "Deliverable"),
            &BytesN::from_array(&env, &[2; 32]),
            &1000,
        );

        // Complete the escrow normally: submit → approve (releases funds)
        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        let meta = client.get_escrow_meta(&escrow_id);
        assert_eq!(meta.status, EscrowStatus::Completed);

        client.pause(&admin);

        // emergency_withdraw on completed escrow must fail (E9 = not active)
        let result = client.try_emergency_withdraw(&admin, &escrow_id);
        assert!(
            matches!(result, Err(Ok(EscrowError::E9))),
            "emergency_withdraw on completed escrow should fail with E9 (not active)"
        );
    }

    #[test]
    fn test_emergency_withdraw_reentrancy_blocked() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1060);

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

        // Manually set the reentrancy lock to simulate an active guard
        env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .set(&crate::DataKey::ReentrancyLock, &true);
        });

        // emergency_withdraw should panic with E22 (reentrancy detected)
        let result = client.try_emergency_withdraw(&admin, &escrow_id);
        assert!(result.is_err());
    }
}
