# Smart Contract Developer Guide

This guide explains how to work on the `escrow_contract` Soroban smart contract, including how to prepare it for safe upgrades.

---

## Prerequisites

- Rust >= 1.74
- `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`
- Soroban CLI / Stellar CLI with contract support

---

## File Structure

```text
contracts/escrow_contract/
|-- Cargo.toml
`-- src/
    |-- lib.rs
    |-- types.rs
    |-- errors.rs
    `-- events.rs
```

---

## Building

```bash
cd contracts/escrow_contract

# Native build for tests
cargo build

# Wasm build for deployment
stellar contract build
```

---

## Running Tests

```bash
cd contracts/escrow_contract

cargo test
cargo test -- --nocapture
cargo test test_create_escrow_happy_path
```

---

## Key Patterns

### Authorization

Every mutating function must call `require_auth()` on the correct address before touching storage.

```rust
caller.require_auth();
let state = load_escrow(&env, escrow_id)?;
```

### Load -> Modify -> Save

Load storage once, mutate in memory, then save once.

```rust
let mut escrow = load_escrow(&env, id)?;
escrow.status = EscrowStatus::Disputed;
env.storage().instance().set(&DataKey::Escrow(id), &escrow);
```

### State Before Transfer

Always commit state changes before token transfers.

```rust
milestone.status = MilestoneStatus::Approved;
env.storage().instance().set(&DataKey::Escrow(id), &escrow);
token_client.transfer(...);
```

### Error Returns

Public functions should return `Result<T, EscrowError>` and avoid panics.

```rust
let escrow = env
    .storage()
    .instance()
    .get(&DataKey::Escrow(id))
    .ok_or(EscrowError::EscrowNotFound)?;
```

---

## Token Transfers

Use `soroban_sdk::token::Client` for token movement.

```rust
use soroban_sdk::token;

let token_client = token::Client::new(&env, &escrow.token);
token_client.transfer(&caller, &env.current_contract_address(), &amount);
token_client.transfer(&env.current_contract_address(), &recipient, &amount);
```

In tests, `StellarAssetClient` can mint mock tokens.

```rust
let sac = soroban_sdk::token::StellarAssetClient::new(&env, &token_addr);
sac.mint(&client_addr, &10_000_000_000i128);
```

---

## Upgrade Readiness

The current contract is not upgrade-ready yet.

It already stores an admin under `DataKey::Admin`, which is the right authority model for upgrades, but it does not yet expose:

- an admin-only `upgrade(new_wasm_hash)` entrypoint
- a `version()` entrypoint
- a storage version key for migrations

Before the first production deployment that may need upgrades, add those pieces. The official Soroban upgrade pattern uses `env.deployer().update_current_contract_wasm(new_wasm_hash)` behind an admin authorization check.

Recommended additions:

```rust
#[contracttype]
pub enum DataKey {
    EscrowCounter,
    Escrow(u64),
    Reputation(Address),
    Admin,
    ContractVersion,
}

pub fn version(env: Env) -> u32 {
    env.storage().instance().get(&DataKey::ContractVersion).unwrap_or(1)
}

pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), EscrowError> {
    let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(EscrowError::NotInitialized)?;
    admin.require_auth();
    env.deployer().update_current_contract_wasm(new_wasm_hash);
    Ok(())
}
```

After deployment, initialize `ContractVersion` to `1` and bump it in each upgrade that changes behavior or storage expectations.

---

## Current Storage Layout

The contract currently persists these top-level keys in `types.rs`:

- `DataKey::EscrowCounter`
- `DataKey::Escrow(id)`
- `DataKey::Reputation(address)`
- `DataKey::Admin`

Important compatibility rule:

Changing the binary layout of `EscrowState`, `Milestone`, `ReputationRecord`, or `DataKey` without a migration plan can make already-written ledger entries unreadable by new Wasm code.

Safe changes:

- adding new public functions that do not reinterpret old storage
- adding new event types
- adding new storage keys that do not conflict with existing ones
- adding optional migration-only functions

High-risk changes:

- renaming or reordering enum variants
- changing existing `contracttype` field ordering
- changing field types, such as `u64` to `i128`
- changing how `DataKey::Escrow(id)` or `DataKey::Reputation(address)` are encoded

---

## Upgrade Process

Use this runbook for any deployed contract upgrade.

### 1. Classify the Change

Decide whether the release is:

- code-only: logic changes, bug fixes, event changes, no storage layout change
- additive storage: new keys or new migration-only data
- breaking storage: existing contract data will be interpreted differently

If the change is breaking storage, do not deploy until the migration design and rollback plan are written and tested.

### 2. Prepare the Release

- Record the current deployed contract ID.
- Record the currently active Wasm hash.
- Record the target release version.
- Build the new Wasm artifact with `stellar contract build`.
- Review any indexer or backend assumptions that depend on emitted events or enum values.

### 3. Check Contract Availability

Before the upgrade window, confirm the deployed contract instance and Wasm TTL are healthy. If TTL is low, extend it before the upgrade so the live contract does not become archived during rollout.

### 4. Test on Localnet or Testnet First

- Deploy the old version.
- Seed representative escrow and reputation state.
- Upload the new Wasm.
- Invoke the upgrade against the test deployment.
- Run post-upgrade functional checks and migration verification.

### 5. Upload the New Wasm

```bash
cd contracts/escrow_contract

stellar contract build

stellar contract upload \
  --source-account <admin_identity> \
  --network <network> \
  --wasm target/wasm32v1-none/release/<compiled_name>.wasm
```

Save the returned Wasm hash. Do not continue without storing both the old and new hashes in the release notes.

### 6. Execute the Upgrade

Invoke the admin-only `upgrade` entrypoint using the new Wasm hash.

