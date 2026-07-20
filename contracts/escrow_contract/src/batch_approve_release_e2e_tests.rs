#[cfg(test)]
#[allow(clippy::module_inception)]
mod batch_approve_release_e2e_tests {
    use soroban_sdk::{
        testutils::{Address as _, Events},
        token, Address, BytesN, Env, String, Symbol, TryFromVal, Vec,
    };

    use crate::{
        CreateEscrowRequest, CrossEscrowRelease, EscrowContract, EscrowContractClient, EscrowError,
        EscrowStatus, MilestoneInit, MultisigConfig, MS_SUBMITTED,
    };

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: Vec::new(env),
            weights: Vec::new(env),
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

    fn count_events_with_symbol(env: &Env, contract_id: &Address, sym: Symbol) -> u32 {
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
    #[test]
    fn test_batch_approve_and_release_e2e() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let amounts = [100_i128, 200_i128, 300_i128];
        let total_amount: i128 = amounts.iter().sum();
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = sac.address();
        token::StellarAssetClient::new(&env, &token_addr)
            .mint(&client_addr, &(total_amount + 30 + 3 * 30));

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

        client.start_timelock(&client_addr, &escrow_id, &100_000_u64);

        let mut milestone_ids: Vec<u32> = Vec::new(&env);
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

        for i in 0..milestone_ids.len() {
            client.submit_milestone(&freelancer, &escrow_id, &milestone_ids.get(i).unwrap());
        }

        client.batch_approve_milestones(&client_addr, &escrow_id, &milestone_ids);
        client.batch_release_funds(&admin, &escrow_id, &milestone_ids);

        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.remaining_balance, 0);
        assert_eq!(state.status, EscrowStatus::Completed);

        let done_count =
            count_events_with_symbol(&env, &contract_id, soroban_sdk::symbol_short!("esc_done"));
        assert_eq!(done_count, 1);

