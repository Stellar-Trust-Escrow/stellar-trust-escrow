use soroban_sdk::{contracttype, Address, BytesN, Vec};

#[contracttype] #[derive(Clone, Debug)]
pub struct BatchEscrowParams {
    pub freelancer: Address, pub token: Address, pub total_amount: i128,
    pub brief_hash: BytesN<32>, pub arbiter: Option<Address>, pub deadline: Option<u64>,
}

#[contracttype] #[derive(Clone, Debug)]
pub struct FeeRecipient { pub address: Address, pub share_bps: u32 }

#[contracttype] #[derive(Clone, Debug)]
pub struct FeeBalance { pub token: Address, pub amount: i128 }

#[contracttype] #[derive(Clone, Debug)]
pub struct Vote {
    pub voter: Address, pub stake: u64, pub for_client: bool, pub cast_at: u64,
}

#[contracttype] #[derive(Clone, Debug)]
pub struct ArbitrationDispute {
    pub escrow_id: u64, pub voting_opens_at: u64, pub voting_closes_at: u64,
    pub weight_for_client: u64, pub weight_for_freelancer: u64, pub total_stake: u64,
    pub votes: Vec<Vote>, pub resolved: bool, pub client_wins: Option<bool>,
}

#[contracttype] #[derive(Clone, Debug)]
pub struct PendingUpgrade {
    pub new_wasm_hash: BytesN<32>, pub queued_at: u64,
    pub executable_after: u64, pub queued_by: Address,
}

#[contracttype]
pub enum DataKey {
    Admin, FeeBps, FeeRecipients, FeeBalance(Address),
    Dispute(u64), PendingUpgrade, StorageVersion,
}
