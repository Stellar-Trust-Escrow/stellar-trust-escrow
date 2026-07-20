use soroban_sdk::Env;

use crate::EscrowError;

pub struct StorageManager;

impl StorageManager {
    pub fn init_version(_env: &Env) {
        // Storage version initialization — no-op for current schema.
    }

    pub fn migrate(_env: &Env) -> Result<(), EscrowError> {
        Ok(())
    }
}
