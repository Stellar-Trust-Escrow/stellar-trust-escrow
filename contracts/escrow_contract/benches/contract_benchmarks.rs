use criterion::{criterion_group, criterion_main, BatchSize, BenchmarkId, Criterion};
use soroban_sdk::{Address, BytesN, Env, String, Vec};
use soroban_sdk::token;
use stellar_trust_escrow_contract::EscrowContractClient;

const MONTH_SECONDS: u64 = 30 * 86_400;

fn setup_env() -> (Env, Address, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client_address = Address::generate(&env);
    let freelancer = Address::generate(&env);
    let contract_id = env.register_contract(None, stellar_trust_escrow_contract::EscrowContract);
    let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_id = token_contract.address();
    let client = EscrowContractClient::new(&env, &contract_id);
    client.initialize(&admin);
    (env, admin, client_address, freelancer, token_id, contract_id)
}

fn mint_for(env: &Env, minter: &Address, token_id: &Address, amount: i128) {
    let token_admin = token::StellarAssetClient::new(&env, token_id);
    token_admin.mint(minter, &amount);
}

fn benchmark_process_recurring_payments(c: &mut Criterion) {
    let mut group = c.benchmark_group("process_recurring_payments");
    for &payments in &[1u32, 5, 10] {
        group.bench_with_input(BenchmarkId::from_parameter(payments), &payments, |b, &payments| {
            b.iter_batched(
                || {
                    let (env, _admin, client_address, freelancer, token_id, contract_id) = setup_env();
                    let client = EscrowContractClient::new(&env, &contract_id);
                    mint_for(&env, &client_address, &token_id, 100_i128 * i128::from(payments) + 10);
                    let start_time = env.ledger().timestamp() + 1;
                    let escrow_id = client.create_recurring_escrow(
                        &client_address,
                        &freelancer,
                        &token_id,
                        &100_i128,
                        &stellar_trust_escrow_contract::types::RecurringInterval::Daily,
                        &start_time,
                        &None,
                        &Some(payments),
                        &BytesN::from_array(&env, &[42; 32]),
                    );
                    env.ledger().with_mut(|ledger| ledger.timestamp = start_time + 86_400 * u64::from(payments));
                    (client, escrow_id)
                },
                |(env, client, escrow_id)| {
                    client.process_recurring_payments(&escrow_id)
                },
                BatchSize::SmallInput,
            );
        });
    }
    group.finish();
}

fn benchmark_batch_add_milestones(c: &mut Criterion) {
    let mut group = c.benchmark_group("batch_add_milestones");
    for &count in &[5u32, 10, 20] {
        group.bench_with_input(BenchmarkId::from_parameter(count), &count, |b, &count| {
            b.iter_batched(
                || {
                    let (env, _admin, client_address, freelancer, token_id, contract_id) = setup_env();
                    let client = EscrowContractClient::new(&env, &contract_id);
                    mint_for(&env, &client_address, &token_id, 1_000_000_i128);
                    let no_multisig = stellar_trust_escrow_contract::types::MultisigConfig {
                        approvers: Vec::new(&env),
                        weights: Vec::new(&env),
                        threshold: 0,
                    };
                    let escrow_id = client.create_escrow(
                        &client_address,
                        &freelancer,
                        &token_id,
                        &1_000_000_i128,
                        &BytesN::from_array(&env, &[43; 32]),
                        &None,
                        &None,
                        &None,
                        &None,
                        &no_multisig,
                    );
                    let mut titles = Vec::new(&env);
                    let mut description_hashes = Vec::new(&env);
                    let mut amounts = Vec::new(&env);
                    for i in 0..count {
                        titles.push_back(String::from_str(&env, &format!("Milestone {}", i)));
                        description_hashes.push_back(BytesN::from_array(&env, &[i as u8; 32]));
                        amounts.push_back(10_000_i128);
                    }
                    (client, escrow_id, titles, description_hashes, amounts)
                },
                |(client, escrow_id, titles, description_hashes, amounts)| {
                    client.batch_add_milestones(&escrow_id, &titles, &description_hashes, &amounts)
                },
                BatchSize::SmallInput,
            );
        });
    }
    group.finish();
}

fn benchmark_batch_release_funds(c: &mut Criterion) {
    let mut group = c.benchmark_group("batch_release_funds");
    for &count in &[5u32, 10, 20] {
        group.bench_with_input(BenchmarkId::from_parameter(count), &count, |b, &count| {
            b.iter_batched(
                || {
                    let (env, admin, client_address, freelancer, token_id, contract_id) = setup_env();
                    let client = EscrowContractClient::new(&env, &contract_id);
                    mint_for(&env, &client_address, &token_id, 1_000_000_i128);
                    let no_multisig = stellar_trust_escrow_contract::types::MultisigConfig {
                        approvers: Vec::new(&env),
                        weights: Vec::new(&env),
                        threshold: 0,
                    };
                    let lock_time = env.ledger().timestamp() + 86_400;
                    let escrow_id = client.create_escrow(
                        &client_address,
                        &freelancer,
                        &token_id,
                        &(count as i128 * 10_000_i128),
                        &BytesN::from_array(&env, &[44; 32]),
                        &None,
                        &None,
                        &Some(lock_time),
                        &None,
                        &no_multisig,
                    );
                    let mut titles = Vec::new(&env);
                    let mut description_hashes = Vec::new(&env);
                    let mut amounts = Vec::new(&env);
                    let mut milestone_ids = Vec::new(&env);
                    for i in 0..count {
                        titles.push_back(String::from_str(&env, &format!("Milestone {}", i)));
                        description_hashes.push_back(BytesN::from_array(&env, &[i as u8; 32]));
                        amounts.push_back(10_000_i128);
                        milestone_ids.push_back(i);
                    }
                    client.batch_add_milestones(&client_address, &escrow_id, &titles, &description_hashes, &amounts);
                    for i in 0..count {
                        client.submit_milestone(&freelancer, &escrow_id, &i);
                    }
                    client.batch_approve_milestones(&client_address, &escrow_id, &milestone_ids);
                    env.ledger().with_mut(|ledger| ledger.timestamp = lock_time + 1);
                    (client, admin, escrow_id, milestone_ids)
                },
                |(client, admin, escrow_id, milestone_ids)| {
                    client.batch_release_funds(&admin, &escrow_id, &milestone_ids)
                },
                BatchSize::SmallInput,
            );
        });
    }
    group.finish();
}

criterion_group!(benches, benchmark_process_recurring_payments, benchmark_batch_add_milestones, benchmark_batch_release_funds);
criterion_main!(benches);
