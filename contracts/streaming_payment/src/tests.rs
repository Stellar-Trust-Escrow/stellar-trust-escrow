#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

use crate::types::RATE_PRECISION;
use crate::{StreamingPaymentContract, StreamingPaymentContractClient};

// ── Minimal mock token ──────────────────────────────────────────────────────

mod mock_token {
    use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

    const _MINT: Symbol = symbol_short!("mint");
    const _TRANSFER: Symbol = symbol_short!("transfer");
    const _BALANCE: Symbol = symbol_short!("balance");

    #[contracttype]
    #[derive(Clone)]
    pub enum DataKey {
        Bal(Address),
    }

    #[contract]
    pub struct MockToken;

    pub use MockTokenClient as Client;

    #[contractimpl]
    impl MockToken {
        pub fn mint(env: Env, to: Address, amount: i128) {
            let bal: i128 = env
                .storage()
                .persistent()
                .get(&DataKey::Bal(to.clone()))
                .unwrap_or(0);
            env.storage()
                .persistent()
                .set(&DataKey::Bal(to), &(bal + amount));
        }

        pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> i128 {
            let from_bal: i128 = env
                .storage()
                .persistent()
                .get(&DataKey::Bal(from.clone()))
                .unwrap_or(0);
            assert!(from_bal >= amount, "insufficient balance");
            env.storage()
                .persistent()
                .set(&DataKey::Bal(from), &(from_bal - amount));
            let to_bal: i128 = env
                .storage()
                .persistent()
                .get(&DataKey::Bal(to.clone()))
                .unwrap_or(0);
            env.storage()
                .persistent()
                .set(&DataKey::Bal(to), &(to_bal + amount));
            amount
        }

        pub fn balance(env: Env, account: Address) -> i128 {
            env.storage()
                .persistent()
                .get(&DataKey::Bal(account))
                .unwrap_or(0)
        }
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn setup() -> (Env, Address, Address, Address) {
    let env = Env::default();
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Deploy mock token
    let token_id = env.register_contract(None::<&Address>, mock_token::MockToken);
    let token_client = mock_token::Client::new(&env, &token_id);

    // Mint 1,000,000 tokens to sender (at 1e7 precision)
    token_client.mint(&sender, &1_000_000_000_000_i128); // 100,000 tokens

    (env, sender, recipient, token_id)
}

fn create_stream(
    env: &Env,
    sender: &Address,
    recipient: &Address,
    token: &Address,
    total_amount: i128,
    rate: i128,
    start_at: u64,
) -> (Address, u64) {
    let stream_contract = env.register_contract(None::<&Address>, StreamingPaymentContract);

    env.ledger().with_mut(|li| {
        li.timestamp = start_at;
    });
    env.mock_all_auths();

    let client = StreamingPaymentContractClient::new(env, &stream_contract);
    let stream_id = client.create_stream(sender, recipient, token, &total_amount, &rate, &start_at);

    (stream_contract, stream_id)
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[test]
fn test_create_stream_escrows_tokens() {
    let (env, sender, recipient, token) = setup();
    let token_client = mock_token::Client::new(&env, &token);

    let (stream_contract, stream_id) = create_stream(
        &env,
        &sender,
        &recipient,
        &token,
        100_000_000_000_i128,
        RATE_PRECISION,
        1000,
    );

    // Sender's balance should decrease
    let sender_bal = token_client.balance(&sender);
    assert_eq!(sender_bal, 1_000_000_000_000 - 100_000_000_000);

    // Contract should hold the escrowed tokens
    let contract_bal = token_client.balance(&stream_contract);
    assert_eq!(contract_bal, 100_000_000_000);

    assert_eq!(stream_id, 1);
}

#[test]
fn test_accrued_returns_zero_before_start_at() {
    let (env, sender, recipient, token) = setup();

    let stream_contract = env.register_contract(None::<&Address>, StreamingPaymentContract);
    let client = StreamingPaymentContractClient::new(&env, &stream_contract);

    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    env.mock_all_auths();

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token,
        &100_000_000_000_i128,
        &RATE_PRECISION,
        &2000,
    );

    let accrued = client.accrued(&stream_id);
    assert_eq!(accrued, 0);
}

#[test]
fn test_accrued_after_ten_seconds() {
    let (env, sender, recipient, token) = setup();

    let stream_contract = env.register_contract(None::<&Address>, StreamingPaymentContract);
    let client = StreamingPaymentContractClient::new(&env, &stream_contract);

    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    env.mock_all_auths();

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token,
        &100_000_000_000_i128,
        &RATE_PRECISION,
        &1000,
    );

