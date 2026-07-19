#[cfg(test)]
mod test {
    use soroban_sdk::{BytesN, Env};
    use crate::*;

    #[test]
    fn test_bond_below_minimum_fails() {
        let env = Env::default();
        let admin = env.register_contract(None, crate::Contract);
        initialize(env.clone(), admin.clone(), 1000, 500, 100);
        let arbiter = Address::generate(&env);
        let token = Address::generate(&env);
        let result = std::panic::catch_unwind(|| {
            bond(env.clone(), arbiter, 500, token);
        });
        assert!(result.is_err());
    }
}
