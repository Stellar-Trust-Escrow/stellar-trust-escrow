#[cfg(test)]
mod nft_gated_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError};
    use soroban_sdk::{
        contract, contractimpl, testutils::Address as _, Address, BytesN, Env,
    };

    // ── Mock NFT contract ─────────────────────────────────────────────────────

    #[contract]
    pub struct MockNft;

    #[contractimpl]
    impl MockNft {
        pub fn set_balance(env: Env, owner: Address, id: u64, bal: i128) {
            env.storage().instance().set(&(owner, id), &bal);
        }

        pub fn balance(env: Env, owner: Address, id: u64) -> i128 {
            env.storage()
                .instance()
                .get::<(Address, u64), i128>(&(owner, id))
                .unwrap_or(0)
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    struct Setup {
        env: Env,
        client: EscrowContractClient<'static>,
        nft_addr: Address,
        token_addr: Address,
        caller: Address,
        freelancer: Address,
        brief_hash: BytesN<32>,
    }

    fn setup() -> Setup {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);

        let escrow_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &escrow_id);
        client.initialize(&admin);

        let nft_addr = env.register_contract(None, MockNft);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = token_id.address();

        let caller = Address::generate(&env);
        let freelancer = Address::generate(&env);

        soroban_sdk::token::StellarAssetClient::new(&env, &token_addr).mint(&caller, &10_000);

        let brief_hash = BytesN::from_array(&env, &[0u8; 32]);

        Setup {
            env,
            client,
            nft_addr,
            token_addr,
            caller,
            freelancer,
            brief_hash,
        }
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    #[test]
    fn test_nft_holder_can_create_escrow() {
        let s = setup();
        let nft_client = MockNftClient::new(&s.env, &s.nft_addr);
        nft_client.set_balance(&s.caller, &42u64, &1i128);

        let result = s.client.try_create_escrow_with_nft_gate(
            &s.caller,
            &s.nft_addr,
            &42u64,
            &s.freelancer,
            &s.token_addr,
            &1_000i128,
            &s.brief_hash,
            &None,
            &None,
            &None,
        );

        assert!(result.is_ok(), "NFT holder should be able to create escrow");
    }

    #[test]
    fn test_non_holder_cannot_create_escrow() {
        let s = setup();

        let result = s.client.try_create_escrow_with_nft_gate(
            &s.caller,
            &s.nft_addr,
            &42u64,
            &s.freelancer,
            &s.token_addr,
            &1_000i128,
            &s.brief_hash,
            &None,
            &None,
            &None,
        );

        assert_eq!(
            result.unwrap_err().unwrap(),
            EscrowError::Unauthorized,
            "Non-holder should get Unauthorized"
        );
    }

    #[test]
    fn test_nft_gated_escrow_returns_valid_id() {
        let s = setup();
        let nft_client = MockNftClient::new(&s.env, &s.nft_addr);
        nft_client.set_balance(&s.caller, &1u64, &5i128);

        let escrow_id = s.client.create_escrow_with_nft_gate(
            &s.caller,
            &s.nft_addr,
            &1u64,
            &s.freelancer,
            &s.token_addr,
            &500i128,
            &s.brief_hash,
            &None,
            &None,
            &None,
        );

        assert_eq!(escrow_id, 0u64);
    }
}
