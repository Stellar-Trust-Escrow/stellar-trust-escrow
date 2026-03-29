#[cfg(test)]
#[allow(clippy::module_inception)]
mod event_tests {
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger},
        token, Address, BytesN, Env, String, Symbol, TryFromVal, Val,
    };

    use crate::{EscrowContract, EscrowContractClient, EscrowError};

    // ── helpers ───────────────────────────────────────────────────────────────

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
        token::StellarAssetClient::new(env, &sac.address()).mint(recipient, &(amount + 1_000));
        sac.address()
    }

    /// Returns all events emitted by the escrow contract (not the token contract).
    fn contract_events(
        env: &Env,
        contract_id: &Address,
    ) -> soroban_sdk::Vec<(Address, soroban_sdk::Vec<Val>, Val)> {
        let all = env.events().all();
        let mut out = soroban_sdk::Vec::new(env);
        for event in all.iter() {
            if event.0 == *contract_id {
                out.push_back(event);
            }
        }
        out
    }

    fn has_topic_symbol(env: &Env, topics: &soroban_sdk::Vec<Val>, expected: Symbol) -> bool {
        topics
            .get(0)
            .map(|val| {
                Symbol::try_from_val(env, &val).expect("event topic[0] should be a symbol")
                    == expected
            })
            .unwrap_or(false)
    }

    fn topic_u64(env: &Env, topics: &soroban_sdk::Vec<Val>, index: u32) -> u64 {
        let val = topics.get(index).expect("missing event topic");
        soroban_sdk::FromVal::from_val(env, &val)
    }

    // ── escrow_created ────────────────────────────────────────────────────────

    #[test]
    fn test_event_escrow_created_topics_and_payload() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1_000);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &1_000_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
        );

        let events = contract_events(&env, &contract_id);
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("esc_crt")))
            .expect("esc_crt event not emitted");

        // topic[1] == escrow_id
        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);

        // data == (client, freelancer, amount)
        let (c, f, amt): (Address, Address, i128) = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(c, client_addr);
        assert_eq!(f, freelancer);
        assert_eq!(amt, 1_000_i128);
    }

    // ── milestone_added ───────────────────────────────────────────────────────

    #[test]
    fn test_event_milestone_added_topics_and_payload() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 1_000);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &1_000_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
        );

        let milestone_id = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Design"),
            &BytesN::from_array(&env, &[2; 32]),
            &400_i128,
        );

        let events = contract_events(&env, &contract_id);
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("mil_add")))
            .expect("mil_add event not emitted");

        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);

        let (mid, amt): (u32, i128) = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(mid, milestone_id);
        assert_eq!(amt, 400_i128);
    }

    // ── milestone_submitted ───────────────────────────────────────────────────

    #[test]
    fn test_event_milestone_submitted_topics_and_payload() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 500);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
        );
        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Dev"),
            &BytesN::from_array(&env, &[2; 32]),
            &500_i128,
        );

        client.submit_milestone(&freelancer, &escrow_id, &mid);

        let events = contract_events(&env, &contract_id);
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("mil_sub")))
            .expect("mil_sub event not emitted");

        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);

        let (emitted_mid, emitted_freelancer): (u32, Address) =
            soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(emitted_mid, mid);
        assert_eq!(emitted_freelancer, freelancer);
    }

    // ── milestone_approved + funds_released + escrow_completed ───────────────

    #[test]
    fn test_event_milestone_approved_and_funds_released() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 300);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &300_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
        );
        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "QA"),
            &BytesN::from_array(&env, &[2; 32]),
            &300_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        let events = contract_events(&env, &contract_id);

        // mil_apr
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("mil_apr")))
            .expect("mil_apr event not emitted");
        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);
        let (emitted_mid, amt): (u32, i128) = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(emitted_mid, mid);
        assert_eq!(amt, 300_i128);

        // funds_rel
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("funds_rel")))
            .expect("funds_rel event not emitted");
        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);
        let (to, released): (Address, i128) = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(to, freelancer);
        assert_eq!(released, 300_i128);

        // esc_done (single milestone → escrow completed)
        let (_, topics, _) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("esc_done")))
            .expect("esc_done event not emitted");
        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);
    }

    // ── milestone_rejected ────────────────────────────────────────────────────

    #[test]
    fn test_event_milestone_rejected_topics_and_payload() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 600);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &600_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
        );
        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Review"),
            &BytesN::from_array(&env, &[2; 32]),
            &600_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.reject_milestone(&client_addr, &escrow_id, &mid);

        let events = contract_events(&env, &contract_id);
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("mil_rej")))
            .expect("mil_rej event not emitted");

        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);
        let (emitted_mid, emitted_client): (u32, Address) =
            soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(emitted_mid, mid);
        assert_eq!(emitted_client, client_addr);
    }

    // ── escrow_cancelled ──────────────────────────────────────────────────────

    #[test]
    fn test_event_escrow_cancelled_topics_and_payload() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 200);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &200_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
        );
        client.cancel_escrow(&client_addr, &escrow_id);

        let events = contract_events(&env, &contract_id);
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("esc_can")))
            .expect("esc_can event not emitted");

        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);
        let returned: i128 = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(returned, 200_i128);
    }

    // ── dispute_raised ────────────────────────────────────────────────────────

    #[test]
    fn test_event_dispute_raised_topics_and_payload() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 500);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
        );
        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &BytesN::from_array(&env, &[2; 32]),
            &500_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.raise_dispute(&client_addr, &escrow_id, &Some(mid));

        let events = contract_events(&env, &contract_id);
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("dis_rai")))
            .expect("dis_rai event not emitted");

        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);
        let raised_by: Address = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(raised_by, client_addr);
    }

    // ── dispute_resolved ──────────────────────────────────────────────────────

    #[test]
    fn test_event_dispute_resolved_topics_and_payload() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let arbiter = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 500);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &Some(arbiter.clone()),
            &None,
            &None,
        );
        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &BytesN::from_array(&env, &[2; 32]),
            &500_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.raise_dispute(&client_addr, &escrow_id, &Some(mid));
        client.resolve_dispute(&arbiter, &escrow_id, &200_i128, &300_i128);

        let events = contract_events(&env, &contract_id);
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("dis_res")))
            .expect("dis_res event not emitted");

        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);
        let (client_amt, freelancer_amt): (i128, i128) =
            soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(client_amt, 200_i128);
        assert_eq!(freelancer_amt, 300_i128);
    }

    // ── reputation_updated ────────────────────────────────────────────────────

    #[test]
    fn test_event_reputation_updated_topics_and_payload() {
        let (env, _admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        client.update_reputation(&client_addr, &true, &false, &2_000_i128);
        client.update_reputation(&freelancer, &false, &true, &0_i128);

        let events = contract_events(&env, &contract_id);
        let mut rep_events: soroban_sdk::Vec<(Address, soroban_sdk::Vec<Val>, Val)> =
            soroban_sdk::Vec::new(&env);
        for e in events.iter() {
            if has_topic_symbol(&env, &e.1, soroban_sdk::symbol_short!("rep_upd")) {
                rep_events.push_back(e);
            }
        }

        assert!(rep_events.len() >= 2, "Expected at least 2 rep_upd events");

        let mut saw_client = false;
        let mut saw_freelancer = false;
        for (_, _, data) in rep_events.iter() {
            let (addr, score): (Address, u64) = soroban_sdk::FromVal::from_val(&env, &data);
            if addr == client_addr {
                saw_client = true;
                assert_eq!(score, 12);
            } else if addr == freelancer {
                saw_freelancer = true;
                assert_eq!(score, 0);
            }
        }

        assert!(saw_client, "Expected rep_upd event for client");
        assert!(saw_freelancer, "Expected rep_upd event for freelancer");
    }

    // ── contract_paused / contract_unpaused ───────────────────────────────────

    #[test]
    fn test_event_contract_paused_and_unpaused() {
        let (env, admin, contract_id, client) = setup();

        client.pause(&admin);
        let events = contract_events(&env, &contract_id);
        let (_, _, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("paused")))
            .expect("paused event not emitted");
        let emitted_admin: Address = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(emitted_admin, admin);

        client.unpause(&admin);
        let events = contract_events(&env, &contract_id);
        let (_, _, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("unpaused")))
            .expect("unpaused event not emitted");
        let emitted_admin: Address = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(emitted_admin, admin);
    }

    // ── lock_time_expired ─────────────────────────────────────────────────────

    #[test]
    fn test_event_lock_time_expired_on_approve() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 500);

        // Create the escrow with a valid future lock time, then advance past it before approval.
        env.ledger().set_timestamp(1_000);
        let lock_time: u64 = 2_000;

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &Some(lock_time),
        );
        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &BytesN::from_array(&env, &[2; 32]),
            &500_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &mid);
        env.ledger().set_timestamp(3_000);
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        let events = contract_events(&env, &contract_id);
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("lock_exp")))
            .expect("lock_exp event not emitted");

        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);
        let emitted_lock_time: u64 = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(emitted_lock_time, lock_time);
    }

    #[test]
    fn test_timelock_workflow_with_release_funds() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 500);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500_i128,
            &BytesN::from_array(&env, &[3; 32]),
            &None,
            &None,
            &None,
        );

        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &BytesN::from_array(&env, &[4; 32]),
            &500_i128,
        );

        client.start_timelock(&client_addr, &escrow_id, &10);

        let events = contract_events(&env, &contract_id);
        let (_, topics, _) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("tl_start")))
            .expect("tl_start event not emitted");
        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);

        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        // Not yet released due to active timelock
        let freelancer_balance_before = token::Client::new(&env, &token).balance(&freelancer);
        assert_eq!(freelancer_balance_before, 0);

        // Client cannot release before expiry
        let release_err = client
            .try_release_funds(&client_addr, &escrow_id, &mid)
            .unwrap_err();
        assert!(matches!(
            release_err,
            Err(Err(EscrowError::TimelockNotExpired))
        ));

        env.ledger().set_timestamp(env.ledger().timestamp() + 20);

        client.release_funds(&client_addr, &escrow_id, &mid);
        let freelancer_balance_after = token::Client::new(&env, &token).balance(&freelancer);
        assert_eq!(freelancer_balance_after, 500);

        let events = contract_events(&env, &contract_id);
        assert!(events.iter().any(|(_, t, _)| has_topic_symbol(
            &env,
            t,
            soroban_sdk::symbol_short!("tl_rel")
        )));
    }

    #[test]
    fn test_admin_override_release_funds_before_timelock_expires() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 500);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500_i128,
            &BytesN::from_array(&env, &[5; 32]),
            &None,
            &None,
            &None,
        );

        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &BytesN::from_array(&env, &[6; 32]),
            &500_i128,
        );

        client.start_timelock(&client_addr, &escrow_id, &10);
        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        client.release_funds(&admin, &escrow_id, &mid);
        let freelancer_balance_after = token::Client::new(&env, &token).balance(&freelancer);
        assert_eq!(freelancer_balance_after, 500);
    }

    // ── cancellation_requested ────────────────────────────────────────────────

    #[test]
    fn test_event_cancellation_requested_topics_and_payload() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 400);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &400_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
        );
        let reason = String::from_str(&env, "No longer needed");
        client.request_cancellation(&client_addr, &escrow_id, &reason);

        let events = contract_events(&env, &contract_id);
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("can_req")))
            .expect("can_req event not emitted");

        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);
        let (requester, emitted_reason, _deadline): (Address, String, u64) =
            soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(requester, client_addr);
        assert_eq!(emitted_reason, reason);
    }

    // ── cancellation_executed ─────────────────────────────────────────────────

    #[test]
    fn test_event_cancellation_executed_topics_and_payload() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 400);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &400_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
        );
        client.request_cancellation(&client_addr, &escrow_id, &String::from_str(&env, "Done"));

        // Advance ledger past the dispute period
        let ts = env.ledger().timestamp();
        env.ledger().set_timestamp(ts + 200_000);

        client.execute_cancellation(&escrow_id);

        let events = contract_events(&env, &contract_id);
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("can_exe")))
            .expect("can_exe event not emitted");

        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);
        let (client_amt, slash_amt): (i128, i128) = soroban_sdk::FromVal::from_val(&env, &data);
        // Full balance returned (no milestones added), no slash
        assert_eq!(client_amt + slash_amt, 400_i128);
    }

    // ── milestone_disputed ────────────────────────────────────────────────────

    #[test]
    fn test_event_milestone_disputed_topics_and_payload() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 500);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
        );
        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &BytesN::from_array(&env, &[2; 32]),
            &500_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.raise_dispute(&client_addr, &escrow_id, &Some(mid));

        let events = contract_events(&env, &contract_id);
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| has_topic_symbol(&env, t, soroban_sdk::symbol_short!("mil_dis")))
            .expect("mil_dis event not emitted");

        assert_eq!(topic_u64(&env, &topics, 1), escrow_id);
        let (emitted_mid, raised_by): (u32, Address) = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(emitted_mid, mid);
        assert_eq!(raised_by, client_addr);
    }

    // ── event ordering / indexing ─────────────────────────────────────────────

    #[test]
    fn test_event_ordering_full_lifecycle() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 500);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &500_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
        );
        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Work"),
            &BytesN::from_array(&env, &[2; 32]),
            &500_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        let events = contract_events(&env, &contract_id);
        let mut topic_names: soroban_sdk::Vec<Symbol> = soroban_sdk::Vec::new(&env);
        for e in events.iter() {
            if let Some(t) = e.1.get(0) {
                topic_names.push_back(
                    Symbol::try_from_val(&env, &t).expect("event topic[0] should be a symbol"),
                );
            }
        }

        // Verify all expected events are present (order-independent check)
        let expected = [
            soroban_sdk::symbol_short!("esc_crt"),
            soroban_sdk::symbol_short!("mil_add"),
            soroban_sdk::symbol_short!("mil_sub"),
            soroban_sdk::symbol_short!("mil_apr"),
            soroban_sdk::symbol_short!("funds_rel"),
            soroban_sdk::symbol_short!("esc_done"),
        ];
        for sym in expected {
            assert!(topic_names.contains(&sym), "Missing event: {sym:?}");
        }
    }
}
