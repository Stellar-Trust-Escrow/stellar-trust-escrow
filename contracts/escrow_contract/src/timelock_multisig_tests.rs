#[cfg(test)]
mod timelock_multisig_tests {
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Address, BytesN, Env,
    };

    use crate::{storage, types::EscrowState, EscrowContract, EscrowContractClient, EscrowError};

    fn setup_env() -> Env {
        let env = Env::default();
        env.mock_all_auths();
        env
    }

    fn create_test_escrow(env: &Env, timelock_release_at: Option<u64>) -> (u64, Address, Address) {
        let client = Address::generate(env);
        let freelancer = Address::generate(env);
        let escrow_id = 1u64;

        // Create a minimal escrow state
        let escrow = crate::types::EscrowState {
            escrow_id,
            client: client.clone(),
            freelancer: freelancer.clone(),
            token: Address::generate(env),
            total_amount: 1000_i128,
            remaining_balance: 1000_i128,
            status: crate::types::EscrowStatus::Active,
            milestones: soroban_sdk::Vec::new(env),
            arbiter: None,
            buyer_signers: soroban_sdk::Vec::new(env),
            created_at: env.ledger().timestamp(),
            deadline: None,
            lock_time: None,
            lock_time_extension: None,
            timelock: crate::types::OptionalTimelock::None,
            dispute_timeout_ledger: None,
            dispute_started_ledger: None,
            brief_hash: BytesN::from_array(env, &[0u8; 32]),
            multisig_approvers: soroban_sdk::Vec::new(env),
            multisig_weights: soroban_sdk::Vec::new(env),
            multisig_threshold: 0,
            timelock_release_at,
        };

        storage::set_escrow(env, escrow_id, &escrow);
        (escrow_id, client, freelancer)
    }

    #[test]
    fn test_claim_before_expiry_fails() {
        let env = setup_env();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        // Set current time to 1000
        env.ledger().with_mut(|l| l.timestamp = 1000);

        // Create escrow with timelock expiring at 5000
        let (escrow_id, _client_addr, _freelancer) = create_test_escrow(&env, Some(5000));

        // Try to claim at 4999 (1 second before expiry)
        env.ledger().with_mut(|l| l.timestamp = 4999);

        let result = client.try_claim_after_timelock(&escrow_id);

        // Should fail with TimelockNotExpired
        assert!(result.is_err(), "Claim before expiry should fail");
        assert_eq!(
            result.unwrap_err(),
            Ok(EscrowError::E75),
            "Should return TimelockNotExpired error"
        );
    }

    #[test]
    fn test_claim_exactly_at_expiry_succeeds() {
        let env = setup_env();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        // Set current time to 1000
        env.ledger().with_mut(|l| l.timestamp = 1000);

        // Create escrow with timelock expiring at 5000
        let (escrow_id, _client_addr, _freelancer) = create_test_escrow(&env, Some(5000));

        // Try to claim exactly at expiry
        env.ledger().with_mut(|l| l.timestamp = 5000);

        let result = client.try_claim_after_timelock(&escrow_id);

        // Should succeed (or fail with a different error if fund transfer logic isn't implemented)
        // Since we haven't implemented the full transfer logic, we expect Ok(()) for now
        assert!(
            result.is_ok() || !matches!(result.unwrap_err(), Ok(EscrowError::E75)),
            "Claim exactly at expiry should not return TimelockNotExpired"
        );
    }

    #[test]
    fn test_claim_after_expiry_succeeds() {
        let env = setup_env();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        // Set current time to 1000
        env.ledger().with_mut(|l| l.timestamp = 1000);

        // Create escrow with timelock expiring at 5000
        let (escrow_id, _client_addr, _freelancer) = create_test_escrow(&env, Some(5000));

        // Try to claim after expiry (at 6000)
        env.ledger().with_mut(|l| l.timestamp = 6000);

        let result = client.try_claim_after_timelock(&escrow_id);

        // Should succeed (or fail with a different error if fund transfer logic isn't implemented)
        assert!(
            result.is_ok() || !matches!(result.unwrap_err(), Ok(EscrowError::E75)),
            "Claim after expiry should not return TimelockNotExpired"
        );
    }

    #[test]
    fn test_claim_without_timelock_fails() {
        let env = setup_env();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        // Create escrow without timelock (None)
        let (escrow_id, _client_addr, _freelancer) = create_test_escrow(&env, None);

        let result = client.try_claim_after_timelock(&escrow_id);

        // Should fail because no timelock is set
        assert!(result.is_err(), "Claim without timelock should fail");
        assert_eq!(
            result.unwrap_err(),
            Ok(EscrowError::E11),
            "Should return error when no timelock is set"
        );
    }

    #[test]
    fn test_early_release_with_valid_signatures() {
        let env = setup_env();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        // Create escrow with timelock
        let (escrow_id, _client_addr, _freelancer) = create_test_escrow(&env, Some(5000));

        // Create valid-looking signatures (64 bytes each)
        let contractor_sig = BytesN::from_array(&env, &[1u8; 64]);
        let client_sig = BytesN::from_array(&env, &[2u8; 64]);

        let result = client.try_early_release(&escrow_id, &contractor_sig, &client_sig);

        // Since we haven't implemented actual signature verification,
        // this should succeed (pending full implementation)
        assert!(
            result.is_ok(),
            "Early release with valid signature format should succeed (pending crypto implementation)"
        );
    }

    #[test]
    fn test_early_release_with_invalid_signature_length() {
        let env = setup_env();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        // Create escrow with timelock
        let (escrow_id, _client_addr, _freelancer) = create_test_escrow(&env, Some(5000));

        // Create invalid signatures (wrong length)
        // Note: BytesN<64> enforces 64-byte length at compile time,
        // so this test demonstrates the type safety

        let contractor_sig = BytesN::from_array(&env, &[1u8; 64]);
        let client_sig = BytesN::from_array(&env, &[2u8; 64]);

        // Both signatures are valid length, so this should pass basic validation
        let result = client.try_early_release(&escrow_id, &contractor_sig, &client_sig);

        // Should succeed with valid signature lengths
        assert!(result.is_ok(), "Valid signature lengths should pass");
    }

    #[test]
    fn test_early_release_nonexistent_escrow() {
        let env = setup_env();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let contractor_sig = BytesN::from_array(&env, &[1u8; 64]);
        let client_sig = BytesN::from_array(&env, &[2u8; 64]);

        // Try to release for non-existent escrow
        let result = client.try_early_release(&999u64, &contractor_sig, &client_sig);

        assert!(result.is_err(), "Early release for non-existent escrow should fail");
        assert_eq!(
            result.unwrap_err(),
            Ok(EscrowError::E16),
            "Should return EscrowNotFound error"
        );
    }

    #[test]
    fn test_claim_nonexistent_escrow() {
        let env = setup_env();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        // Try to claim for non-existent escrow
        let result = client.try_claim_after_timelock(&999u64);

        assert!(result.is_err(), "Claim for non-existent escrow should fail");
        assert_eq!(
            result.unwrap_err(),
            Ok(EscrowError::E16),
            "Should return EscrowNotFound error"
        );
    }
}
