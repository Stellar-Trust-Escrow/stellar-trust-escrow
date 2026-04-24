/// Gas profiling tests for EscrowContract.
///
/// Each test prints a structured line:
///   GAS_PROFILE | escrow_contract | <function> | cpu=<n> | mem=<n>
///
/// The `scripts/gas-profile.sh` script collects these lines and writes
/// `gas-report.json`.
#[cfg(test)]
mod gas_profiling {
    extern crate std;
    use std::println;
    use crate::{EscrowContract, EscrowContractClient};
    use soroban_sdk::{testutils::Address as _, token, BytesN, Env, String};

    fn setup() -> (Env, soroban_sdk::Address, soroban_sdk::Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = soroban_sdk::Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, contract_id, client)
    }

    fn make_escrow(
        env: &Env,
        admin: &soroban_sdk::Address,
        client: &EscrowContractClient,
    ) -> (soroban_sdk::Address, soroban_sdk::Address, u64) {
        let escrow_client = soroban_sdk::Address::generate(env);
        let freelancer = soroban_sdk::Address::generate(env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        token::StellarAssetClient::new(env, &token_id).mint(&escrow_client, &10_000_i128);
        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &1_000_i128,
            &BytesN::from_array(env, &[1; 32]),
            &None,
            &None,
            &None,
        );
        (escrow_client, freelancer, escrow_id)
    }

    fn print(function: &str, cpu: u64, mem: u64) {
        println!(
            "GAS_PROFILE | escrow_contract | {} | cpu={} | mem={}",
            function, cpu, mem
        );
    }

    #[test]
    fn profile_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = soroban_sdk::Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        env.budget().reset_default();
        client.initialize(&admin);
        print("initialize", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_create_escrow() {
        let (env, admin, _contract_id, client) = setup();
        let escrow_client = soroban_sdk::Address::generate(&env);
        let freelancer = soroban_sdk::Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        token::StellarAssetClient::new(&env, &token_id).mint(&escrow_client, &10_000_i128);

        env.budget().reset_default();
        client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &1_000_i128,
            &BytesN::from_array(&env, &[2; 32]),
            &None,
            &None,
            &None,
        );
        print("create_escrow", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_add_milestone() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, _freelancer, escrow_id) = make_escrow(&env, &admin, &client);

        env.budget().reset_default();
        client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Design"),
            &BytesN::from_array(&env, &[3; 32]),
            &300_i128,
        );
        print("add_milestone", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_submit_milestone() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, freelancer, escrow_id) = make_escrow(&env, &admin, &client);
        let milestone_id = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Design"),
            &BytesN::from_array(&env, &[3; 32]),
            &300_i128,
        );

        env.budget().reset_default();
        client.submit_milestone(&freelancer, &escrow_id, &milestone_id);
        print("submit_milestone", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_approve_milestone() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, freelancer, escrow_id) = make_escrow(&env, &admin, &client);
        let milestone_id = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Design"),
            &BytesN::from_array(&env, &[3; 32]),
            &300_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &milestone_id);

        env.budget().reset_default();
        client.approve_milestone(&escrow_client, &escrow_id, &milestone_id);
        print("approve_milestone", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_reject_milestone() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, freelancer, escrow_id) = make_escrow(&env, &admin, &client);
        let milestone_id = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Design"),
            &BytesN::from_array(&env, &[3; 32]),
            &300_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &milestone_id);

        env.budget().reset_default();
        client.reject_milestone(&escrow_client, &escrow_id, &milestone_id);
        print("reject_milestone", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_release_funds() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, freelancer, escrow_id) = make_escrow(&env, &admin, &client);
        let milestone_id = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Design"),
            &BytesN::from_array(&env, &[3; 32]),
            &300_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &milestone_id);
        client.approve_milestone(&escrow_client, &escrow_id, &milestone_id);

        env.budget().reset_default();
        client.release_funds(&admin, &escrow_id, &milestone_id);
        print("release_funds", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_cancel_escrow() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, _freelancer, escrow_id) = make_escrow(&env, &admin, &client);

        env.budget().reset_default();
        client.cancel_escrow(&escrow_client, &escrow_id);
        print("cancel_escrow", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_raise_dispute() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, freelancer, escrow_id) = make_escrow(&env, &admin, &client);
        let milestone_id = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Design"),
            &BytesN::from_array(&env, &[3; 32]),
            &300_i128,
        );
        client.submit_milestone(&freelancer, &escrow_id, &milestone_id);

        env.budget().reset_default();
        client.raise_dispute(&escrow_client, &escrow_id, &Some(milestone_id));
        print("raise_dispute", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_get_escrow() {
        let (env, admin, _contract_id, client) = setup();
        let (_escrow_client, _freelancer, escrow_id) = make_escrow(&env, &admin, &client);

        env.budget().reset_default();
        client.get_escrow(&escrow_id);
        print("get_escrow", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_get_reputation() {
        let (env, _admin, _contract_id, client) = setup();
        let user = soroban_sdk::Address::generate(&env);

        env.budget().reset_default();
        client.get_reputation(&user);
        print("get_reputation", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_get_milestone() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, _freelancer, escrow_id) = make_escrow(&env, &admin, &client);
        let milestone_id = client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Design"),
            &BytesN::from_array(&env, &[3; 32]),
            &300_i128,
        );

        env.budget().reset_default();
        client.get_milestone(&escrow_id, &milestone_id);
        print("get_milestone", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_escrow_count() {
        let (env, _admin, _contract_id, client) = setup();

        env.budget().reset_default();
        client.escrow_count();
        print("escrow_count", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_pause_unpause() {
        let (env, admin, _contract_id, client) = setup();

        env.budget().reset_default();
        client.pause(&admin);
        print("pause", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());

        env.budget().reset_default();
        client.unpause(&admin);
        print("unpause", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    #[test]
    fn profile_request_cancellation() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, _freelancer, escrow_id) = make_escrow(&env, &admin, &client);

        env.budget().reset_default();
        client.request_cancellation(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "No longer needed"),
        );
        print("request_cancellation", env.budget().cpu_instruction_cost(), env.budget().memory_bytes_cost());
    }

    // ── Batch operation benchmarks ────────────────────────────────────────────

    /// Benchmark: batch_add_milestones with 5 milestones vs 5 individual add_milestone calls.
    #[test]
    fn profile_batch_add_milestones_5() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, _freelancer, escrow_id) = make_escrow(&env, &admin, &client);

        let titles = soroban_sdk::Vec::from_array(
            &env,
            [
                String::from_str(&env, "M1"),
                String::from_str(&env, "M2"),
                String::from_str(&env, "M3"),
                String::from_str(&env, "M4"),
                String::from_str(&env, "M5"),
            ],
        );
        let hashes = soroban_sdk::Vec::from_array(
            &env,
            [
                BytesN::from_array(&env, &[1; 32]),
                BytesN::from_array(&env, &[2; 32]),
                BytesN::from_array(&env, &[3; 32]),
                BytesN::from_array(&env, &[4; 32]),
                BytesN::from_array(&env, &[5; 32]),
            ],
        );
        let amounts = soroban_sdk::Vec::from_array(&env, [100_i128, 100, 100, 100, 100]);

        env.budget().reset_default();
        client.batch_add_milestones(&escrow_client, &escrow_id, &titles, &hashes, &amounts);
        print(
            "batch_add_milestones_5",
            env.budget().cpu_instruction_cost(),
            env.budget().memory_bytes_cost(),
        );
    }

    /// Benchmark: 5 individual add_milestone calls (baseline for comparison).
    #[test]
    fn profile_add_milestone_x5_sequential() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, _freelancer, escrow_id) = make_escrow(&env, &admin, &client);

        env.budget().reset_default();
        for i in 0_u8..5 {
            let title = String::from_str(&env, "M");
            let hash = BytesN::from_array(&env, &[i; 32]);
            client.add_milestone(&escrow_client, &escrow_id, &title, &hash, &100_i128);
        }
        print(
            "add_milestone_x5_sequential",
            env.budget().cpu_instruction_cost(),
            env.budget().memory_bytes_cost(),
        );
    }

    /// Benchmark: batch_approve_milestones with 3 milestones.
    #[test]
    fn profile_batch_approve_milestones_3() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, freelancer, escrow_id) = make_escrow(&env, &admin, &client);

        // Add 3 milestones and submit them all.
        let mut ids = soroban_sdk::Vec::new(&env);
        for i in 0_u8..3 {
            let mid = client.add_milestone(
                &escrow_client,
                &escrow_id,
                &String::from_str(&env, "M"),
                &BytesN::from_array(&env, &[i; 32]),
                &100_i128,
            );
            client.submit_milestone(&freelancer, &escrow_id, &mid);
            ids.push_back(mid);
        }

        env.budget().reset_default();
        client.batch_approve_milestones(&escrow_client, &escrow_id, &ids);
        print(
            "batch_approve_milestones_3",
            env.budget().cpu_instruction_cost(),
            env.budget().memory_bytes_cost(),
        );
    }

    /// Benchmark: 3 individual approve_milestone calls (baseline for comparison).
    #[test]
    fn profile_approve_milestone_x3_sequential() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, freelancer, escrow_id) = make_escrow(&env, &admin, &client);

        let mut ids = soroban_sdk::Vec::new(&env);
        for i in 0_u8..3 {
            let mid = client.add_milestone(
                &escrow_client,
                &escrow_id,
                &String::from_str(&env, "M"),
                &BytesN::from_array(&env, &[i; 32]),
                &100_i128,
            );
            client.submit_milestone(&freelancer, &escrow_id, &mid);
            ids.push_back(mid);
        }

        env.budget().reset_default();
        for i in 0..ids.len() {
            let mid = ids.get(i).unwrap();
            client.approve_milestone(&escrow_client, &escrow_id, &mid);
        }
        print(
            "approve_milestone_x3_sequential",
            env.budget().cpu_instruction_cost(),
            env.budget().memory_bytes_cost(),
        );
    }

    /// Benchmark: cancel_escrow with 5 milestones (O(1) counter check, no iteration).
    #[test]
    fn profile_cancel_escrow_with_5_milestones() {
        let (env, admin, _contract_id, client) = setup();
        let (escrow_client, _freelancer, escrow_id) = make_escrow(&env, &admin, &client);

        for i in 0_u8..5 {
            client.add_milestone(
                &escrow_client,
                &escrow_id,
                &String::from_str(&env, "M"),
                &BytesN::from_array(&env, &[i; 32]),
                &100_i128,
            );
        }

        env.budget().reset_default();
        client.cancel_escrow(&escrow_client, &escrow_id);
        print(
            "cancel_escrow_5_milestones",
            env.budget().cpu_instruction_cost(),
            env.budget().memory_bytes_cost(),
        );
    }

    /// Benchmark: MAX_MILESTONES capacity boundary check.
    #[test]
    fn profile_add_milestone_at_capacity() {
        use crate::MAX_MILESTONES;
        let (env, admin, _contract_id, client) = setup();

        // Create escrow with enough funds for MAX_MILESTONES milestones.
        let escrow_client = soroban_sdk::Address::generate(&env);
        let freelancer = soroban_sdk::Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        token::StellarAssetClient::new(&env, &token_id)
            .mint(&escrow_client, &1_000_000_i128);
        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id,
            &100_000_i128,
            &BytesN::from_array(&env, &[9; 32]),
            &None,
            &None,
            &None,
        );

        // Fill up to MAX_MILESTONES - 1.
        for i in 0_u32..(MAX_MILESTONES - 1) {
            client.add_milestone(
                &escrow_client,
                &escrow_id,
                &String::from_str(&env, "M"),
                &BytesN::from_array(&env, &[(i as u8); 32]),
                &100_i128,
            );
        }

        // Profile the last allowed add.
        env.budget().reset_default();
        client.add_milestone(
            &escrow_client,
            &escrow_id,
            &String::from_str(&env, "Last"),
            &BytesN::from_array(&env, &[99; 32]),
            &100_i128,
        );
        print(
            "add_milestone_at_capacity",
            env.budget().cpu_instruction_cost(),
            env.budget().memory_bytes_cost(),
        );
    }
}
