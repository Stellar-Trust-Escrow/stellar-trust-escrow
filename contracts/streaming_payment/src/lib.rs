#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, IntoVal, Symbol, Val, Vec};

mod errors;
mod events;
mod storage;
mod tests;
mod types;

pub use errors::StreamError;
pub use types::{DataKey, Stream, StreamStatus, RATE_PRECISION};

const TRANSFER: Symbol = symbol_short!("transfer");

#[contract]
pub struct StreamingPaymentContract;

#[contractimpl]
impl StreamingPaymentContract {
    /// Create a new payment stream. Transfers `total_amount` from `sender` to
    /// this contract as escrow. Returns a monotonically-increasing stream_id.
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        total_amount: i128,
        rate_per_second: i128,
        start_at: u64,
    ) -> u64 {
        sender.require_auth();

        if total_amount <= 0 {
            panic!("total_amount must be positive");
        }
        if rate_per_second <= 0 {
            panic!("rate_per_second must be positive");
        }

        let now = env.ledger().timestamp();
        if start_at < now {
            panic!("start_at must be in the present or future");
        }

        // Transfer tokens from sender to this contract (escrow)
        let args: Vec<Val> = Vec::from_array(
            &env,
            [
                sender.to_val(),
                env.current_contract_address().to_val(),
                total_amount.into_val(&env),
            ],
        );
        env.invoke_contract::<i128>(&token, &TRANSFER, args);

        let stream_id = storage::increment_stream_count(&env);

        let stream = Stream {
            sender: sender.clone(),
            recipient: recipient.clone(),
            token: token.clone(),
            total_amount,
            remaining_balance: total_amount,
            rate_per_second,
            start_at,
            last_claim_time: start_at,
            paused: false,
            paused_at: None,
            status: StreamStatus::Active,
        };

        storage::set_stream(&env, stream_id, &stream);

        events::emit_stream_created(
            &env,
            stream_id,
            &sender,
            &recipient,
            &token,
            total_amount,
            rate_per_second,
            start_at,
        );

        stream_id
    }

    /// Claim all accrued-but-unclaimed tokens. Only callable by the stream
    /// recipient. Returns the amount transferred.
    pub fn claim(env: Env, recipient: Address, stream_id: u64) -> i128 {
        recipient.require_auth();

        let mut stream = storage::get_stream(&env, stream_id);

        if stream.recipient != recipient {
            panic!("not the stream recipient");
        }
        if stream.status == StreamStatus::Completed {
            panic!("stream already completed");
        }
        if stream.status == StreamStatus::Cancelled {
            panic!("stream already cancelled");
        }
        if stream.remaining_balance <= 0 {
            return 0;
        }

        let accrued = Self::_accrued_amount(&env, &stream);
        if accrued <= 0 {
            return 0;
        }

        let amount = core::cmp::min(accrued, stream.remaining_balance);

        // Transfer tokens from contract to recipient
        let args: Vec<Val> = Vec::from_array(
            &env,
            [
                env.current_contract_address().to_val(),
                recipient.to_val(),
                amount.into_val(&env),
            ],
        );
        env.invoke_contract::<i128>(&stream.token, &TRANSFER, args);

        stream.remaining_balance -= amount;
        stream.last_claim_time = env.ledger().timestamp();

        if stream.remaining_balance <= 0 {
            stream.status = StreamStatus::Completed;
            events::emit_stream_drained(&env, stream_id);
        }

        storage::set_stream(&env, stream_id, &stream);

        events::emit_stream_claimed(
            &env,
            stream_id,
            amount,
            &recipient,
            stream.remaining_balance,
        );

        amount
    }

    /// Pause a stream. Only callable by the sender. Stops the drain. No-op if
    /// already paused.
    pub fn pause(env: Env, sender: Address, stream_id: u64) {
        sender.require_auth();

        let mut stream = storage::get_stream(&env, stream_id);

        if stream.sender != sender {
            panic!("not the stream sender");
        }
        if stream.status != StreamStatus::Active && stream.status != StreamStatus::Paused {
            panic!("stream not in a pausable state");
        }
        if stream.paused {
            return; // no-op
        }

        // Accrue up to now before pausing so we don't lose time
        let accrued = Self::_accrued_amount(&env, &stream);
        if accrued > 0 {
            stream.last_claim_time = env.ledger().timestamp();
            stream.remaining_balance -= core::cmp::min(accrued, stream.remaining_balance);
        }

        stream.paused = true;
        stream.paused_at = Some(env.ledger().timestamp());
        stream.status = StreamStatus::Paused;

        storage::set_stream(&env, stream_id, &stream);
        events::emit_stream_paused(&env, stream_id);
    }

    /// Resume a paused stream. Only callable by the sender. Resets start_at to
    /// the current ledger timestamp.
    pub fn resume(env: Env, sender: Address, stream_id: u64) {
        sender.require_auth();

        let mut stream = storage::get_stream(&env, stream_id);

        if stream.sender != sender {
            panic!("not the stream sender");
        }
        if stream.status != StreamStatus::Paused {
            return; // no-op or error — treat as no-op
        }

        let now = env.ledger().timestamp();
        stream.start_at = now;
        stream.last_claim_time = now;
        stream.paused = false;
        stream.paused_at = None;
        stream.status = StreamStatus::Active;

        storage::set_stream(&env, stream_id, &stream);
        events::emit_stream_resumed(&env, stream_id);
    }

    /// Cancel a stream. Only callable by the sender. Claims recipient's accrued
    /// amount first, then returns the remaining balance to the sender.
    pub fn cancel(env: Env, sender: Address, stream_id: u64) -> (i128, i128) {
        sender.require_auth();

        let mut stream = storage::get_stream(&env, stream_id);

        if stream.sender != sender {
            panic!("not the stream sender");
        }
        if stream.status == StreamStatus::Completed {
            panic!("stream already completed");
        }
        if stream.status == StreamStatus::Cancelled {
            panic!("stream already cancelled");
        }

        // Calculate accrued for recipient
        let accrued = Self::_accrued_amount(&env, &stream);
        let to_recipient = core::cmp::min(accrued, stream.remaining_balance);

        // Transfer accrued to recipient
        if to_recipient > 0 {
            let args: Vec<Val> = Vec::from_array(
                &env,
                [
                    env.current_contract_address().to_val(),
                    stream.recipient.to_val(),
                    to_recipient.into_val(&env),
                ],
            );
            env.invoke_contract::<i128>(&stream.token, &TRANSFER, args);
            stream.remaining_balance -= to_recipient;
        }

        let to_sender = stream.remaining_balance;

        // Return remaining to sender
        if to_sender > 0 {
            let args: Vec<Val> = Vec::from_array(
                &env,
                [
                    env.current_contract_address().to_val(),
                    sender.to_val(),
                    to_sender.into_val(&env),
                ],
            );
            env.invoke_contract::<i128>(&stream.token, &TRANSFER, args);
            stream.remaining_balance = 0;
        }

        stream.status = StreamStatus::Cancelled;
        storage::set_stream(&env, stream_id, &stream);

        events::emit_stream_cancelled(&env, stream_id, to_recipient, to_sender);

        (to_recipient, to_sender)
    }

    /// View: how many tokens has the recipient accrued so far (unclaimed)?
    pub fn accrued(env: Env, stream_id: u64) -> i128 {
        let stream = storage::get_stream(&env, stream_id);
        Self::_accrued_amount(&env, &stream)
    }
}

/// Internal helpers
#[contractimpl]
impl StreamingPaymentContract {
    /// Pure accrual calculation based on the stream's current state and the
    /// ledger timestamp.
    fn _accrued_amount(env: &Env, stream: &Stream) -> i128 {
        if stream.status == StreamStatus::Completed
            || stream.status == StreamStatus::Cancelled
            || stream.paused
            || stream.remaining_balance <= 0
        {
            return 0;
        }

        let now = env.ledger().timestamp();
        if now <= stream.start_at {
            return 0;
        }

        // Use last_claim_time as the accrual baseline. If last_claim_time is
        // before start_at (initial state), use start_at instead.
        let since = if stream.last_claim_time < stream.start_at {
            now - stream.start_at
        } else if now > stream.last_claim_time {
            now - stream.last_claim_time
        } else {
            return 0;
        };

        // accrued = elapsed_seconds * rate_per_second
        let accrued = (since as i128) * stream.rate_per_second;
        core::cmp::min(accrued, stream.remaining_balance)
    }
}
