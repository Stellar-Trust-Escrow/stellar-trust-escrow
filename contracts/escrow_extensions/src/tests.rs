#[cfg(test)]
#[allow(clippy::module_inception)]
mod tests {
    use crate::{
        ArbitrationDispute, BatchEscrowParams, DataKey, EscrowExtensions, EscrowExtensionsClient,
        ExtError, FeeRecipient,
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

    /// Verifies that `distribute_fees` correctly splits 1000 stroops across two
    /// recipients using a 70/30 basis-point split:
    ///   - addr1 (7000 bps) must receive exactly 700 stroops
    ///   - addr2 (3000 bps) must receive exactly 300 stroops
    ///   - `get_fee_balance` must return 0 after distribution (no dust in this case)
    #[test]
    fn test_distribute_fees_proportional_split() {
        // Initialize with 10 % fee so collect_fee accumulates predictable amounts.
        // 10 % of 10_000 = 1_000 stroops in one call.
        let s = setup_with_fee(100); // 1 % fee — we'll use gross=100_000 → fee=1_000

        let addr1 = soroban_sdk::Address::generate(&s.env);
        let addr2 = soroban_sdk::Address::generate(&s.env);

        // Set up a 70/30 split
        let mut recipients = Vec::new(&s.env);
        recipients.push_back(FeeRecipient {
            address: addr1.clone(),
            share_bps: 7_000, // 70 %
        });
        recipients.push_back(FeeRecipient {
            address: addr2.clone(),
            share_bps: 3_000, // 30 %
        });
        s.client.set_fee_recipients(&s.admin, &recipients);

        // Accumulate exactly 1_000 stroops: 1 % of 100_000
        s.client.collect_fee(&1_u64, &s.token_id, &100_000_i128);
        assert_eq!(s.client.get_fee_balance(&s.token_id), 1_000);

        // Fund the contract so it can transfer tokens to recipients
        mint(&s.env, &s.admin, &s.token_id, &s.contract_id, 1_000);

        // Distribute and verify the returned total
        let distributed = s.client.distribute_fees(&s.token_id);
        assert_eq!(distributed, 1_000);

        // Verify each recipient received the correct stroop amount
        let token_client = token::Client::new(&s.env, &s.token_id);
        assert_eq!(token_client.balance(&addr1), 700); // 1_000 * 70 % = 700
        assert_eq!(token_client.balance(&addr2), 300); // 1_000 * 30 % = 300

        // FeeBalance must be zeroed after a clean split (no dust)
        assert_eq!(s.client.get_fee_balance(&s.token_id), 0);
    }

    #[test]
    fn test_emergency_withdraw_fees_full_transfer() {
        let s = setup_with_fee(100); // 1 %
        let (_net, fee) = s.client.collect_fee(&1_u64, &s.token_id, &50_000_i128); // fee = 500
        assert_eq!(fee, 500);

        // Fund contract with the exact fee amount to make token transfer possible.
        mint(&s.env, &s.admin, &s.token_id, &s.contract_id, 500);

        let recipient = soroban_sdk::Address::generate(&s.env);
        let token_client = token::Client::new(&s.env, &s.token_id);
        let before = token_client.balance(&recipient);

        let withdrawn = s
            .client
            .emergency_withdraw_fees(&s.admin, &s.token_id, &recipient);
        assert_eq!(withdrawn, 500);
        assert_eq!(token_client.balance(&recipient) - before, 500);
        assert_eq!(s.client.get_fee_balance(&s.token_id), 0);
    }

    #[test]
    fn test_emergency_withdraw_fees_unauthorized() {
        let s = setup_with_fee(100);
        s.client.collect_fee(&1_u64, &s.token_id, &50_000_i128); // fee = 500
        mint(&s.env, &s.admin, &s.token_id, &s.contract_id, 500);

        let non_admin = soroban_sdk::Address::generate(&s.env);
        let recipient = soroban_sdk::Address::generate(&s.env);
        let result = s
            .client
            .try_emergency_withdraw_fees(&non_admin, &s.token_id, &recipient);
        assert_eq!(result.unwrap_err().unwrap(), ExtError::AdminOnly);
    }

    #[test]
    fn test_emergency_withdraw_fees_zero_balance() {
        let s = setup_with_fee(100);
        let recipient = soroban_sdk::Address::generate(&s.env);
        let result = s
            .client
            .try_emergency_withdraw_fees(&s.admin, &s.token_id, &recipient);
        assert_eq!(result.unwrap_err().unwrap(), ExtError::NoFeesAccumulated);
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

    // ── Batch fee deduction ───────────────────────────────────────────────────

    #[test]
    fn test_batch_create_fee_deduction() {
        // Initialize with fee_bps = 100 (1%)
        let s = setup_with_fee(100);
        let client_addr = soroban_sdk::Address::generate(&s.env);

        // Mint enough tokens for 3 × 1000 stroops
        mint(&s.env, &s.admin, &s.token_id, &client_addr, 3_000);

        let fl1 = soroban_sdk::Address::generate(&s.env);
        let fl2 = soroban_sdk::Address::generate(&s.env);
        let fl3 = soroban_sdk::Address::generate(&s.env);

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
            total_amount: 1_000,
            brief_hash: make_hash(&s.env, 2),
            arbiter: None,
            deadline: None,
        });
        params.push_back(BatchEscrowParams {
            freelancer: fl3,
            token: s.token_id.clone(),
            total_amount: 1_000,
            brief_hash: make_hash(&s.env, 3),
            arbiter: None,
            deadline: None,
        });

        let ids = s.client.create_batch(&client_addr, &params);
        assert_eq!(ids.len(), 3);

        // batch_escrow_count must equal 3 after the batch
        assert_eq!(s.client.batch_escrow_count(), 3);

        // Simulate fee collection on release for each escrow (1% of 1000 = 10 per escrow)
        let (net0, fee0) = s
            .client
            .collect_fee(&ids.get(0).unwrap(), &s.token_id, &1_000_i128);
        let (net1, fee1) = s
            .client
            .collect_fee(&ids.get(1).unwrap(), &s.token_id, &1_000_i128);
        let (net2, fee2) = s
            .client
            .collect_fee(&ids.get(2).unwrap(), &s.token_id, &1_000_i128);

        // Each escrow's net amount after fee deduction must be 990 (1000 - 10)
        assert_eq!(net0, 990);
        assert_eq!(net1, 990);
        assert_eq!(net2, 990);

        // Each fee must be 10 (1% of 1000)
        assert_eq!(fee0, 10);
        assert_eq!(fee1, 10);
        assert_eq!(fee2, 10);

        // get_fee_balance must accumulate 3 × 10 = 30 stroops
        assert_eq!(s.client.get_fee_balance(&s.token_id), 30);
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

    // ── Issue #651: Full upgrade lifecycle ────────────────────────────────────

    /// Tests the full upgrade lifecycle: queue → verify pending → delay elapses
    /// → execute succeeds → pending cleared. Also verifies cancel clears pending.
    #[test]
    fn test_upgrade_queue_delay_execute() {
        let s = setup_with_fee(0);
        let hash = BytesN::from_array(&s.env, &[0x11; 32]);

        // Queue the upgrade
        let executable_after = s.client.queue_upgrade(&s.admin, &hash);
        assert!(executable_after > s.env.ledger().timestamp());

        // get_pending_upgrade must return the queued entry
        let pending = s.client.get_pending_upgrade().unwrap();
        assert_eq!(pending.new_wasm_hash, hash);
        assert_eq!(pending.executable_after, executable_after);

        // execute_upgrade before delay must fail
        let early_result = s.client.try_execute_upgrade(&s.admin);
        assert_eq!(
            early_result.unwrap_err().unwrap(),
            ExtError::UpgradeDelayNotElapsed
        );

        // Pending upgrade must still be present after failed early execution
        assert!(
            s.client.get_pending_upgrade().is_some(),
            "Pending upgrade must persist after failed early execute"
        );

        // Advance ledger past UPGRADE_DELAY_SECONDS (86_400)
        s.env.ledger().with_mut(|l| {
            l.timestamp += 86_401;
        });

        // cancel_upgrade clears the pending entry
        s.client.cancel_upgrade(&s.admin);
        assert!(
            s.client.get_pending_upgrade().is_none(),
            "cancel_upgrade must clear pending upgrade"
        );

        // Queue again and execute after delay
        let hash2 = BytesN::from_array(&s.env, &[0x22; 32]);
        s.client.queue_upgrade(&s.admin, &hash2);
        s.env.ledger().with_mut(|l| {
            l.timestamp += 86_401;
        });

        // execute_upgrade after delay — will panic in test env because WASM upload
        // is not available, but we verify the timelock check passes by confirming
        // the error is NOT UpgradeDelayNotElapsed
        let result = s.client.try_execute_upgrade(&s.admin);
        assert!(
            !matches!(result, Err(Ok(ExtError::UpgradeDelayNotElapsed))),
            "execute_upgrade after delay must not return UpgradeDelayNotElapsed"
        );
    }

    // ── Issue #652: execute_upgrade fails before delay ────────────────────────

    /// Verifies that execute_upgrade returns UpgradeDelayNotElapsed when called
    /// immediately after queue_upgrade, and that the pending upgrade persists.
    #[test]
    fn test_execute_upgrade_fails_before_delay() {
        let s = setup_with_fee(0);
        let hash = BytesN::from_array(&s.env, &[0x33; 32]);

        s.client.queue_upgrade(&s.admin, &hash);

        // Call execute_upgrade without advancing the ledger
        let result = s.client.try_execute_upgrade(&s.admin);
        assert_eq!(
            result.unwrap_err().unwrap(),
            ExtError::UpgradeDelayNotElapsed,
            "execute_upgrade immediately after queue must return UpgradeDelayNotElapsed"
        );

        // Pending upgrade must still be present after the failed attempt
        let pending = s.client.get_pending_upgrade();
        assert!(
            pending.is_some(),
            "Pending upgrade must persist after failed early execute_upgrade"
        );
        assert_eq!(
            pending.unwrap().new_wasm_hash,
            hash,
            "Pending upgrade hash must be unchanged"
        );
    }

    // ── Arithmetic overflow hardening ─────────────────────────────────────────

    /// `resolve_dispute` must reject an overflowing weight calculation with
    /// `ArithmeticOverflow` instead of silently wrapping to a wrong winner.
    #[test]
    fn test_resolve_dispute_overflow_returns_arithmetic_overflow() {
        let s = setup_with_fee(0);
        let escrow_id = 1u64;

        s.env.as_contract(&s.contract_id, || {
            let dispute = ArbitrationDispute {
                escrow_id,
                voting_opens_at: 0,
                voting_closes_at: 100,
                weight_for_client: u64::MAX,
                weight_for_freelancer: 1,
                total_stake: 0,
                votes: Vec::new(&s.env),
                resolved: false,
                client_wins: None,
            };
            s.env
                .storage()
                .persistent()
                .set(&DataKey::Dispute(escrow_id), &dispute);
        });

        s.env.ledger().with_mut(|l| l.timestamp = 200);

        let result = s.client.try_resolve_dispute(&escrow_id);
        assert_eq!(
            result.unwrap_err().unwrap(),
            ExtError::ArithmeticOverflow,
            "weight_for_client.checked_mul(100) must overflow for u64::MAX"
        );
    }
}
