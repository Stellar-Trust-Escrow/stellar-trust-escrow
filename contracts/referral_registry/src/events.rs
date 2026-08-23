use soroban_sdk::{symbol_short, Address, Env, Symbol};

pub fn code_registered(env: &Env, referrer: &Address, code: &Symbol) {
    env.events()
        .publish((symbol_short!("ref_reg"), referrer.clone()), code.clone());
}

/// ReferralBound { escrow_id, referrer, code }
pub fn referral_bound(env: &Env, escrow_id: u64, referrer: &Address, code: &Symbol) {
    env.events().publish(
        (symbol_short!("ref_bound"), escrow_id),
        (referrer.clone(), code.clone()),
    );
}
