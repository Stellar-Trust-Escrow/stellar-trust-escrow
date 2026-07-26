#[cfg(test)]
#[allow(clippy::module_inception)]
mod health_check_tests {
    use crate::{EscrowContract, EscrowContractClient};
    use soroban_sdk::{symbol_short, Env};

    #[test]
    fn test_health_check_returns_ok() {
        let env = Env::default();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let result = client.health_check();

        assert_eq!(result, symbol_short!("OK"));
    }
}
