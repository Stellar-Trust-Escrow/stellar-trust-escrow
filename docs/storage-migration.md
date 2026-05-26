# Storage Migration Guide: v1 → v2

This document explains the versioned storage migration from the monolithic
v1 layout to the granular v2 layout in `stellar-trust-escrow`.

Source: `contracts/escrow_contract/src/storage.rs`

---

## Table of Contents

1. [Why Storage Versioning?](#why-storage-versioning)
2. [Storage Layouts Side by Side](#storage-layouts-side-by-side)
3. [Key Types](#key-types)
4. [StorageManager API](#storagemanager-api)
5. [Migration Sequence](#migration-sequence)
6. [How allocated_amount Is Reconstructed](#how-allocated_amount-is-reconstructed)
7. [Triggering Migration During Upgrade](#triggering-migration-during-upgrade)
8. [Verification Checklist](#verification-checklist)
9. [Rollback Warning](#rollback-warning)
10. [StorageMigrationFailed (Error 42)](#storagemigrationfailed-error-42)

---

## Why Storage Versioning?

The v1 layout stored each escrow as a single `EscrowState` value containing
an inline `Vec<Milestone>`. Every operation that touched any milestone had
to deserialise the entire struct — including all milestones — even when only
one was needed. This was expensive in Soroban's metered execution model.

v2 (introduced in issue #65) splits the data into:

- One `EscrowMeta` entry per escrow (header fields only, no milestones).
- One `Milestone` entry per milestone, keyed by `(escrow_id, milestone_id)`.

This means `approve_milestone` reads exactly two storage entries instead of
the full escrow, reducing instruction count proportionally to milestone count.

---

## Storage Layouts Side by Side

### v1 Layout

```
Instance storage:
  DataKey::Admin           → Address
  DataKey::EscrowCounter   → u64
  StorageKey::Version      → (absent — defaults to 1)

Persistent storage:
  DataKey::Escrow(id)      → EscrowStateV1 {
                               escrow_id, client, freelancer, token,
                               total_amount, remaining_balance, status,
                               milestones: Vec<Milestone>,   ← inline
                               arbiter, created_at, deadline,
                               lock_time, lock_time_extension, brief_hash
                             }
  DataKey::Reputation(addr) → ReputationRecord
```

### v2 Layout

```
Instance storage:
  DataKey::Admin           → Address
  DataKey::EscrowCounter   → u64
  StorageKey::Version      → 2

Persistent storage:
  PackedDataKey::EscrowMeta(id)          → EscrowMeta {
                                             escrow_id, client, freelancer, token,
                                             total_amount,
                                             allocated_amount,   ← new in v2
                                             remaining_balance, status,
                                             milestone_count, approved_count,
                                             arbiter, created_at, deadline,
                                             lock_time, lock_time_extension, brief_hash,
                                             ...
                                           }
  PackedDataKey::Milestone(id, mid)      → Milestone   ← one entry per milestone
  PackedDataKey::RecurringConfig(id)     → RecurringPaymentConfig   ← optional
  DataKey::Reputation(addr)             → ReputationRecord
  DataKey::CancellationRequest(id)      → CancellationRequest
  DataKey::SlashRecord(id)              → SlashRecord
```

---

## Key Types

### Legacy: `DataKey::Escrow(u64)`

Used in v1 to store the full `EscrowStateV1` (with inline milestones).
After migration this key is **deleted** from persistent storage.

### v2: `PackedDataKey`

```rust
pub enum PackedDataKey {
    EscrowMeta(u64),           // escrow header — no milestones
    Milestone(u64, u32),       // (escrow_id, milestone_id)
    RecurringConfig(u64),      // optional recurring payment schedule
}
```

`PackedDataKey` is defined in `lib.rs` and used throughout the contract
for all escrow and milestone reads/writes after migration.

### `StorageKey::Version`

Stored in **instance storage** (survives upgrades). Holds the `u32`
version number. Absent on legacy contracts — `get_version` returns `1`
as the default.

---

## StorageManager API

```rust
pub const STORAGE_VERSION: u32 = 2;

pub struct StorageManager;

impl StorageManager {
    pub fn get_version(env: &Env) -> u32;
    pub fn needs_migration(env: &Env) -> bool;
    pub fn migrate(env: &Env) -> Result<(), EscrowError>;
    pub fn init_version(env: &Env);   // called on fresh deploy only
}
```

| Function | Description |
|----------|-------------|
| `get_version` | Reads `StorageKey::Version` from instance storage. Returns `1` if absent (legacy contract). |
| `needs_migration` | Returns `true` if `get_version() < STORAGE_VERSION`. |
| `migrate` | Runs all pending migrations in order. Called by `upgrade`. |
| `init_version` | Sets version to `STORAGE_VERSION` on a fresh deploy. No migration needed. |

---

## Migration Sequence

`StorageManager::migrate` is the entry point. It runs migrations
sequentially from the current version up to `STORAGE_VERSION`:

```
migrate(env):
  current = get_version(env)          // e.g. 1

  if current == STORAGE_VERSION:
    return Ok(())                     // nothing to do

  if current > STORAGE_VERSION:
    return Err(StorageMigrationFailed) // downgrade not supported

  if current < 2:
    migrate_v1_to_v2(env)?
    set_version(env, 2)

  return Ok(())
```

### migrate_v1_to_v2 in detail

```
for escrow_id in 1..=escrow_counter:

  v1_key = DataKey::Escrow(escrow_id)

  if v1_key exists in persistent storage:

    v1 = load EscrowStateV1 from v1_key

    approved_count = count milestones where status == Approved

    meta = EscrowMeta {
      escrow_id:        v1.escrow_id,
      client:           v1.client,
      freelancer:       v1.freelancer,
      token:            v1.token,
      total_amount:     v1.total_amount,
      allocated_amount: sum(m.amount for m in v1.milestones),  ← reconstructed
      remaining_balance: v1.remaining_balance,
      status:           v1.status,
      milestone_count:  v1.milestones.len(),
      approved_count:   approved_count,
      arbiter:          v1.arbiter,
      created_at:       v1.created_at,
      deadline:         v1.deadline,
      lock_time:        v1.lock_time,
      lock_time_extension: v1.lock_time_extension,
      brief_hash:       v1.brief_hash,
    }

    store meta at PackedDataKey::EscrowMeta(escrow_id)

    for each milestone in v1.milestones:
      store milestone at PackedDataKey::Milestone(escrow_id, milestone.id)

    delete DataKey::Escrow(escrow_id)   ← frees storage
```

---

## How allocated_amount Is Reconstructed

`allocated_amount` is a v2-only field that tracks the sum of all milestone
amounts added to an escrow. It is used as an allocation guard in
`add_milestone` to prevent over-allocation.

v1 did not store this field. During migration it is reconstructed by
summing the `amount` field of every milestone in the v1 inline list:

```rust
allocated_amount: v1_escrow.milestones.iter().map(|m| m.amount).sum()
```

This is correct because in v1 the only way to add funds to an escrow was
through `add_milestone`, so the sum of all milestone amounts equals the
total allocated amount at the time of migration.

---

## Triggering Migration During Upgrade

The `upgrade` function in `lib.rs` calls `StorageManager::migrate` before
replacing the WASM:

```rust
pub fn upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) -> Result<(), EscrowError> {
    caller.require_auth();
    ContractStorage::require_admin(&env, &caller)?;

    // Run storage migration before upgrading contract code
    StorageManager::migrate(&env)?;

    env.deployer().update_current_contract_wasm(new_wasm_hash);
    Ok(())
}
```

This ordering is critical: migration runs against the **old WASM** (which
knows how to read v1 data), then the new WASM is installed. If the order
were reversed, the new WASM would try to read v1 data it does not
understand.

CLI command to trigger upgrade (and migration):

```bash
# 1. Upload the new WASM and capture its hash
NEW_HASH=$(soroban contract upload \
  --source $ADMIN_SECRET \
  --network testnet \
  --wasm target/wasm32-unknown-unknown/release/stellar_trust_escrow_contract.wasm)

# 2. Call upgrade — migration runs automatically
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --source $ADMIN_SECRET \
  --network testnet \
  -- upgrade \
  --caller $ADMIN_ADDRESS \
  --new_wasm_hash "$NEW_HASH"
```

---

## Verification Checklist

After migration, verify the following using view functions:

**1. Storage version is 2**

There is no public `get_version` endpoint, but a successful `upgrade` call
without `StorageMigrationFailed` confirms the version was bumped.

**2. Escrow count is unchanged**

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --network testnet \
  -- escrow_count
# Must match the pre-migration count
```

**3. Each escrow is readable in v2 format**

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --network testnet \
  -- get_escrow \
  --escrow_id 1
# Must return full EscrowState with milestones array populated
```

**4. Each milestone is individually readable**

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --network testnet \
  -- get_milestone \
  --escrow_id 1 \
  --milestone_id 0
# Must return the Milestone struct with correct amount and status
```

**5. Milestone amounts sum to total_amount**

For each escrow, verify:
`sum(milestone.amount for all milestones) == escrow.total_amount`

This confirms `allocated_amount` was reconstructed correctly.

**6. Reputation records are intact**

```bash
soroban contract invoke \
  --id $ESCROW_CONTRACT \
  --network testnet \
  -- get_reputation \
  --address $KNOWN_ADDRESS
# Must return the same score as before migration
```

---

## Rollback Warning

**Downgrading from v2 to v1 is not supported and will not be implemented.**

If `StorageManager::migrate` detects `current_version > STORAGE_VERSION`
(i.e. the running WASM is older than the stored data), it returns
`StorageMigrationFailed` (error 42) immediately without modifying any data.

This protects against accidental data corruption from deploying an older
WASM onto a v2 storage layout.

If you need to roll back a deployment, you must:

1. Re-upload the newer WASM (the one that understands v2).
2. Call `upgrade` again with the correct hash.

There is no path to convert v2 storage back to v1.

---

## StorageMigrationFailed (Error 42)

`EscrowError::StorageMigrationFailed = 42`

| Cause | What to do |
|-------|-----------|
| `current_version > STORAGE_VERSION` — running WASM is older than stored data | Deploy the correct (newer) WASM version. Do not attempt to run v1 code on v2 storage. |
| Corrupted v1 data that cannot be deserialised as `EscrowStateV1` | Inspect the raw storage entry. If the data is unrecoverable, the escrow must be treated as lost. Contact the team immediately. |
| `migrate_v1_to_v2` panics mid-loop | Soroban transactions are atomic — no partial writes will have been committed. Re-run `upgrade` after diagnosing the cause. |
