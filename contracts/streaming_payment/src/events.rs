use soroban_sdk::{symbol_short, Address, Env, Symbol};

pub const STREAM_CREATED: Symbol = symbol_short!("str_crt");
pub const STREAM_CLAIMED: Symbol = symbol_short!("str_clm");
pub const STREAM_PAUSED: Symbol = symbol_short!("str_pau");
pub const STREAM_RESUMED: Symbol = symbol_short!("str_res");
pub const STREAM_CANCELLED: Symbol = symbol_short!("str_can");
pub const STREAM_DRAINED: Symbol = symbol_short!("str_drn");

pub fn emit_stream_created(
    env: &Env,
    stream_id: u64,
    sender: &Address,
    recipient: &Address,
    token: &Address,
    total_amount: i128,
    rate_per_second: i128,
    start_at: u64,
) {
    env.events().publish(
        (STREAM_CREATED, stream_id),
        (
            sender.clone(),
            recipient.clone(),
            token.clone(),
            total_amount,
            rate_per_second,
            start_at,
        ),
    );
}

pub fn emit_stream_claimed(
    env: &Env,
    stream_id: u64,
    amount: i128,
    recipient: &Address,
    remaining: i128,
) {
    env.events().publish(
        (STREAM_CLAIMED, stream_id),
        (amount, recipient.clone(), remaining),
    );
}

pub fn emit_stream_paused(env: &Env, stream_id: u64) {
    env.events().publish((STREAM_PAUSED, stream_id), ());
}

pub fn emit_stream_resumed(env: &Env, stream_id: u64) {
    env.events().publish((STREAM_RESUMED, stream_id), ());
}

pub fn emit_stream_cancelled(env: &Env, stream_id: u64, to_recipient: i128, to_sender: i128) {
    env.events()
        .publish((STREAM_CANCELLED, stream_id), (to_recipient, to_sender));
}

pub fn emit_stream_drained(env: &Env, stream_id: u64) {
    env.events().publish((STREAM_DRAINED, stream_id), ());
}
