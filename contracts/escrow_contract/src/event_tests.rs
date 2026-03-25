#[cfg(test)]
mod event_tests {
    use soroban_sdk::{
        testutils::{Address as _, Events},
        token, Address, BytesN, Env, IntoVal, String, Val,
    };

    use crate::{EscrowContract, EscrowContractClient};

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
        token::StellarAssetClient::new(env, &sac.address()).mint(recipient, &amount);
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
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("esc_crt").into_val(&env))
            })
            .expect("esc_crt event not emitted");

        // topic[1] == escrow_id
        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));

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
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("mil_add").into_val(&env))
            })
            .expect("mil_add event not emitted");

        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));

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
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("mil_sub").into_val(&env))
            })
            .expect("mil_sub event not emitted");

        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));

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
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("mil_apr").into_val(&env))
            })
            .expect("mil_apr event not emitted");
        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));
        let (emitted_mid, amt): (u32, i128) = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(emitted_mid, mid);
        assert_eq!(amt, 300_i128);

        // funds_rel
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("funds_rel").into_val(&env))
            })
            .expect("funds_rel event not emitted");
        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));
        let (to, released): (Address, i128) = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(to, freelancer);
        assert_eq!(released, 300_i128);

        // esc_done (single milestone → escrow completed)
        let (_, topics, _) = events
            .iter()
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("esc_done").into_val(&env))
            })
            .expect("esc_done event not emitted");
        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));
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
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("mil_rej").into_val(&env))
            })
            .expect("mil_rej event not emitted");

        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));
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
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("esc_can").into_val(&env))
            })
            .expect("esc_can event not emitted");

        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));
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
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("dis_rai").into_val(&env))
            })
            .expect("dis_rai event not emitted");

        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));
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
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("dis_res").into_val(&env))
            })
            .expect("dis_res event not emitted");

        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));
        let (client_amt, freelancer_amt): (i128, i128) =
            soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(client_amt, 200_i128);
        assert_eq!(freelancer_amt, 300_i128);
    }

    // ── reputation_updated ────────────────────────────────────────────────────

    #[test]
    fn test_event_reputation_updated_on_escrow_completion() {
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
        let mid = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Final"),
            &BytesN::from_array(&env, &[2; 32]),
            &1_000_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &mid);
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        let events = contract_events(&env, &contract_id);
        let mut rep_events: soroban_sdk::Vec<(Address, soroban_sdk::Vec<Val>, Val)> =
            soroban_sdk::Vec::new(&env);
        for e in events.iter() {
            if e.1.get(0) == Some(soroban_sdk::symbol_short!("rep_upd").into_val(&env)) {
                rep_events.push_back(e);
            }
        }

        // Both client and freelancer reputation should be updated
        assert!(rep_events.len() >= 2, "Expected at least 2 rep_upd events");

        for (_, _, data) in rep_events.iter() {
            let (addr, score): (Address, u64) = soroban_sdk::FromVal::from_val(&env, data);
            // Score should be > 0 after a completed escrow
            assert!(
                score > 0,
                "Reputation score should increase after completion for {addr:?}"
            );
        }
    }

    // ── contract_paused / contract_unpaused ───────────────────────────────────

    #[test]
    fn test_event_contract_paused_and_unpaused() {
        let (env, admin, contract_id, client) = setup();

        client.pause(&admin);
        let events = contract_events(&env, &contract_id);
        let (_, _, data) = events
            .iter()
            .find(|(_, t, _)| t.get(0) == Some(soroban_sdk::symbol_short!("paused").into_val(&env)))
            .expect("paused event not emitted");
        let emitted_admin: Address = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(emitted_admin, admin);

        client.unpause(&admin);
        let events = contract_events(&env, &contract_id);
        let (_, _, data) = events
            .iter()
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("unpaused").into_val(&env))
            })
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

        // Set lock_time in the past so it's already expired
        let lock_time: u64 = 1_000;
        env.ledger().set_timestamp(2_000);

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
        client.approve_milestone(&client_addr, &escrow_id, &mid);

        let events = contract_events(&env, &contract_id);
        let (_, topics, data) = events
            .iter()
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("lock_exp").into_val(&env))
            })
            .expect("lock_exp event not emitted");

        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));
        let emitted_lock_time: u64 = soroban_sdk::FromVal::from_val(&env, &data);
        assert_eq!(emitted_lock_time, lock_time);
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
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("can_req").into_val(&env))
            })
            .expect("can_req event not emitted");

        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));
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
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("can_exe").into_val(&env))
            })
            .expect("can_exe event not emitted");

        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));
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
            .find(|(_, t, _)| {
                t.get(0) == Some(soroban_sdk::symbol_short!("mil_dis").into_val(&env))
            })
            .expect("mil_dis event not emitted");

        assert_eq!(topics.get(1).unwrap(), escrow_id.into_val(&env));
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
        let mut topic_names: soroban_sdk::Vec<soroban_sdk::Val> = soroban_sdk::Vec::new(&env);
        for e in events.iter() {
            if let Some(t) = e.1.get(0) {
                topic_names.push_back(t);
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
            assert!(
                topic_names.contains(&sym.into_val(&env)),
                "Missing event: {sym:?}"
            );
        }
    }
}
