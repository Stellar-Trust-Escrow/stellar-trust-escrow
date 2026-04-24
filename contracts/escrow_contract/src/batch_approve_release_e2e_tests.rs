#[cfg(test)]
#[allow(clippy::module_inception)]
mod batch_approve_release_e2e_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowStatus, MultisigConfig};
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
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, contract_id, client)
    }

    fn has_topic_symbol(env: &Env, topics: &soroban_sdk::Vec<Val>, expected: Symbol) -> bool {
        topics
            .get(0)
            .map(|v| Symbol::try_from_val(env, &v).expect("symbol") == expected)
            .unwrap_or(false)
    }

    /// Full lifecycle with timelock:
    ///   create escrow → add 3 milestones → start_timelock → submit all →
    ///   batch_approve (milestones become MS_APPROVED, no transfer yet) →
    ///   advance ledger past timelock → batch_release_funds →
    ///   verify remaining_balance == 0, status == Completed, esc_done once,
    ///   freelancer balance == total_amount.
    #[test]
    fn test_batch_approve_and_release_e2e() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        // Mint enough: total_amount + 30 (create rent) + 3*30 (milestone rent).
        let total_amount: i128 = 300;
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = sac.address();
        token::StellarAssetClient::new(&env, &token_addr)
            .mint(&client_addr, &(total_amount + 30 + 90));

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

        // Add 3 milestones of 100 each.
        let milestone_ids = soroban_sdk::Vec::from_array(
            &env,
            [
                client.add_milestone(&client_addr, &escrow_id, &String::from_str(&env, "M1"), &BytesN::from_array(&env, &[1; 32]), &100),
                client.add_milestone(&client_addr, &escrow_id, &String::from_str(&env, "M2"), &BytesN::from_array(&env, &[2; 32]), &100),
                client.add_milestone(&client_addr, &escrow_id, &String::from_str(&env, "M3"), &BytesN::from_array(&env, &[3; 32]), &100),
            ],
        );

        // Start a short timelock (1 second) so batch_approve leaves milestones MS_APPROVED.
        client.start_timelock(&client_addr, &escrow_id, &1_u64);

        // Freelancer submits all milestones.
        for i in 0..milestone_ids.len() {
            client.submit_milestone(&freelancer, &escrow_id, &milestone_ids.get(i).unwrap());
        }

        // Client batch-approves — timelock active, so milestones become MS_APPROVED, no transfer.
        client.batch_approve_milestones(&client_addr, &escrow_id, &milestone_ids);

        // Freelancer has received nothing yet.
        assert_eq!(
            token::Client::new(&env, &token_addr).balance(&freelancer),
            0,
            "no funds released before timelock expires"
        );

        // Advance ledger past the timelock.
        env.ledger().set_timestamp(env.ledger().timestamp() + 2);

        // Admin batch-releases all approved milestones.
        client.batch_release_funds(&admin, &escrow_id, &milestone_ids);

        // Verify escrow state.
        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.remaining_balance, 0, "remaining_balance must be 0");
        assert_eq!(state.status, EscrowStatus::Completed, "status must be Completed");

        // Verify freelancer received total_amount.
        assert_eq!(
            token::Client::new(&env, &token_addr).balance(&freelancer),
            total_amount,
            "freelancer balance must equal total_amount"
        );

        // Verify esc_done emitted exactly once.
        let esc_done_count = env
            .events()
            .all()
            .iter()
            .filter(|(addr, topics, _)| {
                *addr == contract_id
                    && has_topic_symbol(&env, topics, symbol_short!("esc_done"))
            })
            .count();
        assert_eq!(esc_done_count, 1, "esc_done must be emitted exactly once");
    }
}
