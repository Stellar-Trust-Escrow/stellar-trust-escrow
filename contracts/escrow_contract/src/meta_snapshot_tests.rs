#[cfg(test)]
#[allow(clippy::module_inception)]
mod meta_snapshot_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowStatus, MultisigConfig};
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

    // ── Helpers ───────────────────────────────────────────────────────────────

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

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        soroban_sdk::token::StellarAssetClient::new(env, &token_id.address())
            .mint(recipient, &amount);
        token_id.address()
    }

    fn hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    /// Snapshot EscrowMeta (via get_escrow) after each lifecycle operation and
    /// assert that the relevant counter / balance field changes correctly.
    #[test]
    fn test_get_escrow_meta_state_snapshots() {
        let (env, admin, _, client) = setup();
        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);

        // Mint enough for: total_amount(1000) + escrow-entry rent(30) + milestone rent(30)
        let token = register_token(&env, &admin, &client_addr, 1_060);

        // ── Create escrow ─────────────────────────────────────────────────────
        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &1_000,
            &hash(&env, 1),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        let state = client.get_escrow(&escrow_id);
        assert_eq!(state.milestones.len(), 0);
        assert_eq!(state.remaining_balance, 1_000);
        assert_eq!(state.status, EscrowStatus::Active);

        // ── After add_milestone: milestone_count increases ────────────────────
        let milestone_id = client.add_milestone(
            &client_addr,
            &escrow_id,
            &String::from_str(&env, "Milestone 1"),
            &hash(&env, 2),
            &500,
        );

        let state = client.get_escrow(&escrow_id);
        assert_eq!(
            state.milestones.len(),
            1,
            "milestone_count should be 1 after add_milestone"
        );

        // ── After submit_milestone: submitted_count increases ─────────────────
        client.submit_milestone(&freelancer, &escrow_id, &milestone_id);

        // submitted_count is on EscrowMeta (internal); verify via milestone status
        let milestone = client.get_milestone(&escrow_id, &milestone_id);
        assert_eq!(
            milestone.status,
            crate::MS_SUBMITTED,
            "milestone status should be MS_SUBMITTED after submit_milestone"
        );
        // Snapshot remaining_balance — must be unchanged before approval
        let state = client.get_escrow(&escrow_id);
        let balance_before_approve = state.remaining_balance;
        assert_eq!(balance_before_approve, 1_000);

        // ── After approve_milestone: approved_count increases,
        //    remaining_balance decreases (no timelock → immediate release) ─────
        client.approve_milestone(&client_addr, &escrow_id, &milestone_id);

        let state = client.get_escrow(&escrow_id);
        // approved_count is internal; verify via milestone status (MS_RELEASED = immediate release)
        let milestone = client.get_milestone(&escrow_id, &milestone_id);
        assert_eq!(
            milestone.status,
            crate::MS_RELEASED,
            "milestone status should be MS_RELEASED after approve_milestone (no timelock)"
        );
        assert_eq!(
            state.remaining_balance,
            balance_before_approve - 500,
            "remaining_balance should decrease by milestone amount after approve_milestone"
        );

        // ── After cancel_escrow: status == Cancelled ──────────────────────────
        // Use a fresh escrow with no pending milestones so cancel is allowed.
        let client_addr2 = Address::generate(&env);
        let freelancer2 = Address::generate(&env);
        // Mint for total_amount(200) + escrow-entry rent(30)
        let token2 = register_token(&env, &admin, &client_addr2, 230);

        let escrow_id2 = client.create_escrow(
            &client_addr2,
            &freelancer2,
            &token2,
            &200,
            &hash(&env, 3),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        client.cancel_escrow(&client_addr2, &escrow_id2);

        let state2 = client.get_escrow(&escrow_id2);
        assert_eq!(
            state2.status,
            EscrowStatus::Cancelled,
            "status should be Cancelled after cancel_escrow"
        );
        assert_eq!(
            state2.remaining_balance, 0,
            "remaining_balance should be 0 after cancel_escrow"
        );
    }
}
