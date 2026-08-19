#![allow(unused)]

use soroban_sdk::{contracttype, Address, Env, Symbol, symbol_short};

// Storage key prefixes
const APPEAL_KEY: Symbol = symbol_short!("APPEAL");
const TREASURY_KEY: Symbol = symbol_short!("TREASURY");
const ADMIN_KEY: Symbol = symbol_short!("ADMIN");
const BOND_KEY: Symbol = symbol_short!("BOND");

/// Status of an appeal in the two-tier appeal system.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum AppealStatus {
    /// Appeal submitted, awaiting first-tier review or tier-2 assignment.
    Pending,
    /// A second-tier arbiter has been assigned and is reviewing.
    SecondTierAssigned,
    /// A ruling has been issued on the appeal.
    Ruled,
    /// The appeal window has passed without a ruling; appeal is expired.
    Expired,
}

/// Represents an on-chain appeal record for a disputed escrow.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Appeal {
    /// The escrow being appealed.
    pub escrow_id: u64,
    /// The address that filed the appeal.
    pub appellant: Address,
    /// The bond amount locked when the appeal was submitted.
    pub bond_amount: i128,
    /// Which tier this appeal is currently in (1 = first, 2 = second).
    pub tier: u32,
    /// Current status of the appeal.
    pub status: AppealStatus,
    /// Address of the second-tier arbiter, if assigned.
    pub second_tier_arbiter: Option<Address>,
    /// The ruling override result: true = appellant wins, false = original ruling stands.
    pub ruling_override: Option<bool>,
    /// Ledger sequence number at which the override window ends.
    pub override_window_end: u32,
}

/// Derive a unique storage key for an appeal by escrow_id.
fn appeal_storage_key(env: &Env, escrow_id: u64) -> soroban_sdk::Val {
    (APPEAL_KEY, escrow_id).into_val(env)
}

/// Derive a unique storage key for a bond by escrow_id.
fn bond_storage_key(env: &Env, escrow_id: u64) -> soroban_sdk::Val {
    (BOND_KEY, escrow_id).into_val(env)
}

/// Submits an appeal for an escrow dispute.
///
/// The appellant must authorize this call. The bond amount is locked in contract
/// storage (in a real implementation, token transfer to the contract would occur here).
/// An `Appeal` record is created with `AppealStatus::Pending` and a 2-tier structure.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - Identifier of the disputed escrow.
/// * `appellant` - Address filing the appeal.
/// * `bond` - Bond amount in the escrow token's smallest unit.
pub fn submit_appeal(env: &Env, escrow_id: u64, appellant: Address, bond: i128) {
    appellant.require_auth();

    // Ensure no duplicate appeal exists for this escrow
    let storage = env.storage().persistent();
    let key = (APPEAL_KEY, escrow_id);
    if storage.has(&key) {
        panic!("appeal already exists for this escrow");
    }
    if bond <= 0 {
        panic!("bond amount must be positive");
    }

    // Lock the bond amount in persistent storage (representative of token lock)
    let bond_key = (BOND_KEY, escrow_id);
    storage.set(&bond_key, &bond);

    // Compute a default override window: current ledger + 17280 (roughly 24h at 5s/ledger)
    let override_window_end: u32 = env.ledger().sequence() + 17280;

    let appeal = Appeal {
        escrow_id,
        appellant: appellant.clone(),
        bond_amount: bond,
        tier: 1,
        status: AppealStatus::Pending,
        second_tier_arbiter: None,
        ruling_override: None,
        override_window_end,
    };

    storage.set(&key, &appeal);

    env.events().publish(
        (symbol_short!("appeal"), symbol_short!("submit")),
        (escrow_id, appellant, bond),
    );
}

/// Slashes the appeal bond, transferring it to the treasury on a failed appeal.
///
/// In a full implementation, this would invoke a token transfer call to move funds
/// from the contract's holding to the treasury address. Here the bond record is
/// cleared and an event is emitted.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow whose appeal bond is to be slashed.
pub fn slash_bond(env: &Env, escrow_id: u64) {
    let storage = env.storage().persistent();
    let appeal_key = (APPEAL_KEY, escrow_id);

    let appeal: Appeal = storage
        .get(&appeal_key)
        .expect("no appeal found for escrow");

    // Only slash if the appeal was ruled against or is expired
    if appeal.status != AppealStatus::Ruled && appeal.status != AppealStatus::Expired {
        panic!("appeal must be ruled or expired before slashing bond");
    }

    let bond_key = (BOND_KEY, escrow_id);
    let bond_amount: i128 = storage.get(&bond_key).unwrap_or(0i128);

    // Retrieve treasury address for transfer (real impl would call token contract here)
    let treasury_key = TREASURY_KEY;
    let treasury: Address = storage
        .get(&treasury_key)
        .expect("treasury address not configured");

    // In a real contract: token_client.transfer(&env.current_contract_address(), &treasury, &bond_amount);
    // Remove bond record after slash
    storage.remove(&bond_key);

    env.events().publish(
        (symbol_short!("bond"), symbol_short!("slash")),
        (escrow_id, treasury, bond_amount),
    );
}

