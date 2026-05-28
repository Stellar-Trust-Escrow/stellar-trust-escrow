#[cfg(test)]
#[allow(clippy::module_inception)]
mod tests {
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, Env, String,
    };

    use crate::{
        FundPayload, GovernanceContract, GovernanceContractClient, ParameterPayload,
        ProposalPayload, ProposalStatus, ProposalType,
    };

    // ── Helpers ───────────────────────────────────────────────────────────────

    const VOTING_DELAY: u64 = 60;
    const VOTING_PERIOD: u64 = 3_600;
    const TIMELOCK_DELAY: u64 = 7_200;
    const QUORUM_BPS: u32 = 400; // 4%
    const APPROVAL_BPS: u32 = 5_100; // 51%
    const THRESHOLD: i128 = 100;

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        GovernanceContractClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);

        // Register a SAC token
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token = token_id.address();

        let contract_id = env.register_contract(None, GovernanceContract);
        let client = GovernanceContractClient::new(&env, &contract_id);

        client.initialize(
            &admin,
            &token,
            &THRESHOLD,
            &VOTING_DELAY,
            &VOTING_PERIOD,
            &TIMELOCK_DELAY,
            &QUORUM_BPS,
            &APPROVAL_BPS,
        );

        (env, admin, token_admin, token, client)
    }

    fn mint(env: &Env, _token_admin: &Address, token: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token).mint(to, &amount);
    }

    fn advance(env: &Env, seconds: u64) {
        env.ledger().with_mut(|l| l.timestamp += seconds);
    }

    fn str(env: &Env, s: &str) -> String {
        String::from_str(env, s)
    }

    // ── Initialization ────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_stores_config() {
        let (_env, _admin, _ta, token, client) = setup();
        let config = client.get_config();
        assert_eq!(config.token, token);
        assert_eq!(config.quorum_bps, QUORUM_BPS);
        assert_eq!(config.approval_threshold_bps, APPROVAL_BPS);
        assert_eq!(config.voting_period, VOTING_PERIOD);
        assert_eq!(config.timelock_delay, TIMELOCK_DELAY);
    }

    #[test]
    fn test_double_initialize_fails() {
        let (_env, admin, _ta, token, client) = setup();
        let result = client.try_initialize(
            &admin,
            &token,
            &THRESHOLD,
            &VOTING_DELAY,
            &VOTING_PERIOD,
            &TIMELOCK_DELAY,
            &QUORUM_BPS,
            &APPROVAL_BPS,
        );
        assert!(result.is_err());
    }

    // ── Proposal creation ─────────────────────────────────────────────────────

    #[test]
    fn test_create_text_proposal() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "Test proposal"),
            &str(&env, "A signal-only proposal"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        assert_eq!(id, 0);
        assert_eq!(client.proposal_count(), 1);

        let p = client.get_proposal(&id);
        assert_eq!(p.status, ProposalStatus::Active);
        assert_eq!(p.votes_for, 0);
        assert_eq!(p.votes_against, 0);
    }

    #[test]
    fn test_create_proposal_insufficient_tokens_fails() {
        let (env, _admin, _ta, _token, client) = setup();
        let proposer = Address::generate(&env); // no tokens minted

        let result = client.try_create_proposal(
            &proposer,
            &str(&env, "Fail"),
            &str(&env, "No tokens"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_create_proposal_mismatched_payload_fails() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);

        // ParameterChange type but Text payload
        let result = client.try_create_proposal(
            &proposer,
            &str(&env, "Bad"),
            &str(&env, "Mismatch"),
            &ProposalType::ParameterChange,
            &ProposalPayload::Text,
            &10_000i128,
        );
        assert!(result.is_err());
    }

    // ── Voting ────────────────────────────────────────────────────────────────

    #[test]
    fn test_cast_vote_for() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 1_000);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        advance(&env, VOTING_DELAY + 1);
        client.cast_vote(&voter, &id, &true);

        let p = client.get_proposal(&id);
        assert_eq!(p.votes_for, 1_000);
        assert_eq!(p.votes_against, 0);
        assert!(client.has_voted(&id, &voter));
    }

    #[test]
    fn test_cast_vote_against() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 500);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        advance(&env, VOTING_DELAY + 1);
        client.cast_vote(&voter, &id, &false);

        let p = client.get_proposal(&id);
        assert_eq!(p.votes_against, 500);
    }

    #[test]
    fn test_double_vote_fails() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 1_000);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        advance(&env, VOTING_DELAY + 1);
        client.cast_vote(&voter, &id, &true);

        let result = client.try_cast_vote(&voter, &id, &false);
        assert!(result.is_err());
    }

    #[test]
    fn test_vote_before_delay_fails() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 1_000);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        // Don't advance past voting_delay
        let result = client.try_cast_vote(&voter, &id, &true);
        assert!(result.is_err());
    }

    #[test]
    fn test_vote_after_period_fails() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 1_000);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        advance(&env, VOTING_DELAY + VOTING_PERIOD + 1);
        let result = client.try_cast_vote(&voter, &id, &true);
        assert!(result.is_err());
    }

    // ── Finalization ──────────────────────────────────────────────────────────

    #[test]
    fn test_finalize_passes_with_quorum_and_majority() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);

        // Mint enough for quorum: supply = 10_000, quorum = 4% = 400
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 10_000);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        advance(&env, VOTING_DELAY + 1);
        client.cast_vote(&voter, &id, &true);

        advance(&env, VOTING_PERIOD);
        let status = client.finalize_proposal(&id);
        assert_eq!(status, ProposalStatus::Queued);
    }

    #[test]
    fn test_finalize_defeated_when_quorum_not_met() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);

        // Supply = 100_000, quorum = 4% = 4_000, voter only has 100
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 100);
        // Mint rest to someone else so supply is large
        let whale = Address::generate(&env);
        mint(&env, &ta, &token, &whale, 99_800);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        advance(&env, VOTING_DELAY + 1);
        client.cast_vote(&voter, &id, &true);

        advance(&env, VOTING_PERIOD);
        let status = client.finalize_proposal(&id);
        assert_eq!(status, ProposalStatus::Defeated);
    }

    #[test]
    fn test_finalize_before_vote_end_fails() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        advance(&env, VOTING_DELAY + 1);
        let result = client.try_finalize_proposal(&id);
        assert!(result.is_err());
    }

    // ── Timelock ──────────────────────────────────────────────────────────────

    #[test]
    fn test_execute_before_timelock_fails() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 10_000);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        advance(&env, VOTING_DELAY + 1);
        client.cast_vote(&voter, &id, &true);
        advance(&env, VOTING_PERIOD);
        client.finalize_proposal(&id);

        // Don't advance past timelock
        let result = client.try_execute_proposal(&id);
        assert!(result.is_err());
    }

    #[test]
    fn test_execute_text_proposal_after_timelock() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 10_000);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        advance(&env, VOTING_DELAY + 1);
        client.cast_vote(&voter, &id, &true);
        advance(&env, VOTING_PERIOD);
        client.finalize_proposal(&id);
        advance(&env, TIMELOCK_DELAY + 1);

        client.execute_proposal(&id);
        let p = client.get_proposal(&id);
        assert_eq!(p.status, ProposalStatus::Executed);
        assert!(p.executed_at.is_some());
    }

    #[test]
    fn test_execute_fund_allocation_transfers_tokens() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        let recipient = Address::generate(&env);
        let contract_id = client.address.clone();

        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 10_000);
        // Fund the governance treasury
        mint(&env, &ta, &token, &contract_id, 5_000);

        let payload = ProposalPayload::Fund(FundPayload {
            recipient: recipient.clone(),
            token: token.clone(),
            amount: 1_000,
        });

        let id = client.create_proposal(
            &proposer,
            &str(&env, "Fund"),
            &str(&env, "Allocate"),
            &ProposalType::FundAllocation,
            &payload,
            &10_000i128,
        );

        advance(&env, VOTING_DELAY + 1);
        client.cast_vote(&voter, &id, &true);
        advance(&env, VOTING_PERIOD);
        client.finalize_proposal(&id);
        advance(&env, TIMELOCK_DELAY + 1);
        client.execute_proposal(&id);

        let balance = token::Client::new(&env, &token).balance(&recipient);
        assert_eq!(balance, 1_000);
    }

    // ── Cancellation ─────────────────────────────────────────────────────────

    #[test]
    fn test_proposer_can_cancel() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        client.cancel_proposal(&proposer, &id);
        let p = client.get_proposal(&id);
        assert_eq!(p.status, ProposalStatus::Cancelled);
    }

    #[test]
    fn test_admin_can_cancel() {
        let (env, admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        client.cancel_proposal(&admin, &id);
        let p = client.get_proposal(&id);
        assert_eq!(p.status, ProposalStatus::Cancelled);
    }

    #[test]
    fn test_stranger_cannot_cancel() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let stranger = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        let result = client.try_cancel_proposal(&stranger, &id);
        assert!(result.is_err());
    }

    // ── Issue #658: Quorum not reached → Defeated ─────────────────────────────

    #[test]
    fn test_governance_quorum_not_reached_defeated() {
        let (env, admin, ta, token, client) = setup();

        // Raise quorum to 10%
        let mut config = client.get_config();
        config.quorum_bps = 1_000;
        client.update_config(&admin, &config);

        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        let whale = Address::generate(&env);

        // total supply = 100_000; 10% quorum = 10_000; voter only has 500 (< 10%)
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 500);
        mint(&env, &ta, &token, &whale, 99_400);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &100_000i128,
        );

        advance(&env, VOTING_DELAY + 1);
        client.cast_vote(&voter, &id, &true);

        advance(&env, VOTING_PERIOD);
        let status = client.finalize_proposal(&id);
        assert_eq!(status, ProposalStatus::Defeated);

        let p = client.get_proposal(&id);
        assert_eq!(p.status, ProposalStatus::Defeated);

        // execute_proposal on a Defeated proposal must fail
        let result = client.try_execute_proposal(&id);
        assert!(result.is_err());
    }

    // ── Issue #659: cancel_proposal edge cases ────────────────────────────────

    #[test]
    fn test_cast_vote_after_cancel_fails() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 1_000);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        client.cancel_proposal(&proposer, &id);
        assert_eq!(client.get_proposal(&id).status, ProposalStatus::Cancelled);

        advance(&env, VOTING_DELAY + 1);
        let result = client.try_cast_vote(&voter, &id, &true);
        assert!(result.is_err());
    }

    #[test]
    fn test_double_cancel_fails() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);

        let id = client.create_proposal(
            &proposer,
            &str(&env, "T"),
            &str(&env, "D"),
            &ProposalType::TextProposal,
            &ProposalPayload::Text,
            &10_000i128,
        );

        client.cancel_proposal(&proposer, &id);
        let result = client.try_cancel_proposal(&proposer, &id);
        assert!(result.is_err());
    }

    // ── Config update ─────────────────────────────────────────────────────────

    #[test]
    fn test_admin_can_update_config() {
        let (_env, admin, _ta, _token, client) = setup();
        let mut config = client.get_config();
        config.quorum_bps = 1_000; // 10%

        client.update_config(&admin, &config);
        assert_eq!(client.get_config().quorum_bps, 1_000);
    }

    #[test]
    fn test_non_admin_cannot_update_config() {
        let (env, _admin, _ta, _token, client) = setup();
        let stranger = Address::generate(&env);
        let config = client.get_config();

        let result = client.try_update_config(&stranger, &config);
        assert!(result.is_err());
    }

    // ── Full governance lifecycle ─────────────────────────────────────────────

    /// End-to-end test: create_proposal → cast_vote (for + against) →
    /// finalize_proposal → execute_proposal, verifying every status transition
    /// and the ParameterChange payload.
    ///
    /// Note: finalize_proposal transitions Active → Queued directly (the
    /// `Passed` variant is defined in ProposalStatus but the contract skips it,
    /// going straight to Queued when quorum + threshold are met).
    #[test]
    fn test_governance_full_lifecycle() {
        let (env, _admin, ta, token, client) = setup();

        let proposer = Address::generate(&env);
        let voter_for = Address::generate(&env);
        let voter_against = Address::generate(&env);

        // Supply: proposer=100, for=8_000, against=1_000 → total=9_100
        // Quorum required: 9_100 * 4% = 364 → total votes 9_000 ≥ 364 ✓
        // Approval: 8_000 / 9_000 ≈ 88.9% ≥ 51% ✓
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter_for, 8_000);
        mint(&env, &ta, &token, &voter_against, 1_000);

        let payload = ProposalPayload::Parameter(ParameterPayload {
            key: str(&env, "platform_fee_bps"),
            value: 150,
        });

        // 1. create_proposal — status must be Active
        let proposal_id = client.create_proposal(
            &proposer,
            &str(&env, "Lower platform fee"),
            &str(&env, "Reduce platform fee to 1.5%"),
            &ProposalType::ParameterChange,
            &payload,
            &9_100i128,
        );
        assert_eq!(proposal_id, 0);

        let p = client.get_proposal(&proposal_id);
        assert_eq!(p.status, ProposalStatus::Active);
        assert_eq!(p.votes_for, 0);
        assert_eq!(p.votes_against, 0);

        // 2. cast_vote — advance past voting_delay, then vote for and against
        advance(&env, VOTING_DELAY + 1);

        client.cast_vote(&voter_for, &proposal_id, &true);
        client.cast_vote(&voter_against, &proposal_id, &false);

        let p = client.get_proposal(&proposal_id);
        assert_eq!(p.votes_for, 8_000);
        assert_eq!(p.votes_against, 1_000);
        assert!(client.has_voted(&proposal_id, &voter_for));
        assert!(client.has_voted(&proposal_id, &voter_against));

        // 3. finalize_proposal — advance past voting_period; expect Queued
        advance(&env, VOTING_PERIOD);

        let status = client.finalize_proposal(&proposal_id);
        assert_eq!(status, ProposalStatus::Queued);

        let p = client.get_proposal(&proposal_id);
        assert_eq!(p.status, ProposalStatus::Queued);

        // 4. execute_proposal — advance past timelock_delay; expect Executed
        advance(&env, TIMELOCK_DELAY + 1);

        client.execute_proposal(&proposal_id);

        let p = client.get_proposal(&proposal_id);
        assert_eq!(p.status, ProposalStatus::Executed);
        assert!(p.executed_at.is_some());

        // Verify the ParameterChange payload is intact and readable
        match p.payload {
            ProposalPayload::Parameter(ref pp) => {
                assert_eq!(pp.key, str(&env, "platform_fee_bps"));
                assert_eq!(pp.value, 150);
            }
            _ => panic!("unexpected payload variant"),
        }
    }

    // ── Parameter change proposal ─────────────────────────────────────────────

    #[test]
    fn test_parameter_change_proposal_full_lifecycle() {
        let (env, _admin, ta, token, client) = setup();
        let proposer = Address::generate(&env);
        let voter = Address::generate(&env);
        mint(&env, &ta, &token, &proposer, THRESHOLD);
        mint(&env, &ta, &token, &voter, 10_000);

        let payload = ProposalPayload::Parameter(ParameterPayload {
            key: String::from_str(&env, "platform_fee_bps"),
            value: 200,
        });

        let id = client.create_proposal(
            &proposer,
            &str(&env, "Lower platform fee"),
            &str(&env, "Reduce fee from 1.5% to 2%"),
            &ProposalType::ParameterChange,
            &payload,
            &10_000i128,
        );

        advance(&env, VOTING_DELAY + 1);
        client.cast_vote(&voter, &id, &true);
        advance(&env, VOTING_PERIOD);
        client.finalize_proposal(&id);
        advance(&env, TIMELOCK_DELAY + 1);
        client.execute_proposal(&id);

        let p = client.get_proposal(&id);
        assert_eq!(p.status, ProposalStatus::Executed);
    }

    // ── Jury Voting Pool Tests ────────────────────────────────────────────────

    #[test]
    fn test_create_jury_pool() {
        let (env, admin, ta, token, client) = setup();

        // Initialize jury config
        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let disputed_amount = 5_000i128;

        // Fund the governance contract with disputed amount
        mint(&env, &ta, &token, &client.address, disputed_amount);

        let pool_id = client.create_jury_pool(
            &1u64,
            &0u64,
            &client_addr,
            &freelancer,
            &disputed_amount,
            &token,
        );

        assert_eq!(pool_id, 0);
        assert_eq!(client.jury_pool_count(), 1);

        let pool = client.get_jury_pool(&pool_id);
        assert_eq!(pool.escrow_id, 1);
        assert_eq!(pool.milestone_id, 0);
        assert_eq!(pool.disputed_amount, disputed_amount);
        assert_eq!(pool.weight_for_client, 0);
        assert_eq!(pool.weight_for_freelancer, 0);
    }

    #[test]
    fn test_cast_jury_vote_for_client() {
        let (env, admin, ta, token, client) = setup();

        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let voter = Address::generate(&env);

        mint(&env, &ta, &token, &client.address, 5_000);

        let pool_id = client.create_jury_pool(
            &1u64,
            &0u64,
            &client_addr,
            &freelancer,
            &5_000i128,
            &token,
        );

        // Voter stakes tokens to get voting power
        mint(&env, &ta, &token, &voter, 1_000);
        client.stake_arbitrator(&voter, &1_000i128);

        // Cast vote for client
        client.cast_jury_vote(&voter, &pool_id, &true);

        let pool = client.get_jury_pool(&pool_id);
        assert_eq!(pool.weight_for_client, 1_000);
        assert_eq!(pool.weight_for_freelancer, 0);
        assert_eq!(pool.total_locked_tokens, 1_000);
        assert!(client.has_jury_voted(&pool_id, &voter));
    }

    #[test]
    fn test_cast_jury_vote_for_freelancer() {
        let (env, admin, ta, token, client) = setup();

        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let voter = Address::generate(&env);

        mint(&env, &ta, &token, &client.address, 5_000);

        let pool_id = client.create_jury_pool(
            &1u64,
            &0u64,
            &client_addr,
            &freelancer,
            &5_000i128,
            &token,
        );

        mint(&env, &ta, &token, &voter, 500);
        client.stake_arbitrator(&voter, &500i128);

        client.cast_jury_vote(&voter, &pool_id, &false);

        let pool = client.get_jury_pool(&pool_id);
        assert_eq!(pool.weight_for_client, 0);
        assert_eq!(pool.weight_for_freelancer, 500);
        assert_eq!(pool.total_locked_tokens, 500);
    }

    #[test]
    fn test_jury_double_vote_fails() {
        let (env, admin, ta, token, client) = setup();

        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let voter = Address::generate(&env);

        mint(&env, &ta, &token, &client.address, 5_000);

        let pool_id = client.create_jury_pool(
            &1u64,
            &0u64,
            &client_addr,
            &freelancer,
            &5_000i128,
            &token,
        );

        mint(&env, &ta, &token, &voter, 1_000);
        client.stake_arbitrator(&voter, &1_000i128);

        client.cast_jury_vote(&voter, &pool_id, &true);

        let result = client.try_cast_jury_vote(&voter, &pool_id, &false);
        assert!(result.is_err());
    }

    #[test]
    fn test_jury_vote_insufficient_stake_fails() {
        let (env, admin, ta, token, client) = setup();

        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let voter = Address::generate(&env);

        mint(&env, &ta, &token, &client.address, 5_000);

        let pool_id = client.create_jury_pool(
            &1u64,
            &0u64,
            &client_addr,
            &freelancer,
            &5_000i128,
            &token,
        );

        // Voter has only 50 tokens staked, below minimum of 100
        mint(&env, &ta, &token, &voter, 50);
        client.stake_arbitrator(&voter, &50i128);

        let result = client.try_cast_jury_vote(&voter, &pool_id, &true);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_jury_pool_client_wins() {
        let (env, admin, ta, token, client) = setup();

        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let voter1 = Address::generate(&env);
        let voter2 = Address::generate(&env);

        mint(&env, &ta, &token, &client.address, 5_000);

        let pool_id = client.create_jury_pool(
            &1u64,
            &0u64,
            &client_addr,
            &freelancer,
            &5_000i128,
            &token,
        );

        // voter1: 2000 tokens for client
        mint(&env, &ta, &token, &voter1, 2_000);
        client.stake_arbitrator(&voter1, &2_000i128);
        client.cast_jury_vote(&voter1, &pool_id, &true);

        // voter2: 500 tokens for freelancer
        mint(&env, &ta, &token, &voter2, 500);
        client.stake_arbitrator(&voter2, &500i128);
        client.cast_jury_vote(&voter2, &pool_id, &false);

        // Advance past voting period
        advance(&env, 604_801);

        let client_wins = client.resolve_jury_pool(&pool_id);
        assert!(client_wins);

        let pool = client.get_jury_pool(&pool_id);
        assert_eq!(pool.weight_for_client, 2_000);
        assert_eq!(pool.weight_for_freelancer, 500);
        assert!(pool.resolved_at.is_some());
    }

    #[test]
    fn test_resolve_jury_pool_freelancer_wins() {
        let (env, admin, ta, token, client) = setup();

        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let voter1 = Address::generate(&env);
        let voter2 = Address::generate(&env);

        mint(&env, &ta, &token, &client.address, 5_000);

        let pool_id = client.create_jury_pool(
            &1u64,
            &0u64,
            &client_addr,
            &freelancer,
            &5_000i128,
            &token,
        );

        // voter1: 800 tokens for client
        mint(&env, &ta, &token, &voter1, 800);
        client.stake_arbitrator(&voter1, &800i128);
        client.cast_jury_vote(&voter1, &pool_id, &true);

        // voter2: 1500 tokens for freelancer
        mint(&env, &ta, &token, &voter2, 1_500);
        client.stake_arbitrator(&voter2, &1_500i128);
        client.cast_jury_vote(&voter2, &pool_id, &false);

        advance(&env, 604_801);

        let client_wins = client.resolve_jury_pool(&pool_id);
        assert!(!client_wins);

        let pool = client.get_jury_pool(&pool_id);
        assert_eq!(pool.weight_for_client, 800);
        assert_eq!(pool.weight_for_freelancer, 1_500);
    }

    #[test]
    fn test_resolve_before_voting_ends_fails() {
        let (env, admin, ta, token, client) = setup();

        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        mint(&env, &ta, &token, &client.address, 5_000);

        let pool_id = client.create_jury_pool(
            &1u64,
            &0u64,
            &client_addr,
            &freelancer,
            &5_000i128,
            &token,
        );

        let result = client.try_resolve_jury_pool(&pool_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_jury_pool_quorum_not_reached() {
        let (env, admin, ta, token, client) = setup();

        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let voter = Address::generate(&env);

        mint(&env, &ta, &token, &client.address, 10_000);

        let pool_id = client.create_jury_pool(
            &1u64,
            &0u64,
            &client_addr,
            &freelancer,
            &10_000i128,
            &token,
        );

        // Only 100 tokens locked, but quorum requires 5% of 10_000 = 500
        mint(&env, &ta, &token, &voter, 100);
        client.stake_arbitrator(&voter, &100i128);
        client.cast_jury_vote(&voter, &pool_id, &true);

        advance(&env, 604_801);

        let result = client.try_resolve_jury_pool(&pool_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_distribute_jury_funds_client_wins() {
        let (env, admin, ta, token, client) = setup();

        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let voter = Address::generate(&env);

        let disputed_amount = 5_000i128;
        mint(&env, &ta, &token, &client.address, disputed_amount);

        let pool_id = client.create_jury_pool(
            &1u64,
            &0u64,
            &client_addr,
            &freelancer,
            &disputed_amount,
            &token,
        );

        mint(&env, &ta, &token, &voter, 1_000);
        client.stake_arbitrator(&voter, &1_000i128);
        client.cast_jury_vote(&voter, &pool_id, &true);

        advance(&env, 604_801);
        client.resolve_jury_pool(&pool_id);

        client.distribute_jury_funds(&pool_id);

        let balance = token::Client::new(&env, &token).balance(&client_addr);
        assert_eq!(balance, disputed_amount);
    }

    #[test]
    fn test_distribute_jury_funds_freelancer_wins() {
        let (env, admin, ta, token, client) = setup();

        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let voter = Address::generate(&env);

        let disputed_amount = 5_000i128;
        mint(&env, &ta, &token, &client.address, disputed_amount);

        let pool_id = client.create_jury_pool(
            &1u64,
            &0u64,
            &client_addr,
            &freelancer,
            &disputed_amount,
            &token,
        );

        mint(&env, &ta, &token, &voter, 1_000);
        client.stake_arbitrator(&voter, &1_000i128);
        client.cast_jury_vote(&voter, &pool_id, &false);

        advance(&env, 604_801);
        client.resolve_jury_pool(&pool_id);

        client.distribute_jury_funds(&pool_id);

        let balance = token::Client::new(&env, &token).balance(&freelancer);
        assert_eq!(balance, disputed_amount);
    }

    #[test]
    fn test_distribute_before_resolution_fails() {
        let (env, admin, ta, token, client) = setup();

        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        mint(&env, &ta, &token, &client.address, 5_000);

        let pool_id = client.create_jury_pool(
            &1u64,
            &0u64,
            &client_addr,
            &freelancer,
            &5_000i128,
            &token,
        );

        let result = client.try_distribute_jury_funds(&pool_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_jury_pool_full_lifecycle() {
        let (env, admin, ta, token, client) = setup();

        // Initialize jury config
        client.initialize_jury_config(&admin, &604_800u64, &100i128, &500u32);

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let voter1 = Address::generate(&env);
        let voter2 = Address::generate(&env);
        let voter3 = Address::generate(&env);

        let disputed_amount = 10_000i128;
        mint(&env, &ta, &token, &client.address, disputed_amount);

        // 1. Create jury pool
        let pool_id = client.create_jury_pool(
            &42u64,
            &3u64,
            &client_addr,
            &freelancer,
            &disputed_amount,
            &token,
        );

        assert_eq!(pool_id, 0);

        // 2. Multiple voters stake and vote
        // voter1: 3000 tokens for client
        mint(&env, &ta, &token, &voter1, 3_000);
        client.stake_arbitrator(&voter1, &3_000i128);
        client.cast_jury_vote(&voter1, &pool_id, &true);

        // voter2: 2000 tokens for freelancer
        mint(&env, &ta, &token, &voter2, 2_000);
        client.stake_arbitrator(&voter2, &2_000i128);
        client.cast_jury_vote(&voter2, &pool_id, &false);

        // voter3: 1500 tokens for client
        mint(&env, &ta, &token, &voter3, 1_500);
        client.stake_arbitrator(&voter3, &1_500i128);
        client.cast_jury_vote(&voter3, &pool_id, &true);

        let pool = client.get_jury_pool(&pool_id);
        assert_eq!(pool.weight_for_client, 4_500);
        assert_eq!(pool.weight_for_freelancer, 2_000);
        assert_eq!(pool.total_locked_tokens, 6_500);

        // 3. Advance past voting period
        advance(&env, 604_801);

        // 4. Resolve pool
        let client_wins = client.resolve_jury_pool(&pool_id);
        assert!(client_wins);

        // 5. Distribute funds
        client.distribute_jury_funds(&pool_id);

        let client_balance = token::Client::new(&env, &token).balance(&client_addr);
        assert_eq!(client_balance, disputed_amount);

        let freelancer_balance = token::Client::new(&env, &token).balance(&freelancer);
        assert_eq!(freelancer_balance, 0);
    }
}
