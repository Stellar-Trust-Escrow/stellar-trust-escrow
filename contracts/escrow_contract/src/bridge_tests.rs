#[cfg(test)]
#[allow(clippy::module_inception)]
mod bridge_tests {
    use crate::bridge::{BridgeProtocol, WrappedTokenInfo, MIN_BRIDGE_CONFIRMATIONS};
    use crate::{EscrowContract, EscrowContractClient, EscrowError};
    use soroban_sdk::{testutils::{Address as _, Events}, Address, Env, String, Symbol, TryFromVal, Val};

    fn setup() -> (Env, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn make_wrapped_token_info(
        env: &Env,
        stellar_address: Address,
        is_approved: bool,
    ) -> WrappedTokenInfo {
        WrappedTokenInfo {
            stellar_address,
            origin_chain: String::from_str(env, "ethereum"),
            origin_address: String::from_str(env, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
            bridge: BridgeProtocol::Wormhole,
            is_approved,
        }
    }

    fn has_topic_symbol(env: &Env, topics: &soroban_sdk::Vec<Val>, expected: Symbol) -> bool {
        topics
            .get(0)
            .map(|val| {
                Symbol::try_from_val(env, &val)
                    .expect("event topic[0] should be a symbol")
                    == expected
            })
            .unwrap_or(false)
    }

    // ── AC: Wrapped tokens are recognized ────────────────────────────────────

    #[test]
    fn test_wrapped_token_registered_and_recognized() {
        let (env, admin, client) = setup();
        let token = Address::generate(&env);
        let info = make_wrapped_token_info(&env, token.clone(), true);

        client.register_wrapped_token(&admin, &info);

        let result = client.get_wrapped_token_info(&token).unwrap();
        assert_eq!(result.origin_chain, String::from_str(&env, "ethereum"));
        assert_eq!(result.bridge, BridgeProtocol::Wormhole);
        assert!(result.is_approved);
    }

    #[test]
    fn test_unregistered_token_not_recognized() {
        let (env, _, client) = setup();
        let unknown = Address::generate(&env);
        assert!(client.get_wrapped_token_info(&unknown).is_none());
    }

    #[test]
    fn test_unapproved_wrapped_token_rejected_on_escrow_creation() {
        let (env, admin, client) = setup();
        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = token_id.address();

        // Register token as NOT approved
        let info = make_wrapped_token_info(&env, token_addr.clone(), false);
        client.register_wrapped_token(&admin, &info);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        soroban_sdk::token::StellarAssetClient::new(&env, &token_addr).mint(&escrow_client, &1000);

        let brief_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);
        let multisig = crate::MultisigConfig {
            approvers: soroban_sdk::Vec::new(&env),
            weights: soroban_sdk::Vec::new(&env),
            threshold: 0,
        };

        let result = client.try_create_escrow(
            &escrow_client,
            &freelancer,
            &token_addr,
            &1000i128,
            &brief_hash,
            &None,
            &None,
            &None,
            &None,
            &multisig,
        );
        assert!(result.is_err());
    }

    // ── AC: Bridge confirmations are tracked ─────────────────────────────────

    #[test]
    fn test_bridge_confirmation_tracked_below_threshold() {
        let (env, _, client) = setup();
        let transfer_token = Address::generate(&env);

        client.update_bridge_confirmation(
            &transfer_token,
            &BridgeProtocol::Wormhole,
            &(MIN_BRIDGE_CONFIRMATIONS - 1),
        );

        let conf = client.get_bridge_confirmation(&transfer_token).unwrap();
        assert_eq!(conf.confirmations, MIN_BRIDGE_CONFIRMATIONS - 1);
        assert!(!conf.is_finalized);
    }

    #[test]
    fn test_bridge_confirmation_finalized_at_threshold() {
        let (env, _, client) = setup();
        let transfer_token = Address::generate(&env);

        client.update_bridge_confirmation(
            &transfer_token,
            &BridgeProtocol::Allbridge,
            &MIN_BRIDGE_CONFIRMATIONS,
        );

        let conf = client.get_bridge_confirmation(&transfer_token).unwrap();
        assert_eq!(conf.confirmations, MIN_BRIDGE_CONFIRMATIONS);
        assert!(conf.is_finalized);
        assert_eq!(conf.bridge, BridgeProtocol::Allbridge);
    }

    #[test]
    fn test_bridge_confirmation_updated_incrementally() {
        let (env, _, client) = setup();
        let transfer_token = Address::generate(&env);

        client.update_bridge_confirmation(&transfer_token, &BridgeProtocol::Wormhole, &5);
        assert!(
            !client
                .get_bridge_confirmation(&transfer_token)
                .unwrap()
                .is_finalized
        );

        client.update_bridge_confirmation(
            &transfer_token,
            &BridgeProtocol::Wormhole,
            &MIN_BRIDGE_CONFIRMATIONS,
        );
        assert!(
            client
                .get_bridge_confirmation(&transfer_token)
                .unwrap()
                .is_finalized
        );
    }

    // ── AC: Cross-chain transfers work ────────────────────────────────────────

    #[test]
    fn test_approved_wrapped_token_rejected_without_finalization() {
        let (env, admin, client) = setup();
        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = token_id.address();

        // Register as approved
        let info = make_wrapped_token_info(&env, token_addr.clone(), true);
        client.register_wrapped_token(&admin, &info);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        // create_escrow transfers amount + rent_reserve (30 stroops for 1 entry × 30 periods)
        soroban_sdk::token::StellarAssetClient::new(&env, &token_addr).mint(&escrow_client, &1030);

        let brief_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);
        let multisig = crate::MultisigConfig {
            approvers: soroban_sdk::Vec::new(&env),
            weights: soroban_sdk::Vec::new(&env),
            threshold: 0,
        };

        let result = client.try_create_escrow(
            &escrow_client,
            &freelancer,
            &token_addr,
            &1000i128,
            &brief_hash,
            &None,
            &None,
            &None,
            &None,
            &multisig,
        );
        assert!(matches!(result, Err(Ok(EscrowError::BridgeError))));
    }

