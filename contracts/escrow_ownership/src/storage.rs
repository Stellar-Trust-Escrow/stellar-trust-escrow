use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Authorised escrow contract address (set once at init).
    EscrowContract,
    /// Current client-rights holder for the given escrow_id.
    Owner(u64),
    /// Address that has accepted (or been offered) a pending transfer.
    PendingTransfer(u64),
}

const LEDGERS_TO_LIVE: u32 = 518400; // ~30 days at 5s/ledger

pub fn bump(env: &soroban_sdk::Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, LEDGERS_TO_LIVE, LEDGERS_TO_LIVE);
}

pub fn get_owner(env: &soroban_sdk::Env, escrow_id: u64) -> Option<Address> {
    env.storage().persistent().get(&DataKey::Owner(escrow_id))
}

pub fn set_owner(env: &soroban_sdk::Env, escrow_id: u64, owner: &Address) {
    let key = DataKey::Owner(escrow_id);
    env.storage().persistent().set(&key, owner);
    bump(env, &key);
}

pub fn get_pending(env: &soroban_sdk::Env, escrow_id: u64) -> Option<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::PendingTransfer(escrow_id))
}

pub fn set_pending(env: &soroban_sdk::Env, escrow_id: u64, addr: &Address) {
    let key = DataKey::PendingTransfer(escrow_id);
    env.storage().persistent().set(&key, addr);
    bump(env, &key);
}

pub fn clear_pending(env: &soroban_sdk::Env, escrow_id: u64) {
    env.storage()
        .persistent()
        .remove(&DataKey::PendingTransfer(escrow_id));
}

pub fn get_escrow_contract(env: &soroban_sdk::Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::EscrowContract)
}

pub fn set_escrow_contract(env: &soroban_sdk::Env, addr: &Address) {
    env.storage().instance().set(&DataKey::EscrowContract, addr);
}
