/// Gas profiling tests for InsuranceContract.
///
/// Each test prints a structured line:
///   GAS_PROFILE | insurance_contract | <function> | cpu=<n> | mem=<n>
///
/// The `scripts/gas-profile.sh` script collects these lines and writes
/// `gas-report.json`.
#[cfg(test)]
#[allow(clippy::module_inception)]
mod gas_profiling {
    extern crate std;
    use crate::{InsuranceContract, InsuranceContractClient};
    use soroban_sdk::{testutils::Address as _, token, Env, String};
    use std::println;

    struct Setup {
        env: Env,
        admin: soroban_sdk::Address,
        token_id: soroban_sdk::Address,
        client: InsuranceContractClient<'static>,
    }

    fn setup() -> Setup {
        let env = Env::default();
        env.mock_all_auths();
        let admin = soroban_sdk::Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let contract_id = env.register_contract(None, InsuranceContract);
        let client = InsuranceContractClient::new(&env, &contract_id);
        client.initialize(&admin, &token_id, &10_i128, &10_000_i128, &2_u32);
        Setup {
            env,
            admin,
            token_id,
            client,
        }
    }

    fn mint(env: &Env, token_id: &soroban_sdk::Address, to: &soroban_sdk::Address, amount: i128) {
        token::StellarAssetClient::new(env, token_id).mint(to, &amount);
    }

    fn print(function: &str, cpu: u64, mem: u64) {
        println!(
            "GAS_PROFILE | insurance_contract | {} | cpu={} | mem={}",
            function, cpu, mem
        );
    }

    #[test]
    fn profile_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = soroban_sdk::Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let contract_id = env.register_contract(None, InsuranceContract);
        let client = InsuranceContractClient::new(&env, &contract_id);

        env.budget().reset_default();
        client.initialize(&admin, &token_id, &10_i128, &10_000_i128, &2_u32);
        print(
            "initialize",
            env.budget().cpu_instruction_cost(),
            env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_contribute() {
        let s = setup();
        let contributor = soroban_sdk::Address::generate(&s.env);
        mint(&s.env, &s.token_id, &contributor, 500);

        s.env.budget().reset_default();
        s.client.contribute(&contributor, &500_i128);
        print(
            "contribute",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_submit_claim() {
        let s = setup();
        let claimant = soroban_sdk::Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Lost funds due to exploit");

        s.env.budget().reset_default();
        s.client.submit_claim(&claimant, &desc, &1_000_i128);
        print(
            "submit_claim",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_withdraw_claim() {
        let s = setup();
        let claimant = soroban_sdk::Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Lost funds");
        let claim_id = s.client.submit_claim(&claimant, &desc, &1_000_i128);

        s.env.budget().reset_default();
        s.client.withdraw_claim(&claimant, &claim_id);
        print(
            "withdraw_claim",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_vote() {
        let s = setup();
        let claimant = soroban_sdk::Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Lost funds");
        let claim_id = s.client.submit_claim(&claimant, &desc, &1_000_i128);
        let governor = soroban_sdk::Address::generate(&s.env);
        s.client.add_governor(&s.admin, &governor);

        s.env.budget().reset_default();
        s.client.vote(&governor, &claim_id, &true);
        print(
            "vote",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_execute_payout() {
        let s = setup();
        let contributor = soroban_sdk::Address::generate(&s.env);
        mint(&s.env, &s.token_id, &contributor, 10_000);
        s.client.contribute(&contributor, &10_000_i128);

        let claimant = soroban_sdk::Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Lost funds");
        let claim_id = s.client.submit_claim(&claimant, &desc, &1_000_i128);

        let g1 = soroban_sdk::Address::generate(&s.env);
        let g2 = soroban_sdk::Address::generate(&s.env);
        s.client.add_governor(&s.admin, &g1);
        s.client.add_governor(&s.admin, &g2);
        s.client.vote(&g1, &claim_id, &true);
        s.client.vote(&g2, &claim_id, &true);

        s.env.budget().reset_default();
        s.client.execute_payout(&claim_id);
        print(
            "execute_payout",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_add_governor() {
        let s = setup();
        let governor = soroban_sdk::Address::generate(&s.env);

        s.env.budget().reset_default();
        s.client.add_governor(&s.admin, &governor);
        print(
            "add_governor",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_remove_governor() {
        let s = setup();
        let governor = soroban_sdk::Address::generate(&s.env);
        s.client.add_governor(&s.admin, &governor);

        s.env.budget().reset_default();
        s.client.remove_governor(&s.admin, &governor);
        print(
            "remove_governor",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_set_claim_cap() {
        let s = setup();

        s.env.budget().reset_default();
        s.client.set_claim_cap(&s.admin, &20_000_i128);
        print(
            "set_claim_cap",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_set_quorum() {
        let s = setup();

        s.env.budget().reset_default();
        s.client.set_quorum(&s.admin, &3_u32);
        print(
            "set_quorum",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_get_fund_info() {
        let s = setup();

        s.env.budget().reset_default();
        s.client.get_fund_info();
        print(
            "get_fund_info",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_get_claim() {
        let s = setup();
        let claimant = soroban_sdk::Address::generate(&s.env);
        let desc = String::from_str(&s.env, "Lost funds");
        let claim_id = s.client.submit_claim(&claimant, &desc, &1_000_i128);

        s.env.budget().reset_default();
        s.client.get_claim(&claim_id);
        print(
            "get_claim",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_get_contribution() {
        let s = setup();
        let contributor = soroban_sdk::Address::generate(&s.env);

        s.env.budget().reset_default();
        s.client.get_contribution(&contributor);
        print(
            "get_contribution",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }

    #[test]
    fn profile_is_governor() {
        let s = setup();
        let addr = soroban_sdk::Address::generate(&s.env);

        s.env.budget().reset_default();
        s.client.is_governor(&addr);
        print(
            "is_governor",
            s.env.budget().cpu_instruction_cost(),
            s.env.budget().memory_bytes_cost(),
        );
    }
}