    env.ledger().with_mut(|li| {
        li.timestamp = 1010;
    });

    let accrued = client.accrued(&stream_id);
    assert_eq!(accrued, 10 * RATE_PRECISION);
}

#[test]
fn test_claim_transfers_correct_amount() {
    let (env, sender, recipient, token) = setup();
    let token_client = mock_token::Client::new(&env, &token);

    let stream_contract = env.register_contract(None::<&Address>, StreamingPaymentContract);
    let client = StreamingPaymentContractClient::new(&env, &stream_contract);

    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    env.mock_all_auths();

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token,
        &100_000_000_000_i128,
        &RATE_PRECISION,
        &1000,
    );

    env.ledger().with_mut(|li| {
        li.timestamp = 1010;
    });

    let claimed = client.claim(&recipient, &stream_id);
    assert_eq!(claimed, 10 * RATE_PRECISION);

    let recipient_bal = token_client.balance(&recipient);
    assert_eq!(recipient_bal, 10 * RATE_PRECISION);
}

#[test]
fn test_cancel_splits_correctly() {
    let (env, sender, recipient, token) = setup();
    let token_client = mock_token::Client::new(&env, &token);

    let stream_contract = env.register_contract(None::<&Address>, StreamingPaymentContract);
    let client = StreamingPaymentContractClient::new(&env, &stream_contract);

    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    env.mock_all_auths();

    let total = 100_000_000_000_i128;
    let stream_id =
        client.create_stream(&sender, &recipient, &token, &total, &RATE_PRECISION, &1000);

    env.ledger().with_mut(|li| {
        li.timestamp = 1030;
    });

    let (to_recipient, to_sender) = client.cancel(&sender, &stream_id);

    assert_eq!(to_recipient, 30 * RATE_PRECISION);
    assert_eq!(to_sender, total - 30 * RATE_PRECISION);
    assert_eq!(to_recipient + to_sender, total);

    let recipient_bal = token_client.balance(&recipient);
    assert_eq!(recipient_bal, 30 * RATE_PRECISION);

    let sender_bal = token_client.balance(&sender);
    assert_eq!(
        sender_bal,
        1_000_000_000_000 - total + (total - 30 * RATE_PRECISION)
    );
}

#[test]
fn test_claim_before_start_returns_zero() {
    let (env, sender, recipient, token) = setup();

    let stream_contract = env.register_contract(None::<&Address>, StreamingPaymentContract);
    let client = StreamingPaymentContractClient::new(&env, &stream_contract);

    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    env.mock_all_auths();

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token,
        &100_000_000_000_i128,
        &RATE_PRECISION,
        &5000,
    );

    let claimed = client.claim(&recipient, &stream_id);
    assert_eq!(claimed, 0);
}

#[test]
fn test_pause_stops_accrual() {
    let (env, sender, recipient, token) = setup();

    let stream_contract = env.register_contract(None::<&Address>, StreamingPaymentContract);
    let client = StreamingPaymentContractClient::new(&env, &stream_contract);

    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    env.mock_all_auths();

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token,
        &100_000_000_000_i128,
        &RATE_PRECISION,
        &1000,
    );

    env.ledger().with_mut(|li| {
        li.timestamp = 1005;
    });
    client.pause(&sender, &stream_id);

    env.ledger().with_mut(|li| {
        li.timestamp = 1020;
    });

    let accrued = client.accrued(&stream_id);
    assert_eq!(accrued, 0);
}

