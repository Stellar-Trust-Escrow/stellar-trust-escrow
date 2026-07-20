use soroban_sdk::{Address, BytesN};

#[derive(Clone)]
#[soroban_sdk::contracttype]
pub struct BondRecord {
    pub amount: i128,
    pub token: Address,
    pub bonded_at_ledger: u32,
    pub last_action_ledger: u32,
    pub suspended: bool,
}

#[derive(Clone)]
#[soroban_sdk::contracttype]
pub struct SlashRecord {
    pub escrow_id: u64,
    pub amount_slashed: i128,
    pub reason_hash: BytesN<32>,
    pub ledger: u32,
}

#[derive(Clone)]
#[soroban_sdk::contracttype]
pub struct AppealRecord {
    pub appellant: Address,
    pub escrow_id: u64,
    pub evidence_hash: BytesN<32>,
    pub opened_at: u32,
    pub resolved: bool,
}

#[derive(Clone)]
#[soroban_sdk::contracttype]
pub struct StakingConfig {
    pub min_bond_amount: i128,
    pub slash_bps: u32,
    pub cooldown_ledgers: u32,
}

#[derive(Clone)]
#[soroban_sdk::contracttype]
pub enum DataKey {
    Bond(Address),
    ActiveDisputeCount(Address),
    SlashHistory(Address),
    Appeal(u64),
    StakingConfig,
}
