use soroban_sdk::Env;

use crate::types::{DataKey, Stream};

pub fn get_stream(env: &Env, stream_id: u64) -> Stream {
    env.storage()
        .persistent()
        .get(&DataKey::Stream(stream_id))
        .expect("stream not found")
}

pub fn set_stream(env: &Env, stream_id: u64, stream: &Stream) {
    env.storage()
        .persistent()
        .set(&DataKey::Stream(stream_id), stream);
}

pub fn get_stream_count(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&DataKey::StreamCount)
        .unwrap_or(0)
}

pub fn increment_stream_count(env: &Env) -> u64 {
    let count = get_stream_count(env);
    env.storage()
        .persistent()
        .set(&DataKey::StreamCount, &(count + 1));
    count + 1
}
