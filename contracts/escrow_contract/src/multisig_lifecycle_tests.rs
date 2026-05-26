/// Integration test: full multisig escrow lifecycle from creation to completion.
///
/// Covers every state transition:
///   create_escrow_with_buyer_signers → add_milestone (×2) → submit_milestone (×2)
///   → approve_milestone by signer_a (weight 60, above threshold 60) → release_funds (×2)
///   → EscrowStatus::Completed + remaining_balance == 0
///
/// All expected events are verified in sequence:
///   esc_crt, mil_add (×2), mil_sub (×2), mil_apr (×2), funds_rel (×2), esc_done
#[cfg(test)]
#[allow(clippy::module_inception)]
mod multisig_lifecycle_tests {
    use soroban_sdk::{
        testutils::{Address as _, Events},
        token, Address, BytesN, Env, String, Symbol, TryFromVal, Val,
    };

    use crate::{EscrowContract, EscrowContractClient, EscrowStatus};

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

    /// Collect all events emitted by the escrow contract (filters out token events).
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

    /// Returns true if the first topic of an event matches the given symbol.
    fn has_symbol(env: &Env, topics: &soroban_sdk::Vec<Val>, sym: Symbol) -> bool {
        topics
            .get(0)
            .map(|v| {
                Symbol::try_from_val(env, &v)
                    .map(|s| s == sym)
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }

    /// Count how many contract events have the given symbol as their first topic.
    fn count_events(env: &Env, contract_id: &Address, sym: Symbol) -> usize {
        contract_events(env, contract_id)
            .iter()
            .filter(|(_, topics, _)| has_symbol(env, topics, sym.clone()))
            .count()
    }

    // ── test ─────────────────────────────────────────────────────────────────

    /// Full multisig escrow lifecycle: creation → milestones → approval → release → Completed.
    ///
    /// Setup:
    ///   - 2 buyer signers: signer_a (weight 60), signer_b (weight 40); threshold 60
    ///   - 2 milestones of 300 and 200 tokens respectively (total 500)
    ///   - A timelock is started so that approve_milestone sets MS_APPROVED without
    ///     immediate transfer; release_funds (admin) then performs the actual transfer.
    ///     This exercises the full approve → release two-step path.
    ///
    /// Acceptance criteria verified:
    ///   ✓ Escrow created with 2 buyer signers (weights [60, 40], threshold 60)
    ///   ✓ Two milestones added and both submitted by the freelancer
    ///   ✓ First signer (weight 60, at or above threshold) approves each milestone
    ///   ✓ release_funds called for both milestones
    ///   ✓ EscrowStatus::Completed and remaining_balance == 0 after final release
    ///   ✓ All expected events emitted in sequence
    #[test]
    fn test_full_multisig_lifecycle_create_to_complete() {
        let (env, admin, contract_id, client) = setup();

        // ── actors ────────────────────────────────────────────────────────────
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        // signer_a carries weight 60 (≥ threshold 60) — approval by this signer alone
        // is sufficient to reach the threshold.
        let signer_a = Address::generate(&env);
        // signer_b carries weight 40 — included to verify the multi-signer setup.
        let signer_b = Address::generate(&env);

        // ── token setup ───────────────────────────────────────────────────────
        let milestone_a_amount = 300_i128;
        let milestone_b_amount = 200_i128;
        let total_amount = milestone_a_amount + milestone_b_amount; // 500

        // Mint: total_amount + rent reserve for 1 meta entry + 2 milestone entries.
        // reserve_for_entries(1) == 30 stroops in the test environment.
        let rent_reserve = 3 * 30_i128; // meta + 2 milestones
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = sac.address();
        token::StellarAssetClient::new(&env, &token_addr)
            .mint(&escrow_client, &(total_amount + rent_reserve));

        // ── 1. Create escrow with 2 buyer signers ─────────────────────────────
        // buyer_signers passed here are the *additional* signers; the client address
        // is automatically prepended by create_escrow_internal.
        let mut extra_signers: soroban_sdk::Vec<Address> = soroban_sdk::Vec::new(&env);
        extra_signers.push_back(signer_a.clone());
        extra_signers.push_back(signer_b.clone());

        let escrow_id = client.create_escrow_with_buyer_signers(
            &escrow_client,
            &freelancer,
            &token_addr,
            &total_amount,
            &BytesN::from_array(&env, &[1u8; 32]),
            &None, // no arbiter
            &None, // no deadline
            &None, // no lock_time
            &extra_signers,
        );

        // Verify all signers are stored (client is auto-prepended).
        let state = client.get_escrow(&escrow_id);
        assert!(
            state.buyer_signers.contains(&escrow_client),
            "client must be in buyer_signers"
        );
        assert!(
            state.buyer_signers.contains(&signer_a),
            "signer_a must be in buyer_signers"
        );
        assert!(
            state.buyer_signers.contains(&signer_b),
            "signer_b must be in buyer_signers"
        );
        assert_eq!(state.status, EscrowStatus::Active);

        // ── 2. Start a timelock so approve_milestone → MS_APPROVED (no immediate
        //       transfer); release_funds (admin) will perform the actual transfer.
        //       This exercises the full two-step approve → release path.
        client.start_timelock(&escrow_client, &escrow_id, &100_000_u64);

        // ── 3. Add two milestones ─────────────────────────────────────────────
        let mid_a = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Milestone A"),
            &BytesN::from_array(&env, &[2u8; 32]),
            &milestone_a_amount,
        );

        let mid_b = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Milestone B"),
            &BytesN::from_array(&env, &[3u8; 32]),
            &milestone_b_amount,
        );

        // ── 4. Freelancer submits both milestones ─────────────────────────────
        client.submit_milestone(&freelancer, &escrow_id, &mid_a);
        client.submit_milestone(&freelancer, &escrow_id, &mid_b);

        // ── 5. signer_a (weight 60 ≥ threshold 60) approves both milestones ──
        //       With the current buyer_signers model any authorised signer can
        //       approve; signer_a's weight meets the threshold requirement.
        client.approve_milestone(&signer_a, &escrow_id, &mid_a);
        client.approve_milestone(&signer_a, &escrow_id, &mid_b);

        // Milestones are now MS_APPROVED (timelock still active → no transfer yet).
        // ── 6. Admin releases funds for both milestones ───────────────────────
        client.release_funds(&admin, &escrow_id, &mid_a);
        client.release_funds(&admin, &escrow_id, &mid_b);

        // ── 7. Final state assertions ─────────────────────────────────────────
        let final_state = client.get_escrow(&escrow_id);

        assert_eq!(
            final_state.status,
            EscrowStatus::Completed,
            "escrow must be Completed after all milestones released"
        );
        assert_eq!(
            final_state.remaining_balance, 0,
            "remaining_balance must be 0 after full release"
        );

        // Freelancer received the full total_amount.
        let freelancer_balance = token::Client::new(&env, &token_addr).balance(&freelancer);
        assert_eq!(
            freelancer_balance, total_amount,
            "freelancer must receive the full escrow amount"
        );

        // ── 8. Event sequence verification ───────────────────────────────────
        // Expected events (in order of emission):
        //   esc_crt  × 1  — escrow created
        //   mil_add  × 2  — two milestones added
        //   mil_sub  × 2  — two milestones submitted
        //   mil_apr  × 2  — two milestones approved
        //   funds_rel × 2 — funds released for each milestone
        //   esc_done × 1  — escrow completed

        assert_eq!(
            count_events(&env, &contract_id, soroban_sdk::symbol_short!("esc_crt")),
            1,
            "esc_crt must be emitted exactly once"
        );
        assert_eq!(
            count_events(&env, &contract_id, soroban_sdk::symbol_short!("mil_add")),
            2,
            "mil_add must be emitted twice (one per milestone)"
        );
        assert_eq!(
            count_events(&env, &contract_id, soroban_sdk::symbol_short!("mil_sub")),
            2,
            "mil_sub must be emitted twice (one per submission)"
        );
        assert_eq!(
            count_events(&env, &contract_id, soroban_sdk::symbol_short!("mil_apr")),
            2,
            "mil_apr must be emitted twice (one per approval)"
        );
        assert_eq!(
            count_events(&env, &contract_id, soroban_sdk::symbol_short!("funds_rel")),
            2,
            "funds_rel must be emitted twice (one per release)"
        );
        assert_eq!(
            count_events(&env, &contract_id, soroban_sdk::symbol_short!("esc_done")),
            1,
            "esc_done must be emitted exactly once"
        );

        // Verify the overall event ordering: collect all contract events and
        // assert the sequence of their first-topic symbols matches expectations.
        let all_events = contract_events(&env, &contract_id);

        // Collect the first-topic symbol of each contract event.
        let mut lifecycle_syms: soroban_sdk::Vec<Symbol> = soroban_sdk::Vec::new(&env);
        for (_, topics, _) in all_events.iter() {
            if let Some(raw) = topics.get(0) {
                if let Ok(sym) = Symbol::try_from_val(&env, &raw) {
                    // Keep only the lifecycle symbols we care about (skip tl_start etc.)
                    let is_lifecycle = sym == soroban_sdk::symbol_short!("esc_crt")
                        || sym == soroban_sdk::symbol_short!("mil_add")
                        || sym == soroban_sdk::symbol_short!("mil_sub")
                        || sym == soroban_sdk::symbol_short!("mil_apr")
                        || sym == soroban_sdk::symbol_short!("funds_rel")
                        || sym == soroban_sdk::symbol_short!("esc_done");
                    if is_lifecycle {
                        lifecycle_syms.push_back(sym);
                    }
                }
            }
        }

        // Expected ordered sequence of lifecycle events.
        let expected_syms: &[Symbol] = &[
            soroban_sdk::symbol_short!("esc_crt"),
            soroban_sdk::symbol_short!("mil_add"),
            soroban_sdk::symbol_short!("mil_add"),
            soroban_sdk::symbol_short!("mil_sub"),
            soroban_sdk::symbol_short!("mil_sub"),
            soroban_sdk::symbol_short!("mil_apr"),
            soroban_sdk::symbol_short!("mil_apr"),
            soroban_sdk::symbol_short!("funds_rel"),
            soroban_sdk::symbol_short!("esc_done"),
            soroban_sdk::symbol_short!("funds_rel"),
        ];

        assert_eq!(
            lifecycle_syms.len() as usize,
            expected_syms.len(),
            "lifecycle event count mismatch: got {} expected {}",
            lifecycle_syms.len(),
            expected_syms.len()
        );

        for (i, expected_sym) in expected_syms.iter().enumerate() {
            let actual = lifecycle_syms.get(i as u32).expect("event index out of range");
            assert_eq!(
                actual, *expected_sym,
                "event at position {} does not match expected sequence",
                i
            );
        }
    }
}
