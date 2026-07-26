#[cfg(test)]
#[allow(clippy::module_inception)]
mod arbiter_registry_tests {
    use crate::{EscrowContract, EscrowContractClient};
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, client)
    }

    #[test]
    fn test_register_arbiter() {
        let (env, admin, client) = setup();
        let arbiter = Address::generate(&env);

        client.register_arbiter(&admin, &arbiter);

        let active = client.get_active_arbiters();
        assert_eq!(active.len(), 1);
        assert_eq!(active.get(0).unwrap(), arbiter);
    }

    #[test]
    fn test_deregister_arbiter() {
        let (env, admin, client) = setup();
        let arbiter = Address::generate(&env);

        client.register_arbiter(&admin, &arbiter);
        client.deregister_arbiter(&admin, &arbiter);

        let active = client.get_active_arbiters();
        assert_eq!(active.len(), 0);
    }

    #[test]
    fn test_duplicate_registration_ignored() {
        let (env, admin, client) = setup();
        let arbiter = Address::generate(&env);

        client.register_arbiter(&admin, &arbiter);
        client.register_arbiter(&admin, &arbiter);

        let active = client.get_active_arbiters();
        assert_eq!(active.len(), 1);
    }

    #[test]
    fn test_get_active_arbiters_returns_correct_list() {
        let (env, admin, client) = setup();
        let arbiter_a = Address::generate(&env);
        let arbiter_b = Address::generate(&env);

        client.register_arbiter(&admin, &arbiter_a);
        client.register_arbiter(&admin, &arbiter_b);

        let active = client.get_active_arbiters();
        assert_eq!(active.len(), 2);
        assert!(active.contains(&arbiter_a));
        assert!(active.contains(&arbiter_b));
    }

    #[test]
    fn test_non_admin_cannot_register() {
        let (env, _admin, client) = setup();
        let non_admin = Address::generate(&env);
        let arbiter = Address::generate(&env);

        let result = client.try_register_arbiter(&non_admin, &arbiter);
        assert!(result.is_err());
    }
}
