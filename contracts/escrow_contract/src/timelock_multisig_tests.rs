#[cfg(test)]
#[allow(clippy::module_inception)]
mod timelock_multisig_tests {
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, BytesN, Env,
    };

    use crate::{EscrowContract, EscrowContractClient, EscrowError, MultisigConfig};

    fn no_multisig(env: &Env) -> MultisigConfig {
        MultisigConfig {
            approvers: soroban_sdk::Vec::new(env),
            weights: soroban_sdk::Vec::new(env),
            threshold: 0,
        }
    }

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        token::StellarAssetClient::new(env, &sac.address()).mint(recipient, &amount);
        sac.address()
    }

    fn create_escrow_with_timelock(
        env: &Env,
        admin: &Address,
        client: &EscrowContractClient,
        duration: u64,
    ) -> (u64, Address, Address) {
        let client_addr = Address::generate(env);
        let freelancer = Address::generate(env);
        let amount = 500_i128;
        let token = register_token(env, admin, &client_addr, amount + 60);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &amount,
            &BytesN::from_array(env, &[1u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(env),
        );

        client.start_timelock(&client_addr, &escrow_id, &duration);

        (escrow_id, client_addr, freelancer)
    }

    #[test]
    fn test_claim_before_expiry_fails() {
        let (env, admin, client) = setup();
        env.ledger().with_mut(|l| l.timestamp = 1000);

        let duration = 4000_u64;
        let (escrow_id, _client_addr, _freelancer) =
            create_escrow_with_timelock(&env, &admin, &client, duration);

        // Try to claim 1 second before the timelock expires
        env.ledger().with_mut(|l| l.timestamp = 4999);
        let result = client.try_claim_after_timelock(&escrow_id);

        assert!(result.is_err(), "Claim before expiry should fail");
        assert_eq!(
            result.unwrap_err(),
            Ok(EscrowError::TimelockNotExpired),
            "Should return TimelockNotExpired error"
        );
    }

    #[test]
    fn test_claim_exactly_at_expiry_succeeds() {
        let (env, admin, client) = setup();
        env.ledger().with_mut(|l| l.timestamp = 1000);

        let duration = 4000_u64;
        let (escrow_id, _client_addr, _freelancer) =
            create_escrow_with_timelock(&env, &admin, &client, duration);

        // Claim exactly at expiry (start=1000, duration=4000 → release_at=5000)
        env.ledger().with_mut(|l| l.timestamp = 5000);
        let result = client.try_claim_after_timelock(&escrow_id);

        assert!(
            result.is_ok(),
            "Claim exactly at expiry should succeed: {:?}",
            result
        );
    }

    #[test]
    fn test_claim_after_expiry_succeeds() {
        let (env, admin, client) = setup();
        env.ledger().with_mut(|l| l.timestamp = 1000);

        let duration = 4000_u64;
        let (escrow_id, _client_addr, _freelancer) =
            create_escrow_with_timelock(&env, &admin, &client, duration);

        env.ledger().with_mut(|l| l.timestamp = 6000);
        let result = client.try_claim_after_timelock(&escrow_id);

        assert!(
            result.is_ok(),
            "Claim after expiry should succeed: {:?}",
            result
        );
    }

    #[test]
    fn test_claim_without_timelock_fails() {
        let (env, admin, client) = setup();

        let client_addr = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let amount = 500_i128;
        let token = register_token(&env, &admin, &client_addr, amount + 60);

        let escrow_id = client.create_escrow(
            &client_addr,
            &freelancer,
            &token,
            &amount,
            &BytesN::from_array(&env, &[1u8; 32]),
            &None,
            &None,
            &None,
            &None,
            &no_multisig(&env),
        );

        // No start_timelock call — timelock_release_at will be None
        let result = client.try_claim_after_timelock(&escrow_id);

        assert!(result.is_err(), "Claim without timelock should fail");
        assert_eq!(
            result.unwrap_err(),
            Ok(EscrowError::E11),
            "Should return error when no timelock is set"
        );
    }

    #[test]
    fn test_early_release_with_valid_signatures() {
        let (env, admin, client) = setup();
        env.ledger().with_mut(|l| l.timestamp = 1000);

        let duration = 4000_u64;
        let (escrow_id, _client_addr, _freelancer) =
            create_escrow_with_timelock(&env, &admin, &client, duration);

        let contractor_sig = BytesN::from_array(&env, &[1u8; 64]);
        let client_sig = BytesN::from_array(&env, &[2u8; 64]);

        let result = client.try_early_release(&escrow_id, &contractor_sig, &client_sig);

        assert!(
            result.is_ok(),
            "Early release should succeed (pending crypto implementation): {:?}",
            result
        );
    }

    #[test]
    fn test_early_release_nonexistent_escrow() {
        let (env, _admin, client) = setup();

        let contractor_sig = BytesN::from_array(&env, &[1u8; 64]);
        let client_sig = BytesN::from_array(&env, &[2u8; 64]);

        let result = client.try_early_release(&999u64, &contractor_sig, &client_sig);

        assert!(
            result.is_err(),
            "Early release for non-existent escrow should fail"
        );
        assert_eq!(
            result.unwrap_err(),
            Ok(EscrowError::E8),
            "Should return EscrowNotFound error"
        );
    }

    #[test]
    fn test_claim_nonexistent_escrow() {
        let (_env, _admin, client) = setup();

        let result = client.try_claim_after_timelock(&999u64);

        assert!(result.is_err(), "Claim for non-existent escrow should fail");
        assert_eq!(
            result.unwrap_err(),
            Ok(EscrowError::E8),
            "Should return EscrowNotFound error"
        );
    }
}
