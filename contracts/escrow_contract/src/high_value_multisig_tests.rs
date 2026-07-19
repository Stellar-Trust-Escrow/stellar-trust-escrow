#[cfg(test)]
#[allow(clippy::module_inception)]
mod high_value_multisig_tests {
    use soroban_sdk::{testutils::Address as _, token, vec, Address, BytesN, Env, String, Vec};

    use crate::{
        EscrowContract, EscrowContractClient, EscrowError, EscrowStatus, MultisigConfig,
        HIGH_VALUE_THRESHOLD, MAX_BUYER_SIGNERS, MS_RELEASED, MS_SUBMITTED,
    };

    struct Fixture {
        env: Env,
        client_addr: Address,
        freelancer: Address,
        signer_a: Address,
        signer_b: Address,
        outsider: Address,
        token: Address,
        contract: EscrowContractClient<'static>,
    }

    fn setup(mint_amount: i128) -> Fixture {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let signer_a = Address::generate(&env);
        let signer_b = Address::generate(&env);
        let outsider = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let contract = EscrowContractClient::new(&env, &contract_id);
        contract.initialize(&admin);

        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token = token_contract.address();
        token::StellarAssetClient::new(&env, &token).mint(&client_addr, &mint_amount);

        Fixture {
            env,
            client_addr,
            freelancer,
            signer_a,
            signer_b,
            outsider,
            token,
            contract,
        }
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: Vec::new(env),
            weights: Vec::new(env),
            threshold: 0,
        }
    }

    fn valid_multisig(f: &Fixture) -> MultisigConfig {
        MultisigConfig {
            approvers: vec![
                &f.env,
                f.client_addr.clone(),
                f.signer_a.clone(),
                f.signer_b.clone(),
            ],
            weights: vec![&f.env, 1_u32, 2_u32, 1_u32],
            threshold: 3,
        }
    }

    fn create_escrow(
        f: &Fixture,
        amount: i128,
        config: &MultisigConfig,
    ) -> Result<Result<u64, soroban_sdk::Error>, Result<EscrowError, soroban_sdk::InvokeError>>
    {
        f.contract.try_create_escrow(
            &f.client_addr,
            &f.freelancer,
            &f.token,
            &amount,
            &BytesN::from_array(&f.env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            config,
        )
    }

    fn create_submitted_milestone(f: &Fixture) -> (u64, u32) {
        let amount = HIGH_VALUE_THRESHOLD;
        let escrow_id = create_escrow(f, amount, &valid_multisig(f))
            .unwrap()
            .unwrap();
        let milestone_id = f.contract.add_milestone(
            &f.client_addr,
            &escrow_id,
            &String::from_str(&f.env, "High value delivery"),
            &BytesN::from_array(&f.env, &[2; 32]),
            &amount,
        );
        f.contract
            .submit_milestone(&f.freelancer, &escrow_id, &milestone_id);
        (escrow_id, milestone_id)
    }

    #[test]
    fn below_high_value_boundary_preserves_legacy_approval() {
        let amount = HIGH_VALUE_THRESHOLD - 1;
        let f = setup(amount + 100);
        let escrow_id = create_escrow(&f, amount, &no_multisig(&f.env))
            .unwrap()
            .unwrap();
        let state = f.contract.get_escrow(&escrow_id);

        assert_eq!(state.multisig_approvers.len(), 1);
        assert!(state.multisig_approvers.contains(&f.client_addr));
        assert_eq!(state.multisig_threshold, 0);
    }

    #[test]
    fn high_value_boundary_requires_multisig() {
        let f = setup(HIGH_VALUE_THRESHOLD + 100);
        let result = create_escrow(&f, HIGH_VALUE_THRESHOLD, &no_multisig(&f.env));

        assert_eq!(result, Err(Ok(EscrowError::HighValueMultisigRequired)));
    }

    #[test]
    fn high_value_rejects_structurally_invalid_configs() {
        let f = setup(HIGH_VALUE_THRESHOLD + 100);
        let empty_approvers_with_weight = MultisigConfig {
            approvers: Vec::new(&f.env),
            weights: vec![&f.env, 1_u32],
            threshold: 0,
        };
        let mismatched_lengths = MultisigConfig {
            approvers: vec![&f.env, f.client_addr.clone(), f.signer_a.clone()],
            weights: vec![&f.env, 1_u32],
            threshold: 1,
        };
        let zero_weight = MultisigConfig {
            approvers: vec![&f.env, f.client_addr.clone(), f.signer_a.clone()],
            weights: vec![&f.env, 1_u32, 0_u32],
            threshold: 1,
        };
        let unreachable_threshold = MultisigConfig {
            approvers: vec![&f.env, f.client_addr.clone(), f.signer_a.clone()],
            weights: vec![&f.env, 1_u32, 1_u32],
            threshold: 3,
        };
        let duplicate_approver = MultisigConfig {
            approvers: vec![&f.env, f.client_addr.clone(), f.client_addr.clone()],
            weights: vec![&f.env, 1_u32, 1_u32],
            threshold: 2,
        };
        let overflowing_weights = MultisigConfig {
            approvers: vec![&f.env, f.client_addr.clone(), f.signer_a.clone()],
            weights: vec![&f.env, u32::MAX, 1_u32],
            threshold: u32::MAX,
        };

        for config in [
            empty_approvers_with_weight,
            mismatched_lengths,
            zero_weight,
            unreachable_threshold,
            duplicate_approver,
            overflowing_weights,
        ] {
            assert_eq!(
                create_escrow(&f, HIGH_VALUE_THRESHOLD, &config),
                Err(Ok(EscrowError::InvalidMultisigConfig))
            );
        }
    }

    #[test]
    fn high_value_rejects_too_many_approvers() {
        let f = setup(HIGH_VALUE_THRESHOLD + 100);
        let mut approvers = Vec::new(&f.env);
        let mut weights = Vec::new(&f.env);
        for _ in 0..=MAX_BUYER_SIGNERS {
            approvers.push_back(Address::generate(&f.env));
            weights.push_back(1_u32);
        }
        let config = MultisigConfig {
            approvers,
            weights,
            threshold: 2,
        };

        assert_eq!(
            create_escrow(&f, HIGH_VALUE_THRESHOLD, &config),
            Err(Ok(EscrowError::InvalidMultisigConfig))
        );
    }

    #[test]
    fn high_value_requires_more_than_one_signature_to_reach_threshold() {
        let f = setup(HIGH_VALUE_THRESHOLD + 100);
        let one_approver = MultisigConfig {
            approvers: vec![&f.env, f.client_addr.clone()],
            weights: vec![&f.env, 1_u32],
            threshold: 1,
        };
        let dominant_approver = MultisigConfig {
            approvers: vec![&f.env, f.client_addr.clone(), f.signer_a.clone()],
            weights: vec![&f.env, 2_u32, 1_u32],
            threshold: 2,
        };

        for config in [one_approver, dominant_approver] {
            assert_eq!(
                create_escrow(&f, HIGH_VALUE_THRESHOLD, &config),
                Err(Ok(EscrowError::HighValueMultisigRequired))
            );
        }
    }

    #[test]
    fn valid_config_is_namespaced_and_visible_in_escrow_view() {
        let f = setup(HIGH_VALUE_THRESHOLD + 100);
        let config = valid_multisig(&f);
        let escrow_id = create_escrow(&f, HIGH_VALUE_THRESHOLD, &config)
            .unwrap()
            .unwrap();
        let state = f.contract.get_escrow(&escrow_id);

        assert_eq!(state.multisig_approvers, config.approvers);
        assert_eq!(state.multisig_weights, config.weights);
        assert_eq!(state.multisig_threshold, config.threshold);
        assert_eq!(state.buyer_signers, state.multisig_approvers);
    }

    #[test]
    fn unauthorized_and_duplicate_approvals_are_rejected() {
        let f = setup(HIGH_VALUE_THRESHOLD + 200);
        let (escrow_id, milestone_id) = create_submitted_milestone(&f);

        assert_eq!(
            f.contract
                .try_approve_milestone(&f.outsider, &escrow_id, &milestone_id),
            Err(Ok(EscrowError::E3))
        );

        f.contract
            .approve_milestone(&f.signer_a, &escrow_id, &milestone_id);
        assert_eq!(
            f.contract
                .try_approve_milestone(&f.signer_a, &escrow_id, &milestone_id),
            Err(Ok(EscrowError::DuplicateMultisigApproval))
        );

        let state = f.contract.get_escrow(&escrow_id);
        let milestone = state.milestones.get(milestone_id).unwrap();
        assert_eq!(milestone.status, MS_SUBMITTED);
        assert_eq!(milestone.approvals.len(), 1);
        assert_eq!(
            token::Client::new(&f.env, &f.token).balance(&f.freelancer),
            0
        );
    }

    #[test]
    fn threshold_releases_funds_only_after_distinct_weighted_approvals() {
        let f = setup(HIGH_VALUE_THRESHOLD + 200);
        let (escrow_id, milestone_id) = create_submitted_milestone(&f);

        f.contract
            .approve_milestone(&f.signer_a, &escrow_id, &milestone_id);
        let partial = f.contract.get_escrow(&escrow_id);
        assert_eq!(partial.status, EscrowStatus::Active);
        assert_eq!(
            partial.milestones.get(milestone_id).unwrap().status,
            MS_SUBMITTED
        );
        assert_eq!(
            token::Client::new(&f.env, &f.token).balance(&f.freelancer),
            0
        );

        f.contract
            .approve_milestone(&f.client_addr, &escrow_id, &milestone_id);
        let completed = f.contract.get_escrow(&escrow_id);
        let milestone = completed.milestones.get(milestone_id).unwrap();
        assert_eq!(milestone.status, MS_RELEASED);
        assert_eq!(milestone.approvals.len(), 2);
        assert_eq!(completed.status, EscrowStatus::Completed);
        assert_eq!(completed.remaining_balance, 0);
        assert_eq!(
            token::Client::new(&f.env, &f.token).balance(&f.freelancer),
            HIGH_VALUE_THRESHOLD
        );
    }

    #[test]
    fn batch_approval_cannot_bypass_multisig_quorum() {
        let f = setup(HIGH_VALUE_THRESHOLD + 200);
        let (escrow_id, milestone_id) = create_submitted_milestone(&f);
        let milestone_ids = vec![&f.env, milestone_id];

        assert_eq!(
            f.contract
                .try_batch_approve_milestones(&f.signer_a, &escrow_id, &milestone_ids),
            Err(Ok(EscrowError::MultisigBatchApprovalUnsupported))
        );

        let state = f.contract.get_escrow(&escrow_id);
        assert_eq!(
            state.milestones.get(milestone_id).unwrap().status,
            MS_SUBMITTED
        );
        assert_eq!(
            token::Client::new(&f.env, &f.token).balance(&f.freelancer),
            0
        );
    }

    #[test]
    fn alternate_buyer_signer_entrypoint_cannot_bypass_high_value_policy() {
        let f = setup(HIGH_VALUE_THRESHOLD + 100);
        let buyer_signers = vec![&f.env, f.signer_a.clone(), f.signer_b.clone()];

        assert_eq!(
            f.contract.try_create_escrow_with_buyer_signers(
                &f.client_addr,
                &f.freelancer,
                &f.token,
                &HIGH_VALUE_THRESHOLD,
                &BytesN::from_array(&f.env, &[3; 32]),
                &None,
                &None,
                &None,
                &buyer_signers,
            ),
            Err(Ok(EscrowError::HighValueMultisigRequired))
        );
    }

    #[test]
    fn legacy_buyer_signer_limit_returns_typed_error() {
        let f = setup(1_100);
        let mut buyer_signers = Vec::new(&f.env);
        for _ in 0..=MAX_BUYER_SIGNERS {
            buyer_signers.push_back(Address::generate(&f.env));
        }

        assert_eq!(
            f.contract.try_create_escrow_with_buyer_signers(
                &f.client_addr,
                &f.freelancer,
                &f.token,
                &1_000,
                &BytesN::from_array(&f.env, &[4; 32]),
                &None,
                &None,
                &None,
                &buyer_signers,
            ),
            Err(Ok(EscrowError::InvalidMultisigConfig))
        );
    }
}
