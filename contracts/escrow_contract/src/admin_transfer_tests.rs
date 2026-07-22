//! # Two-Step Admin Transfer Tests
//!
//! Tests for `propose_admin` and `accept_admin` covering:
//! - Full happy-path two-step transfer
//! - Wrong acceptor is rejected
//! - `accept_admin` without a prior `propose_admin` fails

#[cfg(test)]
#[allow(clippy::module_inception)]
mod admin_transfer_tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};

    use crate::{EscrowContract, EscrowContractClient, EscrowError};

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        (env, admin, client)
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    /// Full two-step transfer: propose then accept by the correct address.
    #[test]
    fn test_two_step_admin_transfer_full() {
        let (env, admin, contract) = setup();
        let new_admin = Address::generate(&env);

        // Step 1: current admin proposes new admin
        contract.propose_admin(&admin, &new_admin);

        // Admin has not changed yet
        assert_eq!(contract.get_admin(), admin.clone());

        // Step 2: proposed admin accepts
        contract.accept_admin(&new_admin);

        // Admin is now the new address
        assert_eq!(contract.get_admin(), new_admin.clone());
    }

    /// `accept_admin` called by an address that is NOT the pending admin must fail.
    #[test]
    fn test_accept_admin_wrong_acceptor_rejected() {
        let (env, admin, contract) = setup();
        let new_admin = Address::generate(&env);
        let impostor = Address::generate(&env);

        contract.propose_admin(&admin, &new_admin);

        let result = contract.try_accept_admin(&impostor);
        assert_eq!(result, Err(Ok(EscrowError::E3)));

        // Admin must remain unchanged
        assert_eq!(contract.get_admin(), admin.clone());
    }

    /// `accept_admin` without a prior `propose_admin` must return `NoPending`.
    #[test]
    fn test_accept_admin_without_proposal_fails() {
        let (env, _admin, contract) = setup();
        let random = Address::generate(&env);

        let result = contract.try_accept_admin(&random);
        assert_eq!(result, Err(Ok(EscrowError::E3)));
    }

    /// `propose_admin` by a non-admin must be rejected.
    #[test]
    fn test_propose_admin_non_admin_rejected() {
        let (env, _admin, contract) = setup();
        let attacker = Address::generate(&env);
        let victim = Address::generate(&env);

        let result = contract.try_propose_admin(&attacker, &victim);
        assert_eq!(result, Err(Ok(EscrowError::E4)));
    }

    /// After a successful transfer, `DataKey::PendingAdmin` is cleared —
    /// a second `accept_admin` call must fail with `NoPending`.
    #[test]
    fn test_pending_admin_cleared_after_accept() {
        let (env, admin, contract) = setup();
        let new_admin = Address::generate(&env);

        contract.propose_admin(&admin, &new_admin);
        contract.accept_admin(&new_admin);

        // PendingAdmin is gone; any further accept attempt must fail
        let another = Address::generate(&env);
        let result = contract.try_accept_admin(&another);
        assert_eq!(result, Err(Ok(EscrowError::E3)));
    }
}
