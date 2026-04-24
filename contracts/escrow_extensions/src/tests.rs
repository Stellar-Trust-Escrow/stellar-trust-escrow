#[cfg(test)]
#[allow(clippy::module_inception)]
mod tests {
    use crate::{
        BatchEscrowParams, EscrowExtensions, EscrowExtensionsClient, ExtError, FeeRecipient,
    };
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, BytesN, Env, Vec,
    };

    // ── Helpers ───────────────────────────────────────────────────────────────

    struct Setup {
        env: Env,
        admin: soroban_sdk::Address,
        token_id: soroban_sdk::Address,
        contract_id: soroban_sdk::Address,
        client: EscrowExtensionsClient<'static>,
    }

    fn setup_with_fee(fee_bps: u32) -> Setup {
        let env = Env::default();
        env.mock_all_auths();

        let admin = soroban_sdk::Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();

        let contract_id = env.register_contract(None, EscrowExtensions);
        let client = EscrowExtensionsClient::new(&env, &contract_id);
        client.initialize(&admin, &fee_bps);

        Setup {
            env,
            admin,
            token_id,
            contract_id,
            client,
        }
    }

    fn mint(
        env: &Env,
        _admin: &soroban_sdk::Address,
        token_id: &soroban_sdk::Address,
        to: &soroban_sdk::Address,
        amount: i128,
    ) {
        token::StellarAssetClient::new(env, token_id).mint(to, &amount);
    }

    fn make_hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    // ── Batch creation ────────────────────────────────────────────────────────

    #[test]
    fn test_batch_creates_multiple_escrows() {
        let s = setup_with_fee(0);
        let client_addr = soroban_sdk::Address::generate(&s.env);
        let fl1 = soroban_sdk::Address::generate(&s.env);
        let fl2 = soroban_sdk::Address::generate(&s.env);

        mint(&s.env, &s.admin, &s.token_id, &client_addr, 3_000);

        let mut params = Vec::new(&s.env);
        params.push_back(BatchEscrowParams {
            freelancer: fl1,
            token: s.token_id.clone(),
            total_amount: 1_000,
            brief_hash: make_hash(&s.env, 1),
            arbiter: None,
            deadline: None,
        });
        params.push_back(BatchEscrowParams {
            freelancer: fl2,
            token: s.token_id.clone(),
            total_amount: 2_000,
            brief_hash: make_hash(&s.env, 2),
            arbiter: None,
            deadline: None,
        });

        let ids = s.client.create_batch(&client_addr, &params);
        assert_eq!(ids.len(), 2);
        assert_eq!(ids.get(0).unwrap(), 0);
        assert_eq!(ids.get(1).unwrap(), 1);
        assert_eq!(s.client.batch_escrow_count(), 2);
    }

    #[test]
    fn test_batch_rejects_empty() {
        let s = setup_with_fee(0);
        let client_addr = soroban_sdk::Address::generate(&s.env);
        let params = Vec::new(&s.env);
        let result = s.client.try_create_batch(&client_addr, &params);
        assert_eq!(result.unwrap_err().unwrap(), ExtError::BatchEmpty);
    }

    #[test]
    fn test_batch_rejects_over_limit() {
        let s = setup_with_fee(0);
        let client_addr = soroban_sdk::Address::generate(&s.env);
        mint(&s.env, &s.admin, &s.token_id, &client_addr, 100_000);

        let mut params = Vec::new(&s.env);
        for i in 0..11_u8 {
            params.push_back(BatchEscrowParams {
                freelancer: soroban_sdk::Address::generate(&s.env),
                token: s.token_id.clone(),
                total_amount: 100,
                brief_hash: make_hash(&s.env, i),
                arbiter: None,
                deadline: None,
            });
        }
        let result = s.client.try_create_batch(&client_addr, &params);
        assert_eq!(result.unwrap_err().unwrap(), ExtError::BatchTooLarge);
    }

    #[test]
    fn test_batch_rejects_zero_amount() {
        let s = setup_with_fee(0);
        let client_addr = soroban_sdk::Address::generate(&s.env);
        let mut params = Vec::new(&s.env);
        params.push_back(BatchEscrowParams {
            freelancer: soroban_sdk::Address::generate(&s.env),
            token: s.token_id.clone(),
            total_amount: 0,
            brief_hash: make_hash(&s.env, 1),
            arbiter: None,
            deadline: None,
        });
        let result = s.client.try_create_batch(&client_addr, &params);
        assert_eq!(result.unwrap_err().unwrap(), ExtError::BatchItemInvalid);
    }

    // ── Protocol fees ─────────────────────────────────────────────────────────

    #[test]
    fn test_fee_collection_calculates_correctly() {
        let s = setup_with_fee(100); // 1 %
        let gross = 10_000_i128;
        let (net, fee) = s.client.collect_fee(&1_u64, &s.token_id, &gross);
        assert_eq!(fee, 100);
        assert_eq!(net, 9_900);
    }

    #[test]
    fn test_zero_fee_returns_gross() {
        let s = setup_with_fee(0);
        let (net, fee) = s.client.collect_fee(&1_u64, &s.token_id, &5_000_i128);
        assert_eq!(fee, 0);
        assert_eq!(net, 5_000);
    }

    #[test]
    fn test_fee_too_high_rejected() {
        let s = setup_with_fee(0);
        let result = s.client.try_set_fee_bps(&s.admin, &201_u32);
        assert_eq!(result.unwrap_err().unwrap(), ExtError::FeeTooHigh);
    }

    #[test]
    fn test_fee_distribution() {
        let s = setup_with_fee(200); // 2 %
        let r1 = soroban_sdk::Address::generate(&s.env);
        let r2 = soroban_sdk::Address::generate(&s.env);

        let mut recipients = Vec::new(&s.env);
        recipients.push_back(FeeRecipient {
            address: r1.clone(),
            share_bps: 7_000,
        });
        recipients.push_back(FeeRecipient {
            address: r2.clone(),
            share_bps: 3_000,
        });
        s.client.set_fee_recipients(&s.admin, &recipients);

        // Collect fees from two releases
        s.client.collect_fee(&1_u64, &s.token_id, &10_000_i128); // fee = 200
        s.client.collect_fee(&2_u64, &s.token_id, &10_000_i128); // fee = 200
                                                                 // Total accumulated = 400

        // Fund the contract so it can distribute
        mint(&s.env, &s.admin, &s.token_id, &s.contract_id, 400);

        let distributed = s.client.distribute_fees(&s.token_id);
        assert_eq!(distributed, 400); // 280 + 120

        let token_client = token::Client::new(&s.env, &s.token_id);
        assert_eq!(token_client.balance(&r1), 280); // 400 * 70%
        assert_eq!(token_client.balance(&r2), 120); // 400 * 30%
    }

    #[test]
    fn test_emergency_withdraw() {
        let s = setup_with_fee(100);
        s.client.collect_fee(&1_u64, &s.token_id, &10_000_i128); // fee = 100
        mint(&s.env, &s.admin, &s.token_id, &s.contract_id, 100);

        let to = soroban_sdk::Address::generate(&s.env);
        let withdrawn = s.client.emergency_withdraw_fees(&s.admin, &s.token_id, &to);
        assert_eq!(withdrawn, 100);

        let token_client = token::Client::new(&s.env, &s.token_id);
        assert_eq!(token_client.balance(&to), 100);
        assert_eq!(s.client.get_fee_balance(&s.token_id), 0);
    }

    // ── Dispute arbitration ───────────────────────────────────────────────────

    #[test]
    fn test_open_dispute_and_vote() {
        let s = setup_with_fee(0);
        s.client.open_dispute(&1_u64);

        let voter1 = soroban_sdk::Address::generate(&s.env);
        let voter2 = soroban_sdk::Address::generate(&s.env);

        // voter1 stakes 100 → weight = 10
        s.client.cast_vote(&voter1, &1_u64, &100_u64, &true);
        // voter2 stakes 25 → weight = 5
        s.client.cast_vote(&voter2, &1_u64, &25_u64, &false);

        let dispute = s.client.get_dispute(&1_u64);
        assert_eq!(dispute.weight_for_client, 10);
        assert_eq!(dispute.weight_for_freelancer, 5);
        assert!(!dispute.resolved);
    }

    #[test]
    fn test_double_vote_rejected() {
        let s = setup_with_fee(0);
        s.client.open_dispute(&2_u64);
        let voter = soroban_sdk::Address::generate(&s.env);
        s.client.cast_vote(&voter, &2_u64, &100_u64, &true);
        let result = s.client.try_cast_vote(&voter, &2_u64, &100_u64, &false);
        assert_eq!(result.unwrap_err().unwrap(), ExtError::AlreadyVoted);
    }

    #[test]
    fn test_resolve_dispute_client_wins() {
        let s = setup_with_fee(0);
        s.client.open_dispute(&3_u64);

        let v1 = soroban_sdk::Address::generate(&s.env);
        let v2 = soroban_sdk::Address::generate(&s.env);
        // client side: weight = 10 + 7 = 17
        s.client.cast_vote(&v1, &3_u64, &100_u64, &true);
        s.client.cast_vote(&v2, &3_u64, &49_u64, &true);
        // freelancer side: weight = 5
        let v3 = soroban_sdk::Address::generate(&s.env);
        s.client.cast_vote(&v3, &3_u64, &25_u64, &false);

        // Advance time past voting window
        s.env.ledger().with_mut(|l| {
            l.timestamp += 604_801;
        });

        let client_wins = s.client.resolve_dispute(&3_u64);
        assert!(client_wins);

        let dispute = s.client.get_dispute(&3_u64);
        assert!(dispute.resolved);
        assert_eq!(dispute.client_wins, Some(true));
    }

    #[test]
    fn test_resolve_before_window_closes_fails() {
        let s = setup_with_fee(0);
        s.client.open_dispute(&4_u64);
        let result = s.client.try_resolve_dispute(&4_u64);
        assert_eq!(result.unwrap_err().unwrap(), ExtError::VotingWindowOpen);
    }

    #[test]
    fn test_no_votes_quorum_not_reached() {
        let s = setup_with_fee(0);
        s.client.open_dispute(&5_u64);
        s.env.ledger().with_mut(|l| {
            l.timestamp += 604_801;
        });
        let result = s.client.try_resolve_dispute(&5_u64);
        assert_eq!(result.unwrap_err().unwrap(), ExtError::QuorumNotReached);
    }

    // ── Upgrade ───────────────────────────────────────────────────────────────

    #[test]
    fn test_queue_and_cancel_upgrade() {
        let s = setup_with_fee(0);
        let hash = BytesN::from_array(&s.env, &[0xAB; 32]);

        let executable_after = s.client.queue_upgrade(&s.admin, &hash);
        assert!(executable_after > s.env.ledger().timestamp());

        let pending = s.client.get_pending_upgrade().unwrap();
        assert_eq!(pending.new_wasm_hash, hash);

        s.client.cancel_upgrade(&s.admin);
        assert!(s.client.get_pending_upgrade().is_none());
    }

    #[test]
    fn test_execute_upgrade_before_delay_fails() {
        let s = setup_with_fee(0);
        let hash = BytesN::from_array(&s.env, &[0xCD; 32]);
        s.client.queue_upgrade(&s.admin, &hash);
        let result = s.client.try_execute_upgrade(&s.admin);
        assert_eq!(
            result.unwrap_err().unwrap(),
            ExtError::UpgradeDelayNotElapsed
        );
    }

    #[test]
    fn test_double_queue_rejected() {
        let s = setup_with_fee(0);
        let hash = BytesN::from_array(&s.env, &[0xEF; 32]);
        s.client.queue_upgrade(&s.admin, &hash);
        let result = s.client.try_queue_upgrade(&s.admin, &hash);
        assert_eq!(
            result.unwrap_err().unwrap(),
            ExtError::UpgradeAlreadyPending
        );
    }

    #[test]
    fn test_isqrt_values() {
        // Verify quadratic voting weights
        assert_eq!(crate::isqrt(0), 0);
        assert_eq!(crate::isqrt(1), 1);
        assert_eq!(crate::isqrt(4), 2);
        assert_eq!(crate::isqrt(9), 3);
        assert_eq!(crate::isqrt(100), 10);
        assert_eq!(crate::isqrt(99), 9);
        assert_eq!(crate::isqrt(u64::MAX), 4_294_967_295);
    }
}
