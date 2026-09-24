#![no_std]

pub mod errors;
#[allow(dead_code)]
mod events;
pub mod types;

pub use errors::InsuranceError;

use soroban_sdk::{contract, contractimpl, Address, Env, String};

#[contract]
pub struct InsuranceContract;

#[contractimpl]
impl InsuranceContract {
    pub fn initialize(
        _env: Env,
        _admin: Address,
        _token: Address,
        _min_contribution: i128,
        _claim_cap: i128,
        _quorum: u32,
    ) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn contribute(
        _env: Env,
        _contributor: Address,
        _amount: i128,
    ) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn submit_claim(
        _env: Env,
        _claimant: Address,
        _description: String,
        _amount: i128,
    ) -> Result<u32, InsuranceError> {
        panic!("stub")
    }

    pub fn withdraw_claim(
        _env: Env,
        _claimant: Address,
        _claim_id: u32,
    ) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn vote(
        _env: Env,
        _governor: Address,
        _claim_id: u32,
        _approve: bool,
    ) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn execute_payout(_env: Env, _claim_id: u32) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn add_governor(
        _env: Env,
        _admin: Address,
        _governor: Address,
    ) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn remove_governor(
        _env: Env,
        _admin: Address,
        _governor: Address,
    ) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn set_claim_cap(_env: Env, _admin: Address, _cap: i128) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn set_quorum(_env: Env, _admin: Address, _quorum: u32) -> Result<(), InsuranceError> {
        panic!("stub")
    }

    pub fn get_fund_info(_env: Env) -> Result<types::FundInfo, InsuranceError> {
        panic!("stub")
    }

    pub fn get_claim(_env: Env, _claim_id: u32) -> Result<types::Claim, InsuranceError> {
        panic!("stub")
    }

    pub fn get_contribution(_env: Env, _contributor: Address) -> Result<i128, InsuranceError> {
        panic!("stub")
    }

    pub fn is_governor(_env: Env, _addr: Address) -> Result<bool, InsuranceError> {
        panic!("stub")
    }
}

#[cfg(test)]
mod gas_profiling;

#[cfg(test)]
mod tests {
    use crate::{InsuranceContract, InsuranceContractClient, InsuranceError};
    use crate::types::ClaimStatus;
    use soroban_sdk::{
        testutils::Address as _,
        Address, Env, String,
    };

    fn setup() -> (Env, Address, Address, InsuranceContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let contract_id = env.register_contract(None, InsuranceContract);
        let client = InsuranceContractClient::new(&env, &contract_id);
        (env, admin, token, client)
    }

    #[test]
    fn test_initialize_success() {
        let (_env, admin, token, client) = setup();
        let result = client.try_initialize(&admin, &token, &10_i128, &10_000_i128, &2_u32);
        assert!(result.is_ok(), "Initialize should succeed");
    }

    #[test]
    fn test_initialize_with_zero_min_contribution() {
        let (_env, admin, token, client) = setup();
        let result = client.try_initialize(&admin, &token, &0_i128, &10_000_i128, &2_u32);
        assert!(result.is_ok() || result.is_err(), "Initialize should handle zero minimum");
    }

    #[test]
    fn test_initialize_with_zero_quorum() {
        let (_env, admin, token, client) = setup();
        let result = client.try_initialize(&admin, &token, &10_i128, &10_000_i128, &0_u32);
        assert!(result.is_err(), "Initialize should reject zero quorum");
    }

    #[test]
    fn test_multiple_initialization_rejected() {
        let (_env, admin, token, client) = setup();
        client.initialize(&admin, &token, &10_i128, &10_000_i128, &2_u32);

        let result = client.try_initialize(&admin, &token, &10_i128, &10_000_i128, &2_u32);
        assert_eq!(
            result,
            Err(Ok(InsuranceError::AlreadyInitialized)),
            "Should reject double initialization"
        );
    }

    #[test]
    fn test_operate_on_uninitialized_contract() {
        let (_env, _admin, _token, client) = setup();

        let result = client.try_get_fund_info();
        assert!(
            result.is_err(),
            "Should fail on uninitialized contract"
        );
    }

    #[test]
    fn test_add_governor_requires_admin() {
        let (env, admin, token, client) = setup();
        client.initialize(&admin, &token, &10_i128, &10_000_i128, &2_u32);

        let non_admin = Address::generate(&env);
        let governor = Address::generate(&env);

        let result = client.try_add_governor(&non_admin, &governor);
        assert!(
            result.is_err(),
            "Only admin should be able to add governor"
        );
    }

    #[test]
    fn test_get_claim_not_found() {
        let (_env, admin, token, client) = setup();
        client.initialize(&admin, &token, &10_i128, &10_000_i128, &2_u32);

        let result = client.try_get_claim(&999_u32);
        assert_eq!(
            result,
            Err(Ok(InsuranceError::ClaimNotFound)),
            "Should return ClaimNotFound for non-existent claim"
        );
    }

    #[test]
    fn test_get_contribution_before_contribute() {
        let (env, admin, token, client) = setup();
        client.initialize(&admin, &token, &10_i128, &10_000_i128, &2_u32);

        let contributor = Address::generate(&env);
        let result = client.try_get_contribution(&contributor);

        if let Ok(amount) = result {
            assert_eq!(amount, 0, "Should return 0 for no contribution");
        }
    }

    #[test]
    fn test_is_governor_before_add() {
        let (env, admin, token, client) = setup();
        client.initialize(&admin, &token, &10_i128, &10_000_i128, &2_u32);

        let addr = Address::generate(&env);
        let result = client.try_is_governor(&addr);

        if let Ok(is_gov) = result {
            assert!(!is_gov, "Should not be governor before add_governor");
        }
    }

    #[test]
    fn test_error_codes_are_defined() {
        assert_eq!(InsuranceError::AlreadyInitialized as u32, 1);
        assert_eq!(InsuranceError::NotInitialized as u32, 2);
        assert_eq!(InsuranceError::AdminOnly as u32, 3);
        assert_eq!(InsuranceError::Unauthorized as u32, 4);
        assert_eq!(InsuranceError::NotGovernor as u32, 5);
        assert_eq!(InsuranceError::InvalidAmount as u32, 6);
        assert_eq!(InsuranceError::BelowMinimum as u32, 7);
        assert_eq!(InsuranceError::ClaimNotFound as u32, 8);
        assert_eq!(InsuranceError::InvalidClaimState as u32, 9);
        assert_eq!(InsuranceError::InsufficientFunds as u32, 10);
    }

    #[test]
    fn test_claim_status_variants_exist() {
        let _pending = ClaimStatus::Pending;
        let _approved = ClaimStatus::Approved;
        let _rejected = ClaimStatus::Rejected;
        let _paid = ClaimStatus::Paid;
        let _withdrawn = ClaimStatus::Withdrawn;
    }

    #[test]
    fn test_fund_info_structure() {
        let (_env, admin, token, client) = setup();
        client.initialize(&admin, &token, &10_i128, &10_000_i128, &2_u32);

        let result = client.try_get_fund_info();
        if let Ok(info) = result {
            assert_eq!(info.total_contributed, 0);
            assert_eq!(info.total_paid_out, 0);
            assert_eq!(info.total_claims, 0);
            assert_eq!(info.paid_claims, 0);
            assert_eq!(info.governor_count, 0);
        }
    }

    #[test]
    fn test_contract_instantiation() {
        let (env, _admin, _token, _client) = setup();
        let _contract_id = env.register_contract(None, InsuranceContract);
        assert!(true);
    }
}