        let freelancer_balance = token::Client::new(&env, &token_addr).balance(&freelancer);
        assert_eq!(freelancer_balance, total_amount);
    }

    /// Acceptance Criterion 1:
    /// `batch_approve_milestones` with one invalid milestone index in the middle
    /// → entire call reverts, no milestones change state.
    #[test]
    fn test_batch_approve_milestones_atomic_revert() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = sac.address();
        token::StellarAssetClient::new(&env, &token_addr).mint(&client_addr, &10_000_i128);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token_addr,
            &1000_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let m0 = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "M0"),
            &BytesN::from_array(&env, &[1; 32]),
            &300_i128,
        );
        let _m1 = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "M1"),
            &BytesN::from_array(&env, &[2; 32]),
            &300_i128,
        );
        let m2 = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "M2"),
            &BytesN::from_array(&env, &[3; 32]),
            &400_i128,
        );

        // Submit M0 and M2, but leave M1 in Pending state
        client.submit_milestone(&freelancer, &escrow_id, &m0);
        client.submit_milestone(&freelancer, &escrow_id, &m2);

        // Try batch approving [0, 1, 2] — index 1 is not in Submitted state
        let mut indices = Vec::new(&env);
        indices.push_back(0);
        indices.push_back(1);
        indices.push_back(2);

        let res = client.try_batch_approve_milestones(&client_addr, &escrow_id, &indices);
        assert!(
            res.is_err(),
            "Batch approve must revert when an index is invalid"
        );

        // Verify M0 status remains Submitted (no partial state change)
        let state = client.get_escrow(&escrow_id);
        let milestone_0 = state.milestones.get(0).unwrap();
        assert_eq!(
            milestone_0.status, MS_SUBMITTED,
            "M0 status must remain MS_SUBMITTED after atomic revert"
        );
    }

    /// Acceptance Criterion 2:
    /// `batch_create_escrows` with 11 requests → BatchError::TooLarge.
    #[test]
    fn test_batch_create_escrows_too_large() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = sac.address();
        token::StellarAssetClient::new(&env, &token_addr).mint(&client_addr, &100_000_i128);

        let mut requests = Vec::new(&env);
        for _ in 0..11 {
            requests.push_back(CreateEscrowRequest {
                freelancer: Address::generate(&env),
                token: token_addr.clone(),
                amount: 100_i128,
                deadline: None,
                brief_hash: BytesN::from_array(&env, &[1; 32]),
                milestones: Vec::new(&env),
            });
        }

        let res = client.try_batch_create_escrows(&client_addr, &requests);
        assert!(res.is_err());
        let err = res.err().unwrap().unwrap();
        assert_eq!(err, EscrowError::BatchTooLarge);
    }

    /// Acceptance Criterion 3:
    /// Single transfer covers total of all escrows in `batch_create_escrows`.
    #[test]
    fn test_batch_create_escrows_single_transfer() {
        let (env, admin, contract_id, client) = setup();
        let client_addr = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = sac.address();
        let initial_mint = 50_000_i128;
        token::StellarAssetClient::new(&env, &token_addr).mint(&client_addr, &initial_mint);

        let mut requests = Vec::new(&env);
        let amounts = [1000_i128, 2000_i128, 3000_i128];
        let total_expected: i128 = amounts.iter().sum();

        for &amt in amounts.iter() {
            let mut ms = Vec::new(&env);
            ms.push_back(MilestoneInit {
                title: String::from_str(&env, "Part 1"),
                amount: amt,
            });
            requests.push_back(CreateEscrowRequest {
                freelancer: Address::generate(&env),
                token: token_addr.clone(),
                amount: amt,
                deadline: None,
                brief_hash: BytesN::from_array(&env, &[1; 32]),
                milestones: ms,
            });
        }

        let escrow_ids = client.batch_create_escrows(&client_addr, &requests);
        assert_eq!(escrow_ids.len(), 3);

        // Verify total token balance transfer
        // Each escrow charges a rent reserve: (1 meta entry + 1 milestone entry) * 30 periods = 60 per escrow
        let rent_per_escrow: i128 = 2 * 30;
        let total_rent: i128 = rent_per_escrow * escrow_ids.len() as i128;
        let contract_balance = token::Client::new(&env, &token_addr).balance(&contract_id);
        assert_eq!(
            contract_balance,
            total_expected + total_rent,
            "Contract balance must equal sum of all batch escrows plus rent reserves"
        );

        // Check BatchCompleted event emitted
        let batch_events =
            count_events_with_symbol(&env, &contract_id, soroban_sdk::symbol_short!("bat_cmpl"));
        assert_eq!(batch_events, 1, "BatchCompleted event must be emitted");
    }

    /// Acceptance Criterion 4:
    /// `batch_cross_escrow_release` where caller is not client of one escrow → reverts.
    #[test]
    fn test_batch_cross_escrow_release_unauthorized() {
        let (env, admin, _contract_id, client) = setup();
        let client_a = Address::generate(&env);
        let client_b = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = sac.address();
        token::StellarAssetClient::new(&env, &token_addr).mint(&client_a, &10_000_i128);
        token::StellarAssetClient::new(&env, &token_addr).mint(&client_b, &10_000_i128);

        // Escrow 1 owned by client_a
        let esc_1 = client.create_escrow(
            &client_a,
            &freelancer,
            &token_addr,
            &500_i128,
            &BytesN::from_array(&env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        let m1 = client.add_milestone(
            &client_a,
            &esc_1,
            &String::from_str(&env, "M1"),
            &BytesN::from_array(&env, &[1; 32]),
            &500_i128,
        );
        client.submit_milestone(&freelancer, &esc_1, &m1);

        // Escrow 2 owned by client_b
        let esc_2 = client.create_escrow(
            &client_b,
            &freelancer,
            &token_addr,
            &500_i128,
            &BytesN::from_array(&env, &[2; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );
        let m2 = client.add_milestone(
            &client_b,
            &esc_2,
            &String::from_str(&env, "M2"),
            &BytesN::from_array(&env, &[2; 32]),
            &500_i128,
        );
        client.submit_milestone(&freelancer, &esc_2, &m2);

        // client_a attempts to batch cross-release esc_1 and esc_2 (not client of esc_2)
        let mut releases = Vec::new(&env);
        releases.push_back(CrossEscrowRelease {
            escrow_id: esc_1,
            milestone_index: m1,
        });
        releases.push_back(CrossEscrowRelease {
            escrow_id: esc_2,
            milestone_index: m2,
        });

        let res = client.try_batch_cross_escrow_release(&client_a, &releases);
        assert!(
            res.is_err(),
            "batch_cross_escrow_release must revert if caller is not client of all escrows"
        );
    }

    /// Acceptance Criterion 5:
    /// Gas profile test: batch of 5 must use fewer total instructions than 5 sequential single calls.
    #[test]
    fn test_batch_gas_profiling() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = sac.address();
        token::StellarAssetClient::new(&env, &token_addr).mint(&client_addr, &1_000_000_i128);

        // 1. Measure 5 sequential single create_escrow calls
        env.budget().reset_default();
        for _ in 0..5 {
            client.create_escrow(
                &client_addr,
                &Address::generate(&env),
                &token_addr,
                &1000_i128,
                &BytesN::from_array(&env, &[1; 32]),
                &None,
                &None,
                &None,
                &None,
                &no_multisig(&env),
            );
        }
        let sequential_cpu = env.budget().cpu_instruction_cost();

        // 2. Measure 1 batch_create_escrows call with 5 requests
        let mut requests = Vec::new(&env);
        for _ in 0..5 {
            requests.push_back(CreateEscrowRequest {
                freelancer: Address::generate(&env),
                token: token_addr.clone(),
                amount: 1000_i128,
                deadline: None,
                brief_hash: BytesN::from_array(&env, &[1; 32]),
                milestones: Vec::new(&env),
            });
        }

        env.budget().reset_default();
        client.batch_create_escrows(&client_addr, &requests);
        let batch_cpu = env.budget().cpu_instruction_cost();

        assert!(
            batch_cpu < sequential_cpu,
            "Batch creation ({}) must use fewer CPU instructions than 5 sequential calls ({})",
            batch_cpu,
            sequential_cpu
        );
    }
}