/// Assigns a second-tier arbiter to an appeal, escalating it to tier 2.
///
/// Only the contract admin may assign a second-tier arbiter. The appeal must be
/// in `Pending` status to be escalated.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow appeal being escalated.
/// * `arbiter` - Address of the second-tier arbiter to assign.
pub fn assign_second_tier_arbiter(env: &Env, escrow_id: u64, arbiter: Address) {
    let storage = env.storage().persistent();

    // Verify caller is admin
    let admin: Address = storage
        .get(&ADMIN_KEY)
        .expect("admin not configured");
    admin.require_auth();

    let appeal_key = (APPEAL_KEY, escrow_id);
    let mut appeal: Appeal = storage
        .get(&appeal_key)
        .expect("no appeal found for escrow");

    if appeal.status != AppealStatus::Pending {
        panic!("appeal must be in Pending status to assign second-tier arbiter");
    }

    appeal.tier = 2;
    appeal.status = AppealStatus::SecondTierAssigned;
    appeal.second_tier_arbiter = Some(arbiter.clone());

    // Extend the override window on escalation (+8640 ledgers ≈ 12h)
    appeal.override_window_end = env.ledger().sequence() + 8640;

    storage.set(&appeal_key, &appeal);

    env.events().publish(
        (symbol_short!("appeal"), symbol_short!("tier2")),
        (escrow_id, arbiter),
    );
}

/// Records a ruling override by the assigned second-tier arbiter.
///
/// The arbiter must be the one assigned to this appeal, and the override window
/// must not have elapsed. Sets the appeal status to `Ruled`.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow appeal being ruled on.
/// * `arbiter` - Address of the arbiter submitting the ruling.
/// * `ruling` - `true` if the appellant wins (original ruling overridden), `false` otherwise.
pub fn rule_override(env: &Env, escrow_id: u64, arbiter: Address, ruling: bool) {
    arbiter.require_auth();

    let storage = env.storage().persistent();
    let appeal_key = (APPEAL_KEY, escrow_id);
    let mut appeal: Appeal = storage
        .get(&appeal_key)
        .expect("no appeal found for escrow");

    if appeal.status != AppealStatus::SecondTierAssigned {
        panic!("appeal must have a second-tier arbiter assigned before ruling");
    }

    // Verify the caller is the assigned arbiter
    match &appeal.second_tier_arbiter {
        Some(assigned) => {
            if assigned != &arbiter {
                panic!("caller is not the assigned second-tier arbiter");
            }
        }
        None => panic!("no second-tier arbiter assigned"),
    }

    // Check that override window has not expired
    let current_ledger = env.ledger().sequence();
    if current_ledger > appeal.override_window_end {
        panic!("override window has expired; appeal should be marked expired");
    }

    appeal.ruling_override = Some(ruling);
    appeal.status = AppealStatus::Ruled;

    storage.set(&appeal_key, &appeal);

    env.events().publish(
        (symbol_short!("appeal"), symbol_short!("ruled")),
        (escrow_id, arbiter, ruling),
    );
}

/// Marks an appeal as expired if its override window has passed without a ruling.
///
/// Anyone may call this function to expire a stale appeal. The bond will remain
/// locked until `slash_bond` is separately invoked.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow appeal to expire.
/// * `current_ledger` - The current ledger sequence number to compare against the window.
pub fn expire_appeal(env: &Env, escrow_id: u64, current_ledger: u32) {
    let storage = env.storage().persistent();
    let appeal_key = (APPEAL_KEY, escrow_id);
    let mut appeal: Appeal = storage
        .get(&appeal_key)
        .expect("no appeal found for escrow");

    if appeal.status == AppealStatus::Ruled || appeal.status == AppealStatus::Expired {
        panic!("appeal is already finalized");
    }

    if current_ledger <= appeal.override_window_end {
        panic!("override window has not yet elapsed");
    }

    appeal.status = AppealStatus::Expired;
    storage.set(&appeal_key, &appeal);

    env.events().publish(
        (symbol_short!("appeal"), symbol_short!("expired")),
        (escrow_id, current_ledger),
    );
}

/// Retrieves the appeal record for a given escrow ID.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow whose appeal to retrieve.
///
/// # Returns
/// The `Appeal` struct if it exists.
pub fn get_appeal(env: &Env, escrow_id: u64) -> Appeal {
    let storage = env.storage().persistent();
    let appeal_key = (APPEAL_KEY, escrow_id);
    storage
        .get(&appeal_key)
        .expect("no appeal found for escrow")
}

/// Returns the locked bond amount for an appeal.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `escrow_id` - The escrow whose bond to query.
pub fn get_bond_amount(env: &Env, escrow_id: u64) -> i128 {
    let storage = env.storage().persistent();
    let bond_key = (BOND_KEY, escrow_id);
    storage.get(&bond_key).unwrap_or(0i128)
}

/// Sets the treasury address. Only used during contract initialization.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `treasury` - Address that receives slashed appeal bonds.
pub fn set_treasury(env: &Env, treasury: Address) {
    env.storage().persistent().set(&TREASURY_KEY, &treasury);
}

/// Sets the admin address. Only used during contract initialization.
///
/// # Arguments
/// * `env` - Soroban environment reference.
/// * `admin` - Address of the contract administrator.
pub fn set_admin(env: &Env, admin: Address) {
    env.storage().persistent().set(&ADMIN_KEY, &admin);
}
