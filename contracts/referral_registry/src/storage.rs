use soroban_sdk::{contracttype, Address, Symbol};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Authorised escrow contract address (set once at init).
    EscrowContract,
    /// Symbol registered by a given referrer address -> the code owns it.
    CodeOf(Address),
    /// Referral code -> the referrer address that owns it (reverse lookup,
    /// also how we check "is this code registered at all").
    OwnerOfCode(Symbol),
    /// escrow_id -> referrer Address, once bound. Presence of this key is
    /// what makes bind_referral idempotent (AlreadyBound).
    Referrer(u64),
}

const LEDGERS_TO_LIVE: u32 = 518_400; // ~30 days at 5s/ledger

pub fn bump(env: &soroban_sdk::Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, LEDGERS_TO_LIVE, LEDGERS_TO_LIVE);
}

pub fn get_code_for_referrer(env: &soroban_sdk::Env, referrer: &Address) -> Option<Symbol> {
    env.storage()
        .persistent()
        .get(&DataKey::CodeOf(referrer.clone()))
}

pub fn get_owner_of_code(env: &soroban_sdk::Env, code: &Symbol) -> Option<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::OwnerOfCode(code.clone()))
}

pub fn set_code(env: &soroban_sdk::Env, referrer: &Address, code: &Symbol) {
    let code_key = DataKey::CodeOf(referrer.clone());
    env.storage().persistent().set(&code_key, code);
    bump(env, &code_key);

    let owner_key = DataKey::OwnerOfCode(code.clone());
    env.storage().persistent().set(&owner_key, referrer);
    bump(env, &owner_key);
}

pub fn get_referrer(env: &soroban_sdk::Env, escrow_id: u64) -> Option<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::Referrer(escrow_id))
}

pub fn set_referrer(env: &soroban_sdk::Env, escrow_id: u64, referrer: &Address) {
    let key = DataKey::Referrer(escrow_id);
    env.storage().persistent().set(&key, referrer);
    bump(env, &key);
}

pub fn get_escrow_contract(env: &soroban_sdk::Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::EscrowContract)
}

pub fn set_escrow_contract(env: &soroban_sdk::Env, addr: &Address) {
    env.storage().instance().set(&DataKey::EscrowContract, addr);
}
