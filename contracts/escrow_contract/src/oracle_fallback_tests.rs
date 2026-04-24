#[cfg(test)]
mod oracle_fallback_tests {
    use crate::oracle::{PriceData, PRICE_STALENESS_THRESHOLD};
    use crate::{EscrowContract, EscrowContractClient, EscrowError};
    use soroban_sdk::{testutils::Ledger as _,
        contract, contractimpl, testutils::Address as _, Address, Env,
    };

    // ── Mock oracle contracts ─────────────────────────────────────────────────

    /// Returns a fixed price with a timestamp injected at registration time via
    /// a single-entry instance storage key ("ts").
    #[contract]
    struct MockOracle;

    #[contractimpl]
    impl MockOracle {
        pub fn set_price_data(env: Env, price: i128, timestamp: u64) {
            env.storage().instance().set(&"price", &price);
            env.storage().instance().set(&"ts", &timestamp);
        }

        pub fn lastprice(env: Env, _asset: Address) -> Option<PriceData> {
            let price: i128 = env.storage().instance().get(&"price").unwrap_or(0);
            let timestamp: u64 = env.storage().instance().get(&"ts").unwrap_or(0);
            Some(PriceData { price, timestamp })
        }
    }

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

    fn register_mock_oracle(env: &Env, price: i128, timestamp: u64) -> Address {
        let id = env.register_contract(None, MockOracle);
        let mock = MockOracleClient::new(env, &id);
        mock.set_price_data(&price, &timestamp);
        id
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    /// Primary oracle returns a stale price → get_price must return the
    /// fallback oracle's fresh price.
    #[test]
    fn test_oracle_fallback_on_stale_primary() {
        let (env, admin, client) = setup();

        let now: u64 = 10_000;
        let stale_ts = now - PRICE_STALENESS_THRESHOLD - 1; // older than threshold
        let fresh_ts = now - 1;                              // within threshold

        let primary = register_mock_oracle(&env, 1_000_000, stale_ts);
        let fallback = register_mock_oracle(&env, 2_000_000, fresh_ts);

        client.set_oracle(&admin, &primary);
        client.set_fallback_oracle(&admin, &fallback);

        env.ledger().with_mut(|l| l.timestamp = now);

        let asset = Address::generate(&env);
        let price = client.get_price(&asset);
        assert_eq!(price, 2_000_000, "should return fallback price when primary is stale");
    }

    /// Both oracles return stale prices → get_price must return OraclePriceStale.
    #[test]
    fn test_oracle_both_stale_returns_error() {
        let (env, admin, client) = setup();

        let now: u64 = 10_000;
        let stale_ts = now - PRICE_STALENESS_THRESHOLD - 1;

        let primary = register_mock_oracle(&env, 1_000_000, stale_ts);
        let fallback = register_mock_oracle(&env, 2_000_000, stale_ts);

        client.set_oracle(&admin, &primary);
        client.set_fallback_oracle(&admin, &fallback);

        env.ledger().with_mut(|l| l.timestamp = now);

        let asset = Address::generate(&env);
        let result = client.try_get_price(&asset);
        assert!(
            matches!(result, Err(Ok(EscrowError::OraclePriceStale))),
            "should return OraclePriceStale when both oracles are stale"
        );
    }

    /// Primary oracle returns a fresh price → get_price must return it without
    /// consulting the fallback.
    #[test]
    fn test_oracle_uses_primary_when_fresh() {
        let (env, admin, client) = setup();

        let now: u64 = 10_000;
        let fresh_ts = now - 1;

        let primary = register_mock_oracle(&env, 5_000_000, fresh_ts);
        // Fallback has a different price; it must NOT be used.
        let fallback = register_mock_oracle(&env, 9_999_999, fresh_ts);

        client.set_oracle(&admin, &primary);
        client.set_fallback_oracle(&admin, &fallback);

        env.ledger().with_mut(|l| l.timestamp = now);

        let asset = Address::generate(&env);
        let price = client.get_price(&asset);
        assert_eq!(price, 5_000_000, "should return primary price when it is fresh");
    }
}
