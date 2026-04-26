#[cfg(test)]
mod escrow_template_tests {
    use crate::{EscrowContract, EscrowContractClient, EscrowError, EscrowTemplate, MilestoneTemplate};

    use soroban_sdk::{
        testutils::Address as _,
        Address, BytesN, Env,
    };

    fn setup() -> (Env, Address, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        (env, admin, contract_id, client)
    }

    fn register_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let sac = soroban_sdk::token::StellarAssetClient::new(env, &token_id.address());
        sac.mint(recipient, &amount);
        token_id.address()
    }

    #[test]
    fn test_create_and_get_template() {
        let (env, _, _, client) = setup();
        let creator = Address::generate(&env);

        let mut milestones = soroban_sdk::Vec::new(&env);
        milestones.push_back(MilestoneTemplate {
            title: "Design".into(),
            description_hash: BytesN::from_array(&env, &[1u8; 32]),
            amount: 100,
        });
        milestones.push_back(MilestoneTemplate {
            title: "Development".into(),
            description_hash: BytesN::from_array(&env, &[2u8; 32]),
            amount: 200,
        });

        let template_id = client.create_template(&creator, &"Web Dev Template".into(), &milestones);

        let template = client.get_template(&template_id);
        assert_eq!(template.id, template_id);
        assert_eq!(template.creator, creator);
        assert_eq!(template.name, "Web Dev Template");
        assert_eq!(template.milestones.len(), 2);
        assert_eq!(template.milestones.get(0).unwrap().title, "Design");
        assert_eq!(template.milestones.get(1).unwrap().amount, 200);
    }

    #[test]
    fn test_create_escrow_from_template() {
        let (env, admin, _, client) = setup();
        let creator = Address::generate(&env);
        let escrow_client = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let token = register_token(&env, &admin, &escrow_client, 1000);

        let mut milestones = soroban_sdk::Vec::new(&env);
        milestones.push_back(MilestoneTemplate {
            title: "Phase 1".into(),
            description_hash: BytesN::from_array(&env, &[1u8; 32]),
            amount: 300,
        });
        milestones.push_back(MilestoneTemplate {
            title: "Phase 2".into(),
            description_hash: BytesN::from_array(&env, &[2u8; 32]),
            amount: 400,
        });

        let template_id = client.create_template(&creator, &"Test Template".into(), &milestones);

        let total_amount = 700;
        let brief_hash = BytesN::from_array(&env, &[0u8; 32]);
        let escrow_id = client.create_escrow_from_template(
            &escrow_client,
            &template_id,
            &escrow_client,
            &freelancer,
            &token,
            &total_amount,
            &brief_hash,
            &None::<Address>,
            &None::<u64>,
        );

        let meta = client.get_escrow_meta(&escrow_id);
        assert_eq!(meta.total_amount, total_amount);
        assert_eq!(meta.allocated_amount, 700);
        assert_eq!(meta.milestone_count, 2);

        // Check milestones
        let milestone0 = client.get_milestone(&escrow_id, &0);
        assert_eq!(milestone0.title, "Phase 1");
        assert_eq!(milestone0.amount, 300);

        let milestone1 = client.get_milestone(&escrow_id, &1);
        assert_eq!(milestone1.title, "Phase 2");
        assert_eq!(milestone1.amount, 400);
    }

    #[test]
    fn test_invalid_template_id() {
        let (env, _, _, client) = setup();

        let result = client.try_get_template(&999);
        assert!(result.is_err());
        assert_eq!(result.err().unwrap(), EscrowError::TemplateNotFound);
    }
}