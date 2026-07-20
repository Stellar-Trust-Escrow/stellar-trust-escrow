use soroban_sdk::{Address, Env, Map};

use crate::types::DataKey;
use crate::EscrowError;

pub struct StorageManager;

impl StorageManager {
    pub fn init_version(_env: &Env) {
        // Storage version initialization — no-op for current schema.
    }

    pub fn migrate(_env: &Env) -> Result<(), EscrowError> {
        Ok(())
    }

    #[allow(dead_code)]
    pub fn is_arbiter_registry_empty(env: &Env) -> bool {
        let registry: Option<Map<Address, bool>> =
            env.storage().persistent().get(&DataKey::ArbiterRegistry);
        match registry {
            Some(map) => map.is_empty(),
            None => true,
        }
    }

    pub fn is_arbiter_registered(env: &Env, arbiter: &Address) -> bool {
        let registry: Option<Map<Address, bool>> =
            env.storage().persistent().get(&DataKey::ArbiterRegistry);
        match registry {
            Some(map) => {
                if map.is_empty() {
                    true
                } else {
                    map.get(arbiter.clone()).unwrap_or(false)
                }
            }
            None => true,
        }
    }

    pub fn assert_registered_arbiter(env: &Env, arbiter: &Address) -> Result<(), EscrowError> {
        if !Self::is_arbiter_registered(env, arbiter) {
            return Err(EscrowError::UnregisteredArbiter);
        }
        Ok(())
    }
}