#[test]
fn test_resume_restarts_accrual() {
    let (env, sender, recipient, token) = setup();

    let stream_contract = env.register_contract(None::<&Address>, StreamingPaymentContract);
    let client = StreamingPaymentContractClient::new(&env, &stream_contract);

    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    env.mock_all_auths();

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token,
        &100_000_000_000_i128,
        &RATE_PRECISION,
        &1000,
    );

    env.ledger().with_mut(|li| {
        li.timestamp = 1005;
    });
    client.pause(&sender, &stream_id);

    env.ledger().with_mut(|li| {
        li.timestamp = 1007;
    });
    client.resume(&sender, &stream_id);

    env.ledger().with_mut(|li| {
        li.timestamp = 1010;
    });

    let accrued = client.accrued(&stream_id);
    assert_eq!(accrued, 3 * RATE_PRECISION);
}

#[test]
fn test_cancel_on_completed_stream_is_error() {
    let (env, sender, recipient, token) = setup();

    let stream_contract = env.register_contract(None::<&Address>, StreamingPaymentContract);
    let client = StreamingPaymentContractClient::new(&env, &stream_contract);

    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    env.mock_all_auths();

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token,
        &100_000_000_i128,
        &RATE_PRECISION,
        &1000,
    );

    env.ledger().with_mut(|li| {
        li.timestamp = 1010;
    });
    let _ = client.claim(&recipient, &stream_id);

    env.ledger().with_mut(|li| {
        li.timestamp = 1020;
    });
    let result = client.try_cancel(&sender, &stream_id);
    assert!(result.is_err());
}

#[test]
fn test_pause_on_already_paused_is_noop() {
    let (env, sender, recipient, token) = setup();

    let stream_contract = env.register_contract(None::<&Address>, StreamingPaymentContract);
    let client = StreamingPaymentContractClient::new(&env, &stream_contract);

    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    env.mock_all_auths();

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token,
        &100_000_000_000_i128,
        &RATE_PRECISION,
        &1000,
    );

    client.pause(&sender, &stream_id);
    client.pause(&sender, &stream_id);

    env.ledger().with_mut(|li| {
        li.timestamp = 1010;
    });

    let accrued = client.accrued(&stream_id);
    assert_eq!(accrued, 0);
}

#[test]
fn test_stream_count_increments() {
    let (env, sender, recipient, token) = setup();

    let stream_contract = env.register_contract(None::<&Address>, StreamingPaymentContract);
    let client = StreamingPaymentContractClient::new(&env, &stream_contract);

    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    env.mock_all_auths();

    let id1 = client.create_stream(
        &sender,
        &recipient,
        &token,
        &100_000_000_000_i128,
        &RATE_PRECISION,
        &1000,
    );

    let id2 = client.create_stream(
        &sender,
        &recipient,
        &token,
        &100_000_000_000_i128,
        &RATE_PRECISION,
        &1000,
    );

    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
}

#[test]
fn test_multiple_claims_accumulate() {
    let (env, sender, recipient, token) = setup();
    let token_client = mock_token::Client::new(&env, &token);

    let stream_contract = env.register_contract(None::<&Address>, StreamingPaymentContract);
    let client = StreamingPaymentContractClient::new(&env, &stream_contract);

    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    env.mock_all_auths();

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token,
        &100_000_000_000_i128,
        &RATE_PRECISION,
        &1000,
    );

    env.ledger().with_mut(|li| {
        li.timestamp = 1005;
    });
    let c1 = client.claim(&recipient, &stream_id);
    assert_eq!(c1, 5 * RATE_PRECISION);

    env.ledger().with_mut(|li| {
        li.timestamp = 1010;
    });
    let c2 = client.claim(&recipient, &stream_id);
    assert_eq!(c2, 5 * RATE_PRECISION);

    assert_eq!(token_client.balance(&recipient), 10 * RATE_PRECISION);
}
