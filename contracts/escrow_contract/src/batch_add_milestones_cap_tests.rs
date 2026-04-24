#[cfg(test)]
#[allow(clippy::module_inception)]
mod batch_add_milestones_cap_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig, MAX_MILESTONES};
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    /// Creates an escrow with `total_amount` large enough for MAX_MILESTONES milestones.
    /// Mints extra tokens to cover rent: 30 for create_escrow + 30*n for batch_add_milestones.
    fn make_escrow(
        env: &Env,
        admin: &Address,
        client: &EscrowContractClient,
        total_amount: i128,
        extra_rent: i128,
    ) -> (Address, u64) {
        let escrow_client = Address::generate(env);
        let freelancer = Address::generate(env);
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        // 30 = reserve_for_entries(1) charged at create_escrow
        let mint_amount = total_amount + 30 + extra_rent;
        soroban_sdk::token::StellarAssetClient::new(env, &token_id.address())
            .mint(&escrow_client, &mint_amount);
        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_id.address(),
            &total_amount,
            &BytesN::from_array(env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(env),
        );
        (escrow_client, escrow_id)
    }

    /// Builds parallel vecs of `n` milestones each with `amount_each`.
    fn make_batch(
        env: &Env,
        n: u32,
        amount_each: i128,
    ) -> (
        soroban_sdk::Vec<String>,
        soroban_sdk::Vec<BytesN<32>>,
        soroban_sdk::Vec<i128>,
    ) {
        let mut titles = soroban_sdk::Vec::new(env);
        let mut hashes = soroban_sdk::Vec::new(env);
        let mut amounts = soroban_sdk::Vec::new(env);
        for i in 0..n {
            titles.push_back(String::from_str(env, "M"));
            hashes.push_back(BytesN::from_array(env, &[(i % 256) as u8; 32]));
            amounts.push_back(amount_each);
        }
        (titles, hashes, amounts)
    }

    /// Adding exactly MAX_MILESTONES milestones in one batch must succeed and
    /// leave milestone_count == MAX_MILESTONES.
    #[test]
    fn test_batch_add_milestones_at_cap() {
        let (env, admin, client) = setup();
        let n = MAX_MILESTONES;
        let amount_each: i128 = 1;
        let total_amount = i128::from(n) * amount_each;
        // batch_add_milestones charges reserve_for_entries(n) = n * 30
        let extra_rent = i128::from(n) * 30;

        let (escrow_client, escrow_id) = make_escrow(&env, &admin, &client, total_amount, extra_rent);
        let (titles, hashes, amounts) = make_batch(&env, n, amount_each);

        client.batch_add_milestones(&escrow_client, &escrow_id, &titles, &hashes, &amounts);

        let state = client.get_escrow(&escrow_id);
        assert_eq!(
            state.milestones.len(), n,
            "milestone_count must equal MAX_MILESTONES after at-cap batch"
        );
    }

    /// A batch that would push the total past MAX_MILESTONES must return
    /// TooManyMilestones (16) and leave milestone_count unchanged.
    #[test]
    fn test_batch_add_milestones_past_cap() {
        let (env, admin, client) = setup();
        let n = MAX_MILESTONES;
        let amount_each: i128 = 1;
        // Fund enough for n+1 milestones so the cap — not the amount — triggers.
        let total_amount = i128::from(n + 1) * amount_each;
        // Rent for n milestones (the rejected batch doesn't charge rent).
        let extra_rent = i128::from(n) * 30;

        let (escrow_client, escrow_id) = make_escrow(&env, &admin, &client, total_amount, extra_rent);

        // Add n milestones to reach the cap.
        let (titles, hashes, amounts) = make_batch(&env, n, amount_each);
        client.batch_add_milestones(&escrow_client, &escrow_id, &titles, &hashes, &amounts);

        // One more milestone must be rejected.
        let (titles1, hashes1, amounts1) = make_batch(&env, 1, amount_each);
        let result = client.try_batch_add_milestones(
            &escrow_client,
            &escrow_id,
            &titles1,
            &hashes1,
            &amounts1,
        );
        assert!(
            matches!(result, Err(Ok(EscrowError::TooManyMilestones))),
            "expected TooManyMilestones when batch exceeds cap"
        );

        // No partial additions — count must still be MAX_MILESTONES.
        let state = client.get_escrow(&escrow_id);
        assert_eq!(
            state.milestones.len(), n,
            "milestone_count must remain MAX_MILESTONES after rejected batch"
        );
    }
}
