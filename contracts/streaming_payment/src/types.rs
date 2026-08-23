use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StreamStatus {
    Active,
    Paused,
    Completed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stream {
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub total_amount: i128,
    pub remaining_balance: i128,
    pub rate_per_second: i128,
    pub start_at: u64,
    pub last_claim_time: u64,
    pub paused: bool,
    pub paused_at: Option<u64>,
    pub status: StreamStatus,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Stream(u64),
    StreamCount,
}

/// Precision divisor for rate_per_second (1e7 = Stellar's standard integer precision).
pub const RATE_PRECISION: i128 = 10_000_000;
