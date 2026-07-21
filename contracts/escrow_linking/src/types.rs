use soroban_sdk::{contracttype, Vec};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ParentEscrowRecord {
    pub child_ids: Vec<u64>,
    pub total_children: u32,
    pub completed_children: u32,
    pub auto_complete: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ParentStatus {
    pub total: u32,
    pub completed: u32,
    pub all_done: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DataKey {
    ParentRecord(u64),
    ChildToParent(u64),
    ChildCompleted(u64),
    CoreContractAddress,
}