    // ── AC: Token representation is canonical ────────────────────────────────

    #[test]
    fn test_bridge_confirmation_threshold_enforcement() {
        let (env, admin, client) = setup();
        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = token_id.address();

        let info = make_wrapped_token_info(&env, token_addr.clone(), true);
        client.register_wrapped_token(&admin, &info);

        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        soroban_sdk::token::StellarAssetClient::new(&env, &token_addr).mint(&escrow_client, &1030);

        client.update_bridge_confirmation(
            &token_addr,
            &BridgeProtocol::Wormhole,
            &(MIN_BRIDGE_CONFIRMATIONS - 1),
        );

        let conf = client.get_bridge_confirmation(&token_addr).unwrap();
        assert_eq!(conf.confirmations, MIN_BRIDGE_CONFIRMATIONS - 1);
        assert!(!conf.is_finalized);

        let events = env.events().all();
        let event = events
            .iter()
            .find(|(_, topics, _)| {
                has_topic_symbol(&env, topics, soroban_sdk::symbol_short!("brg_cnf"))
                    && Address::try_from_val(&env, &topics.get(1).unwrap()).unwrap() == token_addr
            })
            .expect("expected brg_cnf event for 14 confirmations");
        let (emitted_confirmations, emitted_is_finalized): (u32, bool) =
            soroban_sdk::FromVal::from_val(&env, &event.2);
        assert_eq!(emitted_confirmations, MIN_BRIDGE_CONFIRMATIONS - 1);
        assert!(!emitted_is_finalized);

        let brief_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);
        let multisig = crate::MultisigConfig {
            approvers: soroban_sdk::Vec::new(&env),
            weights: soroban_sdk::Vec::new(&env),
            threshold: 0,
        };

        let result = client.try_create_escrow(
            &escrow_client,
            &freelancer,
            &token_addr,
            &1000i128,
            &brief_hash,
            &None,
            &None,
            &None,
            &None,
            &multisig,
        );
        assert!(matches!(result, Err(Ok(EscrowError::BridgeError))));

        client.update_bridge_confirmation(
            &token_addr,
            &BridgeProtocol::Wormhole,
            &MIN_BRIDGE_CONFIRMATIONS,
        );

        let conf = client.get_bridge_confirmation(&token_addr).unwrap();
        assert_eq!(conf.confirmations, MIN_BRIDGE_CONFIRMATIONS);
        assert!(conf.is_finalized);

        let events = env.events().all();
        let event = events
            .iter()
            .rev()
            .find(|(_, topics, _)| {
                has_topic_symbol(&env, topics, soroban_sdk::symbol_short!("brg_cnf"))
                    && Address::try_from_val(&env, &topics.get(1).unwrap()).unwrap() == token_addr
            })
            .expect("expected brg_cnf event for 15 confirmations");
        let (emitted_confirmations, emitted_is_finalized): (u32, bool) =
            soroban_sdk::FromVal::from_val(&env, &event.2);
        assert_eq!(emitted_confirmations, MIN_BRIDGE_CONFIRMATIONS);
        assert!(emitted_is_finalized);

        let result = client.try_create_escrow(
            &escrow_client,
            &freelancer,
            &token_addr,
            &1000i128,
            &brief_hash,
            &None,
            &None,
            &None,
            &None,
            &multisig,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_canonical_token_metadata_preserved() {
        let (env, admin, client) = setup();
        let token = Address::generate(&env);
        let origin_addr = String::from_str(&env, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

        let info = WrappedTokenInfo {
            stellar_address: token.clone(),
            origin_chain: String::from_str(&env, "ethereum"),
            origin_address: origin_addr.clone(),
            bridge: BridgeProtocol::Wormhole,
            is_approved: true,
        };
        client.register_wrapped_token(&admin, &info);

        let stored = client.get_wrapped_token_info(&token).unwrap();
        assert_eq!(stored.stellar_address, token);
        assert_eq!(stored.origin_chain, String::from_str(&env, "ethereum"));
        assert_eq!(stored.origin_address, origin_addr);
        assert_eq!(stored.bridge, BridgeProtocol::Wormhole);
    }

    #[test]
    fn test_re_registering_token_updates_canonical_record() {
        let (env, admin, client) = setup();
        let token = Address::generate(&env);

        // Register unapproved first
        client.register_wrapped_token(&admin, &make_wrapped_token_info(&env, token.clone(), false));
        assert!(!client.get_wrapped_token_info(&token).unwrap().is_approved);

        // Re-register as approved (admin updates canonical record)
        client.register_wrapped_token(&admin, &make_wrapped_token_info(&env, token.clone(), true));
        assert!(client.get_wrapped_token_info(&token).unwrap().is_approved);
    }
}
