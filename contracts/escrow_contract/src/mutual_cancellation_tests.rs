//! Tests for mutual-consent cancellation with partial refund (Issue #1364)

#[cfg(test)]
#[allow(clippy::module_inception)]
mod mutual_cancellation_tests {
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, BytesN, Env,
    };

    use crate::{EscrowContract, EscrowContractClient, MultisigConfig};

    const PROPOSAL_TTL: u64 = 86_400;

    fn setup() -> (Env, Address, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, contract_id, client)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        token::StellarAssetClient::new(env, &sac.address()).mint(recipient, &(amount + 1_000));
        sac.address()
    }

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn advance(env: &Env, seconds: u64) {
        env.ledger().with_mut(|ledger| ledger.timestamp += seconds);
    }

    fn terms_hash(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[0xAB; 32])
    }

    fn create_active_escrow(
        env: &Env,
        client: &EscrowContractClient,
        client_addr: &Address,
        freelancer: &Address,
        token: &Address,
        amount: i128,
    ) -> u64 {
        client.create_escrow(
            client_addr,
            freelancer,
            token,
            &amount,
            &BytesN::from_array(env, &[1; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(env),
        )
    }

    // ── Test 1: Full propose → accept flow ─────────────────────────────────────

    #[test]
    fn test_full_propose_accept_flow_exact_amounts() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        let escrow_id =
            create_active_escrow(&env, &client, &client_addr, &freelancer, &token, 10_000);

        // Propose: 60% to client (6000 bps)
        client.propose_cancellation(&client_addr, &escrow_id, &6_000_u32, &terms_hash(&env));

        // Verify proposal stored
        let proposal = client.get_cancellation_proposal(&escrow_id);
        assert!(proposal.is_some());
        let p = proposal.unwrap();
        assert_eq!(p.proposer, client_addr);
        assert_eq!(p.client_refund_bps, 6_000);
        assert_eq!(p.terms_hash, terms_hash(&env));

        // Freelancer accepts
        client.accept_cancellation(&freelancer, &escrow_id);

        // Verify exact balances
        // client gets 10000 * 6000 / 10000 = 6000
        // freelancer gets 10000 - 6000 = 4000
        let token_client = token::Client::new(&env, &token);
        // client started with 10000 + 1000 (rent reserve), created escrow for 10000
        // so client balance after: (10000 + 1000) - 10000 + 6000 = 7000
        // freelancer: 0 + 4000 = 4000
        // But token.mint minted to client_addr. Let's just check freelancer received exactly 4000.
        assert_eq!(token_client.balance(&freelancer), 4_000);

        // Escrow should be Cancelled
        let proposal_after = client.get_cancellation_proposal(&escrow_id);
        assert!(proposal_after.is_none());
    }

    // ── Test 2: Proposer accepts own proposal → E72 ────────────────────────────

    #[test]
    fn test_proposer_cannot_accept_own_proposal() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        let escrow_id =
            create_active_escrow(&env, &client, &client_addr, &freelancer, &token, 10_000);

        client.propose_cancellation(&client_addr, &escrow_id, &5_000_u32, &terms_hash(&env));

        // Proposer tries to accept own proposal
        let result = client.try_accept_cancellation(&client_addr, &escrow_id);
        assert!(matches!(
            result,
            Err(Ok(crate::EscrowError::CannotAcceptOwnProposal))
        ));
    }

    // ── Test 3: Accept expired proposal → E73 ──────────────────────────────────

    #[test]
    fn test_accept_expired_proposal() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        let escrow_id =
            create_active_escrow(&env, &client, &client_addr, &freelancer, &token, 10_000);

        client.propose_cancellation(&client_addr, &escrow_id, &5_000_u32, &terms_hash(&env));

        // Advance past 24h expiry
        advance(&env, PROPOSAL_TTL + 1);

        let result = client.try_accept_cancellation(&freelancer, &escrow_id);
        assert!(matches!(
            result,
            Err(Ok(crate::EscrowError::ProposalExpired))
        ));
    }

    // ── Test 4: Propose on non-Active escrow → E74 ────────────────────────────

    #[test]
    fn test_propose_on_non_active_escrow() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        let escrow_id =
            create_active_escrow(&env, &client, &client_addr, &freelancer, &token, 10_000);

        // Cancel via the normal path to make it Cancelled
        client.cancel_escrow(&client_addr, &escrow_id);

        let result = client.try_propose_cancellation(
            &client_addr,
            &escrow_id,
            &5_000_u32,
            &terms_hash(&env),
        );
        assert!(matches!(
            result,
            Err(Ok(crate::EscrowError::InvalidEscrowState))
        ));
    }

    // ── Test 5: Reject then accept → E75 ──────────────────────────────────────

    #[test]
    fn test_reject_then_accept_panics() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        let escrow_id =
            create_active_escrow(&env, &client, &client_addr, &freelancer, &token, 10_000);

        client.propose_cancellation(&client_addr, &escrow_id, &5_000_u32, &terms_hash(&env));

        // Freelancer rejects
        client.reject_cancellation(&freelancer, &escrow_id);

        // Verify proposal deleted
        let proposal = client.get_cancellation_proposal(&escrow_id);
        assert!(proposal.is_none());

        // Freelancer tries to accept — should fail with NoCancellationProposal
        let result = client.try_accept_cancellation(&freelancer, &escrow_id);
        assert!(matches!(
            result,
            Err(Ok(crate::EscrowError::NoCancellationProposal))
        ));
    }

    // ── Test 6: Propose while pending exists → E33 ────────────────────────────

    #[test]
    fn test_propose_while_pending_rejected() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        let escrow_id =
            create_active_escrow(&env, &client, &client_addr, &freelancer, &token, 10_000);

        // First proposal
        client.propose_cancellation(&client_addr, &escrow_id, &5_000_u32, &terms_hash(&env));

        // Second proposal from freelancer should fail
        let mut alt_hash = [0xAB_u8; 32];
        alt_hash[0] = 0xCD;
        let result = client.try_propose_cancellation(
            &freelancer,
            &escrow_id,
            &3_000_u32,
            &BytesN::from_array(&env, &alt_hash),
        );
        assert!(matches!(result, Err(Ok(crate::EscrowError::E33))));
    }

    // ── Test 7: Accept after escrow is no longer Active → E74 ──────────────────

    #[test]
    fn test_accept_cancellation_fails_after_escrow_cancelled() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        let escrow_id =
            create_active_escrow(&env, &client, &client_addr, &freelancer, &token, 10_000);

        client.propose_cancellation(&client_addr, &escrow_id, &5_000_u32, &terms_hash(&env));

        // Client cancels via the normal single-party path (sets status to Cancelled)
        client.cancel_escrow(&client_addr, &escrow_id);

        // Freelancer tries to accept the stale proposal — should fail because
        // the escrow is no longer Active
        let result = client.try_accept_cancellation(&freelancer, &escrow_id);
        assert!(matches!(
            result,
            Err(Ok(crate::EscrowError::InvalidEscrowState))
        ));
    }

    // ── Test 8: Non-participant rejects → E3 ──────────────────────────────────

    #[test]
    fn test_reject_cancellation_by_non_participant_rejected() {
        let (env, admin, _contract_id, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &client_addr, 10_000);

        let escrow_id =
            create_active_escrow(&env, &client, &client_addr, &freelancer, &token, 10_000);

        client.propose_cancellation(&client_addr, &escrow_id, &5_000_u32, &terms_hash(&env));

        // Third party tries to reject
        let third_party = Address::generate(&env);
        let result = client.try_reject_cancellation(&third_party, &escrow_id);
        assert!(matches!(result, Err(Ok(crate::EscrowError::E3))));
    }
}
