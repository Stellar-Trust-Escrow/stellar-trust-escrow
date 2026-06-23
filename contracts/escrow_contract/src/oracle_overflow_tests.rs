//! Overflow-safety tests for `OracleConsumer::usd_to_xlm_stroops`.
//!
//! Verifies that an overflowing conversion returns
//! `EscrowError::OraclePriceConversionFailed` instead of panicking
//! (the previous behavior used `.expect("conversion_overflow")`).

#[cfg(test)]
#[allow(clippy::module_inception)]
mod oracle_overflow_tests {
    use crate::oracle::{OracleConsumer, PriceFeed};
    use crate::EscrowError;
    use soroban_sdk::{contract, contractimpl, testutils::Ledger, Env};

    #[contract]
    pub struct MockPriceOracle;

    #[contractimpl]
    impl MockPriceOracle {
        pub fn get_price(env: Env) -> PriceFeed {
            PriceFeed {
                price_micro_usd: 1,
                timestamp: env.ledger().timestamp(),
            }
        }
    }

    #[test]
    fn test_usd_to_xlm_stroops_overflow_returns_err() {
        let env = Env::default();
        env.ledger().with_mut(|l| l.timestamp = 1_000_000);
        let oracle_addr = env.register_contract(None, MockPriceOracle);

        let result = OracleConsumer::usd_to_xlm_stroops(&env, &oracle_addr, i128::MAX);
        assert_eq!(result, Err(EscrowError::OraclePriceConversionFailed));
    }

    #[test]
    fn test_usd_to_xlm_stroops_normal_conversion_succeeds() {
        let env = Env::default();
        env.ledger().with_mut(|l| l.timestamp = 1_000_000);
        let oracle_addr = env.register_contract(None, MockPriceOracle);

        let result = OracleConsumer::usd_to_xlm_stroops(&env, &oracle_addr, 1_000_000);
        assert!(result.is_ok());
    }

    /// 10,000 pseudo-random extreme-value iterations: the conversion must
    /// either succeed with a sane result or return `OraclePriceConversionFailed`
    /// — it must never panic or silently wrap to a wrong amount.
    #[test]
    fn test_usd_to_xlm_stroops_fuzz_extreme_values() {
        let env = Env::default();
        env.ledger().with_mut(|l| l.timestamp = 1_000_000);
        let oracle_addr = env.register_contract(None, MockPriceOracle);

        let mut seed: u64 = 0x9E3779B97F4A7C15;
        for _ in 0..10_000 {
            // Each call invokes the mock oracle contract and emits an event,
            // both of which are metered — reset so 10k iterations don't trip
            // the test budget.
            env.budget().reset_default();

            // xorshift64* — deterministic, dependency-free PRNG.
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;

            let amount = match seed % 4 {
                0 => i128::MAX,
                1 => i128::MIN,
                2 => i128::from(seed as i64),
                _ => i128::from(u64::MAX),
            };

            let result = OracleConsumer::usd_to_xlm_stroops(&env, &oracle_addr, amount);
            match result {
                Ok(stroops) => {
                    // A successful conversion must be internally consistent:
                    // amount_micro_usd and the result must have the same sign
                    // (price_micro_usd is fixed at 1, a positive price).
                    assert!(
                        (amount >= 0 && stroops >= 0) || (amount < 0 && stroops <= 0),
                        "sign mismatch for amount={amount}, stroops={stroops}"
                    );
                }
                Err(e) => assert_eq!(e, EscrowError::OraclePriceConversionFailed),
            }
        }
    }
}
