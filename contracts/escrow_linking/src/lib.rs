#![no_std]
#![allow(clippy::too_many_arguments)]

mod errors;
mod events;
mod storage;
mod types;

#[cfg(test)]
mod tests;

pub use errors::LinkError;
pub use types::{DataKey, ParentEscrowRecord, ParentStatus};

use crate::storage::*;
use soroban_sdk::{contract, contractclient, contractimpl, Address, Env, Vec};

#[contractclient(name = "CoreContractClient")]
pub trait CoreContractInterface {
    fn force_complete_escrow(env: Env, escrow_id: u64);
}

#[contract]
pub struct EscrowLinkingContract;

#[contractimpl]
impl EscrowLinkingContract {
    pub fn init(env: Env, core_contract: Address) {
        set_core_contract(&env, &core_contract);
    }

    pub fn register_parent_escrow(
        env: Env,
        admin: Address,
        parent_escrow_id: u64,
        child_escrow_ids: Vec<u64>,
    ) -> Result<(), LinkError> {
        admin.require_auth();

        let total_children = child_escrow_ids.len();
        if total_children == 0 || total_children > 20 {
            return Err(LinkError::TooManyChildren);
        }

        // Check if any child is already linked
        for child_id in child_escrow_ids.iter() {
            if get_child_to_parent(&env, child_id).is_some() {
                return Err(LinkError::AlreadyLinked);
            }
        }

        for child_id in child_escrow_ids.iter() {
            set_child_to_parent(&env, child_id, parent_escrow_id);
        }

        let record = ParentEscrowRecord {
            child_ids: child_escrow_ids,
            total_children,
            completed_children: 0,
            auto_complete: true,
        };

        set_parent_record(&env, parent_escrow_id, &record);
        events::emit_parent_registered(&env, parent_escrow_id, total_children);

        Ok(())
    }

    pub fn notify_child_completed(env: Env, child_escrow_id: u64) -> Result<(), LinkError> {
        let core_contract = get_core_contract(&env).unwrap();
        core_contract.require_auth();

        if let Some(parent_id) = get_child_to_parent(&env, child_escrow_id) {
            if !is_child_completed(&env, child_escrow_id) {
                set_child_completed(&env, child_escrow_id);
                if let Some(mut record) = get_parent_record(&env, parent_id) {
                    record.completed_children += 1;
                    let remaining = record.total_children - record.completed_children;
                    set_parent_record(&env, parent_id, &record);
                    events::emit_child_completed(&env, parent_id, child_escrow_id, remaining);

                    if record.completed_children == record.total_children && record.auto_complete {
                        let client = CoreContractClient::new(&env, &core_contract);
                        client.force_complete_escrow(&parent_id);
                        events::emit_parent_auto_completed(&env, parent_id);
                    }
                }
            }
        }
        Ok(())
    }

    pub fn get_parent_status(env: Env, parent_escrow_id: u64) -> ParentStatus {
        if let Some(record) = get_parent_record(&env, parent_escrow_id) {
            ParentStatus {
                total: record.total_children,
                completed: record.completed_children,
                all_done: record.completed_children == record.total_children,
            }
        } else {
            ParentStatus {
                total: 0,
                completed: 0,
                all_done: false,
            }
        }
    }
}
