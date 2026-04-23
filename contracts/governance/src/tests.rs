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
}
