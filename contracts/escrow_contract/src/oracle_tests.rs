#[cfg(test)]
mod oracle_triggered_tests {
    use crate::oracle::PriceData;
    use crate::{EscrowContract, EscrowContractClient, EscrowError, PriceCondition, PriceDirection};
    use soroban_sdk::{
        contract, contractimpl, testutils::Address as _, testutils::Ledger, Address, BytesN, Env,
        String,
    };

    // ── Mock oracle contract ──────────────────────────────────────────────────

    #[contract]
    pub struct MockOracle;

    #[contractimpl]
    impl MockOracle {
        pub fn set_price(env: Env, asset: Address, price: i128) {
            env.storage().instance().set(&asset, &price);
        }

        pub fn lastprice(env: Env, asset: Address) -> Option<PriceData> {
            let price: Option<i128> = env.storage().instance().get(&asset);
            price.map(|p| PriceData {
                price: p,
                timestamp: env.ledger().timestamp(),
            })
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    struct Setup {
        env: Env,
        client: EscrowContractClient<'static>,
        oracle_addr: Address,
        token_addr: Address,
        escrow_client: Address,
        freelancer: Address,
        escrow_id: u64,
        asset: Address,
    }

    fn setup() -> Setup {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|l| l.timestamp = 1_000_000);

        let admin = Address::generate(&env);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);

        let oracle_addr = env.register_contract(None, MockOracle);
        client.set_oracle(&admin, &oracle_addr);

        let token_admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = sac.address();

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        soroban_sdk::token::StellarAssetClient::new(&env, &token_addr)
            .mint(&escrow_client, &100_000);

        let brief_hash = BytesN::from_array(&env, &[0u8; 32]);
        let escrow_id = client.create_escrow(
            &escrow_client,
            &freelancer,
            &token_addr,
            &10_000i128,
            &brief_hash,
            &None,
            &None,
            &None,
            &None,
            &crate::MultisigConfig {
                approvers: soroban_sdk::Vec::new(&env),
                weights: soroban_sdk::Vec::new(&env),
                threshold: 0,
            },
        );

        let asset = Address::generate(&env);

        Setup {
            env,
            client,
            oracle_addr,
            token_addr,
            escrow_client,
            freelancer,
            escrow_id,
            asset,
        }
    }

    fn add_price_milestone(s: &Setup, condition: PriceCondition) -> u32 {
        s.client.create_price_indexed_milestone(
            &s.escrow_client,
            &s.escrow_id,
            &String::from_str(&s.env, "Price milestone"),
            &BytesN::from_array(&s.env, &[1u8; 32]),
            &1_000i128,
            &condition,
        )
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    #[test]
    fn test_oracle_release_above_condition_met() {
        let s = setup();
        let oracle_client = MockOracleClient::new(&s.env, &s.oracle_addr);
        oracle_client.set_price(&s.asset, &600_000i128);

        let milestone_id = add_price_milestone(
            &s,
            PriceCondition {
                asset: s.asset.clone(),
                target_price_usd: 500_000i128,
                direction: PriceDirection::Above,
            },
        );

        let result = s
            .client
            .try_trigger_oracle_release(&s.escrow_client, &s.escrow_id, &milestone_id);

        assert!(result.is_ok(), "condition met: should release funds");
    }

    #[test]
    fn test_oracle_release_above_condition_not_met() {
        let s = setup();
        let oracle_client = MockOracleClient::new(&s.env, &s.oracle_addr);
        oracle_client.set_price(&s.asset, &400_000i128);

        let milestone_id = add_price_milestone(
            &s,
            PriceCondition {
                asset: s.asset.clone(),
                target_price_usd: 500_000i128,
                direction: PriceDirection::Above,
            },
        );

        let result = s
            .client
            .try_trigger_oracle_release(&s.escrow_client, &s.escrow_id, &milestone_id);

        assert_eq!(
            result.unwrap_err().unwrap(),
            EscrowError::InvalidMilestoneState,
            "condition not met: should return InvalidMilestoneState"
        );
    }

    #[test]
    fn test_oracle_release_below_condition_met() {
        let s = setup();
        let oracle_client = MockOracleClient::new(&s.env, &s.oracle_addr);
        oracle_client.set_price(&s.asset, &300_000i128);

        let milestone_id = add_price_milestone(
            &s,
            PriceCondition {
                asset: s.asset.clone(),
                target_price_usd: 500_000i128,
                direction: PriceDirection::Below,
            },
        );

        let result = s
            .client
            .try_trigger_oracle_release(&s.escrow_client, &s.escrow_id, &milestone_id);

        assert!(result.is_ok(), "below condition met: should release funds");
    }

    #[test]
    fn test_oracle_release_below_condition_not_met() {
        let s = setup();
        let oracle_client = MockOracleClient::new(&s.env, &s.oracle_addr);
        oracle_client.set_price(&s.asset, &700_000i128);

        let milestone_id = add_price_milestone(
            &s,
            PriceCondition {
                asset: s.asset.clone(),
                target_price_usd: 500_000i128,
                direction: PriceDirection::Below,
            },
        );

        let result = s
            .client
            .try_trigger_oracle_release(&s.escrow_client, &s.escrow_id, &milestone_id);

        assert_eq!(
            result.unwrap_err().unwrap(),
            EscrowError::InvalidMilestoneState
        );
    }

    #[test]
    fn test_milestone_without_price_condition_rejected() {
        let s = setup();

        let milestone_id = s.client.add_milestone(
            &s.escrow_client,
            &s.escrow_id,
            &String::from_str(&s.env, "plain"),
            &BytesN::from_array(&s.env, &[2u8; 32]),
            &1_000i128,
        );

        let result = s
            .client
            .try_trigger_oracle_release(&s.escrow_client, &s.escrow_id, &milestone_id);

        assert_eq!(
            result.unwrap_err().unwrap(),
            EscrowError::InvalidMilestoneState,
            "milestone with no price condition should return InvalidMilestoneState"
        );
    }
}
