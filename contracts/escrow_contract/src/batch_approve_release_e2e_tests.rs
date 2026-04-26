#[cfg(test)]
#[allow(clippy::module_inception)]
mod batch_approve_release_e2e_tests {
    use soroban_sdk::{
        testutils::{Address as _, Events},
        token, Address, BytesN, Env, String, Symbol, TryFromVal,
    };

    use crate::{EscrowContract, EscrowContractClient, EscrowStatus, MultisigConfig};

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

    fn count_events_with_symbol(
        env: &Env,
        contract_id: &Address,
        sym: Symbol,
    ) -> u32 {
        env.events()
            .all()
            .iter()
            .filter(|(addr, topics, _)| {
                *addr == *contract_id
                    && topics
                        .get(0)
                        .map(|v| {
                            Symbol::try_from_val(env, &v)
                                .map(|s| s == sym)
                                .unwrap_or(false)
                        })
                        .unwrap_or(false)
            })
            .count() as u32
    }

    /// End-to-end: create 3-milestone escrow with an active timelock → submit all
    /// → batch_approve_milestones (sets MS_APPROVED, no immediate transfer because
    /// timelock is still active) → batch_release_funds (admin override releases all).
    ///
    /// Verifies:
    ///   - remaining_balance == 0
    ///   - status == EscrowStatus::Completed
    ///   - esc_done emitted exactly once
    ///   - freelancer token balance == total_amount
    #[test]
    fn test_batch_approve_and_release_e2e() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        // Mint: total_amount + rent for create_escrow (30) + 3 milestones (3*30)
        let amounts = [100_i128, 200_i128, 300_i128];
        let total_amount: i128 = amounts.iter().sum(); // 600
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = sac.address();
        token::StellarAssetClient::new(&env, &token_addr).mint(&client_addr, &(total_amount + 30 + 3 * 30));

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token_addr,
            &total_amount,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        // Start a timelock with a long duration so it is NOT expired during
        // batch_approve_milestones — this keeps milestones in MS_APPROVED state
        // (no immediate transfer) and lets batch_release_funds run the release path.
        client.start_timelock(&client_addr, &escrow_id, &100_000_u64);

        // Add 3 milestones individually and collect their IDs.
        let mut milestone_ids: soroban_sdk::Vec<u32> = soroban_sdk::Vec::new(&env);
        for (i, &amt) in amounts.iter().enumerate() {
            let mid = client.add_milestone(
                &client_addr,
                &escrow_id,
                &String::from_str(&env, "M"),
                &BytesN::from_array(&env, &[(i as u8 + 1); 32]),
                &amt,
            );
            milestone_ids.push_back(mid);
        }

        // Freelancer submits all milestones.
        for i in 0..milestone_ids.len() {
            client.submit_milestone(&freelancer, &escrow_id, &milestone_ids.get(i).unwrap());
        }

        // Client batch-approves — milestones become MS_APPROVED (timelock not expired).
        client.batch_approve_milestones(&client_addr, &escrow_id, &milestone_ids);

        // Admin batch-releases all approved milestones (admin bypasses timelock).
        client.batch_release_funds(&admin, &escrow_id, &milestone_ids);

        // ── assertions ────────────────────────────────────────────────────────

        let state = client.get_escrow(&escrow_id);

        assert_eq!(state.remaining_balance, 0, "remaining_balance must be 0 after full release");
        assert_eq!(state.status, EscrowStatus::Completed, "escrow must be Completed");

        // esc_done emitted exactly once.
        let done_count = count_events_with_symbol(
            &env,
            &contract_id,
            soroban_sdk::symbol_short!("esc_done"),
        );
        assert_eq!(done_count, 1, "esc_done must be emitted exactly once");

        // Freelancer received the full total_amount.
        let freelancer_balance = token::Client::new(&env, &token_addr).balance(&freelancer);
        assert_eq!(freelancer_balance, total_amount, "freelancer balance must equal total_amount");
    }
}