```bash
stellar contract invoke \
  --id <contract_id> \
  --source-account <admin_identity> \
  --network <network> \
  -- \
  upgrade \
  --new_wasm_hash <new_wasm_hash>
```

### 7. Run Post-Upgrade Validation

- Call `version()` and confirm the expected version.
- Fetch representative escrows and reputation records.
- Validate milestone approval, dispute, and cancellation flows.
- Confirm backend indexer parsing still matches events and statuses.

---

## Storage Migration Strategy

If storage must change, use one of these patterns.

### Preferred: Add New Keys and Migrate Lazily

Keep old keys readable and write new data into separate keys or versioned structures.

Example approach:

- keep `DataKey::Escrow(id)` readable for old records
- add `DataKey::ContractVersion`
- add a migration function that upgrades one escrow at a time when first touched

This minimizes blast radius and keeps rollback feasible.

### Explicit Migration Function

If every record must be rewritten, expose an admin-only migration entrypoint after the Wasm upgrade.

```rust
pub fn migrate_v2(env: Env, escrow_id: u64) -> Result<(), EscrowError> {
    let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(EscrowError::NotInitialized)?;
    admin.require_auth();

    let version: u32 = env.storage().instance().get(&DataKey::ContractVersion).unwrap_or(1);
    if version >= 2 {
        return Ok(());
    }

    let escrow: EscrowState = env
        .storage()
        .instance()
        .get(&DataKey::Escrow(escrow_id))
        .ok_or(EscrowError::EscrowNotFound)?;

    let migrated = escrow;
    env.storage().instance().set(&DataKey::Escrow(escrow_id), &migrated);
    env.storage().instance().set(&DataKey::ContractVersion, &2u32);
    Ok(())
}
```

The example above is intentionally simple. In a real migration, transform old state into the new format and emit a migration event for auditability.

### Rules for This Repository

- never change `DataKey` meanings in place without a version gate
- never reorder fields in on-ledger structs unless you also migrate old entries
- keep `Admin` stable across upgrades so the same authority can operate rollback
- coordinate contract event changes with `backend/services/escrowIndexer.js`

---

## Rollback Procedure

Every upgrade plan must include rollback before deployment starts.

### Preconditions for Rollback

- the previous Wasm hash is recorded
- the previous release artifact is reproducible
- admin credentials for the contract are available
- migration effects are understood

### Fast Rollback

If the new Wasm only changed logic and did not rewrite stored data:

1. pause any backend jobs that may amplify the incident
2. invoke `upgrade` again using the previous Wasm hash
3. verify `version()` and critical read paths
4. replay post-upgrade checks

### Migration Rollback

If the upgrade rewrote contract storage:

- do not assume Wasm rollback alone is safe
- either provide a reverse migration entrypoint or restore from a pre-upgrade ledger/data snapshot strategy
- document which migrations are reversible and which are one-way

For this repository, one-way migrations should be avoided until the contract is fully implemented and a dedicated migration test harness exists.

### Operational Checklist

- keep the old Wasm hash in the deployment ticket
- keep testnet evidence of both forward and backward upgrade tests
- notify backend/frontend operators before rollback if event shapes changed

---

## Testing Requirements for Upgrades

Every upgrade PR should include upgrade-specific tests, not just normal unit tests.

Minimum required coverage:

- old Wasm deploy -> new Wasm upgrade succeeds
- admin authorization is required for upgrade
- `version()` changes as expected
- pre-upgrade escrows remain readable after upgrade
- pre-upgrade reputation records remain readable after upgrade
- any migration entrypoint is idempotent
- rollback to previous Wasm works when migration is reversible

Recommended test structure:

```rust
mod old_contract {
    soroban_sdk::contractimport!(file = "../old_contract/target/wasm32v1-none/release/old.wasm");
}

mod new_contract {
    soroban_sdk::contractimport!(file = "../new_contract/target/wasm32v1-none/release/new.wasm");
}
```

Then:

1. register or deploy the old contract
2. seed realistic escrow and reputation state
3. upload new Wasm
4. call `upgrade(new_wasm_hash)`
5. verify state reads and post-upgrade writes
6. if supported, upgrade back to old Wasm and verify rollback behavior

For breaking storage changes, add fixtures representing real production-like state:

- active escrows with multiple milestones
- completed escrows with zero remaining balance
- disputed escrows with arbiter assigned
- reputation records with non-zero counters and volume

---

## Version Compatibility

Use semantic compatibility rules for contract releases.

### Compatible Releases

- bug fix without storage changes
- event additions without removing old events
- new read-only methods
- new storage keys that old keys do not depend on

### Conditionally Compatible Releases

- new optional fields represented through new keys
- new admin-only migration functions
- event payload changes that require backend parser updates in the same release

### Incompatible Releases

- changes to existing serialized struct layout without migration
- renaming or removing storage keys used by live data
- changing auth expectations for existing methods without backend/frontend coordination

Release notes should always include:

- contract version number
- previous and new Wasm hashes
- storage migration required: yes or no
- rollback type: direct Wasm rollback or migration-aware rollback
- backend compatibility notes

---

## Pre-Merge Checklist for Upgrade PRs

- [ ] `upgrade()` entrypoint exists and is admin-guarded
- [ ] `version()` exists and is updated
- [ ] storage compatibility reviewed against `types.rs`
- [ ] migration path documented if any serialized type changed
- [ ] rollback plan written
- [ ] localnet or testnet upgrade test executed
- [ ] backend indexer compatibility reviewed

---

## References

- Stellar Docs: Upgrading Wasm bytecode for a deployed contract
  https://developers.stellar.org/docs/build/guides/conventions/upgrading-contracts
- Stellar Docs: Extending a deployed contract's TTL
  https://developers.stellar.org/docs/build/guides/conventions/extending-wasm-ttl
