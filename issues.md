--------------------------------------------------

## #1 Add Inline Rustdoc Comments to `EscrowMeta` Struct Fields

Title: Document `EscrowMeta` Struct Fields with Inline Rust Doc Comments

Body:

Category: Documentation
Difficulty: Beginner
Priority: Low
Estimated Time: 1–2 hours

Description:
The `EscrowMeta` struct defined in `contracts/escrow_contract/src/lib.rs` (L150–181) is the central data type used throughout the contract, yet most of its fields lack inline `///` doc comments explaining their semantics. Fields like `allocated_amount`, `released_count`, `submitted_count`, `lock_time_extension`, and `rent_balance` are non-obvious to new contributors. Proper rustdoc comments enable IDE hover documentation and ensure that `cargo doc` generates accurate HTML API docs for every field.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `EscrowMeta` struct at L150–181
- Fields to document include `allocated_amount`, `remaining_balance`, `milestone_count`, `approved_count`, `released_count`, `submitted_count`, `lock_time`, `lock_time_extension`, `timelock`, `rent_balance`, and `last_rent_collection_at`
- Comments must use `///` (outer doc) or `//!` (inner doc) syntax supported by rustdoc
- Must not change any field types, visibility, or ordering

Acceptance Criteria:
- [ ] Every field in `EscrowMeta` has a `///` doc comment explaining its purpose, units, and invariants
- [ ] `cargo doc --package escrow_contract --no-deps` generates HTML without warnings for `EscrowMeta`
- [ ] Comments accurately describe the difference between `allocated_amount` and `remaining_balance`
- [ ] The `rent_balance` and `last_rent_collection_at` fields document their relationship to `RENT_PER_ENTRY_PER_PERIOD`

Branch Suggestion:
docs/escrow-meta-rustdoc

Commit Message Suggestions:
- `docs: add rustdoc field comments to EscrowMeta struct`
- `docs: clarify allocated_amount vs remaining_balance semantics`
- `docs: document rent_balance and last_rent_collection_at fields`

PR Title:
docs: Add inline rustdoc comments to all `EscrowMeta` struct fields

PR Description:
Summary:
This PR adds comprehensive `///` rustdoc comments to every field of the `EscrowMeta` struct in `contracts/escrow_contract/src/lib.rs`. The comments explain the semantic purpose, units (e.g. stroops for i128 amounts, ledger sequence numbers for timelocks), invariants, and relationships between related fields such as `allocated_amount` vs `remaining_balance` and the rent tracking pair `rent_balance` / `last_rent_collection_at`.

Changes:
- Added `///` doc comments to all 21 fields of `EscrowMeta`
- Clarified the distinction between `milestone_count`, `approved_count`, `released_count`, and `submitted_count`
- Documented that `lock_time` is a Unix timestamp while `timelock` uses ledger sequence numbers

Testing:
- Run `cargo doc --package escrow_contract --no-deps` and verify zero rustdoc warnings
- Confirm no compilation errors with `cargo build --package escrow_contract`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #2 Add Module-Level Rustdoc to `escrow_extensions/src/lib.rs`

Title: Add Rustdoc Module-Level `//!` Documentation to `contracts/escrow_extensions/src/lib.rs`

Body:

Category: Documentation
Difficulty: Beginner
Priority: Low
Estimated Time: 2–3 hours

Description:
The `contracts/escrow_extensions/src/lib.rs` file provides batch creation, protocol fees, quadratic-voting dispute resolution, and timelock-delayed upgrades, but it has no `//!` module-level documentation block at the top. Without this, `cargo doc` generates a blank module page for `EscrowExtensions`. Contributors navigating the codebase cannot understand the intended scope of the extensions contract relative to the core `escrow_contract` without reading the entire source file.

Requirements and Context:
- `contracts/escrow_extensions/src/lib.rs` — currently no `//!` header comment exists
- Must document the purpose of the `EscrowExtensions` contract and its relationship to the core `EscrowContract`
- Should cover the four main feature areas: `create_batch`, protocol fees (`collect_fee`, `distribute_fees`), dispute voting (`open_dispute`, `cast_vote`, `resolve_dispute`), and upgrades (`queue_upgrade`, `execute_upgrade`)
- Document key constants: `MAX_BATCH_SIZE`, `MAX_FEE_BPS`, `VOTING_WINDOW_SECONDS`, `UPGRADE_DELAY_SECONDS`

Acceptance Criteria:
- [ ] A `//!` module-level comment block appears at the top of `contracts/escrow_extensions/src/lib.rs`
- [ ] The module doc covers all four feature subsystems with brief descriptions
- [ ] `cargo doc --package escrow_extensions --no-deps` produces a populated module summary page
- [ ] Each public function has at least a one-line `///` summary comment

Branch Suggestion:
docs/escrow-extensions-module-doc

Commit Message Suggestions:
- `docs: add //! module-level documentation to escrow_extensions lib.rs`
- `docs: document EscrowExtensions feature subsystems in rustdoc`
- `docs: add /// summary comments to all pub fns in EscrowExtensions`

PR Title:
docs: Add module-level `//!` rustdoc to `escrow_extensions/src/lib.rs`

PR Description:
Summary:
This PR adds a comprehensive `//!` module-level documentation block to `contracts/escrow_extensions/src/lib.rs`, describing the purpose of `EscrowExtensions`, its four feature subsystems (batch creation, protocol fees, dispute voting, and upgrades), and its deployment relationship to the core `EscrowContract`. Every public function is annotated with at least a one-line `///` summary so that `cargo doc` generates a complete and navigable API reference for the extensions crate.

Changes:
- Added `//!` module-level documentation header describing all four subsystems
- Added `///` doc comments to `create_batch`, `set_fee_bps`, `open_dispute`, `cast_vote`, `resolve_dispute`, `queue_upgrade`, and `execute_upgrade`
- Documented `MAX_BATCH_SIZE`, `MAX_FEE_BPS`, `VOTING_WINDOW_SECONDS`, and `UPGRADE_DELAY_SECONDS` constants

Testing:
- Run `cargo doc --package escrow_extensions --no-deps` and verify no missing-doc warnings
- Run `cargo build --package escrow_extensions` to confirm no compilation errors

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #3 Create Soroban Testnet Deployment Guide

Title: Write a Step-by-Step Soroban Testnet Deployment Guide for `stellar-trust-escrow`

Body:

Category: Documentation
Difficulty: Beginner
Priority: Medium
Estimated Time: 3–5 hours

Description:
There is no existing document explaining how to deploy any of the four contracts (`escrow_contract`, `escrow_extensions`, `governance`, `insurance_contract`) to the Stellar testnet using the Soroban CLI. New contributors who want to test the contracts on-chain have no reference for installing the Soroban CLI, funding a testnet account with Friendbot, building WASM artifacts, uploading the WASM, and invoking `initialize`. This gap significantly increases onboarding friction.

Requirements and Context:
- New file: `docs/testnet-deployment.md`
- Must cover `soroban contract build`, `soroban contract upload`, and `soroban contract deploy` CLI commands
- Must reference the workspace `Cargo.toml` and the `[profile.release]` settings (`opt-level = "z"`, `lto = true`)
- Must show how to call `EscrowContract::initialize` and `EscrowExtensions::initialize` with example CLI arguments
- Must document the `SOROBAN_NETWORK_PASSPHRASE`, `SOROBAN_RPC_URL`, and `STELLAR_SECRET_KEY` environment variables

Acceptance Criteria:
- [ ] `docs/testnet-deployment.md` is created and covers all four workspace contract crates
- [ ] The guide includes a section on funding a testnet account via Friendbot (`https://friendbot.stellar.org`)
- [ ] Example CLI invocations for `soroban contract invoke --id ... -- initialize` are provided for `EscrowContract`
- [ ] The guide documents how to verify deployment by querying `escrow_count` and `is_paused`
- [ ] A troubleshooting section addresses common errors like `WasmHashNotFound` and insufficient balance

Branch Suggestion:
docs/testnet-deployment-guide

Commit Message Suggestions:
- `docs: add Soroban testnet deployment guide`
- `docs: include example CLI invocations for escrow contract initialization`
- `docs: add troubleshooting section for common deployment errors`

PR Title:
docs: Create step-by-step Soroban testnet deployment guide

PR Description:
Summary:
This PR adds `docs/testnet-deployment.md`, a comprehensive guide for deploying all four `stellar-trust-escrow` contracts to the Stellar testnet using the Soroban CLI. It covers Soroban CLI installation, Friendbot account funding, WASM build and upload, contract deployment, initialization via `soroban contract invoke`, and post-deployment verification using view functions like `escrow_count` and `is_paused`.

Changes:
- Created `docs/testnet-deployment.md` with step-by-step deployment instructions
- Added environment variable reference table for `SOROBAN_RPC_URL`, `SOROBAN_NETWORK_PASSPHRASE`, and `STELLAR_SECRET_KEY`
- Included CLI examples for `EscrowContract::initialize` and `EscrowExtensions::initialize`
- Added a troubleshooting section covering `WasmHashNotFound` and auth errors

Testing:
- Follow the guide end-to-end on Stellar testnet and verify all four contracts deploy successfully
- Confirm `soroban contract invoke -- escrow_count` returns `0` after fresh deployment

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #4 Document the Rent and Storage Reserve System Mechanics

Title: Document the Rent/Storage Reserve System: `charge_rent_reserve`, `collect_rent_due`, and `expire_escrow`

Body:

Category: Documentation
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–4 hours

Description:
The rent system in `contracts/escrow_contract/src/lib.rs` is one of the most complex subsystems in the project, involving `charge_rent_reserve` (L523), `charge_entry_rent` (L537), `collect_rent_due` (L552), `settle_rent_for_access` (L599), and `expire_escrow` (L621). The constants `RENT_PERIOD_SECONDS`, `RENT_RESERVE_PERIODS`, and `RENT_PER_ENTRY_PER_PERIOD` (L88–90) are undocumented in any guide. Without understanding these mechanics, integrators may fail to top up rent correctly, causing escrows to expire unexpectedly.

Requirements and Context:
- New file: `docs/rent-system.md`
- Reference `contracts/escrow_contract/src/lib.rs` functions: `collect_rent`, `top_up_rent`, `expire_escrow`, `active_storage_entries`, `rent_due_per_period`, `rent_has_expired`, `rent_expires_at`
- Must explain the formula: `rent_due = active_entries × RENT_PER_ENTRY_PER_PERIOD × periods_elapsed`
- Must document the `EscrowMeta` fields `rent_balance` and `last_rent_collection_at`
- Must explain the consequence of expiry: `expire_escrow` refunds `remaining_balance` to `client` and removes storage

Acceptance Criteria:
- [ ] `docs/rent-system.md` explains all rent constants and their default values
- [ ] The document describes the flow from `top_up_rent` → `rent_balance` → `collect_rent_due` → `expire_escrow`
- [ ] A worked example shows how many stroops are required to keep a 3-milestone escrow alive for 30 days
- [ ] The document explains what `active_storage_entries` counts and why milestone count affects rent
- [ ] The `settle_rent_for_access` function's role in lazy rent collection is documented

Branch Suggestion:
docs/rent-system-mechanics

Commit Message Suggestions:
- `docs: add rent and storage reserve system documentation`
- `docs: explain active_storage_entries formula and rent expiry flow`
- `docs: add worked rent calculation example for 3-milestone escrow`

PR Title:
docs: Document rent/storage reserve system mechanics and expiry flow

PR Description:
Summary:
This PR creates `docs/rent-system.md`, a detailed reference for the Stellar storage rent system used in `stellar-trust-escrow`. It explains all relevant constants (`RENT_PERIOD_SECONDS`, `RENT_RESERVE_PERIODS`, `RENT_PER_ENTRY_PER_PERIOD`), walks through the full rent lifecycle from `top_up_rent` through `collect_rent_due` to `expire_escrow`, and provides a worked numerical example so integrators can calculate the required rent reserve for a given escrow configuration.

Changes:
- Created `docs/rent-system.md` with full rent mechanics reference
- Added formula documentation for `rent_due_per_period` and `active_storage_entries`
- Included a worked example calculating stroop cost for a 3-milestone escrow over 30 days

Testing:
- Cross-reference documented formulas with `collect_rent_due` implementation at L552–597 in `lib.rs`
- Run `cargo test -p escrow_contract test_collect_rent` to validate the documented behavior

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #5 Add Oracle Integration Setup Guide (Primary + Fallback)

Title: Write Oracle Integration Setup Guide for SEP-40 Primary and Fallback Price Feeds

Body:

Category: Documentation
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
The oracle subsystem in `contracts/escrow_contract/src/oracle.rs` implements a primary + fallback price feed pattern compatible with SEP-40/Band Protocol/DIA oracles on Stellar. However, there is no guide explaining how to deploy a compatible oracle contract, register it via `set_oracle` and `set_fallback_oracle`, or understand the `PRICE_STALENESS_THRESHOLD` (3,600 seconds) and `PRICE_DECIMALS` (7) constants. Integrators who want to use `convert_amount` for currency conversion have no reference for setting this up.

Requirements and Context:
- New file: `docs/oracle-integration.md`
- Reference `contracts/escrow_contract/src/oracle.rs`: `OracleInterface` trait, `PriceData` struct, `get_price_usd`, `convert_amount`, `is_fresh`
- Reference `EscrowContract::set_oracle` (L730) and `EscrowContract::set_fallback_oracle` (L739)
- Must document the `OracleInterface::lastprice(env, asset)` function signature required by any compatible oracle
- Must explain the staleness check: `now - timestamp <= PRICE_STALENESS_THRESHOLD`
- Must explain `EscrowError::OraclePriceStale` (49) and `EscrowError::OracleInvalidPrice` (50)

Acceptance Criteria:
- [ ] `docs/oracle-integration.md` is created and covers primary + fallback oracle setup
- [ ] The guide explains the `OracleInterface` trait and required `lastprice` implementation
- [ ] Fallback behavior is documented: primary stale → try fallback → error if both stale
- [ ] A section explains how `convert_amount` uses both oracle prices for cross-asset conversion
- [ ] The `PRICE_STALENESS_THRESHOLD` constant and its implications are documented

Branch Suggestion:
docs/oracle-integration-guide

Commit Message Suggestions:
- `docs: add oracle integration setup guide for primary and fallback feeds`
- `docs: document OracleInterface trait and PriceData struct requirements`
- `docs: explain price staleness threshold and fallback behavior`

PR Title:
docs: Add oracle integration setup guide (SEP-40 primary + fallback)

PR Description:
Summary:
This PR adds `docs/oracle-integration.md`, a comprehensive guide for integrating price oracles with the `stellar-trust-escrow` contracts. It covers the `OracleInterface` trait definition, how to deploy a compatible oracle, registering primary and fallback feeds via `set_oracle` and `set_fallback_oracle`, the staleness threshold mechanism, and how `convert_amount` uses dual oracle prices for cross-asset escrow support.

Changes:
- Created `docs/oracle-integration.md` with oracle setup and integration steps
- Documented the `PriceData` struct fields and `PRICE_DECIMALS` precision
- Explained the primary-to-fallback failover logic in `get_price_usd`
- Listed oracle-related `EscrowError` codes (48–50) and their causes

Testing:
- Verify all oracle-related functions referenced in the guide exist in `oracle.rs`
- Run `cargo test -p escrow_contract` to confirm oracle tests still pass

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #6 Document the Milestone State Machine with an ASCII Diagram

Title: Add Milestone State Machine Documentation with Transition Diagram to `contracts/escrow_contract/src/types.rs`

Body:

Category: Documentation
Difficulty: Beginner
Priority: Low
Estimated Time: 2–3 hours

Description:
The `MilestoneStatus` type (a `u32` bitflag alias defined at L50 in `types.rs`) uses constants `MS_PENDING`, `MS_SUBMITTED`, `MS_APPROVED`, `MS_RELEASED`, `MS_REJECTED`, `MS_DISPUTED`, `MS_TERMINAL`, and `MS_BLOCKS_CANCEL`, but there is no diagram or prose explanation of the valid state transitions. Contributors implementing or debugging milestone logic must mentally reconstruct the allowed paths (e.g. PENDING→SUBMITTED, SUBMITTED→APPROVED, APPROVED→RELEASED, SUBMITTED→REJECTED→PENDING). A state machine diagram would prevent invalid transition bugs.

Requirements and Context:
- `contracts/escrow_contract/src/types.rs` — `MilestoneStatus` type alias and constants L50–69
- New file: `docs/milestone-state-machine.md` with an ASCII state transition diagram
- Must document which functions drive each transition: `submit_milestone`, `approve_milestone`, `reject_milestone`, `release_funds`, `raise_dispute`, `resolve_dispute`
- Must explain the `MS_TERMINAL` and `MS_BLOCKS_CANCEL` bitflags and their role in cancellation guards
- Reference `contracts/escrow_contract/src/lib.rs` for the transition-driving functions

Acceptance Criteria:
- [ ] `docs/milestone-state-machine.md` is created with a valid ASCII state transition diagram
- [ ] Every state constant (`MS_PENDING` through `MS_BLOCKS_CANCEL`) is explained with its numeric value
- [ ] Each transition arrow is labeled with the function that triggers it (e.g. `submit_milestone`)
- [ ] The document explains that `MS_TERMINAL` prevents further state changes
- [ ] The document notes which states set `MS_BLOCKS_CANCEL` and why

Branch Suggestion:
docs/milestone-state-machine

Commit Message Suggestions:
- `docs: add milestone state machine diagram and transition reference`
- `docs: document MS_TERMINAL and MS_BLOCKS_CANCEL bitflag semantics`
- `docs: annotate state transitions with driving function names`

PR Title:
docs: Add milestone state machine diagram and transition documentation

PR Description:
Summary:
This PR creates `docs/milestone-state-machine.md`, which provides an ASCII state transition diagram for the `MilestoneStatus` bitflag system and explains every valid state transition, the function responsible for each transition, and the semantics of special flags `MS_TERMINAL` and `MS_BLOCKS_CANCEL`. This gives contributors a single reference point when implementing or reviewing milestone lifecycle logic.

Changes:
- Created `docs/milestone-state-machine.md` with ASCII diagram and transition table
- Documented all eight `MilestoneStatus` constants with their `u32` values
- Listed the function driving each transition and the auth required (client vs freelancer vs admin)

Testing:
- Verify the diagram is consistent with actual transition logic in `submit_milestone`, `approve_milestone`, `reject_milestone`, and `release_funds` in `lib.rs`
- No code changes; documentation only

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #7 Add Governance Contract Usage Guide

Title: Write Governance Contract Usage Guide Covering Proposals, Voting, and Execution

Body:

Category: Documentation
Difficulty: Intermediate
Priority: Medium
Estimated Time: 4–6 hours

Description:
The `contracts/governance/src/lib.rs` contract implements `create_proposal`, `cast_vote`, `finalize_proposal`, `execute_proposal`, and `cancel_proposal`, supporting four `ProposalType` variants: `ParameterChange`, `ContractUpgrade`, `FundAllocation`, and `TextProposal`. There is no guide explaining how these interact, what the `GovConfig` parameters (`proposal_threshold`, `voting_period`, `voting_delay`, `timelock_delay`, `quorum_bps`, `approval_threshold_bps`) mean, or how to use the Soroban CLI to submit a proposal and vote.

Requirements and Context:
- New file: `docs/governance-guide.md`
- `contracts/governance/src/lib.rs` — all public functions L175–535
- `contracts/governance/src/types.rs` — `Proposal`, `GovConfig`, `ProposalType`, `ProposalStatus`, `ProposalPayload`
- Must explain the full lifecycle: `create_proposal` → voting delay → `cast_vote` → `finalize_proposal` → timelock → `execute_proposal`
- Must document `ProposalStatus` transitions: Active → Passed/Defeated → Queued → Executed/Cancelled
- Must explain `quorum_bps` and `approval_threshold_bps` with numerical examples

Acceptance Criteria:
- [ ] `docs/governance-guide.md` is created covering the full proposal lifecycle
- [ ] All four `ProposalType` variants are documented with their required `ProposalPayload` fields
- [ ] The voting power formula (`token balance at proposal creation`) is explained
- [ ] Example Soroban CLI commands for `create_proposal` and `cast_vote` are included
- [ ] The `GovConfig` parameters are documented with recommended values for testnet

Branch Suggestion:
docs/governance-usage-guide

Commit Message Suggestions:
- `docs: add governance contract usage guide with full proposal lifecycle`
- `docs: document GovConfig parameters with numerical examples`
- `docs: add CLI examples for create_proposal and cast_vote`

PR Title:
docs: Add governance contract usage guide (proposals, voting, execution)

PR Description:
Summary:
This PR creates `docs/governance-guide.md`, a complete usage reference for the `GovernanceContract`. It covers the four proposal types, the full lifecycle from creation through timelock to execution, the `GovConfig` configuration parameters with examples, and provides Soroban CLI invocation examples for creating proposals and casting votes.

Changes:
- Created `docs/governance-guide.md` with lifecycle walkthrough and parameter reference
- Documented all `ProposalType` variants and their `ProposalPayload` structures
- Explained quorum calculation and approval threshold with a worked example

Testing:
- Verify all function names and parameter names referenced in the guide match `contracts/governance/src/lib.rs`
- Confirm `cargo doc --package governance --no-deps` generates complete docs

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #8 Document the v1→v2 Storage Migration Process

Title: Document the Storage Migration from v1 (Monolithic) to v2 (Granular) in `contracts/escrow_contract/src/storage.rs`

Body:

Category: Documentation
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–4 hours

Description:
`contracts/escrow_contract/src/storage.rs` implements a versioned storage migration from v1 (`EscrowStateV1` with inline milestones) to v2 (`EscrowMeta` + per-milestone `PackedDataKey::Milestone(id, milestone_id)` entries). The `StorageManager::migrate_v1_to_v2` function and `STORAGE_VERSION` constant exist but lack external documentation. Contract operators who need to upgrade a live deployment have no guide explaining what data is transformed, what risks exist, and how to verify migration success without corrupting escrow state.

Requirements and Context:
- `contracts/escrow_contract/src/storage.rs` — `StorageManager`, `migrate_v1_to_v2`, `STORAGE_VERSION = 2`, `EscrowStateV1`
- New file: `docs/storage-migration.md`
- Must document `PackedDataKey` variants (`EscrowMeta`, `Milestone`, `RecurringConfig`) vs legacy `DataKey::Escrow`
- Must explain the upgrade flow: call `upgrade` → `StorageManager::migrate` → `migrate_v1_to_v2` → version bumped to 2
- Must document rollback impossibility and the `StorageMigrationFailed` (error code 42) error
- Must explain how `allocated_amount` is reconstructed by summing v1 milestone amounts

Acceptance Criteria:
- [ ] `docs/storage-migration.md` explains the v1 and v2 storage layouts side by side
- [ ] The migration sequence is documented: how `migrate` is triggered, what it reads, and what it writes
- [ ] The document explains `StorageError::StorageMigrationFailed` (42) and when it occurs
- [ ] A verification checklist is provided to confirm migration success on-chain via view functions
- [ ] The document warns that downgrade (v2 → v1) is unsupported and will return `StorageMigrationFailed`

Branch Suggestion:
docs/storage-migration-guide

Commit Message Suggestions:
- `docs: add v1-to-v2 storage migration process documentation`
- `docs: document PackedDataKey layout and EscrowMeta reconstruction`
- `docs: add migration verification checklist and rollback warning`

PR Title:
docs: Document v1→v2 storage migration process and verification steps

PR Description:
Summary:
This PR creates `docs/storage-migration.md`, which documents the versioned storage migration from the monolithic v1 `EscrowStateV1` layout to the granular v2 `EscrowMeta` + per-milestone storage layout. It covers when migration is triggered, what data is transformed, how `allocated_amount` is reconstructed, verification steps, and the impossibility of downgrading once migration completes.

Changes:
- Created `docs/storage-migration.md` with v1/v2 layout comparison and migration steps
- Documented `StorageManager` functions: `get_version`, `needs_migration`, `migrate`, `migrate_v1_to_v2`
- Added verification checklist using `get_escrow` and `get_milestone` view functions

Testing:
- Cross-reference documentation with `storage.rs` implementation
- Run `cargo test -p escrow_contract test_create_escrow_packs_metadata_separately` to validate v2 layout

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #9 Add Cross-Chain Bridge Integration Guide (Wormhole)

Title: Write Wormhole Bridge Integration Guide for Wrapped Token Escrows

Body:

Category: Documentation
Difficulty: Intermediate
Priority: Medium
Estimated Time: 4–6 hours

Description:
`contracts/escrow_contract/src/bridge.rs` implements `WrappedTokenInfo`, `BridgeConfirmation`, `register_wrapped_token`, `validate_escrow_token`, and `require_bridge_finalized` for Wormhole and Allbridge cross-chain tokens. There is no guide explaining how to register a bridged token, set the `WormholeBridge` address, update confirmation counts via `update_bridge_confirmation`, or use bridge tokens in escrows. The `MIN_BRIDGE_CONFIRMATIONS = 15` constant and the `BridgeError` (error 54) are also undocumented from a user perspective.

Requirements and Context:
- New file: `docs/bridge-integration.md`
- `contracts/escrow_contract/src/bridge.rs` — all types and functions
- `contracts/escrow_contract/src/lib.rs` — `set_wormhole_bridge` (L773), `register_wrapped_token` (L787), `update_bridge_confirmation` (L806), `get_bridge_confirmation` (L827)
- Must explain the `WrappedTokenInfo` fields: `stellar_address`, `origin_chain`, `origin_address`, `bridge`, `is_approved`
- Must document `MIN_BRIDGE_CONFIRMATIONS = 15` and `BridgeConfirmation.is_finalized`
- Must explain `BridgeProtocol::Wormhole` vs `BridgeProtocol::Allbridge`

Acceptance Criteria:
- [ ] `docs/bridge-integration.md` is created and covers the full wrapped token registration workflow
- [ ] The document explains how to call `set_wormhole_bridge`, `register_wrapped_token`, and `update_bridge_confirmation` via the Soroban CLI
- [ ] The finalization requirement (`is_finalized = true` required before use in escrow) is clearly documented
- [ ] `BridgeError` (54) causes and resolution steps are listed
- [ ] The `WormholeBridgeInterface::is_wrapped_asset` trait method is explained

Branch Suggestion:
docs/bridge-integration-guide

Commit Message Suggestions:
- `docs: add Wormhole bridge integration guide for wrapped token escrows`
- `docs: document MIN_BRIDGE_CONFIRMATIONS and BridgeConfirmation finalization`
- `docs: add CLI examples for register_wrapped_token and update_bridge_confirmation`

PR Title:
docs: Add cross-chain Wormhole bridge integration guide

PR Description:
Summary:
This PR creates `docs/bridge-integration.md`, a complete guide for integrating Wormhole-bridged wrapped tokens with `stellar-trust-escrow`. It covers registering wrapped tokens, configuring the Wormhole bridge address, updating confirmation counts, and the finalization requirement before bridge tokens may be used in escrows.

Changes:
- Created `docs/bridge-integration.md` with wrapped token registration workflow
- Documented `WrappedTokenInfo`, `BridgeConfirmation`, and `BridgeProtocol` types
- Added `BridgeError` (54) troubleshooting section

Testing:
- Verify all function signatures referenced in the guide match `bridge.rs`
- Run `cargo test -p escrow_contract` bridge tests to confirm behavior matches documentation

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #10 Document the Slashing Mechanism and Dispute Window

Title: Document the Slash Mechanism, `SLASH_DISPUTE_PERIOD`, and Full Slash Workflow in `lib.rs`

Body:

Category: Documentation
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–4 hours

Description:
The slashing subsystem in `contracts/escrow_contract/src/lib.rs` involves `finalize_slash` (L2441), `dispute_slash` (L2480), `resolve_slash_dispute` (L2518), `apply_slash` (L2662), and the `SlashRecord` type, controlled by `SLASH_DISPUTE_PERIOD` (L86) and `SLASH_PERCENTAGE` (L87). However there is no documentation explaining when a slash is created (as part of `execute_cancellation`), how the `SLASH_DISPUTE_PERIOD` window allows the slashed party to dispute, and what `resolve_slash_dispute` does to reputation on both upheld and reversed outcomes.

Requirements and Context:
- New file: `docs/slashing-mechanism.md`
- `contracts/escrow_contract/src/lib.rs` — `finalize_slash` L2441, `dispute_slash` L2480, `resolve_slash_dispute` L2518
- `contracts/escrow_contract/src/types.rs` — `SlashRecord` struct (L354–375)
- Constants: `SLASH_DISPUTE_PERIOD` (L86), `SLASH_PERCENTAGE` (L87)
- Must explain how `apply_slash` calculates the slashed amount using `calculate_slash_amount` (L2657)
- Must document `SlashRecord` fields: `escrow_id`, `slashed_user`, `recipient`, `amount`, `reason`, `slashed_at`, `disputed`
- Must explain the `slash_count` and `total_slashed` fields in `ReputationRecord`

Acceptance Criteria:
- [ ] `docs/slashing-mechanism.md` is created with the complete slash lifecycle
- [ ] The document explains slash creation during `execute_cancellation` and the `SLASH_PERCENTAGE` formula
- [ ] The `SLASH_DISPUTE_PERIOD` window and its enforcement in `finalize_slash` are documented
- [ ] Both slash outcomes (upheld and reversed) and their reputation effects are documented
- [ ] `EscrowError` codes `SlashNotFound` (38), `SlashAlreadyDisputed` (39), `SlashDisputeDeadlineExpired` (40) are explained

Branch Suggestion:
docs/slashing-mechanism-guide

Commit Message Suggestions:
- `docs: add slashing mechanism and dispute window documentation`
- `docs: document SlashRecord fields and SLASH_PERCENTAGE formula`
- `docs: explain upheld vs reversed slash outcomes and reputation effects`

PR Title:
docs: Document the slashing mechanism, dispute window, and `SlashRecord` lifecycle

PR Description:
Summary:
This PR creates `docs/slashing-mechanism.md`, documenting how slashing works in `stellar-trust-escrow`: how a `SlashRecord` is created during `execute_cancellation`, the `SLASH_DISPUTE_PERIOD` window, how `dispute_slash` and `resolve_slash_dispute` work, and the reputation effects of upheld versus reversed slashes.

Changes:
- Created `docs/slashing-mechanism.md` with full slash lifecycle reference
- Documented `SlashRecord` struct fields and their semantics
- Explained `SLASH_PERCENTAGE` and `calculate_slash_amount` formula
- Listed all slash-related `EscrowError` codes (38–41) with descriptions

Testing:
- Verify documentation against `finalize_slash`, `dispute_slash`, `resolve_slash_dispute` implementations
- Run `cargo test -p escrow_contract test_execute_cancellation_slashes_requester` to validate

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #11 Add Reputation Scoring Algorithm Documentation

Title: Document the On-Chain Reputation Scoring Algorithm and `ReputationRecord` Fields

Body:

Category: Documentation
Difficulty: Intermediate
Priority: Low
Estimated Time: 2–4 hours

Description:
The `_update_reputation_internal` function (L2572) and `update_reputation` public function (L2010) in `contracts/escrow_contract/src/lib.rs` modify the `ReputationRecord` type, which includes `total_score`, `completed_escrows`, `disputed_escrows`, `disputes_won`, `total_volume`, `slash_count`, and `total_slashed`. There is no documentation explaining the scoring formula, how disputes affect score, how slashes reduce it, or how the score is expected to be consumed by clients displaying reputation badges.

Requirements and Context:
- New file: `docs/reputation-scoring.md`
- `contracts/escrow_contract/src/types.rs` — `ReputationRecord` struct (L298–326)
- `contracts/escrow_contract/src/lib.rs` — `_update_reputation_internal` (L2572), `update_reputation` (L2010), `get_reputation` (L2225)
- Must explain every field in `ReputationRecord` with its unit and increment/decrement rules
- Must document when `emit_reputation_updated` fires and what `new_score` represents
- Must explain the relationship between slash events and `slash_count` / `total_slashed`

Acceptance Criteria:
- [ ] `docs/reputation-scoring.md` documents every `ReputationRecord` field
- [ ] The scoring algorithm in `_update_reputation_internal` is explained in plain language
- [ ] The document explains when reputation is updated: escrow completion, dispute resolution, slash finalization
- [ ] Example score calculations are provided for common scenarios
- [ ] The `get_reputation` function's return of a default zero-score record for new addresses is documented

Branch Suggestion:
docs/reputation-scoring-algorithm

Commit Message Suggestions:
- `docs: add reputation scoring algorithm and ReputationRecord field documentation`
- `docs: explain how disputes and slashes affect total_score`
- `docs: add example score calculations for common escrow outcomes`

PR Title:
docs: Document the reputation scoring algorithm and `ReputationRecord` fields

PR Description:
Summary:
This PR creates `docs/reputation-scoring.md`, documenting the `ReputationRecord` data structure, every field's semantics and update rules, and the scoring algorithm implemented in `_update_reputation_internal`. It also explains when the `reputation_updated` event fires and provides worked examples for common outcomes (clean completion, disputed, slashed).

Changes:
- Created `docs/reputation-scoring.md` with field reference and scoring algorithm explanation
- Added worked examples for completed, disputed, and slashed escrow outcomes
- Documented default zero-score behavior for new addresses via `get_reputation`

Testing:
- Verify documented behavior matches `_update_reputation_internal` at L2572 in `lib.rs`
- Run `cargo test -p escrow_contract test_get_reputation_returns_default_record` to confirm defaults

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #12 Create Arbiter Role Responsibilities Guide

Title: Write Arbiter Role Responsibilities Guide Covering `raise_dispute`, `resolve_dispute`, and Auth Requirements

Body:

Category: Documentation
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–3 hours

Description:
The arbiter is a central trusted party in `stellar-trust-escrow`, responsible for resolving disputes via `resolve_dispute` (L1955) in `contracts/escrow_contract/src/lib.rs`. However, there is no guide explaining how an arbiter is selected during `create_escrow`, what actions they can take, what authorization they must provide (via `require_auth()`), and what happens to escrow status when they resolve a dispute. New users assigning arbiters in production do not know the full scope of arbiter powers.

Requirements and Context:
- New file: `docs/arbiter-guide.md`
- `contracts/escrow_contract/src/lib.rs` — `raise_dispute` (L1905), `resolve_dispute` (L1955), `create_escrow_internal` (L895)
- The arbiter is stored in `EscrowMeta.arbiter: Option<Address>`
- Must document that `resolve_dispute` requires the caller to be `meta.arbiter`
- Must explain `resolve_dispute` parameters: `client_amount` + `freelancer_amount` must equal `remaining_balance`
- Must document that `EscrowStatus::Disputed` must be set before `resolve_dispute` can be called

Acceptance Criteria:
- [ ] `docs/arbiter-guide.md` is created explaining arbiter selection, powers, and limitations
- [ ] The auth flow for `resolve_dispute` (arbiter must sign) is documented
- [ ] The constraint that `client_amount + freelancer_amount == remaining_balance` is explained
- [ ] The document lists what the arbiter cannot do (e.g. cannot approve milestones, cannot cancel unilaterally)
- [ ] The `EscrowError::Unauthorized` (3) error for non-arbiter dispute resolution is documented

Branch Suggestion:
docs/arbiter-role-guide

Commit Message Suggestions:
- `docs: add arbiter role responsibilities guide`
- `docs: document resolve_dispute auth requirements and amount constraints`
- `docs: clarify arbiter limitations vs client and freelancer roles`

PR Title:
docs: Create arbiter role responsibilities guide

PR Description:
Summary:
This PR creates `docs/arbiter-guide.md`, a complete reference for parties acting as arbiters in `stellar-trust-escrow`. It covers how arbiters are assigned during escrow creation, what authorization they must provide, the mechanics of `raise_dispute` and `resolve_dispute`, and the constraints on dispute resolution amounts.

Changes:
- Created `docs/arbiter-guide.md` with arbiter powers, limitations, and auth requirements
- Documented the `resolve_dispute` amount constraint and `EscrowStatus::Disputed` prerequisite
- Added a section on best practices for selecting a trusted arbiter address

Testing:
- Verify all function signatures referenced match `lib.rs`
- Run `cargo test -p escrow_contract test_dispute_resolution` to confirm arbiter behavior

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #13 Document Recurring Payment Configuration Parameters

Title: Document `RecurringPaymentConfig` Fields, `RecurringInterval` Variants, and Schedule Semantics

Body:

Category: Documentation
Difficulty: Beginner
Priority: Low
Estimated Time: 2–3 hours

Description:
`RecurringPaymentConfig` (L181–217 in `contracts/escrow_contract/src/types.rs`) has 12 fields including `interval`, `payment_amount`, `start_time`, `next_payment_at`, `end_date`, `total_payments`, `payments_remaining`, `processed_payments`, `paused`, `cancelled`, `paused_at`, and `last_payment_at`. None of these fields have doc comments, and there is no guide explaining how `next_schedule_time` (L2642) computes the next payment for each `RecurringInterval` variant (Daily/Weekly/Monthly) or how `process_recurring_payments` (L1433) handles multiple overdue periods.

Requirements and Context:
- New file: `docs/recurring-payments.md`
- `contracts/escrow_contract/src/types.rs` — `RecurringPaymentConfig` (L181–217), `RecurringInterval` (L111–115)
- `contracts/escrow_contract/src/lib.rs` — `create_recurring_escrow` (L984), `process_recurring_payments` (L1433), `next_schedule_time` (L2642)
- Must explain Daily = 86,400s, Weekly = 604,800s, Monthly = 2,592,000s approximation
- Must explain `payments_remaining` decrement and the `end_date` vs `total_payments` termination conditions

Acceptance Criteria:
- [ ] `docs/recurring-payments.md` documents all 12 `RecurringPaymentConfig` fields
- [ ] All three `RecurringInterval` variants and their second offsets are documented
- [ ] The document explains how `process_recurring_payments` handles multiple overdue periods in one call
- [ ] The pause/resume workflow with `paused_at` timestamp is documented
- [ ] `RecurringConfigNotFound` (43), `NoRecurringPaymentDue` (45), and `RecurringSchedulePaused` (46) errors are explained

Branch Suggestion:
docs/recurring-payment-config

Commit Message Suggestions:
- `docs: add recurring payment configuration and schedule documentation`
- `docs: document RecurringInterval second offsets for Daily/Weekly/Monthly`
- `docs: explain multi-period processing in process_recurring_payments`

PR Title:
docs: Document `RecurringPaymentConfig` fields and recurring schedule semantics

PR Description:
Summary:
This PR adds `docs/recurring-payments.md`, fully documenting the `RecurringPaymentConfig` struct, all three `RecurringInterval` variants, the `next_schedule_time` computation, multi-period processing behavior, and the pause/resume/cancel workflow.

Changes:
- Created `docs/recurring-payments.md` with field reference and schedule computation explanation
- Documented all three interval variants with their second-based offsets
- Explained `process_recurring_payments` multi-period catch-up behavior

Testing:
- Verify documented behavior against `create_recurring_escrow` and `process_recurring_payments` in `lib.rs`
- Run `cargo test -p escrow_contract test_create_recurring_escrow_stores_schedule`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #14 Add Multisig Escrow Setup Guide

Title: Write Multisig Escrow Setup Guide Covering `buyer_signers`, `MultisigConfig`, and Threshold Approval

Body:

Category: Documentation
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–4 hours

Description:
`create_escrow_with_buyer_signers` (L869) in `contracts/escrow_contract/src/lib.rs` enables multisig milestone approval using `MultisigConfig` (weights + threshold) and `ApprovalRecord` tracking, but there is no guide explaining how to configure a multisig escrow, how weighted voting works in `approve_milestone`, or how the `buyer_signers` field in `EscrowMeta` is used. The `emit_multisig_approval_recorded` event also goes undocumented in terms of when it fires vs. `emit_milestone_approved`.

Requirements and Context:
- New file: `docs/multisig-escrow-guide.md`
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_with_buyer_signers` (L869), `approve_milestone` (L1596)
- `contracts/escrow_contract/src/types.rs` — `MultisigConfig` (L133), `ApprovalRecord` (L120)
- `contracts/escrow_contract/src/events.rs` — `emit_multisig_approval_recorded`
- Must explain the relationship between `MultisigConfig.approvers`, `.weights`, and `.threshold`
- Must document that `buyer_signers` is a `Vec<Address>` stored in `EscrowMeta`

Acceptance Criteria:
- [ ] `docs/multisig-escrow-guide.md` explains `MultisigConfig` field semantics
- [ ] A worked example shows a 2-of-3 multisig configuration with example weights and threshold
- [ ] The document distinguishes `emit_multisig_approval_recorded` (partial) from `emit_milestone_approved` (final)
- [ ] The Soroban CLI invocation for `create_escrow_with_buyer_signers` is shown with example args
- [ ] `EscrowError::Unauthorized` (3) for non-signer approval attempts is documented

Branch Suggestion:
docs/multisig-escrow-guide

Commit Message Suggestions:
- `docs: add multisig escrow setup guide with weighted approval example`
- `docs: document MultisigConfig fields and threshold semantics`
- `docs: explain multisig_approval_recorded vs milestone_approved event distinction`

PR Title:
docs: Add multisig escrow setup guide covering `buyer_signers` and weighted approval

PR Description:
Summary:
This PR creates `docs/multisig-escrow-guide.md`, documenting how to configure and use multisig milestone approval in `stellar-trust-escrow`. It covers `MultisigConfig` field semantics, how `ApprovalRecord` tracks individual signer votes, the weighted threshold mechanism, and provides a worked 2-of-3 multisig example with CLI invocation.

Changes:
- Created `docs/multisig-escrow-guide.md` with setup instructions and worked example
- Documented `MultisigConfig` fields: `approvers`, `weights`, `threshold`
- Explained the difference between partial (`msig_apr` event) and final (`mil_apr` event) approval

Testing:
- Verify documented behavior against `approve_milestone` implementation at L1596 in `lib.rs`
- Run `cargo test -p escrow_contract test_approve_milestone_o1_completion_check`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #15 Create Contributor Onboarding Guide for Soroban Development

Title: Write Contributor Onboarding Guide for Soroban/Rust Development on `stellar-trust-escrow`

Body:

Category: Documentation
Difficulty: Beginner
Priority: Medium
Estimated Time: 3–5 hours

Description:
The existing `CONTRIBUTING.md` in the project root does not cover Soroban-specific setup: installing the Soroban CLI, configuring a Stellar testnet identity, understanding the workspace `Cargo.toml` structure, running the contract test suite with `cargo test -p escrow_contract`, or using `Env::default()` and `mock_all_auths()` in Soroban tests. New contributors unfamiliar with Soroban face a steep learning curve that this guide would directly address.

Requirements and Context:
- Update or replace content in `CONTRIBUTING.md` with a Soroban-focused contributor guide
- Must document workspace structure: four crate members in `Cargo.toml`
- Must explain how to run tests: `cargo test -p escrow_contract`, `cargo test -p escrow_extensions`, `cargo test -p governance`
- Must explain the Soroban test harness: `Env::default()`, `mock_all_auths()`, `Address::generate()`, `Ledger::with_mut()` for time manipulation
- Must document the `[profile.release]` settings and why `overflow-checks = true` matters

Acceptance Criteria:
- [ ] `CONTRIBUTING.md` includes a Soroban development environment setup section
- [ ] Instructions for installing the Soroban CLI and Rust toolchain are included
- [ ] The guide explains how to run tests for each contract crate individually
- [ ] The Soroban test harness patterns (`mock_all_auths`, `Ledger::with_mut`) are explained
- [ ] A section on submitting PRs with required test coverage is included

Branch Suggestion:
docs/contributor-onboarding-soroban

Commit Message Suggestions:
- `docs: add Soroban-specific contributor onboarding guide`
- `docs: document Soroban test harness patterns for new contributors`
- `docs: add Rust toolchain and Soroban CLI setup instructions`

PR Title:
docs: Add Soroban/Rust contributor onboarding guide to `CONTRIBUTING.md`

PR Description:
Summary:
This PR updates `CONTRIBUTING.md` with a comprehensive Soroban development onboarding guide. It covers the required toolchain, workspace structure, how to run per-crate tests, Soroban-specific test patterns (`mock_all_auths`, `Ledger::with_mut` for time simulation), and the PR submission process including test coverage expectations.

Changes:
- Expanded `CONTRIBUTING.md` with Soroban CLI installation and setup steps
- Added workspace structure overview referencing the four contract crates
- Documented `cargo test -p escrow_contract` and other per-crate test commands
- Explained `Env::default()`, `mock_all_auths()`, and `Ledger::with_mut()` patterns

Testing:
- Follow guide end-to-end on a clean development environment
- Verify all referenced test commands produce passing results

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #16 Document `EscrowError` Codes with User-Facing Descriptions

Title: Add User-Facing Descriptions for All 54 `EscrowError` Codes in `errors.rs`

Body:

Category: Documentation
Difficulty: Beginner
Priority: Low
Estimated Time: 2–3 hours

Description:
`contracts/escrow_contract/src/errors.rs` defines 54 error codes in the `EscrowError` enum but many variants have no doc comment at all (e.g. `EscrowNotFound`, `MilestoneNotFound`, `TransferFailed`, `AmountMismatch`). Frontend and backend integrators parsing these error codes from Soroban transaction diagnostics need human-readable descriptions to surface to end users. This issue asks for both inline rustdoc comments on each variant and a separate reference document.

Requirements and Context:
- `contracts/escrow_contract/src/errors.rs` — `EscrowError` enum with 54 variants (discriminants 1–54, with gaps at 7, 11, 22, 24)
- New file: `docs/error-codes.md` with a table of all error codes, names, and user-facing descriptions
- Each `EscrowError` variant in `errors.rs` must have a `///` doc comment
- Note the missing discriminants: 7, 11, 22, and 24 are absent from the enum
- Must distinguish between authorization errors (3–6) and state errors (8–26)

Acceptance Criteria:
- [ ] Every `EscrowError` variant has a `///` doc comment in `errors.rs`
- [ ] `docs/error-codes.md` is created with a Markdown table: code | name | user-facing description | when it occurs
- [ ] The missing discriminant values (7, 11, 22, 24) are noted as reserved/unused in the table
- [ ] `cargo doc --package escrow_contract --no-deps` shows no missing-doc warnings for `EscrowError`
- [ ] Error groupings (auth, state, milestone, funds, dispute, etc.) are clearly organized

Branch Suggestion:
docs/escrow-error-codes-reference

Commit Message Suggestions:
- `docs: add rustdoc comments to all 54 EscrowError variants`
- `docs: create error-codes.md reference table with user-facing descriptions`
- `docs: note reserved discriminant gaps at 7, 11, 22, 24 in error enum`

PR Title:
docs: Document all 54 `EscrowError` codes with user-facing descriptions

PR Description:
Summary:
This PR adds `///` rustdoc comments to every `EscrowError` variant in `contracts/escrow_contract/src/errors.rs` and creates a new `docs/error-codes.md` reference table listing all 54 error codes, their names, user-facing descriptions, and the conditions under which they occur. The missing discriminants (7, 11, 22, 24) are noted as reserved.

Changes:
- Added `///` doc comments to all `EscrowError` variants in `errors.rs`
- Created `docs/error-codes.md` with complete error code reference table
- Organized errors by category: initialization, authorization, escrow state, milestone, funds, dispute, timelock, bridge

Testing:
- Run `cargo doc --package escrow_contract --no-deps` and verify no missing-doc warnings
- Run `cargo build --package escrow_contract` to confirm no regressions

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #17 Add Indexer Event Schema Documentation

Title: Document All Contract Events from `events.rs` with Topic/Data Schema for Off-Chain Indexers

Body:

Category: Documentation
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`contracts/escrow_contract/src/events.rs` defines approximately 30 event emitter functions (e.g. `emit_escrow_created`, `emit_milestone_submitted`, `emit_slash_applied`, `emit_bridge_confirmation_updated`) with specific `symbol_short!` topic names and structured data payloads. Backend indexers must decode these events from raw Soroban XDR, but there is no schema document mapping each event topic string to its expected data tuple. This causes indexer mismatches when event shapes change.

Requirements and Context:
- New file: `docs/event-schema.md`
- `contracts/escrow_contract/src/events.rs` — all 30+ `emit_*` functions
- `contracts/escrow_extensions/src/events.rs` — extension contract events
- Must document each event as: topic tuple | data tuple | emitting function | when emitted
- Must note that `symbol_short!` strings are limited to 9 characters in Soroban
- Include events from both `escrow_contract` and `escrow_extensions` contracts

Acceptance Criteria:
- [ ] `docs/event-schema.md` is created with a table for every event in `events.rs`
- [ ] Each entry documents: `symbol_short!` value, topic tuple type, data tuple type, and trigger condition
- [ ] The document notes the 9-character limit on `symbol_short!` names
- [ ] Extension contract events (from `escrow_extensions/src/events.rs`) are included in a separate section
- [ ] The document explains how to decode events from Soroban transaction meta using the horizon API

Branch Suggestion:
docs/indexer-event-schema

Commit Message Suggestions:
- `docs: add indexer event schema documentation for all contract events`
- `docs: document symbol_short! topic names and data tuple types`
- `docs: include escrow_extensions events in event schema reference`

PR Title:
docs: Add indexer event schema documentation for all emitted contract events

PR Description:
Summary:
This PR creates `docs/event-schema.md`, a complete reference for all events emitted by `stellar-trust-escrow` contracts. It maps every `symbol_short!` topic name to its data tuple types, documents the triggering function and condition, and explains how off-chain indexers can decode events from Soroban transaction meta XDR.

Changes:
- Created `docs/event-schema.md` with event schema table for `escrow_contract` and `escrow_extensions`
- Documented all `symbol_short!` values with their 9-character limit noted
- Added a section on decoding Soroban events via the Horizon API

Testing:
- Cross-reference all `emit_*` functions in `events.rs` against the schema table
- Verify no events are missing from the documentation

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #18 Add `get_admin` Public View Function

Title: Add `get_admin() -> Address` Public View Function to `EscrowContract`

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: Low
Estimated Time: 1–2 hours

Description:
`contracts/escrow_contract/src/lib.rs` exposes `require_admin` (L208) as an internal auth check, but there is no public `get_admin` view function that returns the current admin address. Frontend dashboards and off-chain governance tools that want to display the current contract admin have no way to query this without reading raw instance storage. Adding a transparent `get_admin` view follows the principle of least surprise and is consistent with similar admin-viewable DeFi contracts.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — add `pub fn get_admin` after the `is_paused` function (L2071)
- `contracts/escrow_contract/src/lib.rs` — `ContractStorage::require_admin` reads from `DataKey::Admin` (L208)
- `contracts/escrow_contract/src/types.rs` — `DataKey::Admin` variant (L439)
- Must call `storage.require_initialized()` before reading to return `EscrowError::NotInitialized` if not yet set
- Must not require any authentication (view function accessible to all)
- Must call `storage.bump_instance_ttl()` to prevent TTL expiry

Acceptance Criteria:
- [ ] `pub fn get_admin(env: Env) -> Result<Address, EscrowError>` is added to `EscrowContract`
- [ ] The function reads from `DataKey::Admin` in instance storage
- [ ] Returns `EscrowError::NotInitialized` (2) if the contract has not been initialized
- [ ] No auth requirement is imposed (unauthenticated view)
- [ ] A unit test in `contracts/escrow_contract/src/lib.rs` verifies `get_admin` returns the initialized admin address

Branch Suggestion:
feat/get-admin-view-function

Commit Message Suggestions:
- `feat: add get_admin public view function to EscrowContract`
- `test: add unit test for get_admin returning initialized admin address`
- `feat: return NotInitialized error from get_admin when contract uninitialized`

PR Title:
feat: Add `get_admin() -> Address` public view function to `EscrowContract`

PR Description:
Summary:
This PR adds a `get_admin` public view function to `EscrowContract` that returns the current admin `Address` from instance storage. It checks contract initialization and bumps the instance TTL on access, providing transparent admin discoverability for frontends and off-chain governance tools without requiring any authentication.

Changes:
- Added `pub fn get_admin(env: Env) -> Result<Address, EscrowError>` to `EscrowContract` in `lib.rs`
- Returns `EscrowError::NotInitialized` if contract has not been initialized
- Added unit test verifying correct admin address is returned after `initialize`

Testing:
- Run `cargo test -p escrow_contract` and verify new `test_get_admin` test passes
- Confirm `get_admin` returns the admin set during `initialize` in the test environment

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #19 Add `get_escrow_meta` Lightweight View Function

Title: Add `get_escrow_meta(escrow_id: u64) -> EscrowMeta` View Function Without Loading Milestones

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: Medium
Estimated Time: 1–3 hours

Description:
The existing `get_escrow` function (L2185) calls `load_escrow` (L335), which assembles a full `EscrowState` by loading `EscrowMeta` plus every individual `Milestone` from persistent storage — an O(N) operation with respect to milestone count. For callers that only need the escrow header (status, balances, parties, deadline), this is unnecessarily expensive in ledger read operations. A dedicated `get_escrow_meta` view returning only `EscrowMeta` would be O(1) and improve efficiency for monitoring dashboards.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `ContractStorage::load_escrow_meta` at L243, `get_escrow` at L2185
- `contracts/escrow_contract/src/lib.rs` — `EscrowMeta` struct at L150–181
- New function: `pub fn get_escrow_meta(env: Env, escrow_id: u64) -> Result<EscrowMeta, EscrowError>`
- Must call `load_escrow_meta` (not `load_escrow`) to avoid loading milestones
- Must call `storage.settle_rent_for_access` as existing `load_escrow_meta_with_rent` (L254) does
- Must return `EscrowError::EscrowNotFound` (8) if the escrow does not exist

Acceptance Criteria:
- [ ] `pub fn get_escrow_meta(env: Env, escrow_id: u64) -> Result<EscrowMeta, EscrowError>` is added
- [ ] The function does NOT call `load_escrow` (no milestone loading)
- [ ] Returns `EscrowError::EscrowNotFound` (8) if no `PackedDataKey::EscrowMeta(escrow_id)` entry exists
- [ ] A unit test asserts that `get_escrow_meta` returns correct metadata after state-changing operations
- [ ] The function calls `bump_persistent_ttl` on the meta storage key

Branch Suggestion:
feat/get-escrow-meta-view

Commit Message Suggestions:
- `feat: add get_escrow_meta lightweight O(1) view function`
- `feat: avoid milestone loading in get_escrow_meta for gas efficiency`
- `test: add test for get_escrow_meta returning correct EscrowMeta after creation`

PR Title:
feat: Add `get_escrow_meta` lightweight view function (no milestone loading)

PR Description:
Summary:
This PR adds a `get_escrow_meta` view function to `EscrowContract` that returns only the `EscrowMeta` header for a given escrow ID without loading any milestones. This is an O(1) read compared to the O(N) `get_escrow` function and is suitable for monitoring dashboards that only need status, balance, and party information.

Changes:
- Added `pub fn get_escrow_meta(env: Env, escrow_id: u64) -> Result<EscrowMeta, EscrowError>`
- Function reads from `PackedDataKey::EscrowMeta(escrow_id)` directly
- Added unit test confirming correct `EscrowMeta` fields after `create_escrow` and `add_milestone`

Testing:
- Run `cargo test -p escrow_contract test_get_escrow_meta`
- Verify via `cargo test` that no existing tests are broken

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #20 Add `get_lock_time_remaining` View Function

Title: Add `get_lock_time_remaining(escrow_id: u64) -> Option<u64>` Public View Function

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: Low
Estimated Time: 1–2 hours

Description:
`contracts/escrow_contract/src/lib.rs` has `check_lock_time_expired` (L655) as an internal helper, but there is no public view function that lets clients or frontends query how many seconds remain on an active lock time. Users who want to display a countdown to lock expiry, or smart contracts that want to gate actions on lock expiry, have no on-chain way to query this without duplicating the lock time calculation off-chain.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `check_lock_time_expired` at L655, `EscrowMeta.lock_time: Option<u64>`, `EscrowMeta.lock_time_extension: Option<u64>`
- New function: `pub fn get_lock_time_remaining(env: Env, escrow_id: u64) -> Result<Option<u64>, EscrowError>`
- Returns `None` if no lock time is set on the escrow
- Returns `Some(0)` if lock time has already expired
- Returns `Some(seconds_remaining)` computed as `effective_lock_time.saturating_sub(env.ledger().timestamp())`
- Must account for `lock_time_extension` when computing the effective lock time

Acceptance Criteria:
- [ ] `pub fn get_lock_time_remaining(env: Env, escrow_id: u64) -> Result<Option<u64>, EscrowError>` is added
- [ ] Returns `Ok(None)` when `EscrowMeta.lock_time` is `None`
- [ ] Returns `Ok(Some(0))` when lock time has expired
- [ ] Returns `Ok(Some(remaining_seconds))` correctly accounting for `lock_time_extension`
- [ ] A unit test covers all three cases: no lock, active lock, and expired lock

Branch Suggestion:
feat/get-lock-time-remaining-view

Commit Message Suggestions:
- `feat: add get_lock_time_remaining public view function`
- `test: add unit tests for no-lock, active-lock, and expired-lock cases`
- `feat: account for lock_time_extension in remaining time calculation`

PR Title:
feat: Add `get_lock_time_remaining` view function for lock countdown queries

PR Description:
Summary:
This PR adds a `get_lock_time_remaining` public view function to `EscrowContract` that returns the number of seconds until the escrow lock time expires, `None` if no lock is set, or `0` if the lock has already expired. It correctly accounts for `lock_time_extension` when computing the effective lock deadline.

Changes:
- Added `pub fn get_lock_time_remaining(env: Env, escrow_id: u64) -> Result<Option<u64>, EscrowError>`
- Handles `lock_time_extension` override of base `lock_time`
- Added unit tests for no-lock, active-lock, and expired-lock escrow states

Testing:
- Run `cargo test -p escrow_contract test_get_lock_time_remaining`
- Use `Ledger::with_mut` to advance timestamp and verify the zero result after expiry

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #21 Add `get_milestone_approvals` View for Multisig Progress

Title: Add `get_milestone_approvals(escrow_id: u64, milestone_id: u32) -> Vec<ApprovalRecord>` View Function

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: Low
Estimated Time: 1–2 hours

Description:
The `Milestone` struct (L150–176 in `types.rs`) includes an `approvals: Vec<ApprovalRecord>` field tracking multisig signer votes, but there is no public function that exposes only the approvals list for a given milestone without returning the entire `Milestone` struct. Frontends showing a multisig approval progress bar (e.g. "2 of 3 signers have approved") need a dedicated endpoint rather than unpacking the full `get_milestone` response.

Requirements and Context:
- `contracts/escrow_contract/src/types.rs` — `Milestone.approvals: Vec<ApprovalRecord>` (L175), `ApprovalRecord` (L120–123)
- `contracts/escrow_contract/src/lib.rs` — `get_milestone` (L2241), `ContractStorage::load_milestone` (L279)
- New function: `pub fn get_milestone_approvals(env: Env, escrow_id: u64, milestone_id: u32) -> Result<Vec<ApprovalRecord>, EscrowError>`
- Must return `EscrowError::MilestoneNotFound` (13) if the milestone does not exist
- Must bump persistent TTL for the milestone storage entry

Acceptance Criteria:
- [ ] `pub fn get_milestone_approvals(env, escrow_id, milestone_id) -> Result<Vec<ApprovalRecord>, EscrowError>` is added
- [ ] Returns the `approvals` field from the loaded `Milestone`
- [ ] Returns `EscrowError::MilestoneNotFound` (13) for invalid milestone IDs
- [ ] A unit test verifies the approvals list grows correctly after each multisig signer's `approve_milestone` call
- [ ] An empty `Vec` is returned for milestones with no approvals yet

Branch Suggestion:
feat/get-milestone-approvals-view

Commit Message Suggestions:
- `feat: add get_milestone_approvals view function for multisig progress`
- `test: verify approvals list grows after each multisig approve_milestone call`
- `feat: return MilestoneNotFound for invalid milestone in get_milestone_approvals`

PR Title:
feat: Add `get_milestone_approvals` view function for multisig progress tracking

PR Description:
Summary:
This PR adds a `get_milestone_approvals` public view function that returns the `Vec<ApprovalRecord>` for a given milestone without loading all other milestone fields. This is optimized for frontends that display multisig approval progress and only need the list of signers and their approval timestamps.

Changes:
- Added `pub fn get_milestone_approvals(env, escrow_id, milestone_id) -> Result<Vec<ApprovalRecord>, EscrowError>`
- Loaded via `ContractStorage::load_milestone` and returns only the `.approvals` field
- Added unit test verifying empty initial approvals and growth after `approve_milestone` calls

Testing:
- Run `cargo test -p escrow_contract test_get_milestone_approvals`
- Verify `ApprovalRecord.signer` and `ApprovalRecord.approved_at` fields are correctly populated

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #22 Add `get_contract_balance` View Function for Transparency

Title: Add `get_contract_balance(token: Address) -> i128` View Function to Expose On-Chain Token Balance

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: Low
Estimated Time: 1–2 hours

Description:
There is no public function on `EscrowContract` that returns the contract's current token balance for a given token address. External parties verifying that the contract holds sufficient funds to cover all active escrow `remaining_balance` values must rely on querying the token contract directly, which requires knowing the contract's own address. A `get_contract_balance` view function enables transparent solvency checks and simplifies integration testing.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `EscrowContract` impl block
- Must use `soroban_sdk::token::TokenClient::new(&env, &token).balance(&env.current_contract_address())`
- New function: `pub fn get_contract_balance(env: Env, token: Address) -> i128`
- No authentication required (pure view function)
- Must call `bump_instance_ttl` to ensure TTL is maintained

Acceptance Criteria:
- [ ] `pub fn get_contract_balance(env: Env, token: Address) -> i128` is added to `EscrowContract`
- [ ] The function queries the token contract for the escrow contract's own balance
- [ ] No auth requirement is imposed
- [ ] A unit test verifies the balance increases by `total_amount` after `create_escrow`
- [ ] The function is documented with a `///` comment explaining its purpose

Branch Suggestion:
feat/get-contract-balance-view

Commit Message Suggestions:
- `feat: add get_contract_balance transparent token balance view function`
- `test: verify contract balance increases after create_escrow`
- `docs: add rustdoc comment to get_contract_balance explaining solvency check use case`

PR Title:
feat: Add `get_contract_balance` view function for on-chain solvency transparency

PR Description:
Summary:
This PR adds a `get_contract_balance` public view function to `EscrowContract` that returns the contract's current token balance for any specified token address. This enables external parties to perform on-chain solvency checks without needing to know the contract's address or construct token client calls manually.

Changes:
- Added `pub fn get_contract_balance(env: Env, token: Address) -> i128`
- Uses `soroban_sdk::token::TokenClient` to query `env.current_contract_address()` balance
- Added unit test verifying balance equals `total_amount` after a fresh `create_escrow`

Testing:
- Run `cargo test -p escrow_contract test_get_contract_balance`
- Verify balance decreases by the correct amount after `release_funds` in tests

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #23 Add `update_arbiter` Function for Replacing Arbiter on Active Escrows

Title: Add `update_arbiter(escrow_id, new_arbiter)` Function for Arbiter Replacement on Active Escrows

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
Once an escrow is created, the `arbiter` field in `EscrowMeta` cannot be changed. If an arbiter becomes unresponsive or compromised, there is no on-chain mechanism to replace them. This is a critical gap for long-running escrows where the original arbiter address may become unavailable. A new `update_arbiter` function with appropriate authorization (requiring both `client` and `freelancer` to agree) would allow safe arbiter replacement without cancelling the escrow.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `EscrowMeta.arbiter: Option<Address>` (L166), `create_escrow_internal` (L895)
- New function: `pub fn update_arbiter(env: Env, caller: Address, escrow_id: u64, new_arbiter: Option<Address>) -> Result<(), EscrowError>`
- Must require authorization from both `client` and `freelancer` (both must `require_auth()`)
- Must validate that `new_arbiter != Some(client)` and `new_arbiter != Some(freelancer)` (reuse issue #27 validation)
- Must only work on escrows in `EscrowStatus::Active` state
- Must emit an event (new `emit_arbiter_updated`) when the arbiter is changed
- Must call `require_not_paused`

Acceptance Criteria:
- [ ] `pub fn update_arbiter(env, caller, escrow_id, new_arbiter) -> Result<(), EscrowError>` is added
- [ ] Both `client.require_auth()` and `freelancer.require_auth()` are called
- [ ] `new_arbiter` is validated to not equal client or freelancer addresses
- [ ] Returns `EscrowError::EscrowNotActive` (9) if escrow is not in `Active` status
- [ ] `emit_arbiter_updated` is added to `events.rs` and called on success
- [ ] Unit tests cover: successful update, unauthorized caller, invalid arbiter address

Branch Suggestion:
feat/update-arbiter-function

Commit Message Suggestions:
- `feat: add update_arbiter function requiring dual client+freelancer authorization`
- `feat: add emit_arbiter_updated event to events.rs`
- `test: add tests for update_arbiter success and auth failure cases`

PR Title:
feat: Add `update_arbiter` function for safe arbiter replacement on active escrows

PR Description:
Summary:
This PR adds an `update_arbiter` function to `EscrowContract` that allows the client and freelancer to jointly replace the arbiter on an active escrow. Both parties must sign the transaction. The new arbiter is validated against client and freelancer addresses, and an `arbiter_updated` event is emitted on success.

Changes:
- Added `pub fn update_arbiter(env, caller, escrow_id, new_arbiter) -> Result<(), EscrowError>`
- Added `emit_arbiter_updated` to `contracts/escrow_contract/src/events.rs`
- Added unit tests for dual-auth success, single-auth failure, and invalid arbiter address

Testing:
- Run `cargo test -p escrow_contract test_update_arbiter`
- Verify that `mock_all_auths()` and single-signer scenarios behave correctly

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #24 Add `extend_deadline` Function for Client and Arbiter

Title: Add `extend_deadline(escrow_id, new_deadline)` Function Callable by Client or Arbiter

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–4 hours

Description:
The `EscrowMeta.deadline: Option<u64>` field is set at creation time via `create_escrow_internal` (L895) but there is no function to extend it. In practice, complex software projects often need deadline extensions due to scope changes. Adding an `extend_deadline` function callable by the client (or arbiter in disputed escrows) would prevent premature cancellations due to expired deadlines without requiring the escrow to be cancelled and recreated.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `EscrowMeta.deadline: Option<u64>` (L169), `create_escrow_internal` (L895)
- New function: `pub fn extend_deadline(env: Env, caller: Address, escrow_id: u64, new_deadline: u64) -> Result<(), EscrowError>`
- Must validate `new_deadline > env.ledger().timestamp()` to avoid extending to the past (`EscrowError::InvalidDeadline` 25)
- Must validate `new_deadline > current_deadline` (extensions only, no shortening)
- Must require auth from `client` or, if escrow is `EscrowStatus::Disputed`, from `arbiter`
- Must only apply to escrows in `Active` or `Disputed` status
- Must emit `emit_deadline_extended` event

Acceptance Criteria:
- [ ] `pub fn extend_deadline(env, caller, escrow_id, new_deadline) -> Result<(), EscrowError>` is added
- [ ] Returns `EscrowError::InvalidDeadline` (25) if `new_deadline <= current_deadline`
- [ ] Returns `EscrowError::DeadlineExpired` (26) if `new_deadline <= env.ledger().timestamp()`
- [ ] Client auth is required for Active escrows; arbiter auth is accepted for Disputed escrows
- [ ] `emit_deadline_extended` event is added to `events.rs` and emitted on success
- [ ] Unit tests cover extension by client, extension by arbiter in dispute, and rejection of past deadline

Branch Suggestion:
feat/extend-deadline-function

Commit Message Suggestions:
- `feat: add extend_deadline function callable by client or arbiter`
- `feat: add emit_deadline_extended event to events.rs`
- `test: add tests for extend_deadline by client and arbiter, invalid deadline rejection`

PR Title:
feat: Add `extend_deadline` function for client and arbiter deadline management

PR Description:
Summary:
This PR adds an `extend_deadline` function to `EscrowContract` allowing the client (on Active escrows) or arbiter (on Disputed escrows) to extend the escrow deadline. The new deadline must be strictly greater than the current deadline and in the future. An `deadline_extended` event is emitted on success.

Changes:
- Added `pub fn extend_deadline(env, caller, escrow_id, new_deadline) -> Result<(), EscrowError>`
- Added `emit_deadline_extended` to `contracts/escrow_contract/src/events.rs`
- Added unit tests for client extension, arbiter extension in dispute, and invalid deadline cases

Testing:
- Run `cargo test -p escrow_contract test_extend_deadline`
- Verify deadline is correctly updated in `EscrowMeta` after successful extension

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #25 Add `transfer_client_role` Function for Client Ownership Transfer

Title: Add `transfer_client_role(escrow_id, new_client)` Function for Client Address Transfer

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
The `EscrowMeta.client: Address` is immutable after creation. Organizations that use a multisig wallet as the client address may need to transfer client control to a new address (e.g. after a key rotation or DAO restructure) without cancelling active escrows. A `transfer_client_role` function with appropriate guards would enable this use case while preventing potential abuse by validating that the new client is not the same as the freelancer or arbiter.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `EscrowMeta.client: Address` (L152), `create_escrow_internal` (L895)
- New function: `pub fn transfer_client_role(env: Env, escrow_id: u64, new_client: Address) -> Result<(), EscrowError>`
- Must require auth from the current `client` only
- Must validate `new_client != meta.freelancer` and `new_client != meta.arbiter.unwrap_or_default()`
- Must only work on `EscrowStatus::Active` escrows
- Must update `meta.client` and save via `save_escrow_meta`
- Must emit `emit_client_role_transferred` event
- Must call `require_not_paused`

Acceptance Criteria:
- [ ] `pub fn transfer_client_role(env, escrow_id, new_client) -> Result<(), EscrowError>` is added
- [ ] `current_client.require_auth()` is called before any state changes
- [ ] `EscrowError::Unauthorized` (3) is returned if caller is not the current client
- [ ] Returns `EscrowError::EscrowNotActive` (9) for non-Active escrows
- [ ] Validation rejects `new_client == freelancer` or `new_client == arbiter`
- [ ] Unit tests cover: successful transfer, unauthorized transfer, same-as-freelancer rejection

Branch Suggestion:
feat/transfer-client-role

Commit Message Suggestions:
- `feat: add transfer_client_role function for client address ownership transfer`
- `feat: add emit_client_role_transferred event`
- `test: add unit tests for transfer_client_role success and rejection cases`

PR Title:
feat: Add `transfer_client_role` function for client ownership transfer on active escrows

PR Description:
Summary:
This PR adds a `transfer_client_role` function to `EscrowContract` that allows the current client to transfer their role to a new address. The new client cannot be the freelancer or arbiter. Only Active escrows can have their client role transferred. A `client_role_transferred` event is emitted on success.

Changes:
- Added `pub fn transfer_client_role(env, escrow_id, new_client) -> Result<(), EscrowError>`
- Added `emit_client_role_transferred` to `contracts/escrow_contract/src/events.rs`
- Added unit tests for successful transfer, unauthorized caller, and conflict validation

Testing:
- Run `cargo test -p escrow_contract test_transfer_client_role`
- Verify that the new client can perform client-only actions after transfer

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #26 Add Validation: `freelancer != client` in `create_escrow`

Title: Add Input Validation to Reject Self-Escrows Where `freelancer == client` in `create_escrow_internal`

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: High
Estimated Time: 1–2 hours

Description:
`create_escrow_internal` (L895) in `contracts/escrow_contract/src/lib.rs` does not validate that the `freelancer` and `client` addresses are distinct. An escrow where both roles are held by the same address is semantically meaningless and could be used to game the reputation system (completing self-escrows to inflate `completed_escrows` score) or exploit accounting logic. This validation should return `EscrowError::Unauthorized` (3) or a new dedicated error code.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` at L895, `CreateEscrowArgs` struct at L107–116
- `contracts/escrow_contract/src/errors.rs` — `EscrowError::Unauthorized` (3) or consider adding a dedicated `InvalidParties` variant
- Add the check: `if args.freelancer == args.client { return Err(EscrowError::Unauthorized); }` at the start of `create_escrow_internal`
- Must also apply to `create_recurring_escrow` (L984) which calls `create_escrow_internal`
- Must be tested with both `create_escrow` and `create_escrow_with_buyer_signers`

Acceptance Criteria:
- [ ] `create_escrow_internal` validates `freelancer != client` and returns an error if equal
- [ ] The same validation applies via `create_recurring_escrow`
- [ ] A unit test verifies that `create_escrow` fails when `client == freelancer`
- [ ] A unit test verifies that `create_escrow_with_buyer_signers` fails when `client == freelancer`
- [ ] The error code used is documented in `errors.rs` with a `///` comment

Branch Suggestion:
fix/validate-freelancer-neq-client

Commit Message Suggestions:
- `fix: reject self-escrows where freelancer == client in create_escrow_internal`
- `test: add test verifying create_escrow fails with freelancer == client`
- `fix: apply freelancer != client validation to create_recurring_escrow`

PR Title:
fix: Reject self-escrows where `freelancer == client` in `create_escrow_internal`

PR Description:
Summary:
This PR adds an input validation guard to `create_escrow_internal` that rejects escrow creation when the `freelancer` and `client` addresses are identical. This prevents reputation gaming via self-escrows and eliminates a class of accounting edge cases where both roles are the same party.

Changes:
- Added `freelancer != client` check at the beginning of `create_escrow_internal`
- Added unit tests for `create_escrow` and `create_escrow_with_buyer_signers` with `client == freelancer`
- Added `///` doc comment to the relevant `EscrowError` variant used for this check

Testing:
- Run `cargo test -p escrow_contract test_create_escrow_rejects_self_escrow`
- Verify all existing escrow creation tests still pass with distinct parties

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #27 Add Validation: Arbiter Must Differ from Client and Freelancer

Title: Validate That `arbiter != client` and `arbiter != freelancer` in `create_escrow_internal`

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: High
Estimated Time: 1–2 hours

Description:
`create_escrow_internal` (L895) accepts an `arbiter: Option<Address>` but does not validate that the arbiter is a neutral third party distinct from both the client and freelancer. If the client is set as their own arbiter they could resolve disputes entirely in their own favor. If the freelancer is the arbiter they gain unilateral control over `resolve_dispute`. This is a significant trust model violation that needs to be caught at creation time.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` at L895, `CreateEscrowArgs.arbiter: Option<Address>` (L113)
- Add validation: if `Some(arbiter) == client` or `Some(arbiter) == freelancer`, return error
- `contracts/escrow_contract/src/errors.rs` — use `EscrowError::Unauthorized` (3) or add `InvalidArbiter` variant
- Must apply to both `create_escrow` (L842) and `create_escrow_with_buyer_signers` (L869)
- Must apply to `create_recurring_escrow` (L984) as well

Acceptance Criteria:
- [ ] `create_escrow_internal` validates `arbiter != Some(client)` and `arbiter != Some(freelancer)`
- [ ] Error is returned if either validation fails
- [ ] Unit tests verify rejection when arbiter == client and when arbiter == freelancer
- [ ] `None` arbiter passes validation without error (arbiter is optional)
- [ ] The validation is applied consistently across all three creation functions

Branch Suggestion:
fix/validate-arbiter-distinct-from-parties

Commit Message Suggestions:
- `fix: validate arbiter is distinct from client and freelancer in create_escrow_internal`
- `test: add tests rejecting arbiter equal to client or freelancer`
- `fix: apply arbiter validation to create_recurring_escrow and create_escrow_with_buyer_signers`

PR Title:
fix: Validate `arbiter != client` and `arbiter != freelancer` in `create_escrow_internal`

PR Description:
Summary:
This PR adds validation to `create_escrow_internal` ensuring the optional arbiter address is distinct from both the client and freelancer. This closes a trust model gap where a party could appoint themselves or their counterpart as arbiter, granting unfair dispute resolution control.

Changes:
- Added `arbiter != client && arbiter != freelancer` check in `create_escrow_internal`
- Applied the same check in `create_recurring_escrow`
- Added unit tests for arbiter == client and arbiter == freelancer rejection cases

Testing:
- Run `cargo test -p escrow_contract test_create_escrow_rejects_party_as_arbiter`
- Verify all existing creation tests with `None` arbiter still pass

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #28 Add Hard Cap for `total_amount` to Prevent Overflow Risk

Title: Add `MAX_ESCROW_AMOUNT` Constant and Validation in `create_escrow_internal` to Bound `total_amount`

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: High
Estimated Time: 1–2 hours

Description:
`create_escrow_internal` (L895) accepts `total_amount: i128` without an upper bound check. Although `i128` can hold values up to ~170 undecillion, extremely large values near `i128::MAX` could cause overflow in arithmetic operations like `allocated_amount + milestone.amount` during `add_milestone`. The Rust `[profile.release]` already enables `overflow-checks = true`, but a meaningful domain cap (e.g. 100 billion XLM in stroops = `1_000_000_000_000_000_000i128`) would catch misconfigured integrations and prevent accounting anomalies.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` at L895, constants section L80–91
- Add `pub const MAX_ESCROW_AMOUNT: i128 = 1_000_000_000_000_000_000i128;` near other constants
- Validate `args.total_amount <= MAX_ESCROW_AMOUNT` and return `EscrowError::InvalidEscrowAmount` (19) if exceeded
- `contracts/escrow_contract/src/errors.rs` — `EscrowError::InvalidEscrowAmount = 19`
- Must also validate `args.total_amount > 0` (already implied by `InvalidEscrowAmount` semantics)

Acceptance Criteria:
- [ ] `pub const MAX_ESCROW_AMOUNT: i128` is defined in `lib.rs` with a `///` doc comment
- [ ] `create_escrow_internal` validates `total_amount <= MAX_ESCROW_AMOUNT`
- [ ] Returns `EscrowError::InvalidEscrowAmount` (19) for amounts exceeding the cap
- [ ] A unit test verifies rejection at `MAX_ESCROW_AMOUNT + 1`
- [ ] A unit test verifies acceptance at `MAX_ESCROW_AMOUNT`

Branch Suggestion:
fix/max-escrow-amount-cap

Commit Message Suggestions:
- `fix: add MAX_ESCROW_AMOUNT constant and validation in create_escrow_internal`
- `test: add tests for total_amount at and above MAX_ESCROW_AMOUNT cap`
- `docs: add rustdoc comment to MAX_ESCROW_AMOUNT explaining its rationale`

PR Title:
fix: Add `MAX_ESCROW_AMOUNT` constant and validation to prevent escrow overflow risk

PR Description:
Summary:
This PR defines a `MAX_ESCROW_AMOUNT` constant and adds a validation check in `create_escrow_internal` to reject escrow creation with a `total_amount` exceeding the cap. This prevents misconfigured integrations from creating escrows with pathological amounts that could cause arithmetic edge cases in subsequent milestone operations.

Changes:
- Added `pub const MAX_ESCROW_AMOUNT: i128 = 1_000_000_000_000_000_000i128;` to `lib.rs`
- Added `total_amount <= MAX_ESCROW_AMOUNT` check in `create_escrow_internal`
- Added unit tests for boundary values at and above the cap

Testing:
- Run `cargo test -p escrow_contract test_create_escrow_max_amount`
- Verify existing tests with normal amounts still pass

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #29 Add Maximum `buyer_signers` List Length Cap

Title: Add `MAX_BUYER_SIGNERS` Constant and Validation to Limit `buyer_signers` Vec Length

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: Medium
Estimated Time: 1–2 hours

Description:
`create_escrow_with_buyer_signers` (L869) accepts a `buyer_signers` list stored in `EscrowMeta.buyer_signers: Vec<Address>` without a length cap. An unbounded list could cause gas exhaustion when iterating signers in `approve_milestone` (L1596), which checks each signer's weight. Adding a `MAX_BUYER_SIGNERS` constant (e.g. 10) and validating the list length at creation prevents this resource exhaustion vector and ensures predictable gas costs.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_with_buyer_signers` (L869), `create_escrow_internal` (L895), `approve_milestone` (L1596)
- Add `pub const MAX_BUYER_SIGNERS: u32 = 10;` near `MAX_MILESTONES` (L91)
- Validate `buyer_signers.len() <= MAX_BUYER_SIGNERS` in `create_escrow_with_buyer_signers`
- `contracts/escrow_contract/src/errors.rs` — use `EscrowError::InvalidEscrowAmount` (19) or add a new variant

Acceptance Criteria:
- [ ] `pub const MAX_BUYER_SIGNERS: u32 = 10;` is defined with a `///` doc comment
- [ ] Validation rejects `buyer_signers` lists with more than `MAX_BUYER_SIGNERS` entries
- [ ] A unit test verifies rejection at `MAX_BUYER_SIGNERS + 1` signers
- [ ] A unit test verifies acceptance at exactly `MAX_BUYER_SIGNERS` signers
- [ ] The error returned for exceeding the cap is documented with a `///` comment

Branch Suggestion:
fix/max-buyer-signers-cap

Commit Message Suggestions:
- `fix: add MAX_BUYER_SIGNERS constant and validation in create_escrow_with_buyer_signers`
- `test: add tests for buyer_signers at and above MAX_BUYER_SIGNERS cap`
- `docs: document MAX_BUYER_SIGNERS constant rationale`

PR Title:
fix: Add `MAX_BUYER_SIGNERS` constant and validation to cap `buyer_signers` list length

PR Description:
Summary:
This PR defines a `MAX_BUYER_SIGNERS` constant and adds a validation check in `create_escrow_with_buyer_signers` to reject configurations with more than the maximum allowed signers. This prevents gas exhaustion in `approve_milestone` from iterating an unbounded signer list.

Changes:
- Added `pub const MAX_BUYER_SIGNERS: u32 = 10;` to `lib.rs`
- Added length check in `create_escrow_with_buyer_signers`
- Added unit tests for boundary values

Testing:
- Run `cargo test -p escrow_contract test_create_escrow_max_buyer_signers`
- Verify `approve_milestone` tests still pass with valid signer counts

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #30 Add `brief_hash` Zero-Value Validation in `create_escrow_internal`

Title: Reject All-Zero `brief_hash` (`BytesN<32>`) in `create_escrow_internal`

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: Medium
Estimated Time: 1–2 hours

Description:
`CreateEscrowArgs.brief_hash: BytesN<32>` (L112) is intended to hold a hash of an off-chain brief document (e.g. IPFS CID hash). An all-zero `BytesN<32>` is a sentinel value indicating no brief was provided, which violates the contract's trust model — both parties should have agreed to a documented brief. `create_escrow_internal` should validate that `brief_hash` is not the all-zero value and return an appropriate error.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895), `CreateEscrowArgs.brief_hash: BytesN<32>` (L112)
- Construct a zero `BytesN<32>` via `BytesN::from_array(&env, &[0u8; 32])` and compare
- `contracts/escrow_contract/src/errors.rs` — use `EscrowError::InvalidEscrowAmount` (19) or add a new `InvalidBriefHash` variant with an unused discriminant
- Must apply to `create_recurring_escrow` (L984) as well

Acceptance Criteria:
- [ ] `create_escrow_internal` validates that `brief_hash != BytesN::from_array(&env, &[0u8; 32])`
- [ ] An appropriate `EscrowError` is returned for the all-zero hash case
- [ ] A unit test verifies rejection of an all-zero `BytesN<32>` brief hash
- [ ] A unit test verifies acceptance of a valid non-zero hash
- [ ] The same validation is applied in `create_recurring_escrow`

Branch Suggestion:
fix/validate-brief-hash-non-zero

Commit Message Suggestions:
- `fix: reject all-zero brief_hash in create_escrow_internal`
- `test: add test verifying create_escrow rejects zeroed BytesN<32> brief_hash`
- `fix: apply brief_hash zero validation to create_recurring_escrow`

PR Title:
fix: Reject all-zero `brief_hash` in `create_escrow_internal` to enforce brief documentation

PR Description:
Summary:
This PR adds a validation check in `create_escrow_internal` to reject escrow creation when `brief_hash` is the all-zero `BytesN<32>`, which indicates no brief document was provided. This enforces the requirement that both parties have agreed to a documented brief before locking funds.

Changes:
- Added all-zero `BytesN<32>` check in `create_escrow_internal`
- Applied same check in `create_recurring_escrow`
- Added unit tests for zero and non-zero `brief_hash` cases

Testing:
- Run `cargo test -p escrow_contract test_create_escrow_rejects_zero_brief_hash`
- Verify all existing tests provide a valid non-zero hash

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #31 Add Maximum String Length Validation for `String` Type Arguments

Title: Add `MAX_STRING_LEN` Constant and Validate `soroban_sdk::String` Length in Milestone and Cancellation Functions

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–3 hours

Description:
`AddMilestoneArgs.title: String` (L123) and `CancellationRequest.reason: String` (L339) accept unbounded `soroban_sdk::String` values. Storing arbitrarily long strings in persistent storage is a gas and rent attack vector: an adversary could submit a 10KB title or reason string, inflating the storage cost for all subsequent operations on that escrow. A `MAX_STRING_LEN` constant (e.g. 256 bytes) and validation at the entry point would cap this risk.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `add_milestone` (L1090), `request_cancellation` (L2268)
- `contracts/escrow_contract/src/types.rs` — `AddMilestoneArgs.title: String` (L123), `CancellationRequest.reason: String` (L339)
- Add `const MAX_STRING_LEN: u32 = 256;` to `lib.rs` constants section
- Validate `title.len() <= MAX_STRING_LEN` in `add_milestone` and `batch_add_milestones` (L1167)
- Validate `reason.len() <= MAX_STRING_LEN` in `request_cancellation`
- Use `EscrowError::InvalidEscrowAmount` (19) or add a new `StringTooLong` variant

Acceptance Criteria:
- [ ] `const MAX_STRING_LEN: u32 = 256;` is defined with a doc comment
- [ ] `add_milestone` validates `title.len() <= MAX_STRING_LEN`
- [ ] `batch_add_milestones` applies the same validation to each milestone title
- [ ] `request_cancellation` validates `reason.len() <= MAX_STRING_LEN`
- [ ] Unit tests verify rejection for strings of length `MAX_STRING_LEN + 1`

Branch Suggestion:
fix/max-string-length-validation

Commit Message Suggestions:
- `fix: add MAX_STRING_LEN constant and validation for String arguments`
- `fix: validate title length in add_milestone and batch_add_milestones`
- `test: add tests for string length boundary values in milestone and cancellation functions`

PR Title:
fix: Add `MAX_STRING_LEN` validation for `soroban_sdk::String` arguments

PR Description:
Summary:
This PR adds a `MAX_STRING_LEN` constant and validation to all functions accepting `soroban_sdk::String` arguments, capping titles and reasons at 256 bytes. This prevents gas and rent attacks via arbitrarily large string storage in milestone titles and cancellation reasons.

Changes:
- Added `const MAX_STRING_LEN: u32 = 256;` to `lib.rs`
- Added length validation to `add_milestone`, `batch_add_milestones`, and `request_cancellation`
- Added unit tests for boundary string lengths in all three functions

Testing:
- Run `cargo test -p escrow_contract test_add_milestone_string_length`
- Verify all existing tests with short strings still pass

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #32 Add `reject_milestone_with_reason` Function Storing Rejection Reason Hash

Title: Add `reject_milestone_with_reason(escrow_id, milestone_id, reason_hash)` to Store Rejection Evidence

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
The existing `reject_milestone` (L1674) returns a milestone to `MS_PENDING` but does not record why the client rejected it. In practice, rejection reasons (e.g. "deliverable does not meet spec") are critical for dispute resolution and audit trails. Adding a `reject_milestone_with_reason` variant that stores a `BytesN<32>` IPFS hash of the rejection rationale document would give arbiters and freelancers verifiable evidence of the rejection grounds without storing large strings on-chain.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `reject_milestone` (L1674), `Milestone` struct in `types.rs`
- `contracts/escrow_contract/src/types.rs` — `Milestone` struct (L150–176) — add `rejection_reason: Option<BytesN<32>>` field
- New function: `pub fn reject_milestone_with_reason(env: Env, caller: Address, escrow_id: u64, milestone_id: u32, reason_hash: BytesN<32>) -> Result<(), EscrowError>`
- Must validate that `reason_hash != BytesN::from_array(&env, &[0u8; 32])` (non-zero hash required)
- Must set `milestone.rejection_reason = Some(reason_hash)` alongside the `MS_PENDING` status reset
- Must emit an extended `emit_milestone_rejected_with_reason` event including the hash

Acceptance Criteria:
- [ ] `Milestone` struct in `types.rs` gains an `Option<BytesN<32>>` `rejection_reason` field
- [ ] `reject_milestone_with_reason` is added and sets `rejection_reason` on the milestone
- [ ] `emit_milestone_rejected_with_reason` is added to `events.rs` with the reason hash in the payload
- [ ] Zero reason hash is rejected with an appropriate error
- [ ] Unit tests cover successful reason storage and zero-hash rejection

Branch Suggestion:
feat/reject-milestone-with-reason

Commit Message Suggestions:
- `feat: add reject_milestone_with_reason storing IPFS rejection reason hash`
- `feat: add rejection_reason Option<BytesN<32>> field to Milestone struct`
- `test: add tests for reject_milestone_with_reason and zero hash validation`

PR Title:
feat: Add `reject_milestone_with_reason` function with on-chain rejection evidence storage

PR Description:
Summary:
This PR adds a `reject_milestone_with_reason` function that stores a `BytesN<32>` IPFS hash of the rejection rationale alongside the milestone status reset. The `Milestone` struct gains an `Option<BytesN<32>>` `rejection_reason` field, and a new event includes the hash for indexer consumption.

Changes:
- Added `rejection_reason: Option<BytesN<32>>` to `Milestone` struct in `types.rs`
- Added `pub fn reject_milestone_with_reason` to `EscrowContract`
- Added `emit_milestone_rejected_with_reason` to `events.rs`
- Added unit tests for successful reason storage and zero hash rejection

Testing:
- Run `cargo test -p escrow_contract test_reject_milestone_with_reason`
- Verify `get_milestone` returns the stored `rejection_reason` hash after rejection

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #33 Add `client_approve_cancellation` to Short-Circuit the Dispute Window

Title: Add `client_approve_cancellation(escrow_id)` to Allow Immediate Cancellation Execution

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–4 hours

Description:
The current cancellation workflow requires waiting the full `CANCELLATION_DISPUTE_PERIOD` (L85) before `execute_cancellation` (L2324) can be called, even when the opposing party has no objection. If both parties agree to cancel (e.g. the freelancer requested cancellation and the client approves), the mandatory wait is unnecessary friction. A `client_approve_cancellation` function would allow the non-requesting party to explicitly consent, enabling immediate execution without waiting for the dispute window to close.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `request_cancellation` (L2268), `execute_cancellation` (L2324), `CANCELLATION_DISPUTE_PERIOD` (L85)
- `contracts/escrow_contract/src/types.rs` — `CancellationRequest` struct (L331–349) — add `counterparty_approved: bool` field
- New function: `pub fn client_approve_cancellation(env: Env, caller: Address, escrow_id: u64) -> Result<(), EscrowError>`
- Caller must be the counterparty to the requester (if freelancer requested, client must approve)
- When `counterparty_approved = true`, `execute_cancellation` should skip the dispute window check
- Must emit `emit_cancellation_approved` event

Acceptance Criteria:
- [ ] `CancellationRequest` gains a `counterparty_approved: bool` field in `types.rs`
- [ ] `client_approve_cancellation` is added and sets `counterparty_approved = true`
- [ ] `execute_cancellation` skips the `CancellationDisputePeriodActive` (35) check when `counterparty_approved = true`
- [ ] Caller validation ensures only the actual counterparty can approve
- [ ] Unit tests cover immediate execution after approval and rejection if wrong party approves

Branch Suggestion:
feat/client-approve-cancellation

Commit Message Suggestions:
- `feat: add client_approve_cancellation to short-circuit cancellation dispute window`
- `feat: add counterparty_approved field to CancellationRequest struct`
- `test: add tests for immediate execution after counterparty approval`

PR Title:
feat: Add `client_approve_cancellation` to short-circuit the mandatory dispute window

PR Description:
Summary:
This PR adds a `client_approve_cancellation` function that allows the non-requesting party to explicitly consent to a pending cancellation, enabling immediate execution via `execute_cancellation` without waiting for the full `CANCELLATION_DISPUTE_PERIOD`. The `CancellationRequest` struct gains a `counterparty_approved` flag that bypasses the time check.

Changes:
- Added `counterparty_approved: bool` to `CancellationRequest` in `types.rs`
- Added `pub fn client_approve_cancellation` to `EscrowContract`
- Modified `execute_cancellation` to skip dispute window check when `counterparty_approved = true`
- Added `emit_cancellation_approved` to `events.rs`

Testing:
- Run `cargo test -p escrow_contract test_client_approve_cancellation_immediate_execution`
- Verify normal (no approval) cancellation still enforces the dispute window

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #34 Add `withdraw_rent_overpayment` for Refunding Excess Rent Reserve

Title: Add `withdraw_rent_overpayment(escrow_id, amount)` to Allow Client to Reclaim Excess Rent Funds

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
Clients who call `top_up_rent` (L2195) can overfund the `EscrowMeta.rent_balance` beyond what is needed for the escrow's remaining lifetime. There is currently no way to withdraw excess rent funds; they are locked until the escrow is completed or cancelled. A `withdraw_rent_overpayment` function that allows the client to reclaim funds above a required minimum reserve would improve capital efficiency and reduce friction for long-running escrows with reduced milestone counts.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `top_up_rent` (L2195), `collect_rent` (L2189), `EscrowMeta.rent_balance` (L178), `reserve_for_entries` (L499)
- New function: `pub fn withdraw_rent_overpayment(env: Env, caller: Address, escrow_id: u64, amount: i128) -> Result<(), EscrowError>`
- Must compute the minimum required reserve: `reserve_for_entries(active_entries) × RENT_RESERVE_PERIODS`
- Must only allow withdrawal of `rent_balance - minimum_reserve`
- Must require auth from `client` only
- Must use `soroban_sdk::token::TokenClient` to transfer funds back to `client`
- Must emit a `emit_rent_withdrawn` event

Acceptance Criteria:
- [ ] `pub fn withdraw_rent_overpayment(env, caller, escrow_id, amount) -> Result<(), EscrowError>` is added
- [ ] The function validates that the withdrawal does not drop `rent_balance` below the minimum reserve
- [ ] Returns an appropriate error if withdrawal amount exceeds the overpayment
- [ ] `client.require_auth()` is enforced
- [ ] Unit test verifies correct token transfer after overpayment withdrawal

Branch Suggestion:
feat/withdraw-rent-overpayment

Commit Message Suggestions:
- `feat: add withdraw_rent_overpayment function for excess rent reclaim`
- `feat: compute minimum reserve before allowing rent withdrawal`
- `test: add test for rent overpayment withdrawal and reserve enforcement`

PR Title:
feat: Add `withdraw_rent_overpayment` to allow client to reclaim excess rent reserve funds

PR Description:
Summary:
This PR adds a `withdraw_rent_overpayment` function that allows the client to reclaim excess funds from `EscrowMeta.rent_balance` above the minimum required reserve. The minimum is computed from the current number of active storage entries and `RENT_RESERVE_PERIODS`, ensuring the escrow remains solvent.

Changes:
- Added `pub fn withdraw_rent_overpayment(env, caller, escrow_id, amount)` to `EscrowContract`
- Added minimum reserve calculation before permitting withdrawal
- Added `emit_rent_withdrawn` to `events.rs`
- Added unit tests verifying correct withdrawal and reserve enforcement

Testing:
- Run `cargo test -p escrow_contract test_withdraw_rent_overpayment`
- Verify `rent_balance` is correctly reduced and token transferred to client

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #35 Add `get_recurring_schedule_status` Summary View Function

Title: Add `get_recurring_schedule_status(escrow_id)` Returning a Structured Status Summary

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: Low
Estimated Time: 1–3 hours

Description:
The existing `get_recurring_config` (L2229) returns the full `RecurringPaymentConfig` struct (12 fields), but frontends that display a simple status summary (active/paused/cancelled, next payment timestamp, payments remaining) must parse the entire struct. A dedicated `get_recurring_schedule_status` view returning a lightweight summary type would reduce the data clients need to decode and provide a cleaner API surface.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `get_recurring_config` (L2229), `process_recurring_payments` (L1433)
- `contracts/escrow_contract/src/types.rs` — `RecurringPaymentConfig` (L181–217)
- New return type: a `RecurringScheduleStatus` struct with fields: `is_active: bool`, `is_paused: bool`, `is_cancelled: bool`, `next_payment_at: u64`, `payments_remaining: u32`, `payment_amount: i128`
- New function: `pub fn get_recurring_schedule_status(env: Env, escrow_id: u64) -> Result<RecurringScheduleStatus, EscrowError>`
- Must return `EscrowError::RecurringConfigNotFound` (43) if no schedule exists

Acceptance Criteria:
- [ ] `RecurringScheduleStatus` struct is defined in `types.rs` and derived with `#[contracttype]`
- [ ] `pub fn get_recurring_schedule_status` is added to `EscrowContract`
- [ ] Returns `EscrowError::RecurringConfigNotFound` (43) for escrows without a recurring config
- [ ] A unit test verifies correct status after `create_recurring_escrow` and `pause_recurring_schedule`
- [ ] `is_active` is `true` only when `!paused && !cancelled`

Branch Suggestion:
feat/get-recurring-schedule-status

Commit Message Suggestions:
- `feat: add RecurringScheduleStatus struct and get_recurring_schedule_status view`
- `test: add tests for status after create, pause, resume, and cancel operations`
- `feat: return RecurringConfigNotFound for escrows without a recurring config`

PR Title:
feat: Add `get_recurring_schedule_status` lightweight summary view function

PR Description:
Summary:
This PR adds a `RecurringScheduleStatus` struct and a `get_recurring_schedule_status` view function that returns a lightweight summary of a recurring payment schedule. This reduces the data payload compared to `get_recurring_config` for frontends that only need active/paused/cancelled status and the next payment timestamp.

Changes:
- Added `RecurringScheduleStatus` struct to `types.rs` with `#[contracttype]`
- Added `pub fn get_recurring_schedule_status` to `EscrowContract`
- Added unit tests verifying status transitions after pause, resume, and cancel

Testing:
- Run `cargo test -p escrow_contract test_get_recurring_schedule_status`
- Verify status is correct after each lifecycle operation on the recurring schedule

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #36 Add `set_max_milestones` Admin Function

Title: Add `set_max_milestones(new_max: u32)` Admin Function to Make `MAX_MILESTONES` Configurable

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Medium
Estimated Time: 2–4 hours

Description:
`MAX_MILESTONES` is currently a compile-time constant (`pub const MAX_MILESTONES: u32` at L91 in `lib.rs`), requiring a contract upgrade to change. For different deployment contexts (e.g. enterprise escrows with many deliverables vs. simple two-milestone agreements), the right maximum may differ. Storing `MAX_MILESTONES` in instance storage and providing an admin-callable `set_max_milestones` function would allow runtime configuration without a full upgrade.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `MAX_MILESTONES` at L91, `add_milestone` (L1090), `batch_add_milestones` (L1167)
- `contracts/escrow_contract/src/types.rs` — `DataKey` enum — add `MaxMilestones` variant
- Store the configured value in `DataKey::MaxMilestones` in instance storage, falling back to `MAX_MILESTONES` if not set
- New function: `pub fn set_max_milestones(env: Env, caller: Address, new_max: u32) -> Result<(), EscrowError>`
- Validate `new_max >= 1` and `new_max <= 100` (absolute upper bound)
- Must require admin authorization via `require_admin`

Acceptance Criteria:
- [ ] `DataKey::MaxMilestones` variant is added to `DataKey` enum in `types.rs`
- [ ] `set_max_milestones` is added and requires admin auth
- [ ] `add_milestone` and `batch_add_milestones` read from `DataKey::MaxMilestones` with fallback to `MAX_MILESTONES`
- [ ] Validation rejects `new_max < 1` or `new_max > 100`
- [ ] Unit tests verify configurable limit is enforced after `set_max_milestones`

Branch Suggestion:
feat/set-max-milestones-admin

Commit Message Suggestions:
- `feat: add set_max_milestones admin function making MAX_MILESTONES configurable`
- `feat: add DataKey::MaxMilestones to instance storage for runtime configuration`
- `test: add tests for configurable milestone limit enforcement`

PR Title:
feat: Add `set_max_milestones` admin function for runtime milestone cap configuration

PR Description:
Summary:
This PR adds a `set_max_milestones` admin function that stores a configurable milestone cap in instance storage under `DataKey::MaxMilestones`. The `add_milestone` and `batch_add_milestones` functions now read from this key with a fallback to the compile-time `MAX_MILESTONES` constant, enabling runtime configuration without a contract upgrade.

Changes:
- Added `MaxMilestones` variant to `DataKey` enum in `types.rs`
- Added `pub fn set_max_milestones` to `EscrowContract` with admin auth
- Modified `add_milestone` and `batch_add_milestones` to use runtime limit
- Added unit tests for configurable limit and boundary validation

Testing:
- Run `cargo test -p escrow_contract test_set_max_milestones`
- Verify that the default `MAX_MILESTONES` is used when `set_max_milestones` has not been called

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #37 Add Event Emission for Admin Role Changes

Title: Emit `admin_changed` Event During `initialize` and Any Future Admin Transfer in `EscrowContract`

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: Low
Estimated Time: 1–2 hours

Description:
The `initialize` function (L723) in `contracts/escrow_contract/src/lib.rs` sets the admin address in instance storage but does not emit any event. Off-chain indexers have no way to determine the initial admin address from event logs alone — they must read contract storage directly. Emitting an `admin_initialized` event during `initialize` and an `admin_changed` event during any future admin transfer (see issue #74) makes the admin history fully auditable from event logs.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `initialize` (L723), `ContractStorage::initialize` (L187)
- `contracts/escrow_contract/src/events.rs` — add `emit_admin_initialized(env, admin)` and `emit_admin_changed(env, old_admin, new_admin)` functions
- The event should use `symbol_short!("adm_init")` for initialization and `symbol_short!("adm_chg")` for changes
- Must be called immediately after the admin is stored in `DataKey::Admin`

Acceptance Criteria:
- [ ] `emit_admin_initialized` is added to `events.rs` and called from `ContractStorage::initialize`
- [ ] `emit_admin_changed` is added to `events.rs` for future admin transfer use
- [ ] Both events use valid `symbol_short!` names (≤9 characters)
- [ ] A unit test verifies the `admin_initialized` event is emitted during `initialize`
- [ ] The events are documented in `events.rs` with `///` comments

Branch Suggestion:
feat/admin-role-change-events

Commit Message Suggestions:
- `feat: add emit_admin_initialized event to initialize function`
- `feat: add emit_admin_changed event for future admin transfer support`
- `test: add test verifying admin_initialized event emitted during initialize`

PR Title:
feat: Add `admin_initialized` and `admin_changed` event emissions for admin role audit trail

PR Description:
Summary:
This PR adds `emit_admin_initialized` and `emit_admin_changed` event emitters to `events.rs` and calls `emit_admin_initialized` from `ContractStorage::initialize`. This makes the admin history fully auditable from Soroban event logs without requiring direct storage reads.

Changes:
- Added `emit_admin_initialized(env, admin)` to `events.rs` with `symbol_short!("adm_init")`
- Added `emit_admin_changed(env, old_admin, new_admin)` to `events.rs`
- Called `emit_admin_initialized` from `ContractStorage::initialize`
- Added unit test verifying event emission during `initialize`

Testing:
- Run `cargo test -p escrow_contract test_admin_initialized_event`
- Verify event is captured in `env.events().all()` after `initialize`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #38 Add `batch_reject_milestones` Function

Title: Add `batch_reject_milestones(escrow_id, milestone_ids)` as Counterpart to `batch_approve_milestones`

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`batch_approve_milestones` (L1264) exists for approving multiple milestones in a single transaction, but there is no equivalent `batch_reject_milestones` function. In workflows where the client performs a sprint review and finds multiple milestones unsatisfactory, they currently must submit one `reject_milestone` transaction per milestone. Adding `batch_reject_milestones` would reduce transaction overhead and improve UX for large milestone sets.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `batch_approve_milestones` (L1264), `reject_milestone` (L1674)
- New function: `pub fn batch_reject_milestones(env: Env, caller: Address, escrow_id: u64, milestone_ids: Vec<u32>) -> Result<u32, EscrowError>`
- Returns the count of successfully rejected milestones
- Must validate that `caller == meta.client` or `caller` is in `meta.buyer_signers`
- Must validate each milestone is in `MS_SUBMITTED` state (otherwise skip or error per design)
- Must respect `MAX_BATCH_SIZE` or define its own cap
- Must emit `emit_milestone_rejected` for each rejected milestone

Acceptance Criteria:
- [ ] `pub fn batch_reject_milestones` is added to `EscrowContract`
- [ ] Returns the count of rejected milestones
- [ ] Skips milestones not in `MS_SUBMITTED` state rather than aborting the entire batch
- [ ] Emits `emit_milestone_rejected` for each successfully rejected milestone
- [ ] Unit tests cover: all submitted, mixed states, empty list, and unauthorized caller

Branch Suggestion:
feat/batch-reject-milestones

Commit Message Suggestions:
- `feat: add batch_reject_milestones counterpart to batch_approve_milestones`
- `test: add tests for batch rejection with mixed milestone states`
- `feat: skip non-submitted milestones in batch_reject_milestones rather than aborting`

PR Title:
feat: Add `batch_reject_milestones` as counterpart to `batch_approve_milestones`

PR Description:
Summary:
This PR adds a `batch_reject_milestones` function to `EscrowContract` that allows the client to reject multiple submitted milestones in a single transaction. Non-submitted milestones in the batch are skipped without aborting the transaction, and a count of successfully rejected milestones is returned.

Changes:
- Added `pub fn batch_reject_milestones(env, caller, escrow_id, milestone_ids) -> Result<u32, EscrowError>`
- Skips milestones not in `MS_SUBMITTED` state
- Emits `emit_milestone_rejected` for each rejected milestone
- Added unit tests for all-submitted, mixed-state, and empty batches

Testing:
- Run `cargo test -p escrow_contract test_batch_reject_milestones`
- Verify milestone statuses revert to `MS_PENDING` after batch rejection

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #39 Add `update_milestone_description_hash` for Rejected Milestones

Title: Add `update_milestone_description_hash(escrow_id, milestone_id, new_hash)` for Revising Rejected Milestones

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Medium
Estimated Time: 2–4 hours

Description:
When a milestone is rejected by the client (via `reject_milestone` or `reject_milestone_with_reason`), the freelancer may update their deliverable and resubmit. However, the `Milestone.description_hash: BytesN<32>` cannot be updated — it remains pointing to the original deliverable description. Adding `update_milestone_description_hash` would let the freelancer update the IPFS hash to reflect the revised deliverable before calling `submit_milestone` again, providing an accurate audit trail.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `reject_milestone` (L1674), `submit_milestone` (L1555)
- `contracts/escrow_contract/src/types.rs` — `Milestone.description_hash: BytesN<32>` (L159), `MS_PENDING` constant
- New function: `pub fn update_milestone_description_hash(env: Env, caller: Address, escrow_id: u64, milestone_id: u32, new_hash: BytesN<32>) -> Result<(), EscrowError>`
- Must require `caller == meta.freelancer`
- Must only work when `milestone.status == MS_PENDING` (not submitted or approved)
- Must validate `new_hash != BytesN::from_array(&env, &[0u8; 32])`
- Must emit `emit_milestone_description_updated` event

Acceptance Criteria:
- [ ] `pub fn update_milestone_description_hash` is added with freelancer-only auth
- [ ] Returns `EscrowError::InvalidMilestoneState` (14) if milestone is not in `MS_PENDING`
- [ ] Zero hash is rejected with an appropriate error
- [ ] The updated hash is persisted via `ContractStorage::save_milestone`
- [ ] Unit tests cover: successful update on pending milestone, rejection on submitted milestone, zero hash rejection

Branch Suggestion:
feat/update-milestone-description-hash

Commit Message Suggestions:
- `feat: add update_milestone_description_hash for rejected milestone revision`
- `test: add tests for hash update on pending and non-pending milestones`
- `feat: emit milestone_description_updated event on successful hash update`

PR Title:
feat: Add `update_milestone_description_hash` for revising rejected milestone deliverables

PR Description:
Summary:
This PR adds an `update_milestone_description_hash` function that allows the freelancer to update a milestone's IPFS description hash when it is in `MS_PENDING` state after rejection. This enables an accurate audit trail when deliverables are revised before resubmission.

Changes:
- Added `pub fn update_milestone_description_hash` with freelancer-only auth
- Added `InvalidMilestoneState` check for non-pending milestones
- Added `emit_milestone_description_updated` to `events.rs`
- Added unit tests for pending update, non-pending rejection, and zero hash rejection

Testing:
- Run `cargo test -p escrow_contract test_update_milestone_description_hash`
- Verify updated hash appears in `get_milestone` response

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #40 Add `list_active_cancellations_by_requester` Paginated Query Function

Title: Add `list_active_cancellations_by_requester(requester: Address)` to Support Off-Chain Indexing

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Low
Estimated Time: 3–5 hours

Description:
The existing `get_cancellation_request(escrow_id)` (L2250) retrieves a single cancellation by escrow ID, but there is no function to enumerate all active cancellation requests initiated by a given address. Dispute resolution dashboards and indexers that want to show "all pending cancellations by user X" must iterate all escrow IDs externally. Adding a reverse-index query function would make this query practical on-chain.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `get_cancellation_request` (L2250), `request_cancellation` (L2268)
- Requires maintaining a `DataKey::CancellationsByRequester(Address)` index in persistent storage as a `Vec<u64>` of escrow IDs
- `contracts/escrow_contract/src/types.rs` — `DataKey` enum — add `CancellationsByRequester(Address)` variant
- New function: `pub fn list_cancellations_by_requester(env: Env, requester: Address) -> Vec<u64>`
- Returns a `Vec<u64>` of escrow IDs where `requester` has a pending cancellation request
- Must update the index in `request_cancellation` and clean up in `execute_cancellation`

Acceptance Criteria:
- [ ] `DataKey::CancellationsByRequester(Address)` is added to `DataKey` enum
- [ ] `request_cancellation` appends the escrow ID to the requester's index
- [ ] `execute_cancellation` removes the escrow ID from the requester's index on resolution
- [ ] `pub fn list_cancellations_by_requester` is added returning the index Vec
- [ ] Unit tests verify index is populated after `request_cancellation` and cleared after `execute_cancellation`

Branch Suggestion:
feat/list-cancellations-by-requester

Commit Message Suggestions:
- `feat: add CancellationsByRequester index and list_cancellations_by_requester query`
- `feat: maintain requester cancellation index in request_cancellation and execute_cancellation`
- `test: add tests for requester cancellation index lifecycle`

PR Title:
feat: Add `list_cancellations_by_requester` reverse-index query function

PR Description:
Summary:
This PR adds a `CancellationsByRequester(Address)` reverse index in persistent storage, maintained by `request_cancellation` and `execute_cancellation`, and a `list_cancellations_by_requester` query function. This enables dashboards to enumerate all active cancellation requests by a given requester address without external iteration.

Changes:
- Added `CancellationsByRequester(Address)` to `DataKey` enum in `types.rs`
- Updated `request_cancellation` to append to the requester index
- Updated `execute_cancellation` to remove from the requester index
- Added `pub fn list_cancellations_by_requester` query function
- Added unit tests for index lifecycle

Testing:
- Run `cargo test -p escrow_contract test_list_cancellations_by_requester`
- Verify index is empty after cancellation is executed

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #41 Add `get_escrow_ids_by_participant` Paginated Query Function

Title: Add `get_escrow_ids_by_participant(address: Address, offset: u32, limit: u32) -> Vec<u64>` Query

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Medium
Estimated Time: 4–6 hours

Description:
There is no on-chain function to retrieve all escrow IDs where a given address participates as client or freelancer. Off-chain indexers must process every `escrow_created` event to build this mapping. Adding a `get_escrow_ids_by_participant` function backed by a participant index in persistent storage would enable efficient participant-centric queries and reduce indexer complexity for portfolio views.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895), `escrow_count` (L2237)
- New `DataKey::EscrowsByParticipant(Address)` storing `Vec<u64>` in persistent storage
- `contracts/escrow_contract/src/types.rs` — `DataKey` enum — add `EscrowsByParticipant(Address)` variant
- New function: `pub fn get_escrow_ids_by_participant(env: Env, participant: Address, offset: u32, limit: u32) -> Vec<u64>`
- `create_escrow_internal` must append to both `client` and `freelancer` participant indexes
- Implement pagination via `offset` and `limit` parameters capped at 50

Acceptance Criteria:
- [ ] `DataKey::EscrowsByParticipant(Address)` is added and maintained in `create_escrow_internal`
- [ ] `pub fn get_escrow_ids_by_participant` is added with `offset` and `limit` pagination
- [ ] `limit` is capped at 50 entries per page
- [ ] Both client and freelancer entries are indexed for each new escrow
- [ ] Unit tests verify correct results after multiple escrow creations by the same participant

Branch Suggestion:
feat/get-escrow-ids-by-participant

Commit Message Suggestions:
- `feat: add EscrowsByParticipant index and get_escrow_ids_by_participant query`
- `feat: populate participant index in create_escrow_internal for client and freelancer`
- `test: add paginated query tests for get_escrow_ids_by_participant`

PR Title:
feat: Add `get_escrow_ids_by_participant` paginated query with participant index

PR Description:
Summary:
This PR adds a participant index (`DataKey::EscrowsByParticipant(Address)`) maintained in `create_escrow_internal` for both client and freelancer, and a paginated `get_escrow_ids_by_participant` query function. This enables efficient on-chain portfolio views without requiring indexers to process every historical event.

Changes:
- Added `EscrowsByParticipant(Address)` to `DataKey` enum in `types.rs`
- Updated `create_escrow_internal` to append escrow ID to both participant indexes
- Added `pub fn get_escrow_ids_by_participant` with offset/limit pagination
- Added unit tests verifying correct pagination and index population

Testing:
- Run `cargo test -p escrow_contract test_get_escrow_ids_by_participant`
- Verify both client and freelancer indexes are populated after `create_escrow`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #42 Add `get_escrow_ids_by_status` Paginated Query Helper

Title: Add `get_escrow_ids_by_status(status: EscrowStatus, offset: u32, limit: u32) -> Vec<u64>` Query Function

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Medium
Estimated Time: 4–6 hours

Description:
There is no on-chain function to retrieve all escrow IDs in a given `EscrowStatus` (Active, Completed, Disputed, Cancelled, CancellationPending). Admin dashboards, dispute resolution interfaces, and protocol health monitors need to enumerate active or disputed escrows without iterating all escrow IDs from 1 to `escrow_count`. A status-indexed query backed by per-status `Vec<u64>` indexes in persistent storage would satisfy this need.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895), state-changing functions like `raise_dispute` (L1905), `cancel_escrow` (L1783)
- `contracts/escrow_contract/src/types.rs` — `EscrowStatus` enum, `DataKey` enum
- Add `DataKey::EscrowsByStatus(EscrowStatus)` storing `Vec<u64>` in persistent storage
- Maintain status indexes on all status transitions: Active on creation, Disputed on `raise_dispute`, Cancelled on `cancel_escrow`, Completed on final `approve_milestone`
- New function: `pub fn get_escrow_ids_by_status(env: Env, status: EscrowStatus, offset: u32, limit: u32) -> Vec<u64>`

Acceptance Criteria:
- [ ] `DataKey::EscrowsByStatus(EscrowStatus)` is added to `DataKey` enum
- [ ] Status index is populated on creation and updated on all status transitions
- [ ] `pub fn get_escrow_ids_by_status` is added with `offset`/`limit` pagination (max 50)
- [ ] Unit tests verify correct results for `Active`, `Disputed`, and `Completed` statuses
- [ ] Index entries are removed when escrow moves out of a status

Branch Suggestion:
feat/get-escrow-ids-by-status

Commit Message Suggestions:
- `feat: add EscrowsByStatus index and get_escrow_ids_by_status paginated query`
- `feat: maintain status index on all EscrowStatus transitions`
- `test: add tests verifying status index updates across lifecycle transitions`

PR Title:
feat: Add `get_escrow_ids_by_status` paginated query with status-indexed storage

PR Description:
Summary:
This PR adds a `DataKey::EscrowsByStatus(EscrowStatus)` persistent index and a `get_escrow_ids_by_status` paginated query function. The index is maintained across all status transitions (creation, dispute, cancellation, completion), enabling admin dashboards and protocol health monitors to enumerate escrows by status efficiently.

Changes:
- Added `EscrowsByStatus(EscrowStatus)` to `DataKey` enum in `types.rs`
- Updated all status-transition functions to maintain the status index
- Added `pub fn get_escrow_ids_by_status` with pagination
- Added unit tests for status index across lifecycle transitions

Testing:
- Run `cargo test -p escrow_contract test_get_escrow_ids_by_status`
- Verify that disputed escrows appear in `Disputed` index and not in `Active` after `raise_dispute`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #43 Add `get_slash_records_by_address` Aggregate Query Function

Title: Add `get_slash_records_by_address(slashed_user: Address) -> Vec<SlashRecord>` for Reputation Queries

Body:

Category: Smart Contract
Difficulty: Intermediate
Priority: Low
Estimated Time: 3–5 hours

Description:
The existing `get_slash_record(escrow_id)` (L2258) retrieves a single slash record by escrow ID, but there is no function to retrieve all slash records associated with a given address. Reputation systems and compliance dashboards that want to show a user's complete slash history must currently process all `slash_applied` events off-chain. Adding an address-indexed query backed by a `Vec<u64>` of slashed escrow IDs in persistent storage would enable on-chain reputation auditing.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `get_slash_record` (L2258), `apply_slash` (L2662), `finalize_slash` (L2441)
- `contracts/escrow_contract/src/types.rs` — `SlashRecord` (L354–375), `DataKey` enum
- Add `DataKey::SlashsByAddress(Address)` storing `Vec<u64>` of escrow IDs in persistent storage
- Maintain index in `apply_slash` when a slash is recorded
- New function: `pub fn get_slash_records_by_address(env: Env, slashed_user: Address) -> Vec<SlashRecord>`

Acceptance Criteria:
- [ ] `DataKey::SlashsByAddress(Address)` is added to `DataKey` enum
- [ ] `apply_slash` populates the index for the `slashed_user`
- [ ] `pub fn get_slash_records_by_address` returns all `SlashRecord` entries for the given address
- [ ] Unit tests verify correct results after multiple slash events for the same address
- [ ] Returns empty `Vec` for addresses with no slash history

Branch Suggestion:
feat/get-slash-records-by-address

Commit Message Suggestions:
- `feat: add SlashsByAddress index and get_slash_records_by_address query`
- `feat: populate slash index in apply_slash function`
- `test: add tests for slash history query returning correct records`

PR Title:
feat: Add `get_slash_records_by_address` aggregate slash history query

PR Description:
Summary:
This PR adds a `SlashsByAddress(Address)` persistent index maintained in `apply_slash` and a `get_slash_records_by_address` query function that returns all `SlashRecord` entries for a given address. This enables on-chain slash history auditing for reputation systems without requiring off-chain event processing.

Changes:
- Added `SlashsByAddress(Address)` to `DataKey` enum in `types.rs`
- Updated `apply_slash` to append to the slashed user's index
- Added `pub fn get_slash_records_by_address` returning `Vec<SlashRecord>`
- Added unit tests for multi-slash history and empty result

Testing:
- Run `cargo test -p escrow_contract test_get_slash_records_by_address`
- Verify all slash records are returned after multiple `finalize_slash` calls

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #44 Add `update_milestone_title` for Pending-Only Milestones

Title: Add `update_milestone_title(escrow_id, milestone_id, new_title)` Function Restricted to `MS_PENDING` Milestones

Body:

Category: Smart Contract
Difficulty: Beginner
Priority: Low
Estimated Time: 1–3 hours

Description:
`Milestone.title: String` (L156 in `types.rs`) is set at creation via `add_milestone` and cannot be updated afterwards. When a milestone title contains a typo or needs clarification before submission, the only current option is to cancel and recreate the escrow or leave the error. An `update_milestone_title` function callable by the client, restricted to `MS_PENDING` milestones, would allow minor title corrections without disrupting the escrow workflow.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `add_milestone` (L1090), `AddMilestoneArgs.title: String` (L123)
- `contracts/escrow_contract/src/types.rs` — `Milestone.title: String` (L156), `MS_PENDING` constant
- New function: `pub fn update_milestone_title(env: Env, caller: Address, escrow_id: u64, milestone_id: u32, new_title: String) -> Result<(), EscrowError>`
- Must require `caller == meta.client`
- Must validate `milestone.status == MS_PENDING` — return `EscrowError::InvalidMilestoneState` (14) otherwise
- Must apply `MAX_STRING_LEN` validation from issue #31
- Must emit `emit_milestone_title_updated` event

Acceptance Criteria:
- [ ] `pub fn update_milestone_title` is added with client-only auth
- [ ] Returns `EscrowError::InvalidMilestoneState` (14) for non-pending milestones
- [ ] String length is validated against `MAX_STRING_LEN`
- [ ] `emit_milestone_title_updated` is added to `events.rs`
- [ ] Unit tests cover: successful update on pending, rejection on submitted, length validation

Branch Suggestion:
feat/update-milestone-title

Commit Message Suggestions:
- `feat: add update_milestone_title function for pending milestone title correction`
- `feat: add emit_milestone_title_updated event`
- `test: add tests for title update on pending and non-pending milestones`

PR Title:
feat: Add `update_milestone_title` function for correcting pending milestone titles

PR Description:
Summary:
This PR adds an `update_milestone_title` function to `EscrowContract` that allows the client to correct a milestone's title while it remains in `MS_PENDING` state. The function applies string length validation, requires client auth, and emits a `milestone_title_updated` event.

Changes:
- Added `pub fn update_milestone_title` with client auth and `MS_PENDING` state check
- Added `emit_milestone_title_updated` to `events.rs`
- Applied `MAX_STRING_LEN` validation to `new_title`
- Added unit tests for successful update, non-pending rejection, and length validation

Testing:
- Run `cargo test -p escrow_contract test_update_milestone_title`
- Verify updated title appears in `get_milestone` response

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #45 Test `create_recurring_escrow` Happy Path for All Interval Types

Title: Add Unit Tests for `create_recurring_escrow` Happy Path Covering `Daily`, `Weekly`, and `Monthly` Intervals

Body:

Category: Testing
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–4 hours

Description:
`create_recurring_escrow` (L984) is tested by `test_create_recurring_escrow_stores_schedule` but only for a single interval type. All three `RecurringInterval` variants — `Daily`, `Weekly`, and `Monthly` — have different `next_payment_at` computations in `next_schedule_time` (L2642), and each should be independently verified. Missing interval coverage means a regression in monthly interval computation could go undetected.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_recurring_escrow` (L984), `next_schedule_time` (L2642)
- `contracts/escrow_contract/src/types.rs` — `RecurringInterval::Daily`, `Weekly`, `Monthly`
- Test file: `contracts/escrow_contract/src/lib.rs` test module at L2700
- Use `Env::default()`, `mock_all_auths()`, and `Address::generate()` for test setup
- `RecurringPaymentConfig.next_payment_at` should equal `start_time + interval_seconds` for first payment

Acceptance Criteria:
- [ ] A test `test_create_recurring_escrow_daily` verifies `next_payment_at = start_time + 86_400`
- [ ] A test `test_create_recurring_escrow_weekly` verifies `next_payment_at = start_time + 604_800`
- [ ] A test `test_create_recurring_escrow_monthly` verifies `next_payment_at = start_time + 2_592_000`
- [ ] All three tests verify that `payments_remaining` equals the supplied `total_payments` value
- [ ] All three tests verify the `rec_crt` event is emitted with correct payload

Branch Suggestion:
test/recurring-escrow-all-intervals

Commit Message Suggestions:
- `test: add create_recurring_escrow happy path tests for all three interval types`
- `test: verify next_payment_at calculation for Daily, Weekly, and Monthly intervals`
- `test: assert rec_crt event payload for each recurring interval`

PR Title:
test: Add `create_recurring_escrow` happy path tests for all `RecurringInterval` variants

PR Description:
Summary:
This PR adds three new unit tests covering the `create_recurring_escrow` happy path for `RecurringInterval::Daily`, `Weekly`, and `Monthly`. Each test verifies the computed `next_payment_at` timestamp, initial `payments_remaining` count, and the `rec_crt` event payload.

Changes:
- Added `test_create_recurring_escrow_daily` test
- Added `test_create_recurring_escrow_weekly` test
- Added `test_create_recurring_escrow_monthly` test
- Each test checks `next_payment_at`, `payments_remaining`, and event emission

Testing:
- Run `cargo test -p escrow_contract test_create_recurring_escrow_daily`
- Run `cargo test -p escrow_contract test_create_recurring_escrow_weekly`
- Run `cargo test -p escrow_contract test_create_recurring_escrow_monthly`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #46 Test Recurring Payment Processing with Multiple Periods Due at Once

Title: Test `process_recurring_payments` Catches Up Multiple Overdue Periods in a Single Call

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–4 hours

Description:
`process_recurring_payments` (L1433) is designed to release payment for every period that has elapsed since the last `next_payment_at`, not just the most recent one. The test `test_process_recurring_payments_releases_due_amounts` exists but does not verify the multi-period catch-up behavior. A test that advances the ledger by 3× the interval period and then calls `process_recurring_payments` once should verify that 3 payments are released in a single transaction.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `process_recurring_payments` (L1433), test module at L2700
- Use `Ledger::with_mut(|l| l.timestamp = start_time + 3 * interval_seconds)` to advance time
- Verify `processed_count == 3` in the return value and `payments_remaining` decremented by 3
- Verify `total_released == 3 * payment_amount` via `emit_recurring_payments_processed` event
- Verify `next_payment_at` is advanced by 3 × interval after the call

Acceptance Criteria:
- [ ] Test advances ledger by exactly 3 × interval seconds and calls `process_recurring_payments`
- [ ] `RecurringPaymentConfig.payments_remaining` is decremented by 3
- [ ] `RecurringPaymentConfig.processed_payments` is incremented by 3
- [ ] `emit_recurring_payments_processed` event reports `processed_count = 3` and correct `total_released`
- [ ] `next_payment_at` is advanced by exactly `3 * interval_seconds`

Branch Suggestion:
test/recurring-payments-multi-period

Commit Message Suggestions:
- `test: add test for process_recurring_payments catching up 3 overdue periods`
- `test: verify payments_remaining decremented by 3 in multi-period processing`
- `test: assert next_payment_at advanced correctly after multi-period catch-up`

PR Title:
test: Test multi-period catch-up behavior in `process_recurring_payments`

PR Description:
Summary:
This PR adds a test that advances the ledger by three full interval periods and verifies that `process_recurring_payments` releases payment for all three periods in a single call, correctly updating `processed_payments`, `payments_remaining`, and `next_payment_at`.

Changes:
- Added `test_process_recurring_payments_multi_period_catchup` test
- Uses `Ledger::with_mut` to advance timestamp by 3× interval
- Asserts `processed_count == 3`, `payments_remaining` decreased by 3, and correct `total_released`

Testing:
- Run `cargo test -p escrow_contract test_process_recurring_payments_multi_period_catchup`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #47 Test Recurring Schedule Pause, Resume, and Cancel Workflow

Title: Test Full Pause → Resume → Cancel Lifecycle for `RecurringPaymentConfig` via `pause_recurring_schedule`, `resume_recurring_schedule`, `cancel_recurring_escrow`

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`test_pause_and_resume_recurring_schedule` exists (L2807) but does not cover the full cancellation path or the `paused_at` timestamp field. A comprehensive test should verify: (1) pausing sets `paused = true` and records `paused_at`, (2) attempting to process payments while paused returns `RecurringSchedulePaused` (46), (3) resuming adjusts `next_payment_at` to account for paused duration, and (4) cancelling via `cancel_recurring_escrow` refunds the `remaining_balance` to the client.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `pause_recurring_schedule` (L2076), `resume_recurring_schedule` (L2102), `cancel_recurring_escrow` (L2139)
- `contracts/escrow_contract/src/types.rs` — `RecurringPaymentConfig.paused`, `paused_at`, `cancelled`
- Use `Ledger::with_mut` to advance time between operations
- Verify `EscrowError::RecurringSchedulePaused` (46) from `process_recurring_payments` when paused

Acceptance Criteria:
- [ ] Test verifies `paused = true` and `paused_at` timestamp after `pause_recurring_schedule`
- [ ] `process_recurring_payments` returns `EscrowError::RecurringSchedulePaused` (46) when paused
- [ ] `resume_recurring_schedule` correctly adjusts `next_payment_at` for the paused duration
- [ ] `cancel_recurring_escrow` sets `cancelled = true` and refunds remaining balance to client
- [ ] `rec_can` event is emitted with correct refund amount after cancellation

Branch Suggestion:
test/recurring-schedule-pause-resume-cancel

Commit Message Suggestions:
- `test: add full pause-resume-cancel lifecycle test for recurring schedule`
- `test: verify RecurringSchedulePaused error when processing paused schedule`
- `test: assert next_payment_at adjusted for paused duration after resume`

PR Title:
test: Test full pause → resume → cancel lifecycle for recurring payment schedule

PR Description:
Summary:
This PR adds a comprehensive test covering the full pause, resume, and cancel lifecycle for recurring payment schedules. It verifies paused state enforcement, the duration-adjusted `next_payment_at` on resume, and the client refund on cancellation.

Changes:
- Added `test_recurring_schedule_full_pause_resume_cancel` test
- Uses `Ledger::with_mut` to simulate paused duration
- Asserts all state transitions and emitted events throughout the lifecycle

Testing:
- Run `cargo test -p escrow_contract test_recurring_schedule_full_pause_resume_cancel`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #48 Test `batch_add_milestones` at and Past `MAX_MILESTONES` Cap

Title: Test `batch_add_milestones` Boundary Behavior at `MAX_MILESTONES` and Rejection Past the Cap

Body:

Category: Testing
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–3 hours

Description:
`batch_add_milestones` (L1167) must respect the `MAX_MILESTONES` cap (L91), but there is no test verifying behavior at the boundary: adding exactly `MAX_MILESTONES` milestones should succeed, and adding a batch that would push the total past `MAX_MILESTONES` should return `EscrowError::TooManyMilestones` (16). Without boundary tests, regressions in the cap check could silently allow escrows to exceed the maximum.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `batch_add_milestones` (L1167), `MAX_MILESTONES` (L91)
- `contracts/escrow_contract/src/errors.rs` — `EscrowError::TooManyMilestones = 16`
- Test should create an escrow with `total_amount` large enough to accommodate `MAX_MILESTONES` milestones
- Use `AddMilestoneArgs` with small amounts summing to `total_amount`
- Verify partial batch failure: if a batch would push total over cap, entire batch is rejected

Acceptance Criteria:
- [ ] Test `test_batch_add_milestones_at_cap` successfully adds `MAX_MILESTONES` milestones
- [ ] Test `test_batch_add_milestones_past_cap` gets `EscrowError::TooManyMilestones` (16) when exceeding cap
- [ ] `EscrowMeta.milestone_count` equals `MAX_MILESTONES` after the at-cap test
- [ ] The past-cap test verifies no partial milestone additions occurred
- [ ] Both tests verify via `get_escrow` that `milestone_count` is correct

Branch Suggestion:
test/batch-add-milestones-cap-boundary

Commit Message Suggestions:
- `test: add batch_add_milestones boundary test at MAX_MILESTONES cap`
- `test: verify TooManyMilestones error when batch exceeds MAX_MILESTONES`
- `test: assert no partial additions occur when batch is rejected for exceeding cap`

PR Title:
test: Test `batch_add_milestones` boundary at `MAX_MILESTONES` and past-cap rejection

PR Description:
Summary:
This PR adds boundary tests for `batch_add_milestones` at exactly `MAX_MILESTONES` (success case) and for a batch that would push the total past the cap (rejection case). Tests verify that the cap is enforced atomically with no partial additions.

Changes:
- Added `test_batch_add_milestones_at_cap` verifying `MAX_MILESTONES` milestones added successfully
- Added `test_batch_add_milestones_past_cap` verifying `TooManyMilestones` error and no partial state change

Testing:
- Run `cargo test -p escrow_contract test_batch_add_milestones_at_cap`
- Run `cargo test -p escrow_contract test_batch_add_milestones_past_cap`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #49 Test `batch_approve_milestones` and `batch_release_funds` End to End

Title: Test `batch_approve_milestones` and Subsequent `batch_release_funds` in a Single Escrow Lifecycle

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`batch_approve_milestones` (L1264) and `batch_release_funds` (L1359) are both implemented but their combined end-to-end flow — submitting multiple milestones, batch-approving, then batch-releasing — is not tested together. In particular, the interaction between `approved_count` updates in `batch_approve_milestones` and the O(1) completion check in `batch_release_funds` needs integration test coverage to catch ordering or state desync bugs.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `batch_approve_milestones` (L1264), `batch_release_funds` (L1359), `submit_milestone` (L1555)
- Create an escrow with 3 milestones, submit all, batch-approve all, then batch-release all
- Verify `EscrowMeta.remaining_balance == 0` and `status == EscrowStatus::Completed` after `batch_release_funds`
- Verify `emit_escrow_completed` is emitted exactly once
- Verify token balance of freelancer matches sum of all milestone amounts

Acceptance Criteria:
- [ ] Test creates a 3-milestone escrow, submits all milestones, batch-approves, and batch-releases
- [ ] `EscrowMeta.remaining_balance == 0` after `batch_release_funds`
- [ ] `EscrowMeta.status == EscrowStatus::Completed` after final release
- [ ] `emit_escrow_completed` event is emitted exactly once
- [ ] Freelancer token balance equals `total_amount` after all releases

Branch Suggestion:
test/batch-approve-and-release-e2e

Commit Message Suggestions:
- `test: add end-to-end test for batch_approve_milestones and batch_release_funds`
- `test: verify escrow completion status after batch release of all milestones`
- `test: assert freelancer token balance equals total_amount after batch release`

PR Title:
test: Test `batch_approve_milestones` → `batch_release_funds` end-to-end lifecycle

PR Description:
Summary:
This PR adds an end-to-end integration test for `batch_approve_milestones` followed by `batch_release_funds`, verifying that the escrow reaches `Completed` status, the freelancer receives the correct token balance, and the `escrow_completed` event is emitted exactly once.

Changes:
- Added `test_batch_approve_and_release_e2e` test with 3-milestone escrow lifecycle
- Verified `remaining_balance == 0`, `status == Completed`, and freelancer balance

Testing:
- Run `cargo test -p escrow_contract test_batch_approve_and_release_e2e`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #50 Test Escrow Creation with `lock_time` Enforced

Title: Test That `lock_time` Prevents `release_funds` Before Expiry and Permits It After

Body:

Category: Testing
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–3 hours

Description:
`create_escrow_internal` (L895) stores `lock_time: Option<u64>` and `check_lock_time_expired` (L655) enforces it in `release_funds` (L1713). However, there is no dedicated test verifying that `release_funds` fails with `EscrowError::LockTimeNotExpired` (28) when the lock is active and succeeds after advancing the ledger timestamp past the lock time. This gap means a regression in `check_lock_time_expired` could go undetected.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `release_funds` (L1713), `check_lock_time_expired` (L655)
- `contracts/escrow_contract/src/errors.rs` — `EscrowError::LockTimeNotExpired = 28`
- Create escrow with `lock_time = Some(current_timestamp + 3600)` (1 hour from now)
- Use `Ledger::with_mut(|l| l.timestamp = lock_time - 1)` to test the before-expiry case
- Use `Ledger::with_mut(|l| l.timestamp = lock_time + 1)` to test the after-expiry case

Acceptance Criteria:
- [ ] Test `test_lock_time_prevents_early_release` verifies `EscrowError::LockTimeNotExpired` (28) before expiry
- [ ] Test `test_lock_time_allows_release_after_expiry` verifies successful `release_funds` after lock expires
- [ ] `emit_lock_time_expired` event is verified when lock time passes
- [ ] Both tests use `Ledger::with_mut` to manipulate the ledger timestamp
- [ ] `get_lock_time_remaining` returns `Some(0)` exactly at expiry in the after-expiry test

Branch Suggestion:
test/lock-time-enforcement

Commit Message Suggestions:
- `test: add lock_time enforcement test preventing early release_funds`
- `test: add lock_time test verifying successful release after expiry`
- `test: verify emit_lock_time_expired event on lock expiry`

PR Title:
test: Test `lock_time` enforcement in `release_funds` before and after expiry

PR Description:
Summary:
This PR adds two tests verifying lock time enforcement in `release_funds`. The first test confirms `LockTimeNotExpired` before the lock expires; the second confirms successful release after the lock expires using `Ledger::with_mut` timestamp manipulation.

Changes:
- Added `test_lock_time_prevents_early_release` test
- Added `test_lock_time_allows_release_after_expiry` test
- Both tests use `Ledger::with_mut` for time manipulation

Testing:
- Run `cargo test -p escrow_contract test_lock_time_prevents_early_release`
- Run `cargo test -p escrow_contract test_lock_time_allows_release_after_expiry`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #51 Test `timelock` Duration Prevents Early Milestone Release

Title: Test That `Timelock` (`OptionalTimelock::Some`) Prevents `release_funds` Before Ledger Duration Elapses

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–4 hours

Description:
`check_timelock_expired` (L671) enforces that `current_ledger >= timelock.start_ledger + timelock.duration_ledger` before permitting `release_funds`. The `start_timelock` function (L1821) initiates this. However, there is no test explicitly verifying `EscrowError::TimelockNotExpired` (53) when `release_funds` is called before the timelock elapses, or that it succeeds when `current_ledger >= start + duration`.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `start_timelock` (L1821), `check_timelock_expired` (L671), `release_funds` (L1713)
- `contracts/escrow_contract/src/types.rs` — `Timelock { duration_ledger, start_ledger }`, `OptionalTimelock`
- `contracts/escrow_contract/src/errors.rs` — `EscrowError::TimelockNotExpired = 53`
- Use `env.ledger().sequence()` and manipulate ledger sequence number via `Ledger::with_mut`

Acceptance Criteria:
- [ ] Test calls `start_timelock` and then `release_funds` before timelock elapses, expecting `TimelockNotExpired` (53)
- [ ] Test advances ledger sequence to `start + duration + 1` and verifies successful `release_funds`
- [ ] `emit_timelock_started` and `emit_timelock_released` events are verified
- [ ] Test verifies `EscrowError::TimelockAlreadyActive` (52) when calling `start_timelock` twice
- [ ] Tests use `Ledger::with_mut(|l| l.sequence_number = ...)` for ledger advancement

Branch Suggestion:
test/timelock-enforcement

Commit Message Suggestions:
- `test: add timelock enforcement test preventing early release_funds`
- `test: verify TimelockNotExpired error before ledger duration elapses`
- `test: verify successful release after timelock duration using ledger sequence manipulation`

PR Title:
test: Test `Timelock` enforcement preventing early `release_funds` via ledger sequence

PR Description:
Summary:
This PR adds tests for the `Timelock` subsystem verifying that `release_funds` is blocked with `TimelockNotExpired` before the duration elapses and succeeds after the ledger sequence advances past `start_ledger + duration_ledger`.

Changes:
- Added `test_timelock_prevents_early_release` test
- Added `test_timelock_allows_release_after_duration` test
- Added `test_timelock_already_active_on_second_start` test
- All tests use `Ledger::with_mut` for ledger sequence manipulation

Testing:
- Run `cargo test -p escrow_contract test_timelock_prevents_early_release`
- Run `cargo test -p escrow_contract test_timelock_allows_release_after_duration`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #52 Test `buyer_signers` Multisig Approval Reaching Threshold

Title: Test Multisig Milestone Approval with `buyer_signers`, Weighted Votes, and Threshold Enforcement

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`create_escrow_with_buyer_signers` (L869) and `approve_milestone` (L1596) implement a weighted multisig approval system, but the existing tests do not cover the scenario where multiple signers must vote before a milestone is approved and funds released. A test covering weight accumulation, threshold enforcement (milestone not approved below threshold), and final approval (milestone approved when threshold reached) is needed for confidence in the multisig logic.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_with_buyer_signers` (L869), `approve_milestone` (L1596)
- `contracts/escrow_contract/src/types.rs` — `MultisigConfig`, `ApprovalRecord`
- `contracts/escrow_contract/src/events.rs` — `emit_multisig_approval_recorded` (partial), `emit_milestone_approved` (final)
- Set up: 3 signers with weights [30, 30, 40], threshold = 70; first two signers should push past threshold

Acceptance Criteria:
- [ ] Test creates an escrow with 3 `buyer_signers` with weights summing to 100 and threshold = 70
- [ ] First signer approval emits `msig_apr` but NOT `mil_apr` (below threshold)
- [ ] Second signer approval crosses threshold and emits both `msig_apr` and `mil_apr`
- [ ] `get_milestone_approvals` returns 2 `ApprovalRecord` entries after second vote
- [ ] `release_funds` succeeds after multisig threshold is reached

Branch Suggestion:
test/multisig-threshold-approval

Commit Message Suggestions:
- `test: add multisig milestone approval test with weighted votes and threshold`
- `test: verify msig_apr emitted before threshold and mil_apr emitted after`
- `test: assert release_funds succeeds after multisig threshold is reached`

PR Title:
test: Test `buyer_signers` multisig weighted approval reaching threshold

PR Description:
Summary:
This PR adds a comprehensive test for the multisig milestone approval system using three signers with weights [30, 30, 40] and threshold = 70. It verifies that the first vote is recorded but does not trigger approval, and that the second vote crosses the threshold and emits the final approval event.

Changes:
- Added `test_multisig_approval_reaching_threshold` test
- Set up 3 signers with weights [30, 30, 40] and threshold 70
- Verified partial (`msig_apr`) and final (`mil_apr`) event emission
- Verified `release_funds` succeeds after threshold

Testing:
- Run `cargo test -p escrow_contract test_multisig_approval_reaching_threshold`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #53 Test Reputation Record Creation on First Escrow Completion

Title: Test That `ReputationRecord` Is Correctly Initialized on First Escrow Completion for Both Parties

Body:

Category: Testing
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–3 hours

Description:
`get_reputation` (L2225) returns a default zero-score `ReputationRecord` for addresses that have never participated in an escrow. After the first escrow completion via `approve_milestone` (which triggers `_update_reputation_internal`), both the client and freelancer should have non-zero reputation records. `test_get_reputation_returns_default_record` only tests the default case; first-completion record creation is not tested.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `_update_reputation_internal` (L2572), `approve_milestone` (L1596), `get_reputation` (L2225)
- `contracts/escrow_contract/src/types.rs` — `ReputationRecord` fields: `total_score`, `completed_escrows`, `total_volume`
- Create a full escrow lifecycle: create → add milestone → submit → approve → release
- After completion, call `get_reputation` for both client and freelancer

Acceptance Criteria:
- [ ] Test `test_reputation_created_on_first_completion` creates and completes a single-milestone escrow
- [ ] After completion, `get_reputation(freelancer).completed_escrows == 1`
- [ ] After completion, `get_reputation(freelancer).total_volume == milestone_amount`
- [ ] `emit_reputation_updated` event is verified for the freelancer's address
- [ ] `get_reputation(client).completed_escrows == 1` is also verified

Branch Suggestion:
test/reputation-creation-on-completion

Commit Message Suggestions:
- `test: add test for ReputationRecord creation on first escrow completion`
- `test: verify completed_escrows incremented for both client and freelancer`
- `test: assert total_volume equals milestone amount after first completion`

PR Title:
test: Test `ReputationRecord` initialization on first escrow completion for both parties

PR Description:
Summary:
This PR adds a test that completes a full single-milestone escrow lifecycle and verifies that `ReputationRecord` is correctly initialized for both the client and freelancer, with `completed_escrows = 1` and `total_volume` matching the milestone amount.

Changes:
- Added `test_reputation_created_on_first_completion` test
- Verified `get_reputation` returns populated records for both client and freelancer
- Verified `reputation_updated` event emission

Testing:
- Run `cargo test -p escrow_contract test_reputation_created_on_first_completion`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #54 Test Slash Record Creation and Dispute Window Timeout

Title: Test That `SlashRecord` Is Created After `execute_cancellation` and `finalize_slash` Enforces `SLASH_DISPUTE_PERIOD`

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`execute_cancellation` (L2324) creates a `SlashRecord` and `finalize_slash` (L2441) enforces that `SLASH_DISPUTE_PERIOD` has elapsed before the slash is finalized. There is a test `test_execute_cancellation_slashes_requester_and_distributes` but it does not explicitly test the `SLASH_DISPUTE_PERIOD` enforcement: `finalize_slash` called immediately after `execute_cancellation` should fail with `SlashDisputeDeadlineExpired` related logic, and should succeed only after the period elapses.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `execute_cancellation` (L2324), `finalize_slash` (L2441), `SLASH_DISPUTE_PERIOD` (L86)
- `contracts/escrow_contract/src/types.rs` — `SlashRecord.slashed_at`, `SlashRecord.disputed`
- Use `Ledger::with_mut(|l| l.timestamp = slash_time + SLASH_DISPUTE_PERIOD + 1)` to advance past window
- Verify `get_slash_record` returns the created record before finalization

Acceptance Criteria:
- [ ] Test verifies `get_slash_record(escrow_id)` returns a `SlashRecord` after `execute_cancellation`
- [ ] `finalize_slash` called before `SLASH_DISPUTE_PERIOD` returns `SlashDisputeDeadlineExpired` (40) or appropriate error
- [ ] `finalize_slash` succeeds after advancing ledger past `slashed_at + SLASH_DISPUTE_PERIOD`
- [ ] Slash record is removed from storage after finalization
- [ ] Recipient receives slashed token amount after successful finalization

Branch Suggestion:
test/slash-record-and-dispute-window

Commit Message Suggestions:
- `test: add slash record creation and dispute window enforcement test`
- `test: verify finalize_slash fails before SLASH_DISPUTE_PERIOD elapses`
- `test: assert slash record removed and tokens transferred after finalize_slash`

PR Title:
test: Test `SlashRecord` creation and `SLASH_DISPUTE_PERIOD` enforcement in `finalize_slash`

PR Description:
Summary:
This PR adds tests verifying that `execute_cancellation` creates a `SlashRecord`, that `finalize_slash` correctly enforces the `SLASH_DISPUTE_PERIOD` (blocking early finalization), and that finalization after the period succeeds with correct token transfer.

Changes:
- Added `test_slash_record_created_and_dispute_window_enforced` test
- Used `Ledger::with_mut` to test both before and after `SLASH_DISPUTE_PERIOD`
- Verified `get_slash_record` response and post-finalization token transfer

Testing:
- Run `cargo test -p escrow_contract test_slash_record_created_and_dispute_window_enforced`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #55 Test `cancellation_request` Workflow End to End

Title: Test Complete Cancellation Request Workflow: Request → Dispute Period → Execute and Fund Distribution

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
The cancellation request flow spans `request_cancellation` (L2268), `dispute_cancellation` (L2395), `execute_cancellation` (L2324), and the associated slash logic. `test_execute_cancellation_fails_during_dispute_period` and `test_dispute_cancellation_blocks_execution` exist but do not cover the complete happy path: request → wait for `CANCELLATION_DISPUTE_PERIOD` → execute → verify fund distribution and slash. This end-to-end test is critical for validating the entire cancellation subsystem.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `request_cancellation` (L2268), `execute_cancellation` (L2324), `CANCELLATION_DISPUTE_PERIOD` (L85)
- `contracts/escrow_contract/src/types.rs` — `CancellationRequest` struct (L331–349)
- Use `setup_funded_escrow` helper (L3332) from existing tests
- Use `Ledger::with_mut` to advance past `CANCELLATION_DISPUTE_PERIOD`
- Verify client and freelancer token balances after execution including slash deduction

Acceptance Criteria:
- [ ] Test `test_cancellation_workflow_end_to_end` covers: create escrow → request cancellation → advance ledger → execute
- [ ] `get_cancellation_request` returns the request between `request_cancellation` and `execute_cancellation`
- [ ] After `execute_cancellation`, `get_cancellation_request` returns `EscrowError::CancellationNotFound` (32)
- [ ] Escrow status changes to `EscrowStatus::Cancelled`
- [ ] Client and freelancer token balances reflect correct post-slash distribution

Branch Suggestion:
test/cancellation-workflow-e2e

Commit Message Suggestions:
- `test: add complete cancellation request workflow end-to-end test`
- `test: verify fund distribution and slash after execute_cancellation`
- `test: assert CancellationNotFound after execute_cancellation cleanup`

PR Title:
test: Add complete `cancellation_request` workflow end-to-end test

PR Description:
Summary:
This PR adds a complete end-to-end test for the cancellation workflow, covering `request_cancellation`, waiting for `CANCELLATION_DISPUTE_PERIOD`, `execute_cancellation`, and verifying fund distribution including slash deduction for both client and freelancer.

Changes:
- Added `test_cancellation_workflow_end_to_end` test
- Used `Ledger::with_mut` to advance past `CANCELLATION_DISPUTE_PERIOD`
- Verified `CancellationRequest` lifecycle and post-execution token balances

Testing:
- Run `cargo test -p escrow_contract test_cancellation_workflow_end_to_end`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #56 Test `expire_escrow` via Rent Expiry Simulation

Title: Test That `collect_rent` Triggers `expire_escrow` and Refunds Client When Rent Balance Is Depleted

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`test_expired_escrow_is_cleaned_up_by_collect_rent` exists (L3152) but should be extended to verify that `expire_escrow` (L621) correctly refunds `remaining_balance` to the client, removes all associated storage entries (meta + milestones), and emits the expected cancellation event. The existing test may not cover the full storage cleanup or token refund verification.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `expire_escrow` (L621), `collect_rent` (L2189), `rent_has_expired` (L503)
- Use `Ledger::with_mut` to advance timestamp far past `RENT_RESERVE_PERIODS × RENT_PERIOD_SECONDS`
- Verify `get_escrow` returns `EscrowError::EscrowNotFound` (8) after expiry
- Verify client token balance equals initial balance plus refunded `remaining_balance`
- Verify admin receives accumulated rent fees

Acceptance Criteria:
- [ ] Test advances ledger to simulate rent depletion and calls `collect_rent`
- [ ] `expire_escrow` is triggered when `rent_has_expired` returns true
- [ ] Client receives token refund equal to `remaining_balance` at time of expiry
- [ ] `get_escrow(escrow_id)` returns `EscrowNotFound` (8) after expiry
- [ ] `emit_escrow_cancelled` event is emitted with the refunded amount

Branch Suggestion:
test/expire-escrow-rent-depletion

Commit Message Suggestions:
- `test: add rent expiry simulation test triggering expire_escrow`
- `test: verify client refund and storage cleanup after expire_escrow`
- `test: assert EscrowNotFound after rent-triggered expiry`

PR Title:
test: Test `expire_escrow` triggered by rent depletion with client refund verification

PR Description:
Summary:
This PR adds a test that simulates full rent depletion by advancing the ledger timestamp, triggers `expire_escrow` via `collect_rent`, and verifies the complete cleanup: client receives the remaining balance refund, storage is removed, and `EscrowNotFound` is returned on subsequent queries.

Changes:
- Added `test_expire_escrow_rent_depletion_complete_cleanup` test
- Used `Ledger::with_mut` to simulate past-expiry timestamps
- Verified client refund, storage removal, and `escrow_cancelled` event

Testing:
- Run `cargo test -p escrow_contract test_expire_escrow_rent_depletion_complete_cleanup`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #57 Test Contract Upgrade: Queue → Delay → Execute Flow

Title: Test Full Contract Upgrade Lifecycle: `queue_upgrade` → Delay Elapses → `execute_upgrade` in `escrow_extensions`

Body:

Category: Testing
Difficulty: Advanced
Priority: High
Estimated Time: 5–8 hours

Description:
`contracts/escrow_extensions/src/lib.rs` implements `queue_upgrade` (L588), `execute_upgrade` (L623), and `cancel_upgrade` (L650) with a `UPGRADE_DELAY_SECONDS` enforced delay. The existing tests do not include a full upgrade lifecycle test verifying that queuing a WASM hash, waiting for `UPGRADE_DELAY_SECONDS`, and executing the upgrade succeeds. This is a critical path for contract maintainability and needs verified behavior in the Soroban test environment.

Requirements and Context:
- `contracts/escrow_extensions/src/lib.rs` — `queue_upgrade` (L588), `execute_upgrade` (L623), `UPGRADE_DELAY_SECONDS` (L58)
- `contracts/escrow_extensions/src/types.rs` — `PendingUpgrade` struct
- Use `env.deployer().upload_contract_wasm(...)` or a mock WASM hash (`BytesN::<32>::from_array(&env, &[0u8; 32])`)
- Use `Ledger::with_mut(|l| l.timestamp += UPGRADE_DELAY_SECONDS + 1)` for delay simulation
- Verify `get_pending_upgrade` returns the queued upgrade between queue and execute

Acceptance Criteria:
- [ ] Test `test_upgrade_queue_delay_execute` queues an upgrade and verifies `get_pending_upgrade` returns it
- [ ] `execute_upgrade` before delay elapses returns `EscrowError` for `TimelockNotExpired` equivalent
- [ ] `execute_upgrade` after `UPGRADE_DELAY_SECONDS` succeeds
- [ ] `get_pending_upgrade` returns `None` after successful execution
- [ ] `cancel_upgrade` is verified to clear the pending upgrade before execution

Branch Suggestion:
test/upgrade-queue-delay-execute

Commit Message Suggestions:
- `test: add full upgrade lifecycle test in escrow_extensions`
- `test: verify execute_upgrade blocked before UPGRADE_DELAY_SECONDS elapses`
- `test: assert get_pending_upgrade cleared after successful execute_upgrade`

PR Title:
test: Test full contract upgrade lifecycle: `queue_upgrade` → delay → `execute_upgrade`

PR Description:
Summary:
This PR adds a full upgrade lifecycle test for `EscrowExtensions` verifying: queuing a WASM hash via `queue_upgrade`, verifying `get_pending_upgrade` returns the queued entry, confirming `execute_upgrade` is blocked before the delay, and confirming successful execution after `UPGRADE_DELAY_SECONDS` elapses.

Changes:
- Added `test_upgrade_queue_delay_execute` test in `contracts/escrow_extensions/src/tests.rs`
- Used `Ledger::with_mut` to simulate delay passage
- Verified `get_pending_upgrade` lifecycle and `cancel_upgrade` clearing behavior

Testing:
- Run `cargo test -p escrow_extensions test_upgrade_queue_delay_execute`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #58 Test Upgrade Fails Before Delay Elapses

Title: Test That `execute_upgrade` Returns an Error When Called Before `UPGRADE_DELAY_SECONDS` Elapses

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 2–3 hours

Description:
`execute_upgrade` (L623) in `contracts/escrow_extensions/src/lib.rs` checks that `env.ledger().timestamp() >= pending.executable_after` before executing. There is no dedicated test asserting the error return when this check fails. An adversary or misconfigured integrator calling `execute_upgrade` immediately after `queue_upgrade` must receive a clear error, not a panic or silent success. This test ensures the timelock is actually enforced.

Requirements and Context:
- `contracts/escrow_extensions/src/lib.rs` — `execute_upgrade` (L623), `queue_upgrade` (L588), `UPGRADE_DELAY_SECONDS` (L58)
- `contracts/escrow_extensions/src/types.rs` — `PendingUpgrade.executable_after`
- Test must call `execute_upgrade` immediately after `queue_upgrade` without advancing the ledger
- The expected error should be a timelock or upgrade-not-ready error from `escrow_extensions/src/errors.rs`

Acceptance Criteria:
- [ ] Test `test_execute_upgrade_fails_before_delay` calls `queue_upgrade` then immediately `execute_upgrade`
- [ ] The call returns an error (not panics) with a timelock-related error code
- [ ] A second assertion verifies the pending upgrade is still present after the failed execution
- [ ] `get_pending_upgrade` still returns the queued hash after the failed `execute_upgrade`
- [ ] `Ledger::with_mut` is NOT called (test must use the unadvanced ledger)

Branch Suggestion:
test/upgrade-execute-before-delay-fails

Commit Message Suggestions:
- `test: add test verifying execute_upgrade fails before UPGRADE_DELAY_SECONDS`
- `test: assert pending upgrade not cleared on failed early execute_upgrade`
- `test: verify timelock error returned from execute_upgrade before delay`

PR Title:
test: Test that `execute_upgrade` fails before `UPGRADE_DELAY_SECONDS` elapses

PR Description:
Summary:
This PR adds a test verifying that `execute_upgrade` returns a timelock error when called before `UPGRADE_DELAY_SECONDS` has elapsed since `queue_upgrade`. The pending upgrade remains queued after the failed attempt.

Changes:
- Added `test_execute_upgrade_fails_before_delay` in `contracts/escrow_extensions/src/tests.rs`
- Verified timelock error return without ledger advancement
- Confirmed pending upgrade persists after failed early execution

Testing:
- Run `cargo test -p escrow_extensions test_execute_upgrade_fails_before_delay`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #59 Test `meta_transaction` Execution with Valid Signature

Title: Test `MetaTransaction` Execution with Valid Nonce, Deadline, and Soroban Signature

Body:

Category: Testing
Difficulty: Advanced
Priority: High
Estimated Time: 6–10 hours

Description:
`MetaTransaction` (L387 in `types.rs`) includes `signer`, `nonce`, `deadline`, `function_name`, `function_args`, and `signature` fields, enabling gas-abstracted function calls. However, there are no tests in the test suite verifying that a properly constructed `MetaTransaction` with a valid Soroban ed25519 signature executes the intended function. This is a critical path for relayer-based integrations and needs tested behavior.

Requirements and Context:
- `contracts/escrow_contract/src/types.rs` — `MetaTransaction` (L387–405), `FeeDelegation` (L412–421)
- `contracts/escrow_contract/src/lib.rs` — find the meta-transaction dispatch function (search for function accepting `MetaTransaction`)
- Use Soroban SDK's `env.crypto().ed25519_verify()` compatible key generation for test signatures
- `soroban_sdk::crypto::Hash::sha256()` for message construction
- Nonce must be tracked and monotonically increasing

Acceptance Criteria:
- [ ] Test generates a valid ed25519 keypair using Soroban SDK test utilities
- [ ] A `MetaTransaction` is constructed with valid `nonce = 0`, future `deadline`, correct `function_name`
- [ ] The meta-transaction is executed successfully, triggering the intended underlying function
- [ ] Subsequent execution with the same nonce returns a `nonce-already-used` style error
- [ ] A replay attack (reusing a processed `MetaTransaction`) is rejected

Branch Suggestion:
test/meta-transaction-valid-signature

Commit Message Suggestions:
- `test: add meta_transaction execution test with valid ed25519 signature`
- `test: verify nonce replay protection in meta_transaction execution`
- `test: assert intended underlying function is triggered by meta_transaction`

PR Title:
test: Test `MetaTransaction` execution with valid signature and nonce replay protection

PR Description:
Summary:
This PR adds a test for the `MetaTransaction` subsystem using a valid ed25519 signature to execute an underlying contract function via the meta-transaction dispatch path. Nonce replay protection is also verified by confirming the same transaction is rejected on a second execution attempt.

Changes:
- Added `test_meta_transaction_valid_signature_executes` test
- Implemented ed25519 signature generation using Soroban SDK test utilities
- Verified nonce replay protection

Testing:
- Run `cargo test -p escrow_contract test_meta_transaction_valid_signature_executes`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #60 Test `meta_transaction` Rejected with Expired Deadline

Title: Test That `MetaTransaction` with `deadline < env.ledger().timestamp()` Is Rejected

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 2–4 hours

Description:
`MetaTransaction.deadline: u64` (L395 in `types.rs`) should prevent replaying an old signed meta-transaction after it expires. There must be a test verifying that a `MetaTransaction` with `deadline < current_ledger_timestamp` is rejected with an appropriate error. This test guards against the scenario where a signed meta-transaction is intercepted and replayed after the intended execution window.

Requirements and Context:
- `contracts/escrow_contract/src/types.rs` — `MetaTransaction.deadline: u64` (L395)
- `contracts/escrow_contract/src/errors.rs` — `EscrowError::DeadlineExpired = 26`
- Construct a `MetaTransaction` with `deadline = current_timestamp - 1`
- Use `Ledger::with_mut` to advance the ledger timestamp past the deadline before execution
- The error returned must be `EscrowError::DeadlineExpired` (26) or equivalent

Acceptance Criteria:
- [ ] Test constructs a `MetaTransaction` with a past deadline
- [ ] Execution attempt returns `EscrowError::DeadlineExpired` (26) or meta-transaction specific error
- [ ] No state changes occur when a meta-transaction with expired deadline is rejected
- [ ] A second test variant verifies acceptance with `deadline = current_timestamp + 60`
- [ ] The test uses `Ledger::with_mut` for deterministic deadline testing

Branch Suggestion:
test/meta-transaction-expired-deadline

Commit Message Suggestions:
- `test: add meta_transaction rejection test with expired deadline`
- `test: verify no state changes on expired deadline meta_transaction attempt`
- `test: add happy path test with future deadline for comparison`

PR Title:
test: Test `MetaTransaction` rejection when `deadline` has expired

PR Description:
Summary:
This PR adds a test verifying that a `MetaTransaction` with an expired deadline is rejected before any state changes occur. A companion test confirms acceptance with a future deadline.

Changes:
- Added `test_meta_transaction_expired_deadline_rejected` test
- Added `test_meta_transaction_future_deadline_accepted` test
- Used `Ledger::with_mut` to control timestamp for deterministic deadline testing

Testing:
- Run `cargo test -p escrow_contract test_meta_transaction_expired_deadline_rejected`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #61 Test Oracle Price Fallback When Primary Returns Stale Price

Title: Test `get_price_usd` Falls Back to Fallback Oracle When Primary Price Is Stale

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`get_price_usd` in `contracts/escrow_contract/src/oracle.rs` falls back to the fallback oracle when the primary oracle returns a price older than `PRICE_STALENESS_THRESHOLD` (3,600 seconds). There are no tests for this fallback behavior. Without test coverage, a regression in the staleness check or fallback logic could cause `convert_amount` to silently use a stale price, corrupting cross-asset escrow conversions.

Requirements and Context:
- `contracts/escrow_contract/src/oracle.rs` — `get_price_usd`, `is_fresh`, `PRICE_STALENESS_THRESHOLD = 3_600`
- `contracts/escrow_contract/src/lib.rs` — `get_price` (L753), `set_oracle` (L730), `set_fallback_oracle` (L739)
- Must mock two oracle contracts: one returning stale timestamp, one returning fresh timestamp
- Use Soroban SDK `contractimpl` mock for the `OracleInterface` trait
- Advance ledger timestamp to `primary_price_timestamp + PRICE_STALENESS_THRESHOLD + 1`

Acceptance Criteria:
- [ ] Test registers both a primary and fallback oracle mock
- [ ] Primary oracle returns a price with stale timestamp
- [ ] `get_price` returns the fallback oracle's fresh price
- [ ] A second test verifies `OraclePriceStale` (49) is returned when both oracles are stale
- [ ] A third test verifies the primary price is used when it is fresh (no fallback triggered)

Branch Suggestion:
test/oracle-fallback-stale-primary

Commit Message Suggestions:
- `test: add oracle fallback test when primary returns stale price`
- `test: verify OraclePriceStale error when both oracles are stale`
- `test: verify primary oracle price used when fresh`

PR Title:
test: Test `get_price_usd` oracle fallback behavior for stale primary price

PR Description:
Summary:
This PR adds tests for the oracle fallback mechanism, verifying that `get_price_usd` correctly falls back to the fallback oracle when the primary price is stale, returns `OraclePriceStale` when both are stale, and uses the primary price when it is fresh.

Changes:
- Added `test_oracle_fallback_on_stale_primary` test
- Added `test_oracle_both_stale_returns_error` test
- Added `test_oracle_uses_primary_when_fresh` test
- Implemented mock oracle contracts for the `OracleInterface` trait

Testing:
- Run `cargo test -p escrow_contract test_oracle_fallback_on_stale_primary`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #62 Test Bridge Confirmation Finalization Threshold

Title: Test That Bridge Token Is Usable Only After `MIN_BRIDGE_CONFIRMATIONS` Are Reached

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`require_bridge_finalized` in `contracts/escrow_contract/src/bridge.rs` checks `BridgeConfirmation.is_finalized` before allowing use of a bridge token in an escrow. `update_bridge_confirmation` (L806 in `lib.rs`) sets `is_finalized = true` when `confirmations >= MIN_BRIDGE_CONFIRMATIONS = 15`. There are no tests verifying that an escrow creation with an unfinalized bridge token is rejected and succeeds only after reaching 15 confirmations.

Requirements and Context:
- `contracts/escrow_contract/src/bridge.rs` — `BridgeConfirmation`, `MIN_BRIDGE_CONFIRMATIONS = 15`, `require_bridge_finalized`
- `contracts/escrow_contract/src/lib.rs` — `update_bridge_confirmation` (L806), `register_wrapped_token` (L787)
- `contracts/escrow_contract/src/errors.rs` — `EscrowError::BridgeError = 54`
- Test must register a wrapped token, create a `BridgeConfirmation` with 14 confirmations, and verify rejection
- Advance to 15 confirmations via `update_bridge_confirmation` and verify acceptance

Acceptance Criteria:
- [ ] Test registers a wrapped token with `is_approved = true`
- [ ] Bridge confirmation with 14 confirmations (`is_finalized = false`) causes `BridgeError` (54) on escrow use
- [ ] After `update_bridge_confirmation` reaches 15, `is_finalized = true` and escrow creation succeeds
- [ ] `emit_bridge_confirmation_updated` event is verified at each confirmation count
- [ ] `get_bridge_confirmation` returns correct state at each stage

Branch Suggestion:
test/bridge-confirmation-threshold

Commit Message Suggestions:
- `test: add bridge confirmation threshold test for MIN_BRIDGE_CONFIRMATIONS`
- `test: verify BridgeError on unfinalized bridge token in escrow creation`
- `test: assert escrow creation succeeds after 15 bridge confirmations`

PR Title:
test: Test bridge confirmation finalization at `MIN_BRIDGE_CONFIRMATIONS` threshold

PR Description:
Summary:
This PR adds tests for the bridge confirmation finalization mechanism, verifying that escrow creation with an unfinalized bridge token (< 15 confirmations) returns `BridgeError`, and that it succeeds after `update_bridge_confirmation` reaches `MIN_BRIDGE_CONFIRMATIONS`.

Changes:
- Added `test_bridge_confirmation_threshold_enforcement` test
- Verified `BridgeError` below 15 confirmations and success at 15
- Verified `emit_bridge_confirmation_updated` event at each update

Testing:
- Run `cargo test -p escrow_contract test_bridge_confirmation_threshold_enforcement`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #63 Test Governance Proposal Creation, Voting, and Execution

Title: Test Full Governance Lifecycle: `create_proposal` → `cast_vote` → `finalize_proposal` → `execute_proposal`

Body:

Category: Testing
Difficulty: Intermediate
Priority: High
Estimated Time: 5–8 hours

Description:
`contracts/governance/src/tests.rs` exists but the governance contract's full lifecycle — creating a `ParameterChange` proposal, casting votes, finalizing when voting closes, waiting for the timelock, and executing — must be tested end-to-end. This is the most critical user journey for the governance contract, and a missing test here means operator confidence in the governance system is based entirely on code review.

Requirements and Context:
- `contracts/governance/src/lib.rs` — `create_proposal` (L234), `cast_vote` (L308), `finalize_proposal` (L363), `execute_proposal` (L404)
- `contracts/governance/src/types.rs` — `GovConfig`, `Proposal`, `ProposalStatus`, `ParameterPayload`
- Use `Ledger::with_mut` to advance past `voting_delay`, `voting_period`, and `timelock_delay`
- Verify `ProposalStatus` transitions: `Active` → `Passed` → `Queued` → `Executed`

Acceptance Criteria:
- [ ] Test initializes governance with a `GovConfig` with known `quorum_bps` and `approval_threshold_bps`
- [ ] `create_proposal` succeeds and returns `proposal_id`
- [ ] `cast_vote` is called by token holders for and against, and results in Passed status
- [ ] `finalize_proposal` transitions proposal to `Passed` then `Queued`
- [ ] `execute_proposal` succeeds after `timelock_delay` elapses and triggers the payload
- [ ] `ProposalStatus::Executed` is verified via `get_proposal`

Branch Suggestion:
test/governance-full-lifecycle

Commit Message Suggestions:
- `test: add full governance proposal lifecycle test from creation to execution`
- `test: verify ProposalStatus transitions through Active, Passed, Queued, Executed`
- `test: assert execute_proposal triggers ParameterChange payload correctly`

PR Title:
test: Test full governance proposal lifecycle: creation → voting → finalization → execution

PR Description:
Summary:
This PR adds an end-to-end test for the full governance proposal lifecycle in `contracts/governance`, covering proposal creation, voting (for and against), finalization, timelock waiting, and execution. All `ProposalStatus` transitions are verified.

Changes:
- Added `test_governance_full_lifecycle` in `contracts/governance/src/tests.rs`
- Used `Ledger::with_mut` to advance past voting delay, voting period, and timelock
- Verified all `ProposalStatus` transitions and `execute_proposal` effect

Testing:
- Run `cargo test -p governance test_governance_full_lifecycle`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #64 Test Governance Quorum Not Reached Scenario

Title: Test That `finalize_proposal` Transitions to `Defeated` When Quorum Is Not Reached

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 2–4 hours

Description:
`GovernanceContract::finalize_proposal` (L363) should transition a proposal to `ProposalStatus::Defeated` when the total votes do not meet `quorum_bps` (minimum % of total supply). Without a test for this, a regression in the quorum calculation could allow under-voted proposals to pass incorrectly. This test is essential for verifying the governance safety guarantees.

Requirements and Context:
- `contracts/governance/src/lib.rs` — `finalize_proposal` (L363), `evaluate` function (L138)
- `contracts/governance/src/types.rs` — `GovConfig.quorum_bps`, `Proposal.total_supply_snapshot`, `ProposalStatus::Defeated`
- Set `quorum_bps = 1000` (10%) and vote with < 10% of total supply
- Use `Ledger::with_mut` to advance past `vote_end` before calling `finalize_proposal`

Acceptance Criteria:
- [ ] Test configures governance with `quorum_bps = 1000` (10% quorum)
- [ ] Votes are cast representing < 10% of the `total_supply_snapshot`
- [ ] `finalize_proposal` returns `ProposalStatus::Defeated`
- [ ] `execute_proposal` on a `Defeated` proposal returns an appropriate error
- [ ] `get_proposal` shows `ProposalStatus::Defeated` after finalization

Branch Suggestion:
test/governance-quorum-not-reached

Commit Message Suggestions:
- `test: add governance quorum not reached test resulting in Defeated proposal`
- `test: verify execute_proposal fails on Defeated proposal status`
- `test: configure 10% quorum and vote below threshold to trigger defeat`

PR Title:
test: Test governance quorum not reached scenario resulting in `Defeated` proposal

PR Description:
Summary:
This PR adds a test verifying that `finalize_proposal` correctly transitions a proposal to `Defeated` when total participation falls below `quorum_bps`. A follow-up assertion confirms that `execute_proposal` is rejected for defeated proposals.

Changes:
- Added `test_governance_quorum_not_reached_defeated` in `contracts/governance/src/tests.rs`
- Configured 10% quorum and voted with < 10% of total supply
- Verified `Defeated` status and `execute_proposal` rejection

Testing:
- Run `cargo test -p governance test_governance_quorum_not_reached_defeated`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #65 Test Governance Proposal Cancellation by Proposer

Title: Test That a Proposer Can Cancel Their Own `Active` Proposal via `cancel_proposal`

Body:

Category: Testing
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–3 hours

Description:
`GovernanceContract::cancel_proposal` (L458) allows the proposer or admin to cancel an `Active` proposal. There is no test verifying this flow: the proposer calls `cancel_proposal`, the proposal transitions to `ProposalStatus::Cancelled`, and subsequent `cast_vote` or `execute_proposal` calls are rejected. This is a basic safety valve that prevents erroneous proposals from proceeding and needs test coverage.

Requirements and Context:
- `contracts/governance/src/lib.rs` — `cancel_proposal` (L458), `create_proposal` (L234)
- `contracts/governance/src/types.rs` — `ProposalStatus::Cancelled`, `ProposalStatus::Active`
- Use `mock_all_auths()` and a proposer `Address` generated via `Address::generate()`
- Verify that `cast_vote` on a cancelled proposal returns an error

Acceptance Criteria:
- [ ] Test creates an `Active` proposal and calls `cancel_proposal` as the proposer
- [ ] `get_proposal` shows `ProposalStatus::Cancelled` after cancellation
- [ ] `cast_vote` on the cancelled proposal returns an appropriate error
- [ ] Test verifies that a non-proposer (non-admin) cannot cancel the proposal
- [ ] Cancellation of an already-cancelled proposal is also tested (should fail gracefully)

Branch Suggestion:
test/governance-proposal-cancellation

Commit Message Suggestions:
- `test: add governance proposal cancellation by proposer test`
- `test: verify Cancelled status and cast_vote rejection after cancellation`
- `test: verify non-proposer cannot cancel another user's proposal`

PR Title:
test: Test governance proposal cancellation by proposer

PR Description:
Summary:
This PR adds tests for `cancel_proposal` in the governance contract, verifying that the proposer can cancel an Active proposal, the status transitions to Cancelled, and subsequent votes are rejected.

Changes:
- Added `test_governance_proposal_cancellation_by_proposer` in `contracts/governance/src/tests.rs`
- Added non-proposer cancellation rejection test
- Verified `cast_vote` failure on cancelled proposal

Testing:
- Run `cargo test -p governance test_governance_proposal_cancellation_by_proposer`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #66 Test That `ContractPaused` Error Is Returned When Paused

Title: Expand Pause Tests to Verify `ContractPaused` Error on All Paused State-Mutating Functions

Body:

Category: Testing
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–4 hours

Description:
`contracts/escrow_contract/src/pause_tests.rs` contains good pause tests, but the coverage should be verified to include every state-mutating function that calls `require_not_paused()`. Functions like `add_milestone` (L1090), `approve_milestone` (L1596), `reject_milestone` (L1674), `release_funds` (L1713), `start_timelock` (L1821), `extend_lock_time` (L1863), and `process_recurring_payments` (L1433) should all be tested for `ContractPaused` (31) behavior.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — all functions calling `require_not_paused` (L704)
- `contracts/escrow_contract/src/pause_tests.rs` — existing pause tests to extend
- `contracts/escrow_contract/src/errors.rs` — `EscrowError::ContractPaused = 31`
- Use `setup_pause_escrow` (L3533) helper to set up a paused contract state

Acceptance Criteria:
- [ ] `reject_milestone` when paused returns `EscrowError::ContractPaused` (31)
- [ ] `release_funds` when paused returns `EscrowError::ContractPaused` (31)
- [ ] `start_timelock` when paused returns `EscrowError::ContractPaused` (31)
- [ ] `process_recurring_payments` when paused returns `EscrowError::ContractPaused` (31)
- [ ] `extend_lock_time` when paused returns `EscrowError::ContractPaused` (31)

Branch Suggestion:
test/pause-coverage-all-mutating-functions

Commit Message Suggestions:
- `test: expand pause tests to cover reject_milestone, release_funds, start_timelock`
- `test: add ContractPaused test for process_recurring_payments and extend_lock_time`
- `test: verify ContractPaused returned by all require_not_paused functions`

PR Title:
test: Expand pause test coverage to all state-mutating functions returning `ContractPaused`

PR Description:
Summary:
This PR extends the pause test suite to cover all state-mutating functions that call `require_not_paused`, ensuring that every such function returns `EscrowError::ContractPaused` (31) when the contract is paused.

Changes:
- Added `test_reject_milestone_blocked_when_paused` in `pause_tests.rs`
- Added `test_release_funds_blocked_when_paused` in `pause_tests.rs`
- Added `test_start_timelock_blocked_when_paused` in `pause_tests.rs`
- Added `test_process_recurring_payments_blocked_when_paused` in `pause_tests.rs`

Testing:
- Run `cargo test -p escrow_contract` and verify all new pause tests pass

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #67 Test Admin Can Unpause and Operations Resume

Title: Test That Admin Unpause Restores Normal Contract Operation After a Pause Cycle

Body:

Category: Testing
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–3 hours

Description:
`test_pause_unpause_cycle_restores_mutations` exists (L3748) but the coverage should be verified to include a complete workflow: pause → attempt state mutation (fails) → unpause → retry same mutation (succeeds). This pattern confirms the pause/unpause mechanism as a true circuit breaker rather than a one-way latch. Specifically, a full mini-lifecycle (create → add → submit → approve) should complete successfully after an unpause.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `pause` (L2043), `unpause` (L2057), `is_paused` (L2071)
- `contracts/escrow_contract/src/pause_tests.rs` — `test_pause_unpause_cycle_restores_mutations` (L3748)
- Extend existing test or add new test covering: pause → `add_milestone` fails → unpause → `add_milestone` succeeds
- Verify `is_paused` returns `true` after pause and `false` after unpause
- Verify `emit_contract_paused` and `emit_contract_unpaused` events

Acceptance Criteria:
- [ ] Test verifies `is_paused() == true` after `pause`
- [ ] `add_milestone` returns `ContractPaused` (31) when contract is paused
- [ ] After `unpause`, `is_paused() == false`
- [ ] `add_milestone` succeeds after `unpause`
- [ ] Both `paused` and `unpaused` events are verified in `env.events().all()`

Branch Suggestion:
test/pause-unpause-operation-restoration

Commit Message Suggestions:
- `test: add pause-unpause cycle test verifying operation restoration`
- `test: verify add_milestone blocked when paused and succeeds after unpause`
- `test: assert paused and unpaused events emitted in correct sequence`

PR Title:
test: Test admin unpause restores normal operation after a pause cycle

PR Description:
Summary:
This PR extends or replaces the existing pause/unpause cycle test with a complete scenario: pause → `add_milestone` fails → unpause → `add_milestone` succeeds. Both events are verified and `is_paused` is checked at each stage.

Changes:
- Updated or added `test_pause_unpause_restores_add_milestone` in `pause_tests.rs`
- Verified `is_paused()` state at each step
- Verified `paused` and `unpaused` event emission

Testing:
- Run `cargo test -p escrow_contract test_pause_unpause_restores_add_milestone`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #68 Test Full Lifecycle: Create → Add Milestones → Submit → Multisig Approve → Release

Title: Add Integration Test for Complete Multisig Escrow Lifecycle from Creation to Final Release

Body:

Category: Testing
Difficulty: Intermediate
Priority: High
Estimated Time: 4–6 hours

Description:
`test_full_escrow_lifecycle` (L3324) exists as a placeholder but the complete multisig variant — create with `buyer_signers`, add 2 milestones, submit both, get weighted multisig approval from two signers, and batch-release — is not tested end to end. This integration test is the most important confidence check for the contract's primary use case and should cover every state transition from creation to `EscrowStatus::Completed`.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_with_buyer_signers` (L869), `add_milestone` (L1090), `submit_milestone` (L1555), `approve_milestone` (L1596), `release_funds` (L1713)
- `contracts/escrow_contract/src/types.rs` — `MultisigConfig`, `EscrowStatus::Completed`
- Use `setup_funded_escrow` helper pattern from existing tests
- Verify all emitted events in sequence: `esc_crt`, `mil_add`, `mil_sub`, `msig_apr`, `mil_apr`, `funds_rel`, `esc_done`

Acceptance Criteria:
- [ ] Test creates an escrow with 2 buyer signers (weights [60, 40], threshold 60)
- [ ] Two milestones are added and both are submitted by the freelancer
- [ ] First signer (weight 60) approval triggers milestone approval (above threshold)
- [ ] `release_funds` is called for both milestones
- [ ] `EscrowStatus::Completed` and `remaining_balance == 0` are verified after final release
- [ ] All expected events are emitted in sequence

Branch Suggestion:
test/full-multisig-lifecycle

Commit Message Suggestions:
- `test: add full multisig escrow lifecycle integration test`
- `test: verify all state transitions from create to Completed in multisig escrow`
- `test: assert event sequence for complete multisig milestone lifecycle`

PR Title:
test: Full lifecycle integration test for multisig escrow from creation to completion

PR Description:
Summary:
This PR adds a comprehensive integration test for the full multisig escrow lifecycle: creation with `buyer_signers`, adding two milestones, freelancer submission, weighted multisig approval, fund release, and final `EscrowStatus::Completed` verification. All expected events are validated in sequence.

Changes:
- Added `test_full_multisig_lifecycle_create_to_complete` integration test
- Used 2-signer configuration (weights [60, 40], threshold 60)
- Verified all emitted events in correct sequence

Testing:
- Run `cargo test -p escrow_contract test_full_multisig_lifecycle_create_to_complete`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #69 Test Full Lifecycle with Dispute: Submit → Dispute → Arbiter Resolve

Title: Add Integration Test for Disputed Escrow: Milestone Submit → Raise Dispute → Arbiter Resolution with Fund Split

Body:

Category: Testing
Difficulty: Intermediate
Priority: High
Estimated Time: 4–6 hours

Description:
`test_dispute_resolution` (L3328) exists as a placeholder. A complete test of the disputed escrow path — submit a milestone, raise a dispute, have the arbiter resolve it with a specific client/freelancer split, and verify token balances — is needed. This is the critical path for escrow conflict resolution and must be fully tested with balance assertions.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `submit_milestone` (L1555), `raise_dispute` (L1905), `resolve_dispute` (L1955)
- `contracts/escrow_contract/src/types.rs` — `EscrowStatus::Disputed`, `EscrowStatus::Completed`
- `contracts/escrow_contract/src/events.rs` — `emit_dispute_raised`, `emit_dispute_resolved`
- Use `setup_funded_escrow` pattern; arbiter must be a distinct generated address
- `resolve_dispute` parameters: `client_amount + freelancer_amount == remaining_balance`

Acceptance Criteria:
- [ ] Test creates an escrow with an arbiter, adds and submits a milestone, then raises a dispute
- [ ] `EscrowStatus::Disputed` is verified after `raise_dispute`
- [ ] Arbiter calls `resolve_dispute` with 60/40 split
- [ ] Client token balance increases by `0.6 × remaining_balance`
- [ ] Freelancer token balance increases by `0.4 × remaining_balance`
- [ ] `dis_rai` and `dis_res` events are emitted with correct payloads

Branch Suggestion:
test/full-dispute-lifecycle

Commit Message Suggestions:
- `test: add full dispute lifecycle test with arbiter resolution and 60/40 split`
- `test: verify client and freelancer token balances after dispute resolution`
- `test: assert dis_rai and dis_res events emitted with correct payloads`

PR Title:
test: Full disputed escrow lifecycle test with arbiter resolution and balance verification

PR Description:
Summary:
This PR implements the `test_dispute_resolution` placeholder with a complete test covering: escrow creation with an arbiter, milestone submission, dispute raising, arbiter resolution with a 60/40 fund split, and token balance verification for both parties.

Changes:
- Implemented `test_dispute_resolution` test in `lib.rs` test module
- Used 60/40 split for `resolve_dispute` and verified client/freelancer balances
- Verified `dis_rai` and `dis_res` events with correct payload values

Testing:
- Run `cargo test -p escrow_contract test_dispute_resolution`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #70 Test `batch_create` in Extensions with Fee Deduction

Title: Test `EscrowExtensions::create_batch` Correctly Deducts Protocol Fee for Each Escrow Created

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`EscrowExtensions::create_batch` (L160 in `contracts/escrow_extensions/src/lib.rs`) creates multiple escrows in one transaction and collects a protocol fee (in basis points) for each. There are no tests in `contracts/escrow_extensions/src/tests.rs` verifying that the fee is correctly deducted from each escrow's `total_amount` and accumulated in the `FeeBalance` storage. A regression in fee calculation could result in undercollection or overcollection silently.

Requirements and Context:
- `contracts/escrow_extensions/src/lib.rs` — `create_batch` (L160), `collect_fee` (L294), `get_fee_balance` (L388)
- `contracts/escrow_extensions/src/types.rs` — `BatchEscrowParams`, `FeeBalance`
- Set `fee_bps = 100` (1%) and create a batch of 3 escrows with known amounts
- Verify `get_fee_balance` shows `3 × (amount × 0.01)` after batch creation
- Use `mock_all_auths()` and the core escrow contract as the target for cross-contract calls

Acceptance Criteria:
- [ ] Test initializes `EscrowExtensions` with `fee_bps = 100`
- [ ] `create_batch` is called with 3 `BatchEscrowParams` entries of 1000 stroops each
- [ ] `get_fee_balance` returns `30` stroops (1% × 3 × 1000) after batch creation
- [ ] Each created escrow has `total_amount = 990` (1000 - 10 fee) when read via the core contract
- [ ] `batch_escrow_count` is verified to equal 3 after the batch

Branch Suggestion:
test/batch-create-fee-deduction

Commit Message Suggestions:
- `test: add batch_create fee deduction test for EscrowExtensions`
- `test: verify get_fee_balance accumulates correctly for 3 batch-created escrows`
- `test: assert each escrow total_amount reduced by protocol fee after batch_create`

PR Title:
test: Test `EscrowExtensions::create_batch` protocol fee deduction and accumulation

PR Description:
Summary:
This PR adds a test for `EscrowExtensions::create_batch` that verifies the protocol fee is correctly deducted from each escrow's amount and accumulated in `FeeBalance` storage. The test uses `fee_bps = 100` (1%) and creates a batch of 3 escrows.

Changes:
- Added `test_batch_create_fee_deduction` in `contracts/escrow_extensions/src/tests.rs`
- Verified `get_fee_balance` accumulation and per-escrow amount deduction
- Verified `batch_escrow_count` equals 3 after batch creation

Testing:
- Run `cargo test -p escrow_extensions test_batch_create_fee_deduction`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #71 Test Fee Distribution to Multiple Recipients with Correct Proportions

Title: Test `EscrowExtensions::distribute_fees` Splits Accumulated Fees Correctly Across Multiple `FeeRecipient` Entries

Body:

Category: Testing
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`distribute_fees` (L325 in `contracts/escrow_extensions/src/lib.rs`) splits the accumulated `FeeBalance` among `FeeRecipient` entries according to their `share_bps` values (which must sum to 10,000). There are no tests verifying that a 70/30 or 50/25/25 split distributes the correct token amounts to each recipient address. Without this test, rounding errors or off-by-one bugs in the distribution math could go undetected.

Requirements and Context:
- `contracts/escrow_extensions/src/lib.rs` — `distribute_fees` (L325), `set_fee_recipients` (L267), `get_fee_balance` (L388)
- `contracts/escrow_extensions/src/types.rs` — `FeeRecipient { address, share_bps }`, `FeeBalance`
- Accumulate 1000 stroops in `FeeBalance` via `collect_fee`
- Set `fee_recipients = [{ addr1, 7000 }, { addr2, 3000 }]` (70/30 split)
- Verify `addr1` receives 700 and `addr2` receives 300 after `distribute_fees`

Acceptance Criteria:
- [ ] Test sets up two `FeeRecipient` entries with `share_bps = [7000, 3000]`
- [ ] Accumulates 1000 stroops in `FeeBalance` via manual or batch fee collection
- [ ] After `distribute_fees`, `addr1` token balance increases by 700 stroops
- [ ] After `distribute_fees`, `addr2` token balance increases by 300 stroops
- [ ] `get_fee_balance` returns 0 after successful distribution

Branch Suggestion:
test/fee-distribution-proportions

Commit Message Suggestions:
- `test: add distribute_fees test verifying 70/30 split across two recipients`
- `test: verify fee_balance zeroed after distribute_fees`
- `test: assert correct stroop amounts received by each fee recipient`

PR Title:
test: Test `distribute_fees` proportional split across multiple `FeeRecipient` entries

PR Description:
Summary:
This PR adds a test for `EscrowExtensions::distribute_fees` verifying that accumulated fees are correctly split according to `share_bps` among multiple recipients. A 70/30 split with 1000 stroops accumulation is used to verify 700 and 300 stroop distributions.

Changes:
- Added `test_distribute_fees_proportional_split` in `contracts/escrow_extensions/src/tests.rs`
- Set up two recipients with 7000/3000 basis point shares
- Verified token balances and `FeeBalance` zeroing after distribution

Testing:
- Run `cargo test -p escrow_extensions test_distribute_fees_proportional_split`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #72 Test `emergency_withdraw_fees` Transfers to Specified Address

Title: Test That `emergency_withdraw_fees` Moves Entire `FeeBalance` to the Specified Recipient Address

Body:

Category: Testing
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–3 hours

Description:
`emergency_withdraw_fees` (L359 in `contracts/escrow_extensions/src/lib.rs`) allows the admin to withdraw all accumulated fees to a specified address. This function bypasses the normal `distribute_fees` flow and is intended for emergency use. Without a test, regressions in this critical admin function (e.g. wrong recipient, partial transfer, missing auth check) could silently lose accumulated fees.

Requirements and Context:
- `contracts/escrow_extensions/src/lib.rs` — `emergency_withdraw_fees` (L359), `get_fee_balance` (L388)
- Must test that only the admin can call `emergency_withdraw_fees` (Unauthorized for others)
- Accumulate fees first via `collect_fee` (L294) or by direct storage manipulation in tests
- Verify recipient token balance increases by the full `FeeBalance` amount
- Verify `get_fee_balance` returns 0 after the emergency withdrawal

Acceptance Criteria:
- [ ] Test accumulates 500 stroops in `FeeBalance` and calls `emergency_withdraw_fees`
- [ ] The specified recipient receives exactly 500 stroops
- [ ] `get_fee_balance` returns 0 after the withdrawal
- [ ] Non-admin call returns `EscrowError::Unauthorized` (3)
- [ ] `emergency_withdraw_fees` to a zero-value `FeeBalance` is handled gracefully

Branch Suggestion:
test/emergency-withdraw-fees

Commit Message Suggestions:
- `test: add emergency_withdraw_fees test verifying full balance transfer to recipient`
- `test: verify Unauthorized error when non-admin calls emergency_withdraw_fees`
- `test: assert fee_balance zeroed after emergency withdrawal`

PR Title:
test: Test `emergency_withdraw_fees` full balance transfer and admin auth enforcement

PR Description:
Summary:
This PR adds tests for `emergency_withdraw_fees` verifying that the full accumulated `FeeBalance` is transferred to the specified recipient, `FeeBalance` is zeroed after withdrawal, and non-admin calls are rejected with `Unauthorized`.

Changes:
- Added `test_emergency_withdraw_fees_full_transfer` in `contracts/escrow_extensions/src/tests.rs`
- Added `test_emergency_withdraw_fees_unauthorized` test
- Verified `get_fee_balance == 0` post-withdrawal

Testing:
- Run `cargo test -p escrow_extensions test_emergency_withdraw_fees_full_transfer`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #73 Test `get_escrow_meta` View Returns Correct Values After State Changes

Title: Test That `get_escrow_meta` Reflects Correct `EscrowMeta` Field Values After Each State-Changing Operation

Body:

Category: Testing
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–3 hours

Description:
Once `get_escrow_meta` is implemented (per issue #19), tests must verify that it returns accurately updated values after each major state change: after `add_milestone` (`milestone_count` increases), after `submit_milestone` (`submitted_count` increases), after `approve_milestone` (`approved_count` increases), and after `release_funds` (`remaining_balance` decreases). Without these snapshot tests, the `EscrowMeta` caching logic could desync from actual escrow state.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `get_escrow_meta` (to be added per #19), `EscrowMeta` struct
- Requires issue #19 (`get_escrow_meta`) to be merged first, or can be written to use `get_escrow` for now
- Test should snapshot `EscrowMeta` after each operation and assert changed fields
- Use `assert_eq!` on specific fields rather than the entire struct to avoid brittleness

Acceptance Criteria:
- [ ] After `add_milestone`, `meta.milestone_count` equals previous count + 1
- [ ] After `submit_milestone`, `meta.submitted_count` equals previous + 1
- [ ] After `approve_milestone`, `meta.approved_count` equals previous + 1
- [ ] After `release_funds`, `meta.remaining_balance` equals previous - milestone amount
- [ ] After `cancel_escrow`, `meta.status == EscrowStatus::Cancelled`

Branch Suggestion:
test/get-escrow-meta-state-snapshots

Commit Message Suggestions:
- `test: add get_escrow_meta state snapshot tests after each lifecycle operation`
- `test: verify milestone_count, submitted_count, and approved_count increments`
- `test: assert remaining_balance decreases correctly after release_funds`

PR Title:
test: Verify `get_escrow_meta` returns accurate field values after each state-changing operation

PR Description:
Summary:
This PR adds snapshot tests for `get_escrow_meta`, verifying that each state-changing operation (`add_milestone`, `submit_milestone`, `approve_milestone`, `release_funds`, `cancel_escrow`) correctly updates the relevant `EscrowMeta` fields.

Changes:
- Added `test_get_escrow_meta_state_snapshots` with field assertions after each lifecycle operation
- Verified `milestone_count`, `submitted_count`, `approved_count`, `remaining_balance`, and `status` fields

Testing:
- Run `cargo test -p escrow_contract test_get_escrow_meta_state_snapshots`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #74 Add Two-Step Admin Transfer with Pending Admin Confirmation

Title: Implement Two-Step Admin Transfer: `propose_admin(new_admin)` + `accept_admin()` Pattern

Body:

Category: Security
Difficulty: Intermediate
Priority: High
Estimated Time: 4–6 hours

Description:
The current admin role in `contracts/escrow_contract/src/lib.rs` is set during `initialize` (L723) via `ContractStorage::initialize` (L187) and cannot be changed without a contract upgrade. Adding a two-step admin transfer pattern — `propose_admin` (callable by current admin) followed by `accept_admin` (callable only by the proposed new admin) — prevents accidental admin lockout by requiring the new admin to actively confirm receipt of the role before the transfer completes.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `ContractStorage::initialize` (L187), `require_admin` (L208)
- `contracts/escrow_contract/src/types.rs` — `DataKey` enum — add `PendingAdmin` variant
- New functions: `pub fn propose_admin(env, caller, new_admin) -> Result<(), EscrowError>` and `pub fn accept_admin(env, caller) -> Result<(), EscrowError>`
- `propose_admin` requires current admin auth and stores `new_admin` in `DataKey::PendingAdmin`
- `accept_admin` requires `new_admin.require_auth()` and swaps `DataKey::Admin` → `new_admin`, clears `DataKey::PendingAdmin`
- Must emit `emit_admin_changed` (from issue #37) on successful `accept_admin`

Acceptance Criteria:
- [ ] `DataKey::PendingAdmin` is added to `DataKey` enum in `types.rs`
- [ ] `propose_admin` stores the new admin as `PendingAdmin` and requires current admin auth
- [ ] `accept_admin` requires the pending admin's auth and completes the transfer
- [ ] `get_admin` returns the new admin after `accept_admin`
- [ ] `DataKey::PendingAdmin` is cleared after `accept_admin`
- [ ] Unit tests cover: full two-step transfer, wrong acceptor rejected, transfer without prior proposal

Branch Suggestion:
feat/two-step-admin-transfer

Commit Message Suggestions:
- `feat: add two-step admin transfer with propose_admin and accept_admin`
- `feat: add DataKey::PendingAdmin for pending admin transfer tracking`
- `test: add tests for two-step admin transfer, wrong acceptor, and no-proposal cases`

PR Title:
feat: Implement two-step admin transfer (`propose_admin` + `accept_admin`) to prevent lockout

PR Description:
Summary:
This PR implements a two-step admin transfer pattern in `EscrowContract`. The current admin proposes a new admin via `propose_admin`, and the new admin must call `accept_admin` to complete the transfer. This prevents accidental admin lockout by requiring active confirmation from the new admin.

Changes:
- Added `PendingAdmin` to `DataKey` enum in `types.rs`
- Added `pub fn propose_admin` and `pub fn accept_admin` to `EscrowContract`
- Integrated `emit_admin_changed` event on successful transfer
- Added unit tests for successful transfer, wrong acceptor, and missing proposal

Testing:
- Run `cargo test -p escrow_contract test_two_step_admin_transfer`
- Verify `get_admin` returns new admin only after `accept_admin` is called by the correct address

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #75 Add Minimum Escrow Amount Constant to Prevent Dust Attacks

Title: Add `MIN_ESCROW_AMOUNT` Constant and Validation in `create_escrow_internal` to Reject Dust Escrows

Body:

Category: Security
Difficulty: Beginner
Priority: Medium
Estimated Time: 1–2 hours

Description:
There is no minimum `total_amount` check in `create_escrow_internal` (L895). An adversary could create thousands of escrows with `total_amount = 1` stroop to bloat the indexer, consume storage entries, and waste the admin's time managing dust escrows. Adding a `MIN_ESCROW_AMOUNT` constant (e.g. 10,000,000 stroops = 1 XLM) prevents this class of dust attack while remaining accessible to legitimate small escrows.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895), constants at L80–91
- Add `pub const MIN_ESCROW_AMOUNT: i128 = 10_000_000i128;` (1 XLM in stroops)
- Validate `args.total_amount >= MIN_ESCROW_AMOUNT` in `create_escrow_internal`
- Return `EscrowError::InvalidEscrowAmount` (19) for amounts below the minimum
- Must apply to `create_recurring_escrow` (L984) `payment_amount` per period as well
- `contracts/escrow_contract/src/errors.rs` — `EscrowError::InvalidEscrowAmount = 19`

Acceptance Criteria:
- [ ] `pub const MIN_ESCROW_AMOUNT: i128 = 10_000_000i128;` is defined with a `///` doc comment
- [ ] `create_escrow_internal` rejects `total_amount < MIN_ESCROW_AMOUNT` with `InvalidEscrowAmount` (19)
- [ ] `create_recurring_escrow` rejects `payment_amount < MIN_ESCROW_AMOUNT`
- [ ] A unit test verifies rejection at `MIN_ESCROW_AMOUNT - 1` and acceptance at `MIN_ESCROW_AMOUNT`
- [ ] Existing tests with valid amounts are not broken

Branch Suggestion:
fix/min-escrow-amount-dust-protection

Commit Message Suggestions:
- `fix: add MIN_ESCROW_AMOUNT constant and validation to prevent dust escrow attacks`
- `fix: apply minimum amount check to create_recurring_escrow payment_amount`
- `test: add boundary tests for MIN_ESCROW_AMOUNT validation`

PR Title:
fix: Add `MIN_ESCROW_AMOUNT` constant to prevent dust attack escrow creation

PR Description:
Summary:
This PR adds a `MIN_ESCROW_AMOUNT` constant (1 XLM = 10,000,000 stroops) and validation in `create_escrow_internal` and `create_recurring_escrow` to reject dust escrow creation. This prevents storage bloat and indexer flooding via micro-amount escrows.

Changes:
- Added `pub const MIN_ESCROW_AMOUNT: i128 = 10_000_000i128;` to `lib.rs`
- Added minimum amount checks in `create_escrow_internal` and `create_recurring_escrow`
- Added boundary unit tests for the minimum amount

Testing:
- Run `cargo test -p escrow_contract test_create_escrow_min_amount`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #76 Add Maximum Escrow Amount Constant to Bound Protocol Risk

Title: Add `MAX_ESCROW_AMOUNT` Constant and Validation in `create_escrow_internal` to Cap `total_amount`

Body:

Category: Security
Difficulty: Beginner
Priority: Medium
Estimated Time: 1–2 hours

Description:
Complementary to the dust protection in issue #75, there is no upper bound on `total_amount` in `create_escrow_internal` (L895). While Rust's `[profile.release]` uses `overflow-checks = true`, an absurdly large `total_amount` near `i128::MAX` could cause arithmetic overflows in downstream calculations like `allocated_amount + milestone.amount` or `remaining_balance - release_amount` that use intermediate values. A domain-meaningful cap reduces the attack surface.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895), constants at L80–91
- Add `pub const MAX_ESCROW_AMOUNT: i128 = 100_000_000_000_000_000i128;` (10 billion XLM)
- Validate `args.total_amount <= MAX_ESCROW_AMOUNT` and return `EscrowError::InvalidEscrowAmount` (19)
- Must also apply to `create_recurring_escrow` total funding calculation
- Note: this issue complements issue #28 which may overlap; resolve by using the same constant

Acceptance Criteria:
- [ ] `pub const MAX_ESCROW_AMOUNT: i128` is defined with a `///` doc comment explaining the rationale
- [ ] `create_escrow_internal` rejects `total_amount > MAX_ESCROW_AMOUNT`
- [ ] Unit test verifies rejection at `MAX_ESCROW_AMOUNT + 1` and acceptance at `MAX_ESCROW_AMOUNT`
- [ ] No existing tests with valid amounts are broken
- [ ] The constant is exported as `pub` for use by integrators

Branch Suggestion:
fix/max-escrow-amount-cap-security

Commit Message Suggestions:
- `fix: add MAX_ESCROW_AMOUNT cap to bound protocol risk from oversized escrows`
- `test: add boundary test for MAX_ESCROW_AMOUNT in create_escrow_internal`
- `docs: explain MAX_ESCROW_AMOUNT rationale in rustdoc comment`

PR Title:
fix: Add `MAX_ESCROW_AMOUNT` constant to cap `total_amount` and bound protocol risk

PR Description:
Summary:
This PR adds a `MAX_ESCROW_AMOUNT` constant and corresponding validation in `create_escrow_internal` to prevent escrow creation with absurdly large amounts that could cause arithmetic edge cases. The cap is set at 10 billion XLM (100 quadrillion stroops) to allow legitimate large escrows while bounding risk.

Changes:
- Added `pub const MAX_ESCROW_AMOUNT: i128 = 100_000_000_000_000_000i128;`
- Added `total_amount <= MAX_ESCROW_AMOUNT` check in `create_escrow_internal`
- Added boundary unit tests for the maximum amount

Testing:
- Run `cargo test -p escrow_contract test_create_escrow_max_amount`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #77 Add Rate Limiting on `slash_user` Invocations Per Escrow

Title: Add Per-Escrow Rate Limit to Prevent Repeated `finalize_slash` Calls After Dispute Resolution

Body:

Category: Security
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
The `apply_slash` function (L2662) in `contracts/escrow_contract/src/lib.rs` can be triggered multiple times for the same escrow through different code paths. If there is no guard preventing a second slash on the same `slashed_user` within the same escrow after the first slash is finalized, a malicious caller could potentially drain a user's escrow allocation through repeated slash applications. A per-escrow slash-already-applied guard in `SlashRecord` would prevent this.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `apply_slash` (L2662), `finalize_slash` (L2441)
- `contracts/escrow_contract/src/types.rs` — `SlashRecord` (L354–375) — check if `SlashRecord` already exists before applying another
- Add a check in `apply_slash`: if `ContractStorage::load_slash_record(env, escrow_id).is_some()`, return `EscrowError::InvalidSlashAmount` (41) or a new `SlashAlreadyApplied` error
- `contracts/escrow_contract/src/errors.rs` — add `SlashAlreadyApplied` variant if needed

Acceptance Criteria:
- [ ] `apply_slash` checks for an existing `SlashRecord` before creating a new one
- [ ] Returns an error (existing or new) if a slash record already exists for the escrow
- [ ] `finalize_slash` or `resolve_slash_dispute` removes the `SlashRecord` on completion
- [ ] Unit test verifies that a second slash attempt on the same escrow is rejected
- [ ] Existing slash tests pass without modification

Branch Suggestion:
fix/slash-rate-limit-per-escrow

Commit Message Suggestions:
- `fix: add per-escrow rate limit to prevent repeated slash applications`
- `fix: check existing SlashRecord before applying new slash in apply_slash`
- `test: add test verifying second slash attempt is rejected for same escrow`

PR Title:
fix: Add per-escrow rate limit to prevent repeated `apply_slash` invocations

PR Description:
Summary:
This PR adds a guard in `apply_slash` that checks for an existing `SlashRecord` before creating a new one. This prevents repeated slash applications to the same escrow that could drain a user's allocation through multiple slash invocations.

Changes:
- Added existing `SlashRecord` check at the start of `apply_slash`
- Added appropriate error return for duplicate slash attempt
- Added unit test verifying second slash attempt rejection

Testing:
- Run `cargo test -p escrow_contract test_slash_rate_limit_per_escrow`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #78 Add Validation Preventing Unfinalized Bridge Tokens from Being Used in Escrows

Title: Validate Bridge Token Finalization Status in `create_escrow_internal` Before Accepting Bridge Tokens

Body:

Category: Security
Difficulty: Intermediate
Priority: High
Estimated Time: 3–5 hours

Description:
`validate_escrow_token` in `contracts/escrow_contract/src/bridge.rs` checks only that a registered wrapped token has `is_approved = true`. It does not check whether there is an active `BridgeConfirmation` with `is_finalized = true` for the bridge transfer that funded the escrow. An attacker could register an approved token and create escrows before the bridge transfer is finalized, double-spending by initiating the transfer and escrow simultaneously.

Requirements and Context:
- `contracts/escrow_contract/src/bridge.rs` — `validate_escrow_token`, `require_bridge_finalized`, `BridgeConfirmation.is_finalized`
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895)
- `contracts/escrow_contract/src/errors.rs` — `EscrowError::BridgeError = 54`
- `create_escrow_internal` should accept an optional `transfer_id: Option<String>` parameter
- If `transfer_id` is provided and the token is a wrapped asset, call `require_bridge_finalized(env, transfer_id)`
- If `transfer_id` is `None` for a wrapped token, return `EscrowError::BridgeError`

Acceptance Criteria:
- [ ] `create_escrow_internal` checks bridge finalization when the escrow token is a registered wrapped token
- [ ] An unfinalized bridge transfer (`is_finalized = false`) causes `BridgeError` (54) on escrow creation
- [ ] A native/non-wrapped token bypasses the bridge finalization check
- [ ] Unit tests cover: finalized bridge token (success), unfinalized (fail), native token (success)
- [ ] The `CreateEscrowArgs` struct gains an optional `bridge_transfer_id: Option<String>` field if needed

Branch Suggestion:
fix/validate-bridge-finalization-on-create

Commit Message Suggestions:
- `fix: validate bridge token finalization before accepting in create_escrow_internal`
- `test: add tests for finalized, unfinalized, and native token create_escrow scenarios`
- `fix: return BridgeError for unfinalized bridge transfer in create_escrow_internal`

PR Title:
fix: Validate bridge token finalization status in `create_escrow_internal`

PR Description:
Summary:
This PR adds bridge finalization validation to `create_escrow_internal`: when the escrow token is a registered wrapped asset, the caller must provide a `bridge_transfer_id` that has reached `MIN_BRIDGE_CONFIRMATIONS` (is_finalized = true). This prevents double-spend attacks via unfinalized bridge transfers.

Changes:
- Added optional `bridge_transfer_id` to `CreateEscrowArgs` struct
- Added finalization check in `create_escrow_internal` for wrapped token escrows
- Added unit tests for all three token scenarios

Testing:
- Run `cargo test -p escrow_contract test_create_escrow_bridge_finalization_required`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #79 Audit `settle_rent_for_access` for Potential Rent Manipulation

Title: Audit and Harden `settle_rent_for_access` Against Rent Manipulation via Repeated View Calls

Body:

Category: Security
Difficulty: Advanced
Priority: Medium
Estimated Time: 4–8 hours

Description:
`settle_rent_for_access` (L599 in `contracts/escrow_contract/src/lib.rs`) is called by read functions like `load_escrow_meta_with_rent` (L254) to lazily collect rent on every access. If this function can be triggered by any caller through a view function (which costs no auth), an adversary could make thousands of view calls to an escrow to drain the `rent_balance` faster than the normal `collect_rent_due` schedule. The audit should identify whether view-call-triggered rent collection could be abused.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `settle_rent_for_access` (L599), `load_escrow_meta_with_rent` (L254), `collect_rent_due` (L552)
- `contracts/escrow_contract/src/lib.rs` — `rent_due_per_period` (L494), `active_storage_entries` (L467)
- Audit: does `settle_rent_for_access` charge rent for each call or only once per period?
- Review whether `last_rent_collection_at` prevents double-charging within the same period
- Document findings and propose a fix if a manipulation vector exists

Acceptance Criteria:
- [ ] A written audit finding is added as a comment in `settle_rent_for_access` documenting the analysis
- [ ] If a manipulation vector is found, a fix is implemented preventing multiple charges per period
- [ ] If safe, a test is added verifying that repeated `get_escrow` calls do not increase rent depletion
- [ ] `last_rent_collection_at` update logic is reviewed for period-boundary correctness
- [ ] The audit finding is summarized in a new `SECURITY.md` section

Branch Suggestion:
fix/audit-settle-rent-for-access

Commit Message Suggestions:
- `security: audit settle_rent_for_access for rent manipulation via view calls`
- `fix: prevent multiple rent charges per period from repeated view call access`
- `docs: add SECURITY.md section documenting settle_rent_for_access audit`

PR Title:
security: Audit and harden `settle_rent_for_access` against rent manipulation via view calls

PR Description:
Summary:
This PR audits `settle_rent_for_access` for potential rent manipulation via repeated view function calls and either documents its safety or implements a fix if a manipulation vector is identified. Findings are documented in a `SECURITY.md` section.

Changes:
- Added audit comment to `settle_rent_for_access` documenting the analysis
- Implemented period-boundary guard if manipulation vector found
- Added test verifying repeated `get_escrow` calls do not over-deplete `rent_balance`

Testing:
- Run `cargo test -p escrow_contract test_settle_rent_for_access_no_repeated_charge`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #80 Review `collect_rent_due` for Integer Overflow with Extreme Timestamps

Title: Review and Add Overflow Guards to `collect_rent_due` Timestamp Arithmetic

Body:

Category: Security
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`collect_rent_due` (L552 in `contracts/escrow_contract/src/lib.rs`) computes `periods_elapsed = (now - last_collection) / RENT_PERIOD_SECONDS`, where all values are `u64`. While `u64` subtraction cannot overflow (it would underflow instead), a scenario where `now < last_rent_collection_at` — caused by a ledger timestamp inconsistency — could cause a underflow panic in debug mode or wrap in release mode despite `overflow-checks = true`. The `saturating_sub` pattern should be audited and enforced.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `collect_rent_due` (L552–597), `RENT_PERIOD_SECONDS` (L88)
- `EscrowMeta.last_rent_collection_at: u64` (L180)
- Review all arithmetic in `collect_rent_due` for potential underflow/overflow
- Replace any `now - last_collection` with `now.saturating_sub(last_collection)`
- Replace any `periods * rate` multiplication with `.checked_mul` returning `EscrowError` on overflow
- Review `rent_due_per_period` (L494) and `reserve_for_entries` (L499) for similar issues

Acceptance Criteria:
- [ ] All `u64` subtractions in `collect_rent_due` use `saturating_sub`
- [ ] All `i128` multiplications in rent calculation use `checked_mul` with error return
- [ ] A unit test with extreme timestamp values (near `u64::MAX`) verifies no panic
- [ ] A comment explaining the arithmetic safety approach is added to `collect_rent_due`
- [ ] `rent_due_per_period` and `reserve_for_entries` are similarly audited and hardened

Branch Suggestion:
fix/collect-rent-due-overflow-guards

Commit Message Suggestions:
- `fix: use saturating_sub for timestamp arithmetic in collect_rent_due`
- `fix: use checked_mul for rent amount calculations to prevent overflow`
- `test: add extreme timestamp test to verify collect_rent_due does not panic`

PR Title:
fix: Add overflow/underflow guards to `collect_rent_due` timestamp arithmetic

PR Description:
Summary:
This PR audits and hardens the arithmetic in `collect_rent_due`, replacing bare subtraction with `saturating_sub` and bare multiplication with `checked_mul`. This prevents potential underflow panics under unexpected ledger timestamp conditions.

Changes:
- Replaced `now - last_collection` with `now.saturating_sub(last_collection)` in `collect_rent_due`
- Replaced rent multiplication with `checked_mul` and appropriate error propagation
- Added arithmetic safety comment and extreme-value unit test

Testing:
- Run `cargo test -p escrow_contract test_collect_rent_due_extreme_timestamps`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #81 Add Guard Against `create_escrow` with Unapproved Bridge Token

Title: Add `validate_escrow_token` Call in `create_escrow_internal` to Reject Unapproved Wrapped Tokens

Body:

Category: Security
Difficulty: Beginner
Priority: High
Estimated Time: 1–3 hours

Description:
`validate_escrow_token` exists in `contracts/escrow_contract/src/bridge.rs` and correctly returns `EscrowError::BridgeError` (54) if a registered wrapped token has `is_approved = false`. However, it is not called from `create_escrow_internal` (L895). This means a registered-but-unapproved wrapped token can be used as an escrow token, bypassing the approval gate. The fix is simple: call `validate_escrow_token(&env, &args.token)?` in `create_escrow_internal`.

Requirements and Context:
- `contracts/escrow_contract/src/bridge.rs` — `validate_escrow_token` function
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895)
- `contracts/escrow_contract/src/errors.rs` — `EscrowError::BridgeError = 54`
- Add `bridge::validate_escrow_token(&env, &args.token)?;` near the start of `create_escrow_internal`
- Must not break escrows using native (non-registered) Stellar tokens

Acceptance Criteria:
- [ ] `validate_escrow_token` is called in `create_escrow_internal` for the escrow token
- [ ] A registered wrapped token with `is_approved = false` causes `BridgeError` (54) on `create_escrow`
- [ ] A registered wrapped token with `is_approved = true` is accepted
- [ ] A native (non-registered) Stellar token is still accepted without error
- [ ] A unit test covers all three cases

Branch Suggestion:
fix/validate-escrow-token-on-create

Commit Message Suggestions:
- `fix: call validate_escrow_token in create_escrow_internal to block unapproved wrapped tokens`
- `test: add tests for approved, unapproved, and native token in create_escrow`
- `fix: ensure native tokens bypass wrapped token approval check`

PR Title:
fix: Add `validate_escrow_token` guard in `create_escrow_internal` to reject unapproved bridge tokens

PR Description:
Summary:
This PR adds a `validate_escrow_token` call at the start of `create_escrow_internal` to ensure that registered-but-unapproved wrapped tokens cannot be used as escrow tokens. Native Stellar tokens bypass this check and are unaffected.

Changes:
- Added `bridge::validate_escrow_token(&env, &args.token)?` to `create_escrow_internal`
- Added unit tests for approved wrapped, unapproved wrapped, and native token scenarios

Testing:
- Run `cargo test -p escrow_contract test_create_escrow_token_validation`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #82 Add Input Validation for `meta_transaction` Nonce (Monotonically Increasing)

Title: Enforce Monotonically Increasing Nonce in `MetaTransaction` Dispatch to Prevent Replay Attacks

Body:

Category: Security
Difficulty: Intermediate
Priority: High
Estimated Time: 3–5 hours

Description:
`MetaTransaction.nonce: u64` (L392 in `types.rs`) is intended to prevent replay attacks, but the enforcement mechanism must be verified: the contract must store the last used nonce per signer and reject any `MetaTransaction` where `nonce <= stored_nonce`. If nonces are not monotonically enforced (e.g. only checking exact equality), a gap attack could allow replay of a skipped nonce value. This issue ensures strictly monotonically increasing nonce enforcement.

Requirements and Context:
- `contracts/escrow_contract/src/types.rs` — `MetaTransaction.nonce: u64` (L392)
- `contracts/escrow_contract/src/types.rs` — `DataKey` enum — add `MetaTxNonce(Address)` variant to track per-signer nonces
- The nonce check must enforce `nonce == stored_nonce + 1` (strictly sequential) or `nonce > stored_nonce` (gap-allowing)
- Document the chosen strategy with a `///` comment explaining the security tradeoff
- Must return `EscrowError::Unauthorized` (3) or a new `InvalidNonce` error for nonce violations

Acceptance Criteria:
- [ ] `DataKey::MetaTxNonce(Address)` is added to `DataKey` enum for per-signer nonce tracking
- [ ] Nonce validation enforces `nonce > last_nonce` before executing any `MetaTransaction`
- [ ] After execution, the stored nonce is updated to the used value
- [ ] A unit test verifies: nonce 0 succeeds, nonce 1 succeeds, nonce 0 again rejected (replay), nonce 0 skipped then used rejected
- [ ] The nonce strategy is documented in a `///` comment on `MetaTransaction.nonce`

Branch Suggestion:
fix/meta-transaction-nonce-enforcement

Commit Message Suggestions:
- `fix: enforce monotonically increasing nonce for MetaTransaction replay protection`
- `feat: add DataKey::MetaTxNonce for per-signer nonce tracking`
- `test: add nonce replay and gap attack tests for meta_transaction dispatch`

PR Title:
fix: Enforce monotonically increasing nonce in `MetaTransaction` dispatch

PR Description:
Summary:
This PR adds per-signer nonce tracking via `DataKey::MetaTxNonce(Address)` and enforces strictly monotonically increasing nonces in the `MetaTransaction` dispatch path. Replay attacks (same nonce reuse) and gap attacks (non-sequential nonces) are both rejected.

Changes:
- Added `MetaTxNonce(Address)` to `DataKey` enum in `types.rs`
- Added nonce validation and update logic in `MetaTransaction` dispatch
- Added unit tests for sequential nonces, replay rejection, and gap rejection

Testing:
- Run `cargo test -p escrow_contract test_meta_transaction_nonce_enforcement`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #83 Add Maximum `buyer_signers` Weight Sum Validation

Title: Validate That `MultisigConfig` Weight Sum Does Not Exceed Threshold to Prevent Threshold Bypass

Body:

Category: Security
Difficulty: Intermediate
Priority: High
Estimated Time: 2–4 hours

Description:
`create_escrow_with_buyer_signers` (L869) accepts a `MultisigConfig` with arbitrary `weights` and `threshold` values. If the `threshold` is set to 0 or if the sum of a subset of weights can trivially exceed the threshold from the very first vote, the multisig provides no real security. Specifically, a `threshold = 0` would allow any signer to approve a milestone unilaterally. Input validation must enforce: `threshold >= 1`, `sum(weights) >= threshold`, and no single `weight > threshold` (to require at least two signers).

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_with_buyer_signers` (L869), `create_escrow_internal` (L895)
- `contracts/escrow_contract/src/types.rs` — `MultisigConfig { approvers, weights, threshold }` (L133)
- Add validation: `threshold >= 1`, `weights.iter().sum() >= threshold`, `approvers.len() == weights.len()`
- Add validation: no single weight equals or exceeds `threshold` (require genuine multi-party approval)
- Return `EscrowError::InvalidEscrowAmount` (19) or a new `InvalidMultisigConfig` variant

Acceptance Criteria:
- [ ] `threshold < 1` is rejected
- [ ] `sum(weights) < threshold` is rejected (threshold unreachable)
- [ ] A single weight `>= threshold` is rejected (single signer can approve alone — not multisig)
- [ ] `approvers.len() != weights.len()` is rejected
- [ ] Unit tests cover all four invalid configurations and a valid 2-of-3 configuration
- [ ] Valid configurations with existing tests still pass

Branch Suggestion:
fix/multisig-config-weight-validation

Commit Message Suggestions:
- `fix: add MultisigConfig weight sum and threshold validation`
- `fix: reject threshold=0 and single-weight-exceeds-threshold configurations`
- `test: add validation tests for all invalid MultisigConfig edge cases`

PR Title:
fix: Add `MultisigConfig` weight sum validation to prevent threshold bypass

PR Description:
Summary:
This PR adds comprehensive validation for `MultisigConfig` in `create_escrow_with_buyer_signers`, rejecting configurations where `threshold = 0`, the sum of weights is less than the threshold, or a single signer's weight alone meets the threshold (defeating the multi-party requirement).

Changes:
- Added `threshold >= 1` check in `create_escrow_internal`
- Added `sum(weights) >= threshold` check
- Added single-weight-exceeds-threshold check
- Added `approvers.len() == weights.len()` check
- Added unit tests for all invalid configurations

Testing:
- Run `cargo test -p escrow_contract test_multisig_config_validation`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #84 Audit `expire_escrow` Refund Calculation for Edge Cases

Title: Audit `expire_escrow` Refund Logic for Edge Cases: Zero Balance, Active Disputes, and Partial Milestone Releases

Body:

Category: Security
Difficulty: Advanced
Priority: Medium
Estimated Time: 4–8 hours

Description:
`expire_escrow` (L621 in `contracts/escrow_contract/src/lib.rs`) refunds `remaining_balance` to the client when rent is depleted. Edge cases that must be audited: (1) what happens when `remaining_balance == 0` (no token transfer should occur), (2) what happens when the escrow is in `EscrowStatus::Disputed` at the time of expiry (arbiter may still need to resolve), (3) what happens when some milestones are in `MS_APPROVED` but not yet released. Each case needs documented behavior and potentially a guard.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `expire_escrow` (L621–649), `rent_has_expired` (L503)
- `contracts/escrow_contract/src/types.rs` — `EscrowStatus::Disputed`, `MS_APPROVED`, `MS_RELEASED`
- Document the intended behavior for each edge case in a comment block above `expire_escrow`
- Add guards for: skip token transfer if `remaining_balance == 0`, warn/event if disputed escrow expires
- Consider whether a disputed escrow should be prevented from expiring without arbiter resolution

Acceptance Criteria:
- [ ] `expire_escrow` correctly handles `remaining_balance == 0` without attempting token transfer
- [ ] A `///` comment block above `expire_escrow` documents behavior for Disputed and partial-release states
- [ ] A test verifies zero-balance escrow expiry produces no token transfer errors
- [ ] A test verifies disputed escrow expiry behavior (document the chosen policy clearly)
- [ ] An audit finding summary is added to `SECURITY.md`

Branch Suggestion:
fix/audit-expire-escrow-edge-cases

Commit Message Suggestions:
- `fix: handle zero remaining_balance in expire_escrow without token transfer`
- `docs: document expire_escrow behavior for Disputed and partial-release edge cases`
- `test: add edge case tests for expire_escrow with zero balance and disputed status`

PR Title:
fix: Audit and harden `expire_escrow` refund logic for zero-balance and disputed edge cases

PR Description:
Summary:
This PR audits `expire_escrow` for three edge cases — zero `remaining_balance`, `EscrowStatus::Disputed`, and partially released milestones — documents the intended behavior, and adds guards and tests for each case.

Changes:
- Added guard in `expire_escrow` for `remaining_balance == 0` (skip token transfer)
- Added `///` documentation block covering all edge case behaviors
- Added unit tests for zero-balance and disputed escrow expiry
- Added audit finding summary to `SECURITY.md`

Testing:
- Run `cargo test -p escrow_contract test_expire_escrow_zero_balance`
- Run `cargo test -p escrow_contract test_expire_escrow_disputed_state`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #85 Add Timelock on Admin Role Changes

Title: Add `ADMIN_CHANGE_DELAY_SECONDS` Timelock Between `propose_admin` and `accept_admin` Execution

Body:

Category: Security
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
The two-step admin transfer from issue #74 (`propose_admin` + `accept_admin`) should also enforce a minimum delay between proposal and acceptance. Without a delay, a compromised admin key could immediately transfer admin rights to an attacker address. A `ADMIN_CHANGE_DELAY_SECONDS` constant (e.g. 24 hours = 86,400 seconds) gives the protocol team time to detect and respond to unauthorized admin transfer proposals before they complete.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `propose_admin`, `accept_admin` (from issue #74)
- `contracts/escrow_contract/src/types.rs` — `DataKey::PendingAdmin` — extend to include `proposed_at: u64` timestamp
- Add `const ADMIN_CHANGE_DELAY_SECONDS: u64 = 86_400;` to `lib.rs` constants
- `accept_admin` must check `env.ledger().timestamp() >= pending.proposed_at + ADMIN_CHANGE_DELAY_SECONDS`
- Return `EscrowError::TimelockNotExpired` (53) if called before delay elapses
- Requires issue #74 to be merged first

Acceptance Criteria:
- [ ] `ADMIN_CHANGE_DELAY_SECONDS = 86_400` is defined with a `///` comment
- [ ] `accept_admin` returns `TimelockNotExpired` (53) before the delay elapses
- [ ] `accept_admin` succeeds after `ADMIN_CHANGE_DELAY_SECONDS` have passed
- [ ] Unit test uses `Ledger::with_mut` to test both before and after delay
- [ ] The delay is documented in the admin transfer flow guide

Branch Suggestion:
feat/admin-change-timelock

Commit Message Suggestions:
- `feat: add ADMIN_CHANGE_DELAY_SECONDS timelock to admin role transfer`
- `fix: enforce 24-hour delay between propose_admin and accept_admin`
- `test: add tests for admin change delay enforcement via Ledger::with_mut`

PR Title:
feat: Add `ADMIN_CHANGE_DELAY_SECONDS` timelock between `propose_admin` and `accept_admin`

PR Description:
Summary:
This PR adds a 24-hour (`ADMIN_CHANGE_DELAY_SECONDS = 86_400`) delay between `propose_admin` and `accept_admin` to give the protocol team time to detect and cancel unauthorized admin transfer proposals before they take effect.

Changes:
- Added `const ADMIN_CHANGE_DELAY_SECONDS: u64 = 86_400;` to `lib.rs`
- Modified `PendingAdmin` storage to include `proposed_at: u64` timestamp
- Added timelock check in `accept_admin` using `TimelockNotExpired` error
- Added unit tests with `Ledger::with_mut` for before/after delay scenarios

Testing:
- Run `cargo test -p escrow_contract test_admin_change_timelock_enforcement`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #86 Validate Oracle Price Is Non-Zero Before Using in Conversion

Title: Add Non-Zero Price Validation in `get_price_usd` and `convert_amount` to Prevent Division by Zero

Body:

Category: Security
Difficulty: Beginner
Priority: High
Estimated Time: 1–2 hours

Description:
`convert_amount` in `contracts/escrow_contract/src/oracle.rs` checks `if to_price == 0 { return Err(EscrowError::OracleInvalidPrice) }` but `get_price_usd` does not validate that the returned price is non-zero before returning it. If a malicious or faulty oracle returns `PriceData { price: 0, timestamp: now }` (fresh but zero), `get_price_usd` would return `Ok(0)`, and downstream callers using that price for multiplication could produce zero results silently without triggering the `to_price == 0` guard.

Requirements and Context:
- `contracts/escrow_contract/src/oracle.rs` — `get_price_usd` function, `convert_amount`
- `contracts/escrow_contract/src/errors.rs` — `EscrowError::OracleInvalidPrice = 50`
- Add `if data.price <= 0 { return Err(EscrowError::OracleInvalidPrice) }` in `get_price_usd` after freshness check
- Must apply to both primary and fallback oracle price readings
- Add a `///` comment explaining why zero/negative prices are rejected

Acceptance Criteria:
- [ ] `get_price_usd` returns `EscrowError::OracleInvalidPrice` (50) if the oracle returns `price <= 0`
- [ ] The check applies to both primary and fallback oracle price readings
- [ ] A unit test with a mock oracle returning `price = 0` verifies `OracleInvalidPrice` is returned
- [ ] A unit test with `price = -1` also verifies `OracleInvalidPrice` (negative prices are invalid)
- [ ] `convert_amount` retains its existing zero `to_price` check as a second layer of defense

Branch Suggestion:
fix/oracle-non-zero-price-validation

Commit Message Suggestions:
- `fix: validate oracle price is positive in get_price_usd before returning`
- `fix: apply non-zero price check to both primary and fallback oracle readings`
- `test: add tests for zero and negative oracle prices returning OracleInvalidPrice`

PR Title:
fix: Add non-zero price validation in `get_price_usd` to prevent zero-price silent failures

PR Description:
Summary:
This PR adds a `price <= 0` validation guard in `get_price_usd` for both primary and fallback oracle readings, returning `EscrowError::OracleInvalidPrice` when a fresh but zero or negative price is returned by an oracle.

Changes:
- Added `price <= 0` check in `get_price_usd` for both oracle paths
- Added unit tests for zero price and negative price from mock oracle
- Added `///` comment explaining rejection rationale

Testing:
- Run `cargo test -p escrow_contract test_oracle_zero_price_rejected`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #87 Add Maximum Voting Weight per Address in Quadratic Voting

Title: Add `MAX_VOTE_STAKE` Cap in `EscrowExtensions::cast_vote` to Limit Per-Address Quadratic Voting Power

Body:

Category: Security
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
`cast_vote` (L439 in `contracts/escrow_extensions/src/lib.rs`) uses `isqrt` (L99) to apply quadratic weighting to voter stakes. An address with a very large reputation stake could dominate the vote outcome even in quadratic systems if no per-address cap exists. Adding a `MAX_VOTE_STAKE` constant limits the maximum stake a single address can commit to a single dispute vote, ensuring genuine quadratic power distribution across many voters rather than one dominant voter.

Requirements and Context:
- `contracts/escrow_extensions/src/lib.rs` — `cast_vote` (L439), `isqrt` (L99)
- `contracts/escrow_extensions/src/types.rs` — `Vote { voter, stake, for_client, cast_at }`, `ArbitrationDispute`
- Add `const MAX_VOTE_STAKE: u64 = 10_000;` to `escrow_extensions/src/lib.rs` constants
- In `cast_vote`, cap the committed `stake` at `min(supplied_stake, MAX_VOTE_STAKE)` before `isqrt`
- Document the cap in a `///` comment explaining the quadratic distribution rationale

Acceptance Criteria:
- [ ] `const MAX_VOTE_STAKE: u64 = 10_000;` is defined with a `///` doc comment
- [ ] `cast_vote` caps stake at `MAX_VOTE_STAKE` before applying `isqrt`
- [ ] Capped stake (not the raw supplied stake) is stored in `Vote.stake`
- [ ] A unit test verifies that a voter with `stake = 1_000_000` has the same voting weight as `stake = 10_000`
- [ ] A unit test verifies normal (below-cap) stake behavior is unchanged

Branch Suggestion:
fix/max-vote-stake-cap-quadratic

Commit Message Suggestions:
- `fix: add MAX_VOTE_STAKE cap to prevent single-voter domination in quadratic voting`
- `test: verify capped stake equals MAX_VOTE_STAKE for oversized stake input`
- `docs: document MAX_VOTE_STAKE rationale for quadratic distribution`

PR Title:
fix: Add `MAX_VOTE_STAKE` cap in `cast_vote` to prevent quadratic voting power concentration

PR Description:
Summary:
This PR adds a `MAX_VOTE_STAKE` constant and stake capping in `cast_vote` to prevent a single voter with an outsized reputation stake from dominating dispute resolution even in the quadratic voting system.

Changes:
- Added `const MAX_VOTE_STAKE: u64 = 10_000;` to `escrow_extensions/src/lib.rs`
- Added `min(supplied_stake, MAX_VOTE_STAKE)` capping in `cast_vote`
- Added unit tests for oversized stake capping and normal stake behavior

Testing:
- Run `cargo test -p escrow_extensions test_max_vote_stake_cap`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #88 Review `batch_release_funds` for Partial Failure Rollback Handling

Title: Audit and Document `batch_release_funds` Failure Behavior: Rollback vs. Skip on Individual Release Failure

Body:

Category: Security
Difficulty: Intermediate
Priority: High
Estimated Time: 3–6 hours

Description:
`batch_release_funds` (L1359 in `contracts/escrow_contract/src/lib.rs`) releases funds for multiple approved milestones in one transaction. If one `release_funds` call in the batch fails (e.g. a milestone is not in `MS_APPROVED` state), the question is whether the entire batch transaction is rolled back or only that milestone is skipped. In Soroban, contract panics roll back the entire transaction, but returned `Err` values do not. The current behavior must be audited and explicitly documented.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `batch_release_funds` (L1359–1430)
- Determine: does the function panic on individual failure, return `Err` and rollback, or skip and continue?
- If it panics on non-approved milestones, this is a griefing vector (one bad milestone ID in a batch cancels all releases)
- The fix should either: (a) skip non-approved milestones and return a count, or (b) pre-validate all IDs before any transfer
- Add a `///` comment documenting the chosen behavior clearly

Acceptance Criteria:
- [ ] The current `batch_release_funds` failure behavior is documented in a `///` comment
- [ ] If griefing via invalid milestone ID is possible, a fix is implemented (skip or pre-validate)
- [ ] A unit test verifies the documented behavior for a batch containing one invalid milestone ID
- [ ] A unit test verifies that valid milestones in the batch are released even if one is invalid (if skip behavior)
- [ ] The audit finding is summarized in `SECURITY.md`

Branch Suggestion:
fix/batch-release-funds-partial-failure

Commit Message Suggestions:
- `fix: audit batch_release_funds for partial failure griefing vector`
- `fix: skip invalid milestones in batch_release_funds instead of panicking`
- `test: add batch_release_funds test with mixed valid and invalid milestone IDs`

PR Title:
fix: Audit and harden `batch_release_funds` against partial failure griefing

PR Description:
Summary:
This PR audits `batch_release_funds` for the partial failure griefing vector (where one invalid milestone ID in the batch could block all valid releases) and implements the appropriate fix (skip invalid milestones and return a count of successful releases).

Changes:
- Audited `batch_release_funds` failure behavior
- Implemented skip-invalid-milestone behavior with return count
- Added `///` documentation of the chosen behavior
- Added unit tests for mixed valid/invalid batches

Testing:
- Run `cargo test -p escrow_contract test_batch_release_funds_partial_failure`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #89 Add Maximum Escrow Count Guard for `migrate_v1_to_v2` to Avoid Ledger Limits

Title: Add Maximum Iteration Guard in `migrate_v1_to_v2` to Prevent Hitting Soroban Ledger Entry Limits

Body:

Category: Security
Difficulty: Advanced
Priority: Medium
Estimated Time: 4–7 hours

Description:
`migrate_v1_to_v2` in `contracts/escrow_contract/src/storage.rs` iterates `for escrow_id in 1..=escrow_counter` and reads/writes persistent storage entries for each escrow. Soroban transactions have a maximum number of ledger entries that can be read or written per transaction (currently 64 in many network configurations). A deployment with many escrows would exceed this limit during a single migration call, causing the migration transaction to fail. The migration must be made resumable by processing escrows in batches.

Requirements and Context:
- `contracts/escrow_contract/src/storage.rs` — `migrate_v1_to_v2` function
- `contracts/escrow_contract/src/lib.rs` — `upgrade` function (L2024) that calls migration
- Add a `from_id: u64` parameter to `migrate_v1_to_v2` and process only `MAX_MIGRATION_BATCH = 20` escrows per call
- Store the migration progress in instance storage via a new `DataKey::MigrationCursor` variant
- Add a new public function `pub fn migrate_storage(env: Env, caller: Address) -> Result<bool, EscrowError>` returning `true` when complete
- See also issue #125 for the batch refactor companion

Acceptance Criteria:
- [ ] `migrate_v1_to_v2` is refactored to process at most `MAX_MIGRATION_BATCH = 20` escrows per call
- [ ] A `MigrationCursor` in instance storage tracks the last migrated escrow ID
- [ ] `pub fn migrate_storage` is added for admin-callable incremental migration
- [ ] Returns `Ok(true)` when `cursor >= escrow_counter` (migration complete)
- [ ] Unit tests verify incremental migration with `escrow_counter > MAX_MIGRATION_BATCH`

Branch Suggestion:
fix/migrate-v1-to-v2-batch-guard

Commit Message Suggestions:
- `fix: add MAX_MIGRATION_BATCH guard to migrate_v1_to_v2 for ledger entry limit safety`
- `feat: add MigrationCursor tracking for resumable v1-to-v2 migration`
- `feat: add migrate_storage public function for incremental admin-callable migration`

PR Title:
fix: Add ledger entry limit guard to `migrate_v1_to_v2` with resumable batch processing

PR Description:
Summary:
This PR refactors `migrate_v1_to_v2` to process at most `MAX_MIGRATION_BATCH = 20` escrows per call and adds `MigrationCursor` tracking in instance storage for resumable migration. A new `migrate_storage` admin function enables incremental migration without hitting Soroban ledger entry limits.

Changes:
- Refactored `migrate_v1_to_v2` to accept a `from_id` parameter and batch size limit
- Added `DataKey::MigrationCursor` to instance storage
- Added `pub fn migrate_storage` admin function with resumable progress tracking
- Added unit tests for incremental migration with cursor advancement

Testing:
- Run `cargo test -p escrow_contract test_migrate_storage_incremental`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #90 Add Event for Every Admin-Privileged Operation

Title: Ensure All Admin-Only Functions in `EscrowContract` Emit an Auditable Event

Body:

Category: Security
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
Off-chain monitoring systems must be able to detect when an admin performs privileged operations. Currently, some admin functions like `pause` and `unpause` emit events, but others like `set_oracle` (L730), `set_fallback_oracle` (L739), `set_wormhole_bridge` (L773), `register_wrapped_token` (L787), and `upgrade` (L2024) may not emit auditable events. Every admin-only operation should emit an event so that monitoring tools can alert on unexpected privileged actions.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `set_oracle` (L730), `set_fallback_oracle` (L739), `set_wormhole_bridge` (L773), `register_wrapped_token` (L787), `upgrade` (L2024), `pause` (L2043), `unpause` (L2057)
- `contracts/escrow_contract/src/events.rs` — add `emit_oracle_set`, `emit_bridge_set`, `emit_wrapped_token_registered_admin`, `emit_upgrade_executed` if not already present
- All events must use `symbol_short!` names ≤ 9 characters
- Review `contracts/escrow_contract/src/bridge.rs` `emit_wrapped_token_registered` to ensure it is called from the public function

Acceptance Criteria:
- [ ] `set_oracle` emits an `oracle_set` event with the new oracle address
- [ ] `set_fallback_oracle` emits a `fallback_set` event
- [ ] `set_wormhole_bridge` emits a `bridge_set` event
- [ ] `upgrade` emits an `upgraded` event with the new WASM hash
- [ ] Unit tests verify each new event is emitted after the corresponding admin call
- [ ] All event `symbol_short!` names are ≤ 9 characters

Branch Suggestion:
feat/admin-operation-events

Commit Message Suggestions:
- `feat: add oracle_set, fallback_set, bridge_set events to admin-only functions`
- `feat: add upgraded event emission to the upgrade function`
- `test: add tests verifying each admin operation emits the correct event`

PR Title:
feat: Add auditable events to all admin-privileged operations in `EscrowContract`

PR Description:
Summary:
This PR ensures every admin-privileged function in `EscrowContract` emits an auditable event. New event emitters are added for `set_oracle`, `set_fallback_oracle`, `set_wormhole_bridge`, and `upgrade`, enabling off-chain monitoring systems to alert on unexpected privileged actions.

Changes:
- Added `emit_oracle_set`, `emit_fallback_oracle_set`, `emit_bridge_set`, and `emit_upgrade_executed` to `events.rs`
- Called each new emitter from the corresponding admin function
- Added unit tests verifying event emission for each admin operation

Testing:
- Run `cargo test -p escrow_contract test_admin_operation_events`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #91 Document and Test the Trust Model for `mock_all_auths` in Test Environments

Title: Add Documentation and Warning Comments Explaining `mock_all_auths()` Trust Model to Prevent Misuse in Tests

Body:

Category: Security
Difficulty: Beginner
Priority: Low
Estimated Time: 2–3 hours

Description:
The Soroban test harness function `mock_all_auths()` bypasses all `require_auth()` calls, meaning tests using it do not verify that authorization is correctly enforced. Tests that assert on authorization failures (e.g. non-client calling `approve_milestone`) must NOT use `mock_all_auths()` — they must explicitly set up the correct signers. Some existing tests in `lib.rs` use `mock_all_auths()` in setups where auth-failure tests are then expected to work, which may give false confidence in auth enforcement.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — test module setup functions `setup` (L2707), `no_multisig` (L2716), `setup_funded_escrow` (L3332)
- `contracts/escrow_contract/src/pause_tests.rs` — `setup_pause_escrow` (L3533)
- Add a `/// # Warning` rustdoc comment to any helper using `mock_all_auths()` explaining the auth bypass
- Audit existing auth-failure tests to ensure they set up correct signers rather than relying on `mock_all_auths`
- Add a section to `CONTRIBUTING.md` explaining when `mock_all_auths` is and is not appropriate

Acceptance Criteria:
- [ ] All test helper functions using `mock_all_auths()` have a `// WARNING: mock_all_auths bypasses all auth` comment
- [ ] Auth-failure tests (expecting `EscrowError::Unauthorized`) are verified to NOT use `mock_all_auths()`
- [ ] `CONTRIBUTING.md` gains a section on `mock_all_auths` trust model and when to use `env.mock_auth()`
- [ ] At least one existing test is corrected if found to incorrectly combine `mock_all_auths` with auth-failure assertions
- [ ] A new test demonstrates `approve_milestone` auth failure without `mock_all_auths`

Branch Suggestion:
docs/mock-all-auths-trust-model

Commit Message Suggestions:
- `docs: add mock_all_auths trust model warning to test helper functions`
- `fix: remove mock_all_auths from auth-failure tests that check Unauthorized errors`
- `docs: add CONTRIBUTING.md section on mock_all_auths vs env.mock_auth usage`

PR Title:
docs: Document `mock_all_auths()` trust model and audit auth-failure tests for correctness

PR Description:
Summary:
This PR adds warning comments to all test helpers using `mock_all_auths()`, audits existing auth-failure tests to verify they correctly set up signers, updates `CONTRIBUTING.md` with guidance on `mock_all_auths` vs `env.mock_auth`, and adds a demonstration test for `approve_milestone` authorization failure.

Changes:
- Added `// WARNING: mock_all_auths bypasses all auth checks` to all setup helpers
- Audited auth-failure tests and corrected any using `mock_all_auths` for `Unauthorized` assertions
- Added `CONTRIBUTING.md` section on Soroban auth testing patterns
- Added `test_approve_milestone_unauthorized_without_mock` demonstration test

Testing:
- Run `cargo test -p escrow_contract` and verify all auth-failure tests pass correctly

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #92 Add `Makefile` with `build`, `test`, `clippy`, `fmt`, `deploy-testnet` Targets

Title: Add Project-Wide `Makefile` with Standard Targets for Building, Testing, and Deploying Contracts

Body:

Category: Dev Experience
Difficulty: Beginner
Priority: High
Estimated Time: 2–4 hours

Description:
The project has no `Makefile`, forcing contributors to remember the full `cargo build --target wasm32-unknown-unknown --release` command, the workspace test invocations, and the multi-step Soroban CLI deploy sequence. A `Makefile` at the project root with standard targets (`build`, `test`, `clippy`, `fmt`, `deploy-testnet`) would significantly reduce onboarding friction and standardize the development workflow across contributors.

Requirements and Context:
- New file: `Makefile` in the project root
- `build` target: `cargo build --release --target wasm32-unknown-unknown` for all contract crates
- `test` target: `cargo test --workspace`
- `clippy` target: `cargo clippy --workspace -- -D warnings`
- `fmt` target: `cargo fmt --all -- --check`
- `deploy-testnet` target: shell script calling `soroban contract deploy` with env var injection
- Reference `Cargo.toml` workspace members: `escrow_contract`, `escrow_extensions`, `governance`, `insurance_contract`

Acceptance Criteria:
- [ ] `Makefile` is created with `build`, `test`, `clippy`, `fmt`, and `deploy-testnet` targets
- [ ] `make build` produces WASM artifacts for all four contract crates
- [ ] `make test` runs all workspace tests and exits with code 0 on success
- [ ] `make clippy` fails with non-zero exit if clippy has warnings
- [ ] `make deploy-testnet` documents required env vars in a comment or `.env.example`
- [ ] A `help` target prints all available targets with brief descriptions

Branch Suggestion:
feat/add-makefile

Commit Message Suggestions:
- `feat: add Makefile with build, test, clippy, fmt, and deploy-testnet targets`
- `feat: add make help target listing all available build targets`
- `docs: add Makefile usage section to CONTRIBUTING.md`

PR Title:
feat: Add project-wide `Makefile` with standard build, test, and deployment targets

PR Description:
Summary:
This PR adds a `Makefile` to the project root with targets for building WASM artifacts (`build`), running workspace tests (`test`), linting with clippy (`clippy`), format checking (`fmt`), and deploying to the Stellar testnet (`deploy-testnet`). A `help` target documents all available targets.

Changes:
- Created `Makefile` with `build`, `test`, `clippy`, `fmt`, `deploy-testnet`, and `help` targets
- Added environment variable documentation in `deploy-testnet` target comments
- Added `Makefile` usage reference to `CONTRIBUTING.md`

Testing:
- Run `make test` and verify all workspace tests pass
- Run `make build` and verify WASM artifacts are produced in `target/wasm32-unknown-unknown/release/`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #93 Add `.env.example` with All Soroban CLI Environment Variables Documented

Title: Add `.env.example` File Documenting All Required Soroban CLI Environment Variables

Body:

Category: Dev Experience
Difficulty: Beginner
Priority: Medium
Estimated Time: 1–2 hours

Description:
Contributors configuring the Soroban CLI for testnet or mainnet deployment have no reference for which environment variables are needed and what format they take. A `.env.example` file listing all required variables (`SOROBAN_RPC_URL`, `SOROBAN_NETWORK_PASSPHRASE`, `STELLAR_SECRET_KEY`, `ESCROW_CONTRACT_ID`, `EXTENSIONS_CONTRACT_ID`, `GOVERNANCE_CONTRACT_ID`) with placeholder values and inline comments would significantly reduce configuration errors.

Requirements and Context:
- New file: `.env.example` in the project root (`.gitignore` already present)
- Must document: `SOROBAN_RPC_URL` (testnet: `https://soroban-testnet.stellar.org`), `SOROBAN_NETWORK_PASSPHRASE` (testnet passphrase), `STELLAR_SECRET_KEY` (never commit real keys)
- Must document contract ID variables for all four deployed contracts
- Must reference `docs/testnet-deployment.md` (from issue #3) for setup instructions
- Must include a note that `.env` is in `.gitignore` and should never be committed

Acceptance Criteria:
- [ ] `.env.example` is created with all required Soroban CLI environment variables
- [ ] Each variable has an inline comment explaining its purpose and format
- [ ] Testnet RPC URL and network passphrase are provided as defaults
- [ ] A `STELLAR_SECRET_KEY=PLACEHOLDER` warning comment is included
- [ ] The file references the deployment guide for full setup instructions

Branch Suggestion:
feat/add-env-example

Commit Message Suggestions:
- `feat: add .env.example with all Soroban CLI environment variables documented`
- `docs: add STELLAR_SECRET_KEY placeholder warning in .env.example`
- `docs: reference testnet deployment guide from .env.example`

PR Title:
feat: Add `.env.example` with documented Soroban CLI environment variables

PR Description:
Summary:
This PR adds a `.env.example` file documenting all environment variables required for Soroban CLI deployment and testing. Each variable includes an inline comment explaining its purpose, format, and source.

Changes:
- Created `.env.example` with all required Soroban CLI and contract deployment variables
- Added testnet RPC URL and network passphrase as default values
- Added security warning comment for `STELLAR_SECRET_KEY`

Testing:
- Copy `.env.example` to `.env`, fill in real values, and verify `make deploy-testnet` works

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #94 Add GitHub Actions CI Workflow Running `cargo test` on All Contract Crates

Title: Add GitHub Actions CI Workflow for `cargo test --workspace` on Push and Pull Request

Body:

Category: Dev Experience
Difficulty: Beginner
Priority: High
Estimated Time: 2–4 hours

Description:
There is no GitHub Actions CI workflow configured in `.github/workflows/` that runs `cargo test` on the contract crates. Without automated CI, PRs can merge broken code. A basic workflow running `cargo test --workspace` on every push to `main` and on pull requests would catch regressions automatically and enforce a test-passing gate on all contributions.

Requirements and Context:
- New file: `.github/workflows/test.yml`
- Must use `actions/checkout@v4` and install the Rust toolchain with the `wasm32-unknown-unknown` target
- Must run `cargo test --workspace` for all four contract crates
- Must cache Cargo dependencies using `actions/cache@v4` with the `Cargo.lock` hash as the cache key
- Should run on `push` to `main`/`master` and `pull_request` targeting `main`/`master`
- Must set `CARGO_TERM_COLOR: always` for readable CI output

Acceptance Criteria:
- [ ] `.github/workflows/test.yml` is created and triggers on push and PR
- [ ] The workflow installs the correct Rust toolchain and `wasm32-unknown-unknown` target
- [ ] `cargo test --workspace` is run and the job fails if any test fails
- [ ] Cargo dependencies are cached to speed up subsequent runs
- [ ] The workflow completes in under 5 minutes on a cold cache run

Branch Suggestion:
feat/github-actions-ci-test

Commit Message Suggestions:
- `feat: add GitHub Actions CI workflow for cargo test on all contract crates`
- `feat: configure Cargo dependency caching in CI workflow`
- `ci: set CARGO_TERM_COLOR=always for readable test output`

PR Title:
feat: Add GitHub Actions CI workflow running `cargo test --workspace`

PR Description:
Summary:
This PR adds `.github/workflows/test.yml`, a GitHub Actions CI workflow that runs `cargo test --workspace` on every push to `main` and on all pull requests. Cargo dependencies are cached to speed up subsequent runs.

Changes:
- Created `.github/workflows/test.yml` with test workflow
- Configured `actions/cache@v4` with `Cargo.lock`-based cache key
- Added `wasm32-unknown-unknown` target installation step

Testing:
- Open a test PR and verify the workflow runs and passes

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #95 Add GitHub Actions Workflow for `cargo clippy -- -D warnings`

Title: Add GitHub Actions CI Workflow Enforcing `cargo clippy -- -D warnings` on All Contract Crates

Body:

Category: Dev Experience
Difficulty: Beginner
Priority: Medium
Estimated Time: 1–3 hours

Description:
Alongside the test workflow from issue #94, a dedicated `cargo clippy -- -D warnings` workflow would catch code quality issues (unnecessary clones, unused variables, non-idiomatic patterns) before they merge. Treating warnings as errors (`-D warnings`) sets a high quality bar and is consistent with Rust best practices in production codebases.

Requirements and Context:
- New file: `.github/workflows/clippy.yml`
- Run `cargo clippy --workspace -- -D warnings` on push to `main` and PRs
- Must install `clippy` component via `rustup component add clippy`
- Must use the same Rust toolchain version as `test.yml` for consistency
- Share Cargo cache with the test workflow by using the same cache key

Acceptance Criteria:
- [ ] `.github/workflows/clippy.yml` is created and triggers on push and PR
- [ ] The workflow fails on any clippy warning (`-D warnings` flag)
- [ ] All four contract crates are linted (`--workspace`)
- [ ] The workflow uses the same Cargo cache key as `test.yml`
- [ ] All existing clippy warnings in the codebase are fixed before merging this PR

Branch Suggestion:
feat/github-actions-clippy

Commit Message Suggestions:
- `feat: add GitHub Actions clippy workflow with -D warnings for all crates`
- `fix: resolve all existing clippy warnings across workspace crates`
- `ci: share Cargo cache between test and clippy workflows`

PR Title:
feat: Add GitHub Actions `cargo clippy -- -D warnings` workflow for all contract crates

PR Description:
Summary:
This PR adds `.github/workflows/clippy.yml`, a GitHub Actions workflow that runs `cargo clippy --workspace -- -D warnings` to enforce zero-warning code quality on all PRs and pushes. All pre-existing clippy warnings are resolved in this PR.

Changes:
- Created `.github/workflows/clippy.yml` with clippy workflow
- Fixed all pre-existing clippy warnings across workspace crates
- Shared Cargo cache key with `test.yml`

Testing:
- Verify the clippy workflow passes with no warnings on the PR itself

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #96 Add `rustfmt.toml` Configuration for Consistent Rust Formatting

Title: Add `rustfmt.toml` at Project Root with Consistent Formatting Rules for All Contract Crates

Body:

Category: Dev Experience
Difficulty: Beginner
Priority: Low
Estimated Time: 1–2 hours

Description:
There is no `rustfmt.toml` configuration file in the project root, meaning `cargo fmt` uses default Rust formatting settings. For a multi-contributor project, explicit formatting configuration prevents noisy format-only diffs in PRs and ensures consistency across editor setups. Key settings to configure include `max_width`, `use_small_heuristics`, `imports_granularity`, and `group_imports`.

Requirements and Context:
- New file: `rustfmt.toml` in the project root
- Recommended settings: `edition = "2021"`, `max_width = 100`, `use_small_heuristics = "Default"`, `imports_granularity = "Crate"`, `group_imports = "StdExternalCrate"`
- After adding `rustfmt.toml`, run `cargo fmt --all` and commit any formatting changes
- The `fmt` Makefile target (from issue #92) should use `cargo fmt --all -- --check`
- All four contract crates must format cleanly with the new configuration

Acceptance Criteria:
- [ ] `rustfmt.toml` is created at the project root with appropriate settings
- [ ] `cargo fmt --all -- --check` passes with zero differences after the initial format run
- [ ] All four contract crates format consistently with the new settings
- [ ] The configuration is documented with a comment explaining each non-default setting
- [ ] The `.github/workflows/test.yml` (or a new `fmt.yml`) runs `cargo fmt -- --check` in CI

Branch Suggestion:
feat/add-rustfmt-config

Commit Message Suggestions:
- `feat: add rustfmt.toml with max_width=100 and Crate imports granularity`
- `style: run cargo fmt --all after adding rustfmt.toml`
- `ci: add cargo fmt --check step to GitHub Actions test workflow`

PR Title:
feat: Add `rustfmt.toml` and apply consistent formatting across all workspace crates

PR Description:
Summary:
This PR adds `rustfmt.toml` to the project root with explicit formatting rules and applies `cargo fmt --all` to bring all four contract crates into conformance. A `cargo fmt -- --check` step is added to CI to enforce formatting on future PRs.

Changes:
- Created `rustfmt.toml` with edition, max_width, and imports configuration
- Applied `cargo fmt --all` to all workspace crates
- Added `cargo fmt -- --check` step to CI workflow

Testing:
- Run `cargo fmt --all -- --check` and verify zero differences

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #97 Configure `cargo-audit` in CI for Dependency Vulnerability Scanning

Title: Add `cargo-audit` to GitHub Actions CI for Automated Dependency Vulnerability Detection

Body:

Category: Dev Experience
Difficulty: Beginner
Priority: Medium
Estimated Time: 2–3 hours

Description:
The Rust ecosystem's `cargo-audit` tool checks `Cargo.lock` against the RustSec Advisory Database to detect known security vulnerabilities in dependencies. Without automated vulnerability scanning, a vulnerable version of `soroban-sdk` or another dependency could be included in a production deployment without detection. Adding `cargo-audit` to CI provides automated early warning for dependency vulnerabilities.

Requirements and Context:
- New file: `.github/workflows/audit.yml` or add to existing workflow
- Install `cargo-audit` via `cargo install cargo-audit`
- Run `cargo audit` against `Cargo.lock` in the workspace root
- Configure `cargo-audit` to ignore specific non-applicable advisories via `.cargo/audit.toml` if needed
- The workflow should run on push to `main` and weekly via `schedule: cron`

Acceptance Criteria:
- [ ] `.github/workflows/audit.yml` is created and runs `cargo audit` on push and weekly schedule
- [ ] The workflow uses the workspace `Cargo.lock` file
- [ ] A `.cargo/audit.toml` is created (even if empty) for future advisory ignores
- [ ] The workflow fails if any unfixed vulnerability is found
- [ ] The audit results are summarized in a step output for easy review

Branch Suggestion:
feat/cargo-audit-ci

Commit Message Suggestions:
- `feat: add cargo-audit to GitHub Actions CI for dependency vulnerability scanning`
- `feat: add .cargo/audit.toml for future advisory ignore configuration`
- `ci: schedule weekly cargo-audit runs via cron`

PR Title:
feat: Add `cargo-audit` dependency vulnerability scanning to GitHub Actions CI

PR Description:
Summary:
This PR adds `cargo-audit` to GitHub Actions CI for automated detection of known security vulnerabilities in Rust dependencies. The workflow runs on every push to `main` and weekly on a cron schedule to catch newly discovered advisories.

Changes:
- Created `.github/workflows/audit.yml` with `cargo audit` invocation
- Created `.cargo/audit.toml` for advisory configuration
- Configured weekly schedule via `cron: '0 6 * * 1'`

Testing:
- Verify the audit workflow runs and passes on the PR branch

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #98 Add Soroban CLI Deployment Script for Testnet with Environment Variable Injection

Title: Add `scripts/deploy-testnet.sh` Shell Script for Automated Soroban Testnet Deployment

Body:

Category: Dev Experience
Difficulty: Intermediate
Priority: Medium
Estimated Time: 3–5 hours

Description:
Contributors who want to deploy all four contracts to the Stellar testnet currently have no automation — they must manually run `soroban contract build`, `soroban contract upload`, `soroban contract deploy`, and `soroban contract invoke -- initialize` for each of the four crates. A `scripts/deploy-testnet.sh` shell script that automates this sequence and injects environment variables from `.env` would reduce deployment friction and prevent manual configuration errors.

Requirements and Context:
- New file: `scripts/deploy-testnet.sh`
- Must source `.env` for `SOROBAN_RPC_URL`, `SOROBAN_NETWORK_PASSPHRASE`, `STELLAR_SECRET_KEY`
- Must build all four contracts: `escrow_contract`, `escrow_extensions`, `governance`, `insurance_contract`
- Must deploy in order (core escrow first, then extensions referencing the escrow contract ID)
- Must call `initialize` on each contract after deployment with appropriate parameters
- Must write deployed contract IDs to `.env.deployed` for reference by subsequent scripts

Acceptance Criteria:
- [ ] `scripts/deploy-testnet.sh` is created and is executable (`chmod +x`)
- [ ] The script sources `.env` and validates all required variables are set before proceeding
- [ ] All four contracts are built, uploaded, deployed, and initialized in sequence
- [ ] Deployed contract IDs are written to `.env.deployed`
- [ ] The script prints progress messages and exits with code 1 on any failure
- [ ] A `--dry-run` flag prints the commands without executing them

Branch Suggestion:
feat/deploy-testnet-script

Commit Message Suggestions:
- `feat: add scripts/deploy-testnet.sh for automated Soroban testnet deployment`
- `feat: write deployed contract IDs to .env.deployed after successful deployment`
- `feat: add --dry-run flag to deploy-testnet.sh for safe preview`

PR Title:
feat: Add `scripts/deploy-testnet.sh` for automated all-contract testnet deployment

PR Description:
Summary:
This PR adds `scripts/deploy-testnet.sh`, a shell script that automates building, uploading, deploying, and initializing all four `stellar-trust-escrow` contracts on the Stellar testnet. Deployed contract IDs are written to `.env.deployed` for subsequent use.

Changes:
- Created `scripts/deploy-testnet.sh` with full deploy sequence
- Added `.env` sourcing and variable validation
- Implemented `--dry-run` flag
- Added progress output and error-on-failure behavior

Testing:
- Run `./scripts/deploy-testnet.sh --dry-run` and verify printed commands are correct
- Run against Stellar testnet and verify all four contracts deploy successfully

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #99 Add VS Code `devcontainer.json` with Rust and Soroban CLI Pre-Installed

Title: Add `.devcontainer/devcontainer.json` for Codespaces-Compatible Rust and Soroban CLI Development Environment

Body:

Category: Dev Experience
Difficulty: Beginner
Priority: Low
Estimated Time: 2–4 hours

Description:
Contributors who use GitHub Codespaces or VS Code Dev Containers have no pre-configured development environment for this project. Adding a `.devcontainer/devcontainer.json` with Rust, the `wasm32-unknown-unknown` target, and the Soroban CLI pre-installed would enable one-click development environment setup. This is especially valuable for Wave contributors who may not have a local Rust setup.

Requirements and Context:
- New directory: `.devcontainer/`
- New file: `.devcontainer/devcontainer.json`
- Base image: `mcr.microsoft.com/devcontainers/rust:latest` or `debian:bookworm` with Rust installed
- Post-create command: `rustup target add wasm32-unknown-unknown && cargo install --locked soroban-cli`
- VS Code extensions to pre-install: `rust-lang.rust-analyzer`, `vadimcn.vscode-lldb`, `tamasfe.even-better-toml`
- Forward port 8000 for a local Soroban RPC if needed

Acceptance Criteria:
- [ ] `.devcontainer/devcontainer.json` is created and valid JSON
- [ ] The devcontainer installs Rust, `wasm32-unknown-unknown`, and Soroban CLI on creation
- [ ] `rust-analyzer`, `CodeLLDB`, and `Even Better TOML` extensions are pre-installed
- [ ] `cargo test --workspace` runs successfully inside the devcontainer
- [ ] A `postCreateCommand` runs `cargo build` to warm up the Cargo cache

Branch Suggestion:
feat/devcontainer-soroban

Commit Message Suggestions:
- `feat: add .devcontainer/devcontainer.json with Rust and Soroban CLI`
- `feat: pre-install rust-analyzer, CodeLLDB, and Even Better TOML extensions`
- `feat: add postCreateCommand warming up Cargo build cache`

PR Title:
feat: Add VS Code devcontainer with Rust, Soroban CLI, and workspace extensions

PR Description:
Summary:
This PR adds `.devcontainer/devcontainer.json` for Codespaces and VS Code Dev Container users. The environment pre-installs Rust, the `wasm32-unknown-unknown` target, and the Soroban CLI, enabling one-click development environment setup for new contributors.

Changes:
- Created `.devcontainer/devcontainer.json` with Rust devcontainer configuration
- Added Soroban CLI installation in `postCreateCommand`
- Pre-configured `rust-analyzer`, `CodeLLDB`, and `Even Better TOML` extensions

Testing:
- Open the repository in a GitHub Codespace and verify `cargo test --workspace` passes

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #100 Create `CHANGELOG.md` with Semantic Versioning Starting from v1.0.0

Title: Create `CHANGELOG.md` Following Keep a Changelog Format Starting from v1.0.0

Body:

Category: Dev Experience
Difficulty: Beginner
Priority: Low
Estimated Time: 2–3 hours

Description:
There is no `CHANGELOG.md` documenting the project's release history. A changelog following the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format with semantic versioning (SemVer) would help users track breaking changes, new features, and bug fixes across contract versions. This is especially important given that the storage migration from v1 to v2 represents a significant breaking change that needs documentation.

Requirements and Context:
- New file: `CHANGELOG.md` in the project root
- Must follow Keep a Changelog format: `## [Unreleased]`, `## [1.0.0] - YYYY-MM-DD` with `### Added`, `### Changed`, `### Fixed`, `### Security` subsections
- v1.0.0 should document the initial feature set: milestone escrow, dispute resolution, reputation, recurring payments
- Include a note about the v1→v2 storage migration as a `### Changed` entry
- Reference `docs/storage-migration.md` (from issue #8) for migration instructions

Acceptance Criteria:
- [ ] `CHANGELOG.md` is created with Keep a Changelog format and Unreleased + v1.0.0 sections
- [ ] v1.0.0 `### Added` section lists all major implemented features
- [ ] v1.0.0 `### Changed` section documents the v1→v2 storage migration
- [ ] An `[Unreleased]` section is present for tracking future changes
- [ ] `CONTRIBUTING.md` is updated to require changelog entries for significant PRs

Branch Suggestion:
docs/changelog-v1

Commit Message Suggestions:
- `docs: create CHANGELOG.md with Keep a Changelog format starting from v1.0.0`
- `docs: document v1-to-v2 storage migration as v1.0.0 Changed entry`
- `docs: add changelog update requirement to CONTRIBUTING.md`

PR Title:
docs: Create `CHANGELOG.md` with semantic versioning starting from v1.0.0

PR Description:
Summary:
This PR creates `CHANGELOG.md` following the Keep a Changelog format, documenting the initial v1.0.0 release with all major features and the v1→v2 storage migration as a significant change. `CONTRIBUTING.md` is updated to require changelog entries for significant PRs.

Changes:
- Created `CHANGELOG.md` with Unreleased and v1.0.0 sections
- Listed all major v1.0.0 features in the Added section
- Documented the v1→v2 storage migration in the Changed section
- Updated `CONTRIBUTING.md` with changelog update requirement

Testing:
- Verify `CHANGELOG.md` follows the Keep a Changelog format by checking https://keepachangelog.com

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #101 Add Issue Templates for Bug Reports, Feature Requests, and Security Disclosures

Title: Add GitHub Issue Templates for Bug Reports, Feature Requests, and Security Vulnerability Disclosures

Body:

Category: Dev Experience
Difficulty: Beginner
Priority: Low
Estimated Time: 2–3 hours

Description:
The project has no GitHub issue templates in `.github/ISSUE_TEMPLATE/`. Without templates, bug reports and feature requests arrive in inconsistent formats, making triage difficult. For a smart contract project, a dedicated security disclosure template is especially important to guide reporters toward private disclosure rather than public issue creation.

Requirements and Context:
- New directory: `.github/ISSUE_TEMPLATE/`
- New file: `.github/ISSUE_TEMPLATE/bug_report.md` — include fields for: contract crate (`escrow_contract`, `escrow_extensions`, `governance`), Soroban CLI version, reproduction steps, expected vs actual behavior, and relevant `EscrowError` code
- New file: `.github/ISSUE_TEMPLATE/feature_request.md` — include fields for: motivation, proposed API (function signatures), affected crates, and Soroban/Stellar-specific constraints
- New file: `.github/ISSUE_TEMPLATE/security_disclosure.md` — guide reporters to email instead of opening a public issue, with a template for private disclosure

Acceptance Criteria:
- [ ] `.github/ISSUE_TEMPLATE/bug_report.md` is created with Soroban-specific fields
- [ ] `.github/ISSUE_TEMPLATE/feature_request.md` is created with API proposal field
- [ ] `.github/ISSUE_TEMPLATE/security_disclosure.md` directs reporters to private channels
- [ ] A `.github/ISSUE_TEMPLATE/config.yml` is created to configure the template chooser
- [ ] Templates are tested by creating a test issue on GitHub

Branch Suggestion:
docs/issue-templates

Commit Message Suggestions:
- `docs: add GitHub issue templates for bug reports and feature requests`
- `docs: add security disclosure template directing to private reporting channel`
- `docs: add ISSUE_TEMPLATE config.yml for template chooser`

PR Title:
docs: Add GitHub issue templates for bug reports, feature requests, and security disclosures

PR Description:
Summary:
This PR adds three GitHub issue templates to `.github/ISSUE_TEMPLATE/`: a Soroban-specific bug report template, a feature request template with API proposal field, and a security disclosure template directing reporters to private disclosure. A `config.yml` configures the template chooser.

Changes:
- Created `.github/ISSUE_TEMPLATE/bug_report.md` with Soroban-specific fields
- Created `.github/ISSUE_TEMPLATE/feature_request.md` with API proposal field
- Created `.github/ISSUE_TEMPLATE/security_disclosure.md` with private disclosure guidance
- Created `.github/ISSUE_TEMPLATE/config.yml` for template chooser

Testing:
- Verify templates appear correctly in the GitHub issue creation UI

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #102 Configure `cargo-tarpaulin` for Code Coverage Reporting

Title: Add `cargo-tarpaulin` Configuration and GitHub Actions Coverage Reporting Step

Body:

Category: Dev Experience
Difficulty: Intermediate
Priority: Low
Estimated Time: 3–5 hours

Description:
There is no code coverage measurement for the contract test suite. Adding `cargo-tarpaulin` configuration would provide visibility into which lines of `escrow_contract`, `escrow_extensions`, and `governance` are covered by tests. This is particularly valuable for identifying gaps in security-critical paths like `apply_slash`, `expire_escrow`, and `collect_rent_due`.

Requirements and Context:
- New file: `tarpaulin.toml` at the project root
- Configure to run on `contracts/escrow_contract`, `contracts/escrow_extensions`, `contracts/governance`
- Generate both an HTML report and a Coveralls/Codecov XML report
- Add `cargo-tarpaulin` installation and run step to `.github/workflows/test.yml` or a dedicated `coverage.yml`
- Note: `cargo-tarpaulin` requires Linux; configure workflow to use `ubuntu-latest`
- Exclude test modules from coverage counts via `tarpaulin.toml` `exclude-files` setting

Acceptance Criteria:
- [ ] `tarpaulin.toml` is created with workspace coverage configuration
- [ ] `cargo tarpaulin --config tarpaulin.toml` runs successfully on `ubuntu-latest`
- [ ] Coverage report is generated (HTML and XML/LCOV format)
- [ ] Test module files are excluded from coverage percentage calculations
- [ ] A coverage badge is added to `README.md` (optional but recommended)

Branch Suggestion:
feat/cargo-tarpaulin-coverage

Commit Message Suggestions:
- `feat: add tarpaulin.toml configuration for workspace code coverage`
- `ci: add coverage reporting step using cargo-tarpaulin in GitHub Actions`
- `docs: add coverage badge to README.md`

PR Title:
feat: Configure `cargo-tarpaulin` for contract code coverage reporting

PR Description:
Summary:
This PR adds `tarpaulin.toml` configuration and a GitHub Actions coverage step using `cargo-tarpaulin` to measure and report code coverage across all three main contract crates. Coverage reports are generated in HTML and LCOV format.

Changes:
- Created `tarpaulin.toml` with workspace coverage configuration and test exclusions
- Added `cargo-tarpaulin` step to CI workflow
- Added coverage badge to `README.md`

Testing:
- Run `cargo tarpaulin --config tarpaulin.toml` locally on Linux and verify report generation

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #103 Add `cargo bench` Benchmark Harness for Gas-Critical Contract Functions

Title: Add `cargo bench` Benchmark Suite for Gas-Critical Functions: `process_recurring_payments`, `batch_release_funds`, `migrate_v1_to_v2`

Body:

Category: Dev Experience
Difficulty: Intermediate
Priority: Low
Estimated Time: 4–7 hours

Description:
There is no performance benchmark suite for gas-critical contract functions. In Soroban, CPU instruction limits per transaction make gas optimization critical for complex operations. Adding a `cargo bench` harness using `criterion` (or Soroban's built-in instruction counter) for functions like `process_recurring_payments` (which iterates periods), `batch_release_funds` (O(n) releases), and `batch_add_milestones` would make gas regressions visible during development.

Requirements and Context:
- `contracts/escrow_contract/src/gas_profiling.rs` already exists — review its content for reuse
- New file: `contracts/escrow_contract/benches/contract_benchmarks.rs` using `criterion`
- Add `criterion` as a `dev-dependency` in `contracts/escrow_contract/Cargo.toml`
- Benchmark `process_recurring_payments` with 1, 5, and 10 periods due
- Benchmark `batch_add_milestones` with 5, 10, and 20 milestone batches
- Benchmark `batch_release_funds` with 5, 10, and 20 released milestones

Acceptance Criteria:
- [ ] `contracts/escrow_contract/benches/contract_benchmarks.rs` is created
- [ ] `criterion` is added as a `dev-dependency` in `Cargo.toml`
- [ ] Benchmarks for `process_recurring_payments`, `batch_add_milestones`, and `batch_release_funds` are implemented
- [ ] `cargo bench -p escrow_contract` runs successfully and outputs timing results
- [ ] A `make bench` target is added to the `Makefile` (from issue #92)

Branch Suggestion:
feat/cargo-bench-gas-benchmarks

Commit Message Suggestions:
- `feat: add cargo bench suite for gas-critical contract functions`
- `feat: benchmark process_recurring_payments, batch_add_milestones, batch_release_funds`
- `feat: add make bench target to Makefile`

PR Title:
feat: Add `cargo bench` harness for gas-critical contract function benchmarks

PR Description:
Summary:
This PR adds a `criterion`-based benchmark suite for gas-critical `EscrowContract` functions. Benchmarks cover `process_recurring_payments`, `batch_add_milestones`, and `batch_release_funds` at various batch sizes to make gas regressions visible during development.

Changes:
- Created `contracts/escrow_contract/benches/contract_benchmarks.rs`
- Added `criterion` to `dev-dependencies` in `Cargo.toml`
- Added `make bench` target to `Makefile`

Testing:
- Run `cargo bench -p escrow_contract` and verify benchmark output

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #104 Implement `create_escrow_with_vesting` for Linear Token Vesting Schedules

Title: Implement `create_escrow_with_vesting(cliff, duration, total_amount)` for Linear Vesting with Cliff

Body:

Category: Advanced Features
Difficulty: Advanced
Priority: Medium
Estimated Time: 8–12 hours

Description:
Linear vesting schedules (e.g. 1-year cliff + 3-year linear vest) are a common DeFi primitive for team compensation and investor allocations. Implementing `create_escrow_with_vesting` as a specialized escrow type using the existing `RecurringPaymentConfig` infrastructure (monthly intervals + total months calculation) would provide a native vesting product on Stellar. The cliff would be implemented as a `start_time` delay in the `RecurringPaymentConfig`.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_recurring_escrow` (L984), `RecurringPaymentConfig`, `RecurringInterval::Monthly`
- New function: `pub fn create_escrow_with_vesting(env, caller, client, beneficiary, token, total_amount, cliff_seconds, vest_duration_seconds, brief_hash) -> Result<u64, EscrowError>`
- Cliff implemented as `start_time = env.ledger().timestamp() + cliff_seconds`
- Monthly payment amount = `total_amount / total_months`
- Must handle non-divisible `total_amount` by adding remainder to the final payment
- New event: `emit_vesting_schedule_created` with cliff and duration in payload

Acceptance Criteria:
- [ ] `create_escrow_with_vesting` creates a `RecurringPaymentConfig` with cliff as `start_time`
- [ ] Monthly payment is computed as `total_amount / total_months` with remainder in final month
- [ ] `process_recurring_payments` handles vesting payments identically to regular recurring payments
- [ ] `emit_vesting_schedule_created` event is emitted with cliff, duration, and monthly amount
- [ ] Unit tests cover: 12-month vest with 0 cliff, 24-month vest with 6-month cliff, and non-divisible total

Branch Suggestion:
feat/create-escrow-with-vesting

Commit Message Suggestions:
- `feat: implement create_escrow_with_vesting for linear vesting with cliff`
- `feat: compute monthly vesting amount with remainder in final payment`
- `test: add vesting schedule tests for cliff and non-divisible total_amount cases`

PR Title:
feat: Implement `create_escrow_with_vesting` for linear token vesting with cliff period

PR Description:
Summary:
This PR implements `create_escrow_with_vesting`, a specialized escrow type that creates a linear vesting schedule with an optional cliff using the existing `RecurringPaymentConfig` infrastructure. Monthly payments are computed with remainder handling for non-divisible totals.

Changes:
- Added `pub fn create_escrow_with_vesting` to `EscrowContract`
- Added `emit_vesting_schedule_created` to `events.rs`
- Added unit tests for cliff, no-cliff, and non-divisible total scenarios

Testing:
- Run `cargo test -p escrow_contract test_create_escrow_with_vesting`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #105 Implement Token Whitelist Management (Admin-Controlled Approved Token List)

Title: Implement Admin-Controlled Token Whitelist for `create_escrow` with `add_approved_token` and `remove_approved_token`

Body:

Category: Advanced Features
Difficulty: Intermediate
Priority: Medium
Estimated Time: 5–8 hours

Description:
Currently any Stellar token can be used in an escrow (subject only to bridge approval for wrapped tokens). For deployments where the protocol operator wants to restrict escrows to a curated list of stablecoins and major assets, a token whitelist system managed by the admin would be valuable. `create_escrow_internal` would check the whitelist if it is enabled, allowing permissioned token escrow creation.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895)
- `contracts/escrow_contract/src/types.rs` — `DataKey` enum — add `ApprovedToken(Address)` and `TokenWhitelistEnabled` variants
- New functions: `pub fn add_approved_token(env, caller, token) -> Result<(), EscrowError>` and `pub fn remove_approved_token(env, caller, token) -> Result<(), EscrowError>`
- New function: `pub fn set_token_whitelist_enabled(env, caller, enabled: bool) -> Result<(), EscrowError>`
- `create_escrow_internal` checks whitelist only if `TokenWhitelistEnabled = true`
- All three new functions require admin auth

Acceptance Criteria:
- [ ] `ApprovedToken(Address)` and `TokenWhitelistEnabled` are added to `DataKey` in `types.rs`
- [ ] `add_approved_token` and `remove_approved_token` admin functions are implemented
- [ ] `set_token_whitelist_enabled` enables/disables whitelist enforcement
- [ ] `create_escrow_internal` checks `DataKey::ApprovedToken(token)` when whitelist is enabled
- [ ] Unit tests cover: whitelist enabled with approved token (success), unapproved token (fail), whitelist disabled (any token accepted)

Branch Suggestion:
feat/token-whitelist-management

Commit Message Suggestions:
- `feat: implement admin token whitelist with add_approved_token and remove_approved_token`
- `feat: add set_token_whitelist_enabled to toggle whitelist enforcement`
- `test: add whitelist enforcement tests for enabled/disabled and approved/unapproved tokens`

PR Title:
feat: Implement admin-controlled token whitelist for `create_escrow` token restriction

PR Description:
Summary:
This PR implements an admin-controlled token whitelist system for `create_escrow`. When enabled via `set_token_whitelist_enabled`, only tokens added via `add_approved_token` can be used in new escrows. The whitelist can be disabled to allow any token.

Changes:
- Added `ApprovedToken(Address)` and `TokenWhitelistEnabled` to `DataKey` in `types.rs`
- Added `add_approved_token`, `remove_approved_token`, and `set_token_whitelist_enabled` admin functions
- Added whitelist check in `create_escrow_internal`
- Added unit tests for all whitelist enforcement scenarios

Testing:
- Run `cargo test -p escrow_contract test_token_whitelist`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #106 Implement `split_escrow` to Divide an Active Escrow into Two Child Escrows

Title: Implement `split_escrow(escrow_id, split_amount)` to Create Two Child Escrows from One Active Parent

Body:

Category: Advanced Features
Difficulty: Advanced
Priority: Low
Estimated Time: 10–15 hours

Description:
When an active escrow's scope changes significantly (e.g. one deliverable is completed but another grows in complexity), it may be desirable to split the remaining balance into two separate escrows for independent tracking. `split_escrow` would: cancel the parent escrow's unallocated balance, create two new child escrows (one with `split_amount`, one with `remaining_balance - split_amount`), and inherit the original parties, token, and arbiter.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895), `cancel_escrow` (L1783)
- New function: `pub fn split_escrow(env, caller, escrow_id, split_amount, new_brief_hash) -> Result<(u64, u64), EscrowError>`
- Returns `(child_escrow_id_1, child_escrow_id_2)` as a tuple
- Requires auth from both `client` and `freelancer` (joint consent)
- Only `unallocated_amount = total_amount - allocated_amount` can be split
- Inherits `client`, `freelancer`, `token`, `arbiter`, `deadline` from parent
- Must emit `emit_escrow_split` event with parent and both child IDs

Acceptance Criteria:
- [ ] `split_escrow` returns a tuple of two new escrow IDs
- [ ] Both child escrows inherit parties and arbiter from the parent
- [ ] `split_amount + child2_amount == parent.remaining_balance - parent.allocated_amount`
- [ ] Parent escrow is not cancelled — only unallocated balance is split
- [ ] `emit_escrow_split` event is added to `events.rs`
- [ ] Unit tests cover: successful split, split exceeding unallocated amount, single-signer rejection

Branch Suggestion:
feat/split-escrow

Commit Message Suggestions:
- `feat: implement split_escrow creating two child escrows from unallocated parent balance`
- `feat: add emit_escrow_split event with parent and child IDs`
- `test: add split_escrow tests for success, amount overflow, and auth failure`

PR Title:
feat: Implement `split_escrow` to divide unallocated balance into two child escrows

PR Description:
Summary:
This PR implements `split_escrow`, allowing the client and freelancer to jointly split an active escrow's unallocated balance into two independent child escrows. Child escrows inherit parties, token, arbiter, and deadline from the parent.

Changes:
- Added `pub fn split_escrow` to `EscrowContract` with dual-auth requirement
- Added `emit_escrow_split` to `events.rs`
- Added unit tests for successful split, over-allocation, and auth failure

Testing:
- Run `cargo test -p escrow_contract test_split_escrow`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #107 Implement `escrow_template` System for Reusable Milestone Set Definitions

Title: Implement `create_template`, `get_template`, and `create_escrow_from_template` for Reusable Milestone Blueprints

Body:

Category: Advanced Features
Difficulty: Intermediate
Priority: Low
Estimated Time: 6–10 hours

Description:
Agencies and platforms that create many escrows with the same milestone structure (e.g. "web development: design + development + testing + launch") currently must manually recreate identical milestone sets for each new escrow. An escrow template system would allow a `template_id` to be stored with a predefined set of `AddMilestoneArgs` entries, and `create_escrow_from_template` would instantiate a new escrow with all template milestones pre-added in a single transaction.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `add_milestone` (L1090), `batch_add_milestones` (L1167)
- `contracts/escrow_contract/src/types.rs` — `DataKey` enum — add `Template(u64)` and `TemplateCounter` variants
- New `EscrowTemplate` struct: `{ id: u64, creator: Address, milestones: Vec<AddMilestoneArgs>, name: String }`
- New functions: `create_template(env, caller, name, milestones) -> u64`, `get_template(env, id) -> EscrowTemplate`, `create_escrow_from_template(env, caller, template_id, client, freelancer, token, total_amount, brief_hash, arbiter, deadline) -> u64`
- Templates are immutable once created

Acceptance Criteria:
- [ ] `EscrowTemplate` struct and `DataKey::Template(u64)` are defined in `types.rs`
- [ ] `create_template` stores the template and returns a `template_id`
- [ ] `create_escrow_from_template` creates a new escrow and bulk-adds template milestones
- [ ] `get_template` returns the stored template
- [ ] Unit tests cover: template creation, escrow-from-template, and invalid template ID

Branch Suggestion:
feat/escrow-template-system

Commit Message Suggestions:
- `feat: implement escrow template system with create_template and create_escrow_from_template`
- `feat: add EscrowTemplate struct and DataKey::Template storage`
- `test: add tests for template creation and escrow instantiation from template`

PR Title:
feat: Implement `escrow_template` system for reusable milestone set definitions

PR Description:
Summary:
This PR implements an escrow template system allowing users to define reusable milestone blueprints via `create_template` and instantiate new escrows with pre-configured milestones via `create_escrow_from_template`.

Changes:
- Added `EscrowTemplate` struct and `DataKey::Template(u64)` to `types.rs`
- Added `create_template`, `get_template`, and `create_escrow_from_template` functions
- Added unit tests for all template lifecycle operations

Testing:
- Run `cargo test -p escrow_contract test_escrow_template_system`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #108 Implement Automatic Deadline Extension When Milestone Is in Submitted State

Title: Implement `AUTO_DEADLINE_EXTENSION_SECONDS` to Automatically Extend Deadline When a Milestone Awaits Review

Body:

Category: Advanced Features
Difficulty: Intermediate
Priority: Low
Estimated Time: 4–7 hours

Description:
When a freelancer submits a milestone close to the escrow deadline, the client may not have enough time to review and respond before the deadline expires. Adding an `AUTO_DEADLINE_EXTENSION_SECONDS` constant (e.g. 7 days = 604,800 seconds) that automatically extends the `EscrowMeta.deadline` whenever a milestone enters `MS_SUBMITTED` state and the remaining time before deadline is less than the extension window would prevent unfair deadline expiry while work is under review.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `submit_milestone` (L1555), `EscrowMeta.deadline: Option<u64>`
- Add `const AUTO_DEADLINE_EXTENSION_SECONDS: u64 = 604_800;` (7 days)
- In `submit_milestone`, check if `deadline - now < AUTO_DEADLINE_EXTENSION_SECONDS`; if so, extend `deadline` to `now + AUTO_DEADLINE_EXTENSION_SECONDS`
- Must emit `emit_deadline_extended` (from issue #24) when auto-extension occurs
- Must not extend past an existing `lock_time` (if lock_time < new_deadline, do not extend)

Acceptance Criteria:
- [ ] `const AUTO_DEADLINE_EXTENSION_SECONDS: u64 = 604_800;` is defined with a `///` doc comment
- [ ] `submit_milestone` extends the deadline when remaining time < `AUTO_DEADLINE_EXTENSION_SECONDS`
- [ ] `emit_deadline_extended` is emitted when auto-extension occurs
- [ ] Deadline is NOT extended if remaining time is already >= `AUTO_DEADLINE_EXTENSION_SECONDS`
- [ ] Unit tests cover: extension triggered, no extension when sufficient time, and `None` deadline case

Branch Suggestion:
feat/auto-deadline-extension-on-submit

Commit Message Suggestions:
- `feat: implement auto-deadline extension when milestone submitted near deadline`
- `feat: add AUTO_DEADLINE_EXTENSION_SECONDS constant for submitted milestone grace period`
- `test: add tests for deadline extension on submit and no-extension with sufficient time`

PR Title:
feat: Implement automatic deadline extension when milestone is submitted near deadline

PR Description:
Summary:
This PR adds an `AUTO_DEADLINE_EXTENSION_SECONDS` (7 days) grace period mechanism that automatically extends the escrow deadline when a milestone is submitted with less than 7 days until the deadline expires, preventing unfair deadline expiry while work is under client review.

Changes:
- Added `const AUTO_DEADLINE_EXTENSION_SECONDS: u64 = 604_800;` to `lib.rs`
- Added deadline extension logic in `submit_milestone`
- Added `emit_deadline_extended` event emission on auto-extension
- Added unit tests for extension triggered and not triggered

Testing:
- Run `cargo test -p escrow_contract test_auto_deadline_extension_on_submit`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #109 Implement Reputation-Weighted Fee Discounts in the Extensions Fee System

Title: Implement Reputation Score-Based Fee Discounts in `EscrowExtensions::collect_fee`

Body:

Category: Advanced Features
Difficulty: Advanced
Priority: Low
Estimated Time: 7–12 hours

Description:
`EscrowExtensions::collect_fee` (L294) charges a flat `fee_bps` for all escrows. Implementing reputation-weighted fee discounts — where clients with higher `ReputationRecord.total_score` get a lower effective fee — would incentivize reputation building and reward loyal platform users. The discount could be tiered: Bronze (score < 100) = full fee, Silver (100–500) = 50% discount, Gold (> 500) = 75% discount.

Requirements and Context:
- `contracts/escrow_extensions/src/lib.rs` — `collect_fee` (L294), `get_fee_bps` (L383)
- `contracts/escrow_contract/src/types.rs` — `ReputationRecord.total_score: u64`
- `EscrowExtensions` must make a cross-contract call to `EscrowContract::get_reputation(client_address)` to fetch the score
- New function: `fn compute_effective_fee_bps(base_bps: u32, reputation_score: u64) -> u32` with tiered discount logic
- Store the target `EscrowContract` address in instance storage for cross-contract calls

Acceptance Criteria:
- [ ] `compute_effective_fee_bps` is implemented with Bronze/Silver/Gold tiers
- [ ] `collect_fee` queries client reputation via cross-contract call and applies discount
- [ ] `EscrowExtensions` stores the `EscrowContract` address for reputation queries
- [ ] Unit tests cover all three reputation tiers and the fee discount calculation
- [ ] Events include the effective fee bps (after discount) for indexer transparency

Branch Suggestion:
feat/reputation-weighted-fee-discounts

Commit Message Suggestions:
- `feat: implement reputation-weighted fee discounts in EscrowExtensions collect_fee`
- `feat: add compute_effective_fee_bps with Bronze/Silver/Gold tier logic`
- `test: add fee discount tests for all three reputation tiers`

PR Title:
feat: Implement reputation-weighted fee discounts in `EscrowExtensions::collect_fee`

PR Description:
Summary:
This PR adds reputation-based fee discounts to `EscrowExtensions::collect_fee`. Clients with higher `ReputationRecord.total_score` receive tiered discounts (Bronze: 0%, Silver: 50%, Gold: 75%) computed via a cross-contract call to `EscrowContract::get_reputation`.

Changes:
- Added `compute_effective_fee_bps` with tiered discount logic
- Added cross-contract reputation query in `collect_fee`
- Added `EscrowContract` address storage in `EscrowExtensions`
- Added unit tests for all reputation tiers

Testing:
- Run `cargo test -p escrow_extensions test_reputation_fee_discounts`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #110 Implement Anti-Sybil Check: Minimum Reputation Score Required to Be Arbiter

Title: Implement `MIN_ARBITER_REPUTATION_SCORE` Check in `create_escrow_internal` to Require Arbiter Reputation

Body:

Category: Advanced Features
Difficulty: Intermediate
Priority: Medium
Estimated Time: 5–8 hours

Description:
Any address can currently be specified as an arbiter in `create_escrow_internal` (L895). A sybil attacker could create many fresh addresses with zero reputation and use them as arbiters to gain control over dispute resolution. Adding a minimum reputation score requirement for arbiters — enforced via a cross-contract call to `get_reputation` if the arbiter is set — would reduce sybil risk and ensure arbiters have a track record on the platform.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895), `get_reputation` (L2225)
- Add `pub const MIN_ARBITER_REPUTATION_SCORE: u64 = 100;` to `lib.rs`
- If `arbiter = Some(addr)`, call `load_reputation(env, &addr)` and check `total_score >= MIN_ARBITER_REPUTATION_SCORE`
- Return a new `EscrowError::InsufficientArbiterReputation` or use `EscrowError::Unauthorized` (3)
- Add an admin function `set_min_arbiter_reputation(new_min: u64)` to make the threshold configurable

Acceptance Criteria:
- [ ] `pub const MIN_ARBITER_REPUTATION_SCORE: u64 = 100;` is defined with `///` comment
- [ ] `create_escrow_internal` rejects arbiters with `total_score < MIN_ARBITER_REPUTATION_SCORE`
- [ ] `None` arbiter bypasses the reputation check
- [ ] `set_min_arbiter_reputation` admin function allows runtime threshold configuration
- [ ] Unit tests cover: arbiter with sufficient reputation (pass), insufficient reputation (fail), no arbiter (pass)

Branch Suggestion:
feat/min-arbiter-reputation-antisybil

Commit Message Suggestions:
- `feat: add MIN_ARBITER_REPUTATION_SCORE check to prevent sybil arbiters`
- `feat: add set_min_arbiter_reputation admin function for threshold configuration`
- `test: add tests for arbiter reputation checks in create_escrow_internal`

PR Title:
feat: Implement `MIN_ARBITER_REPUTATION_SCORE` anti-sybil check for arbiter assignment

PR Description:
Summary:
This PR adds a minimum reputation score requirement for escrow arbiters to prevent sybil attacks via fresh-address arbiters. `create_escrow_internal` now checks `ReputationRecord.total_score >= MIN_ARBITER_REPUTATION_SCORE` when an arbiter is provided.

Changes:
- Added `pub const MIN_ARBITER_REPUTATION_SCORE: u64 = 100;`
- Added reputation check in `create_escrow_internal` for non-None arbiters
- Added `set_min_arbiter_reputation` admin function
- Added unit tests for all arbiter reputation scenarios

Testing:
- Run `cargo test -p escrow_contract test_min_arbiter_reputation_check`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #111 Implement `partial_cancel` to Refund Only Unallocated Pending Milestones

Title: Implement `partial_cancel(escrow_id)` to Refund Only Unallocated Balance Without Cancelling Allocated Milestones

Body:

Category: Advanced Features
Difficulty: Advanced
Priority: Low
Estimated Time: 7–12 hours

Description:
`cancel_escrow` (L1783) cancels the entire escrow and is blocked by `CannotCancelWithPendingFunds` (12) when milestones have allocated but unreleased funds. `partial_cancel` would refund only the unallocated portion (`total_amount - allocated_amount`) back to the client while leaving allocated milestones to proceed normally. This is useful when a project scope is reduced and excess funds should be returned without disrupting in-progress milestones.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `cancel_escrow` (L1783), `EscrowMeta.allocated_amount` (L157), `EscrowMeta.remaining_balance` (L158)
- New function: `pub fn partial_cancel(env, caller, escrow_id) -> Result<i128, EscrowError>`
- `unallocated = remaining_balance - allocated_amount_pending_milestones`
- Requires auth from `client`
- Returns the refunded amount
- Escrow status remains `Active` after `partial_cancel` (not fully cancelled)
- Must emit `emit_partial_cancellation` event with refunded amount

Acceptance Criteria:
- [ ] `pub fn partial_cancel` is added refunding only `total_amount - allocated_amount`
- [ ] Escrow status remains `EscrowStatus::Active` after `partial_cancel`
- [ ] `EscrowMeta.remaining_balance` is reduced by the refunded unallocated amount
- [ ] `emit_partial_cancellation` event is added to `events.rs`
- [ ] Returns `0` (and no token transfer) if there is no unallocated balance
- [ ] Unit tests cover: successful partial cancel, no unallocated balance, and auth failure

Branch Suggestion:
feat/partial-cancel-escrow

Commit Message Suggestions:
- `feat: implement partial_cancel to refund only unallocated escrow balance`
- `feat: add emit_partial_cancellation event with refunded amount`
- `test: add tests for partial cancel with and without unallocated balance`

PR Title:
feat: Implement `partial_cancel` to refund unallocated escrow balance while preserving active milestones

PR Description:
Summary:
This PR implements `partial_cancel`, allowing the client to reclaim the unallocated portion of an escrow's balance while leaving allocated milestones to proceed normally. The escrow remains `Active` after `partial_cancel`.

Changes:
- Added `pub fn partial_cancel(env, caller, escrow_id) -> Result<i128, EscrowError>`
- Added `emit_partial_cancellation` to `events.rs`
- Added unit tests for successful partial cancel and zero unallocated balance

Testing:
- Run `cargo test -p escrow_contract test_partial_cancel`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #112 Implement Cross-Contract Governance Escalation for High-Value Dispute Resolution

Title: Implement `escalate_dispute_to_governance(escrow_id)` for High-Value Disputes Requiring DAO Resolution

Body:

Category: Advanced Features
Difficulty: Advanced
Priority: Low
Estimated Time: 10–16 hours

Description:
For escrows above a `HIGH_VALUE_THRESHOLD` where the arbiter resolution is contested, implementing a governance escalation path — `escalate_dispute_to_governance` — would allow the losing party to request a DAO vote on the dispute outcome. This would create a `FundAllocation` proposal in the `GovernanceContract` with the disputed amount as the payload, requiring token holder consensus to override the arbiter's decision.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `resolve_dispute` (L1955), `EscrowMeta.total_amount`
- `contracts/governance/src/lib.rs` — `create_proposal` (L234) — cross-contract call target
- Add `const HIGH_VALUE_THRESHOLD: i128 = 10_000_000_000i128;` (1,000 XLM)
- New function: `pub fn escalate_dispute_to_governance(env, caller, escrow_id) -> Result<u64, EscrowError>`
- Creates a `ProposalType::FundAllocation` in `GovernanceContract` with the disputed `remaining_balance`
- Requires the escrow to be in `EscrowStatus::Disputed` and `total_amount >= HIGH_VALUE_THRESHOLD`
- Returns the governance `proposal_id`

Acceptance Criteria:
- [ ] `escalate_dispute_to_governance` is added requiring disputed status and high-value threshold
- [ ] A cross-contract call to `GovernanceContract::create_proposal` creates a `FundAllocation` proposal
- [ ] The `GovernanceContract` address is stored in instance storage and configurable by admin
- [ ] Returns `EscrowError::EscrowNotDisputed` (10) for non-disputed escrows
- [ ] Returns appropriate error for escrows below `HIGH_VALUE_THRESHOLD`
- [ ] Unit tests mock the governance contract call and verify proposal creation

Branch Suggestion:
feat/governance-dispute-escalation

Commit Message Suggestions:
- `feat: implement escalate_dispute_to_governance for high-value DAO resolution`
- `feat: add HIGH_VALUE_THRESHOLD constant and governance contract address storage`
- `test: add mock governance contract tests for dispute escalation`

PR Title:
feat: Implement `escalate_dispute_to_governance` for high-value dispute DAO resolution

PR Description:
Summary:
This PR implements `escalate_dispute_to_governance`, allowing parties in high-value disputed escrows (above `HIGH_VALUE_THRESHOLD`) to request DAO-level resolution via a cross-contract call to `GovernanceContract::create_proposal`.

Changes:
- Added `pub fn escalate_dispute_to_governance` to `EscrowContract`
- Added `GovernanceContract` address storage and admin configuration
- Added `HIGH_VALUE_THRESHOLD` constant
- Added mock governance contract tests for proposal creation

Testing:
- Run `cargo test -p escrow_contract test_escalate_dispute_to_governance`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #113 Implement `create_escrow_with_nft_gate` (Require NFT Ownership to Create)

Title: Implement `create_escrow_with_nft_gate(nft_contract, token_id, ...)` Requiring NFT Ownership for Escrow Creation

Body:

Category: Advanced Features
Difficulty: Advanced
Priority: Low
Estimated Time: 8–12 hours

Description:
NFT-gated access patterns are common in Web3 for premium platform tiers. Implementing `create_escrow_with_nft_gate` would require the `client` to hold a specific NFT (from a given NFT contract address and token ID) at the time of escrow creation. This enables platform operators to create membership tiers where only NFT holders can create escrows, verified via cross-contract call to a Stellar-native NFT contract interface.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895)
- New function: `pub fn create_escrow_with_nft_gate(env, caller, nft_contract, token_id, args: CreateEscrowArgs) -> Result<u64, EscrowError>`
- NFT check: cross-contract call to `nft_contract` using a `#[contractclient]` trait `NftInterface { fn balance(env: Env, owner: Address, id: u64) -> i128; }`
- Returns `EscrowError::Unauthorized` (3) if `balance == 0`
- Uses `create_escrow_internal` for the actual escrow creation after auth
- Emit `emit_nft_gated_escrow_created` event with `nft_contract` and `token_id` in payload

Acceptance Criteria:
- [ ] `NftInterface` trait is defined as a `#[contractclient]` in a new `nft.rs` module
- [ ] `create_escrow_with_nft_gate` performs the NFT ownership check before `create_escrow_internal`
- [ ] Returns `EscrowError::Unauthorized` (3) if NFT balance is zero
- [ ] `emit_nft_gated_escrow_created` event is added to `events.rs`
- [ ] Unit tests mock the NFT contract and verify: NFT holder succeeds, non-holder fails

Branch Suggestion:
feat/nft-gated-escrow-creation

Commit Message Suggestions:
- `feat: implement create_escrow_with_nft_gate for NFT-gated escrow creation`
- `feat: add NftInterface contractclient trait in nft.rs module`
- `test: add mock NFT contract tests for NFT holder and non-holder cases`

PR Title:
feat: Implement `create_escrow_with_nft_gate` for NFT-gated escrow access control

PR Description:
Summary:
This PR implements `create_escrow_with_nft_gate`, requiring the `client` to hold a specific NFT before escrow creation is permitted. The NFT balance is checked via cross-contract call using the `NftInterface` trait.

Changes:
- Added `NftInterface` trait in `contracts/escrow_contract/src/nft.rs`
- Added `pub fn create_escrow_with_nft_gate` to `EscrowContract`
- Added `emit_nft_gated_escrow_created` to `events.rs`
- Added mock NFT contract tests for holder and non-holder scenarios

Testing:
- Run `cargo test -p escrow_contract test_nft_gated_escrow_creation`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #114 Implement Oracle-Triggered Automatic Release for Price-Indexed Milestones

Title: Implement `create_price_indexed_milestone` and `trigger_oracle_release` for Automatic Price-Condition Fund Release

Body:

Category: Advanced Features
Difficulty: Advanced
Priority: Low
Estimated Time: 10–16 hours

Description:
Combining the oracle subsystem (`oracle.rs`) with the milestone lifecycle, `create_price_indexed_milestone` would allow a milestone to have a `release_condition: PriceCondition { asset, target_price_usd, direction }` field. `trigger_oracle_release` would check the current oracle price for the asset and automatically approve and release the milestone if the price condition is met (e.g. "release when XLM/USD >= $0.50"). This enables DeFi-style escrow products on Stellar.

Requirements and Context:
- `contracts/escrow_contract/src/oracle.rs` — `get_price_usd`, `convert_amount`
- `contracts/escrow_contract/src/types.rs` — `Milestone` struct — add `price_condition: Option<PriceCondition>` field
- New `PriceCondition` struct: `{ asset: Address, target_price_usd: i128, direction: PriceDirection }` where `PriceDirection::Above` or `Below`
- New function: `pub fn trigger_oracle_release(env, caller, escrow_id, milestone_id) -> Result<(), EscrowError>`
- Fetches current price via `get_price_usd(env, &condition.asset)`, evaluates condition, and calls `release_funds` if met
- Returns `EscrowError::InvalidMilestoneState` (14) if condition is not yet met

Acceptance Criteria:
- [ ] `PriceCondition` and `PriceDirection` types are defined in `types.rs`
- [ ] `Milestone.price_condition: Option<PriceCondition>` field is added
- [ ] `trigger_oracle_release` evaluates the price condition and conditionally releases funds
- [ ] Returns `InvalidMilestoneState` (14) if price condition is not met
- [ ] Unit tests mock the oracle contract and verify: condition met (release), condition not met (error)

Branch Suggestion:
feat/oracle-triggered-milestone-release

Commit Message Suggestions:
- `feat: implement PriceCondition and trigger_oracle_release for price-indexed milestones`
- `feat: add PriceDirection enum and PriceCondition struct to types.rs`
- `test: add mock oracle tests for price condition met and not met cases`

PR Title:
feat: Implement oracle-triggered automatic release for price-indexed milestones

PR Description:
Summary:
This PR implements oracle-triggered fund release for price-indexed milestones. `PriceCondition` fields on milestones define release conditions, and `trigger_oracle_release` checks the current oracle price and releases funds if the condition is satisfied.

Changes:
- Added `PriceCondition`, `PriceDirection` to `types.rs`
- Added `price_condition: Option<PriceCondition>` to `Milestone` struct
- Added `pub fn trigger_oracle_release` to `EscrowContract`
- Added mock oracle tests for condition-met and condition-not-met scenarios

Testing:
- Run `cargo test -p escrow_contract test_oracle_triggered_release`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #115 Extract `validate_escrow_inputs` into a Shared Validation Helper Module

Title: Refactor `create_escrow_internal` Input Validation into a Standalone `validate_escrow_inputs` Helper Function

Body:

Category: Refactoring
Difficulty: Beginner
Priority: Low
Estimated Time: 2–4 hours

Description:
`create_escrow_internal` (L895 in `contracts/escrow_contract/src/lib.rs`) performs several input validations inline: checking `total_amount > 0`, validating the deadline is in the future, and (after issues #26–#31) validating parties are distinct, amounts are bounded, and strings are within length limits. These validations are scattered throughout the function body. Extracting them into a `validate_escrow_inputs(env: &Env, args: &CreateEscrowArgs) -> Result<(), EscrowError>` helper would improve readability and reusability.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895), `CreateEscrowArgs` (L107)
- Extract all input validation from `create_escrow_internal` into a single `fn validate_escrow_inputs(env: &Env, args: &CreateEscrowArgs) -> Result<(), EscrowError>` function
- `validate_escrow_inputs` should call: amount bounds check, parties distinct check, arbiter distinct check, brief_hash non-zero check, deadline validity check, string length checks
- `create_escrow_internal` should call `validate_escrow_inputs(env, &args)?` at the start
- All existing tests must pass without modification

Acceptance Criteria:
- [ ] `fn validate_escrow_inputs(env: &Env, args: &CreateEscrowArgs) -> Result<(), EscrowError>` is extracted
- [ ] `create_escrow_internal` calls `validate_escrow_inputs` as its first statement
- [ ] All existing creation tests pass without modification
- [ ] The function is documented with a `///` comment listing all validations it performs
- [ ] No new functionality is added — pure refactoring only

Branch Suggestion:
refactor/validate-escrow-inputs-helper

Commit Message Suggestions:
- `refactor: extract validate_escrow_inputs helper from create_escrow_internal`
- `refactor: consolidate all CreateEscrowArgs validation into single function`
- `docs: add rustdoc listing all validations in validate_escrow_inputs`

PR Title:
refactor: Extract `validate_escrow_inputs` helper from `create_escrow_internal`

PR Description:
Summary:
This PR extracts all input validation logic from `create_escrow_internal` into a standalone `validate_escrow_inputs` function, improving readability and making the validation logic reusable across escrow creation variants.

Changes:
- Extracted `fn validate_escrow_inputs(env: &Env, args: &CreateEscrowArgs) -> Result<(), EscrowError>`
- `create_escrow_internal` calls `validate_escrow_inputs(env, &args)?` as its first statement
- Added `///` documentation listing all validations performed

Testing:
- Run `cargo test -p escrow_contract` and verify all creation tests pass unchanged

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #116 Replace Inline `symbol_short!` Event Names with a Constants Module

Title: Refactor All `symbol_short!` Event Topic Names in `events.rs` to Constants in a Dedicated `event_names.rs` Module

Body:

Category: Refactoring
Difficulty: Beginner
Priority: Low
Estimated Time: 2–4 hours

Description:
`contracts/escrow_contract/src/events.rs` uses inline `symbol_short!("esc_crt")`, `symbol_short!("mil_add")`, etc. throughout. With ~30 event functions, the topic names are scattered and could be accidentally duplicated or mistyped. Extracting all event topic constants into a `contracts/escrow_contract/src/event_names.rs` module with `pub const` declarations would make the topic namespace visible and prevent duplication.

Requirements and Context:
- `contracts/escrow_contract/src/events.rs` — all `symbol_short!()` calls
- New file: `contracts/escrow_contract/src/event_names.rs`
- Define `pub const ESCROW_CREATED: soroban_sdk::Symbol = symbol_short!("esc_crt");` pattern for each event
- Update `events.rs` to use `event_names::ESCROW_CREATED` instead of inline `symbol_short!("esc_crt")`
- Add `mod event_names;` to `lib.rs`
- Apply the same pattern to `contracts/escrow_extensions/src/events.rs`

Acceptance Criteria:
- [ ] `contracts/escrow_contract/src/event_names.rs` is created with all event topic constants
- [ ] All `symbol_short!` calls in `events.rs` are replaced with the corresponding constant
- [ ] `contracts/escrow_extensions/src/events.rs` similarly refactored
- [ ] `cargo build` compiles without errors
- [ ] All existing event tests pass without modification

Branch Suggestion:
refactor/event-names-constants-module

Commit Message Suggestions:
- `refactor: extract symbol_short! event topic names into event_names.rs constants`
- `refactor: replace all inline symbol_short! in events.rs with event_names constants`
- `refactor: apply event_names constants to escrow_extensions events.rs`

PR Title:
refactor: Extract `symbol_short!` event topic names into `event_names.rs` constants module

PR Description:
Summary:
This PR extracts all `symbol_short!` event topic names from `events.rs` into a dedicated `event_names.rs` module with `pub const` declarations, eliminating duplication risk and providing a central namespace for all event topics.

Changes:
- Created `contracts/escrow_contract/src/event_names.rs` with all event topic constants
- Updated `events.rs` to use `event_names::*` constants
- Applied same refactoring to `contracts/escrow_extensions/src/events.rs`

Testing:
- Run `cargo test -p escrow_contract` and verify all event tests pass
- Run `cargo build --workspace` to confirm no compilation errors

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #117 Consolidate TTL Constants into a Shared `config.rs` Module

Title: Consolidate Duplicated TTL Constants from All Contract Crates into a Shared `config.rs` Module

Body:

Category: Refactoring
Difficulty: Beginner
Priority: Low
Estimated Time: 2–4 hours

Description:
`INSTANCE_TTL_THRESHOLD`, `INSTANCE_TTL_EXTEND_TO`, `PERSISTENT_TTL_THRESHOLD`, and `PERSISTENT_TTL_EXTEND_TO` are duplicated across `contracts/escrow_contract/src/lib.rs` (L80–83), `contracts/escrow_extensions/src/lib.rs` (L65–68), and `contracts/governance/src/lib.rs` (L43–46) with identical values. A single source of truth in a shared `config.rs` would eliminate the risk of these drifting out of sync across crates.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — TTL constants at L80–83
- `contracts/escrow_extensions/src/lib.rs` — TTL constants at L65–68
- `contracts/governance/src/lib.rs` — TTL constants at L43–46
- Since Cargo workspace crates cannot easily share source files, create a `contracts/shared/` workspace member with a `config.rs` exporting the constants
- Alternatively, define the constants in `escrow_contract` and re-export from a `stellar_trust_escrow_config` crate
- Each contract crate adds the shared config crate as a dependency

Acceptance Criteria:
- [ ] A shared configuration crate or module is created with the four TTL constants
- [ ] All three contract crates import TTL constants from the shared source
- [ ] `cargo build --workspace` compiles without errors
- [ ] All existing tests pass without modification
- [ ] The constants are documented with `///` comments explaining their values and rationale

Branch Suggestion:
refactor/shared-ttl-constants-config

Commit Message Suggestions:
- `refactor: consolidate duplicated TTL constants into shared config module`
- `refactor: update escrow_contract, escrow_extensions, and governance to use shared TTL constants`
- `docs: add rustdoc to TTL constants explaining their values`

PR Title:
refactor: Consolidate duplicated TTL constants into a shared `config.rs` module

PR Description:
Summary:
This PR eliminates the duplication of `INSTANCE_TTL_THRESHOLD`, `INSTANCE_TTL_EXTEND_TO`, `PERSISTENT_TTL_THRESHOLD`, and `PERSISTENT_TTL_EXTEND_TO` across three contract crates by extracting them into a shared configuration module.

Changes:
- Created shared TTL constants source (shared crate or module)
- Updated `escrow_contract`, `escrow_extensions`, and `governance` to import from shared source
- Added `///` documentation to all four constants

Testing:
- Run `cargo build --workspace` to verify all crates compile
- Run `cargo test --workspace` to verify no regressions

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #118 Extract Rent Logic into a Dedicated `rent.rs` Module

Title: Refactor `charge_rent_reserve`, `collect_rent_due`, `expire_escrow` and Related Functions into `rent.rs`

Body:

Category: Refactoring
Difficulty: Intermediate
Priority: Medium
Estimated Time: 4–7 hours

Description:
The rent subsystem in `contracts/escrow_contract/src/lib.rs` — including `charge_rent_reserve` (L523), `charge_entry_rent` (L537), `collect_rent_due` (L552), `settle_rent_for_access` (L599), `collect_rent` (L609), `expire_escrow` (L621), `active_storage_entries` (L467), `rent_due_per_period` (L494), `reserve_for_entries` (L499), `rent_has_expired` (L503), `rent_expires_at` (L518) — comprises approximately 200 lines of closely related logic that should be extracted into a dedicated `rent.rs` module for improved separation of concerns.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — rent functions at L467–649
- New file: `contracts/escrow_contract/src/rent.rs`
- Move all rent-related `ContractStorage` methods to `rent.rs` as standalone functions or an impl block extension
- Add `mod rent;` to `lib.rs`
- Constants `RENT_PERIOD_SECONDS`, `RENT_RESERVE_PERIODS`, `RENT_PER_ENTRY_PER_PERIOD` move to `rent.rs`
- All calling sites in `lib.rs` updated to use `rent::function_name` prefix

Acceptance Criteria:
- [ ] `contracts/escrow_contract/src/rent.rs` is created with all rent-related functions
- [ ] Rent constants are moved to `rent.rs` and re-exported or accessed via module path
- [ ] All calling sites in `lib.rs` use `rent::` prefix or `use crate::rent::*`
- [ ] `cargo build --package escrow_contract` compiles without errors
- [ ] All existing rent-related tests pass without modification

Branch Suggestion:
refactor/extract-rent-module

Commit Message Suggestions:
- `refactor: extract rent subsystem into dedicated rent.rs module`
- `refactor: move RENT_* constants and all rent functions to rent.rs`
- `refactor: update lib.rs calling sites to use rent:: module prefix`

PR Title:
refactor: Extract rent subsystem (`charge_rent_reserve`, `collect_rent_due`, `expire_escrow`) into `rent.rs`

PR Description:
Summary:
This PR extracts approximately 200 lines of rent-related logic from `lib.rs` into a dedicated `rent.rs` module, improving separation of concerns and making the rent subsystem independently navigable and testable.

Changes:
- Created `contracts/escrow_contract/src/rent.rs` with all rent functions and constants
- Added `mod rent;` to `lib.rs`
- Updated all calling sites in `lib.rs` to use `rent::` prefix
- Confirmed all existing rent tests pass

Testing:
- Run `cargo test -p escrow_contract` and verify all rent tests pass
- Run `cargo build --package escrow_contract` to confirm no errors

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #119 Refactor `create_escrow_internal` to Use a Builder/Params Struct Pattern

Title: Refactor `create_escrow_internal` to Accept a Single `EscrowCreationParams` Builder Struct

Body:

Category: Refactoring
Difficulty: Intermediate
Priority: Medium
Estimated Time: 4–6 hours

Description:
`create_escrow_internal` (L895) accepts `CreateEscrowArgs` and additional parameters like `buyer_signers: Option<Vec<Address>>`, `multisig_config: Option<MultisigConfig>`, making its signature grow with each new feature. Refactoring to a single `EscrowCreationParams` struct that encapsulates all creation parameters would make the function signature stable, improve readability, and make adding future optional parameters (like `bridge_transfer_id`, `vesting_config`) non-breaking.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `create_escrow_internal` (L895), `CreateEscrowArgs` (L107)
- New struct: `EscrowCreationParams` combining `CreateEscrowArgs` fields with optional multisig config, buyer signers, and other optional parameters
- Update `create_escrow`, `create_escrow_with_buyer_signers`, and `create_recurring_escrow` to construct `EscrowCreationParams` before calling `create_escrow_internal`
- `create_escrow_internal` signature: `fn create_escrow_internal(env: &Env, storage: &ContractStorage, params: EscrowCreationParams) -> Result<u64, EscrowError>`

Acceptance Criteria:
- [ ] `EscrowCreationParams` struct is defined with all current `create_escrow_internal` parameters
- [ ] `create_escrow_internal` signature is updated to accept `EscrowCreationParams`
- [ ] All three public creation functions build `EscrowCreationParams` before calling internal
- [ ] `cargo build --package escrow_contract` compiles without errors
- [ ] All existing creation tests pass without modification

Branch Suggestion:
refactor/create-escrow-params-struct

Commit Message Suggestions:
- `refactor: introduce EscrowCreationParams struct for create_escrow_internal`
- `refactor: update create_escrow, create_escrow_with_buyer_signers to build EscrowCreationParams`
- `refactor: update create_recurring_escrow to use EscrowCreationParams builder`

PR Title:
refactor: Replace `create_escrow_internal` parameters with `EscrowCreationParams` builder struct

PR Description:
Summary:
This PR introduces an `EscrowCreationParams` struct that consolidates all parameters for `create_escrow_internal`. This makes the internal function's signature stable and extensible, allowing future optional parameters to be added without signature changes.

Changes:
- Added `EscrowCreationParams` struct in `lib.rs`
- Updated `create_escrow_internal` signature to accept `EscrowCreationParams`
- Updated all three public creation functions to construct `EscrowCreationParams`

Testing:
- Run `cargo test -p escrow_contract` and verify all creation tests pass

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #120 Consolidate Duplicate Auth Check Patterns into a `require_role!` Macro

Title: Refactor Repeated `if caller != meta.client { return Err(Unauthorized) }` Patterns into a `require_role!` Macro

Body:

Category: Refactoring
Difficulty: Intermediate
Priority: Low
Estimated Time: 3–5 hours

Description:
Throughout `contracts/escrow_contract/src/lib.rs`, the pattern `caller.require_auth(); if caller != meta.client { return Err(EscrowError::ClientOnly); }` (and equivalent for freelancer and arbiter) is repeated many times across different functions. A `require_role!` macro that takes `(caller, expected, error_variant)` and expands to the standard auth + equality check would eliminate this duplication and make the authorization intent clearer at each call site.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — multiple functions with `caller != meta.client` patterns
- New macro: `macro_rules! require_role { ($caller:expr, $expected:expr, $err:expr) => { $caller.require_auth(); if $caller != $expected { return Err($err); } }; }`
- Apply the macro in `submit_milestone` (freelancer check), `approve_milestone` (client check), `reject_milestone` (client check), `cancel_escrow` (client check), `release_funds` (client check)
- The macro should be defined in `lib.rs` or a new `macros.rs` module

Acceptance Criteria:
- [ ] `require_role!` macro is defined and documented with a comment
- [ ] Applied to at least 5 functions replacing inline auth patterns
- [ ] The macro correctly expands to `require_auth()` + equality check + error return
- [ ] `cargo build --package escrow_contract` compiles without errors
- [ ] All existing auth-failure tests pass without modification

Branch Suggestion:
refactor/require-role-macro

Commit Message Suggestions:
- `refactor: add require_role! macro to consolidate repeated auth check patterns`
- `refactor: apply require_role! macro to submit_milestone, approve_milestone, reject_milestone`
- `refactor: apply require_role! macro to cancel_escrow and release_funds`

PR Title:
refactor: Introduce `require_role!` macro to consolidate repeated auth check patterns

PR Description:
Summary:
This PR introduces a `require_role!` macro that consolidates the repeated `caller.require_auth(); if caller != expected { return Err(error); }` pattern across multiple functions in `lib.rs`, improving code clarity and reducing duplication.

Changes:
- Added `macro_rules! require_role!` definition in `lib.rs`
- Applied macro to `submit_milestone`, `approve_milestone`, `reject_milestone`, `cancel_escrow`, and `release_funds`

Testing:
- Run `cargo test -p escrow_contract` and verify all auth tests pass unchanged

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #121 Renumber and Close Gaps in `EscrowError` Discriminant Values

Title: Renumber `EscrowError` Enum to Close Missing Discriminant Gaps at 7, 11, 22, and 24

Body:

Category: Refactoring
Difficulty: Beginner
Priority: Low
Estimated Time: 2–4 hours

Description:
The `EscrowError` enum in `contracts/escrow_contract/src/errors.rs` has gaps at discriminant values 7, 11, 22, and 24 where variants are missing. While the Rust `#[contracterror]` macro does not require sequential values, the gaps suggest removed variants that left holes in the numbering. Closing the gaps by adding `Reserved` variants or renumbering would make the error code space cleaner and easier to document. Any renumbering must be treated as a **breaking change** and documented.

Requirements and Context:
- `contracts/escrow_contract/src/errors.rs` — `EscrowError` enum, current discriminant gaps at 7, 11, 22, 24
- Option A: Add `Reserved7 = 7`, `Reserved11 = 11`, `Reserved22 = 22`, `Reserved24 = 24` placeholder variants
- Option B: Renumber all variants sequentially (breaking change — requires storage migration consideration)
- Option A is preferred to avoid breaking changes to existing deployed contracts
- Must update `docs/error-codes.md` (from issue #16) to note the reserved values

Acceptance Criteria:
- [ ] The four gaps (7, 11, 22, 24) are addressed either by reserved variants or renumbering
- [ ] If Option A: `Reserved*` variants are added with `/// Reserved for future use` doc comment
- [ ] If Option B: all callers and tests are updated to the new discriminant values, and migration docs updated
- [ ] `docs/error-codes.md` is updated to reflect the chosen approach
- [ ] `cargo build --package escrow_contract` compiles without errors

Branch Suggestion:
refactor/close-escrow-error-gaps

Commit Message Suggestions:
- `refactor: close discriminant gaps in EscrowError with Reserved placeholder variants`
- `docs: update error-codes.md to document Reserved error codes at 7, 11, 22, 24`
- `refactor: add rustdoc Reserved for future use comments to Reserved* variants`

PR Title:
refactor: Close `EscrowError` discriminant gaps at 7, 11, 22, and 24 with `Reserved` variants

PR Description:
Summary:
This PR closes the discriminant gaps in `EscrowError` at values 7, 11, 22, and 24 by adding `Reserved` placeholder variants. This makes the error code space contiguous and prevents future confusion about whether these values are valid.

Changes:
- Added `Reserved7 = 7`, `Reserved11 = 11`, `Reserved22 = 22`, `Reserved24 = 24` to `EscrowError`
- Added `/// Reserved for future use` doc comments to each reserved variant
- Updated `docs/error-codes.md` to document reserved values

Testing:
- Run `cargo build --package escrow_contract` to verify enum compiles correctly
- Verify `docs/error-codes.md` accurately reflects all 58 variants (54 real + 4 reserved)

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #122 Refactor `load_escrow` View Assembly to Use `iter().map()` Instead of Index Loop

Title: Refactor `ContractStorage::load_escrow` Milestone Assembly from Index Loop to Iterator Pattern

Body:

Category: Refactoring
Difficulty: Beginner
Priority: Low
Estimated Time: 2–3 hours

Description:
`ContractStorage::load_escrow` (L335 in `contracts/escrow_contract/src/lib.rs`) assembles an `EscrowState` by loading each milestone via an index loop: `for i in 0..meta.milestone_count { milestones.push(self.load_milestone(env, escrow_id, i)?); }`. Refactoring to use a Rust iterator pattern `(0..meta.milestone_count).map(|i| self.load_milestone(env, escrow_id, i)).collect::<Result<Vec<_>, _>>()?` would be more idiomatic and easier to extend with filtering or mapping.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `ContractStorage::load_escrow` at L335–363
- `ContractStorage::load_milestone` returns `Result<Milestone, EscrowError>` (L279)
- The refactored version must correctly propagate the `Err` from any `load_milestone` call
- Must handle the Soroban SDK `Vec` type vs standard Rust `Vec` correctly
- All existing `get_escrow`-based tests must pass without modification

Acceptance Criteria:
- [ ] `load_escrow` milestone assembly uses an iterator pattern instead of a for loop
- [ ] The iterator correctly propagates `Err` from individual `load_milestone` failures
- [ ] `cargo build --package escrow_contract` compiles without errors
- [ ] All existing tests using `get_escrow` pass without modification
- [ ] The refactored code is no longer than the original (pure style improvement)

Branch Suggestion:
refactor/load-escrow-iterator-pattern

Commit Message Suggestions:
- `refactor: replace index loop in load_escrow with iterator pattern`
- `refactor: use (0..count).map().collect() for milestone assembly in load_escrow`

PR Title:
refactor: Refactor `load_escrow` milestone assembly from index loop to iterator pattern

PR Description:
Summary:
This PR refactors the milestone assembly loop in `ContractStorage::load_escrow` from an explicit index-based for loop to a more idiomatic Rust iterator pattern using `map` and `collect`, making the code more readable and consistent with Rust style.

Changes:
- Replaced `for i in 0..meta.milestone_count` with `(0..meta.milestone_count).map(...).collect()?` in `load_escrow`
- Confirmed correct `Err` propagation from individual `load_milestone` failures

Testing:
- Run `cargo test -p escrow_contract` and verify all `get_escrow`-based tests pass

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #123 Move Bridge-Related Types from `bridge.rs` into a Dedicated `bridge/types.rs` Submodule

Title: Refactor `contracts/escrow_contract/src/bridge.rs` to Split Types into `bridge/types.rs` Submodule

Body:

Category: Refactoring
Difficulty: Intermediate
Priority: Low
Estimated Time: 3–5 hours

Description:
`contracts/escrow_contract/src/bridge.rs` currently contains both type definitions (`WrappedTokenInfo`, `BridgeConfirmation`, `BridgeDataKey`, `BridgeProtocol`) and logic functions (`register_wrapped_token`, `validate_escrow_token`, `require_bridge_finalized`, event emitters). As the bridge module grows with additional chain support, separating types into `bridge/types.rs` and logic into `bridge/mod.rs` would follow Rust module organization best practices and improve navigability.

Requirements and Context:
- `contracts/escrow_contract/src/bridge.rs` — current monolithic file
- New structure: `contracts/escrow_contract/src/bridge/mod.rs` (logic functions) and `contracts/escrow_contract/src/bridge/types.rs` (type definitions)
- `contracts/escrow_contract/src/lib.rs` — `mod bridge;` at L54 remains unchanged
- All types re-exported from `bridge/mod.rs` via `pub use types::*;` for backward compatibility
- `WormholeBridgeInterface` trait stays in `bridge/mod.rs`

Acceptance Criteria:
- [ ] `contracts/escrow_contract/src/bridge/` directory is created
- [ ] `bridge/types.rs` contains `WrappedTokenInfo`, `BridgeConfirmation`, `BridgeDataKey`, `BridgeProtocol`
- [ ] `bridge/mod.rs` contains all logic functions and `pub use types::*;`
- [ ] `mod bridge;` in `lib.rs` still works without changes to calling sites
- [ ] `cargo build --package escrow_contract` compiles without errors
- [ ] All bridge-related tests pass without modification

Branch Suggestion:
refactor/bridge-types-submodule

Commit Message Suggestions:
- `refactor: split bridge.rs into bridge/mod.rs and bridge/types.rs submodule`
- `refactor: move WrappedTokenInfo, BridgeConfirmation, BridgeDataKey to bridge/types.rs`
- `refactor: re-export bridge types from bridge/mod.rs for backward compatibility`

PR Title:
refactor: Move bridge types into dedicated `bridge/types.rs` submodule

PR Description:
Summary:
This PR restructures `bridge.rs` into a `bridge/` directory with separate `mod.rs` (logic) and `types.rs` (type definitions) files, following Rust module organization best practices. All types are re-exported from `bridge/mod.rs` for backward compatibility.

Changes:
- Created `contracts/escrow_contract/src/bridge/` directory
- Moved type definitions to `bridge/types.rs`
- Moved logic functions to `bridge/mod.rs` with `pub use types::*;`

Testing:
- Run `cargo build --package escrow_contract` to verify no compilation errors
- Run `cargo test -p escrow_contract` to verify bridge tests pass

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #124 Deduplicate TTL Bump Helpers Between `escrow_contract` and `escrow_extensions`

Title: Deduplicate `bump_instance_ttl` and `bump_persistent_ttl` Helper Functions Across Contract Crates

Body:

Category: Refactoring
Difficulty: Beginner
Priority: Low
Estimated Time: 2–4 hours

Description:
`ContractStorage::bump_instance_ttl` and `ContractStorage::bump_persistent_ttl` in `contracts/escrow_contract/src/lib.rs` (L446–462) and the standalone `bump_instance` and `bump_persistent` functions in `contracts/escrow_extensions/src/lib.rs` (L72–82) implement identical TTL bump logic with the same constant values. After the shared config module from issue #117 is in place, these helpers should also be deduplicated into a shared utility function, or at minimum the constants should be unified.

Requirements and Context:
- `contracts/escrow_contract/src/lib.rs` — `bump_instance_ttl` (L446), `bump_persistent_ttl` (L453)
- `contracts/escrow_extensions/src/lib.rs` — `bump_instance` (L72), `bump_persistent` (L78)
- `contracts/governance/src/lib.rs` — `bump_instance` (L53), `bump_persistent` (L59)
- Requires issue #117 (shared config) to be completed first for constant deduplication
- Goal: after #117, the TTL bump logic in all three crates should use the shared constants and ideally the same helper pattern

Acceptance Criteria:
- [ ] All three crates use the same TTL constant values from the shared config (per #117)
- [ ] The `bump_instance_ttl` / `bump_instance` function implementations are identical across crates
- [ ] A `///` comment in each bump function references the shared config constants
- [ ] `cargo build --workspace` compiles without errors
- [ ] All existing TTL-dependent tests pass without modification

Branch Suggestion:
refactor/deduplicate-ttl-bump-helpers

Commit Message Suggestions:
- `refactor: deduplicate TTL bump helpers across escrow_contract, extensions, and governance`
- `refactor: use shared config constants in all bump_instance_ttl implementations`
- `docs: add reference to shared config in TTL bump function comments`

PR Title:
refactor: Deduplicate `bump_instance_ttl` and `bump_persistent_ttl` across all contract crates

PR Description:
Summary:
This PR deduplicates the TTL bump helper functions across `escrow_contract`, `escrow_extensions`, and `governance` by ensuring all three use the same constant values from the shared config (introduced in #117). The implementations are aligned to be functionally identical.

Changes:
- Updated all three crates to use shared TTL constants
- Aligned `bump_instance` and `bump_persistent` implementations
- Added `///` comments referencing shared config in each bump function

Testing:
- Run `cargo build --workspace` to verify all crates compile
- Run `cargo test --workspace` to verify no regressions

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------

## #125 Refactor `migrate_v1_to_v2` to Process Escrows in Batches to Avoid Ledger Limits

Title: Refactor `StorageManager::migrate_v1_to_v2` to Process Escrows in Configurable Batches with Cursor

Body:

Category: Refactoring
Difficulty: Advanced
Priority: High
Estimated Time: 5–9 hours

Description:
`StorageManager::migrate_v1_to_v2` in `contracts/escrow_contract/src/storage.rs` uses a single `for escrow_id in 1..=escrow_counter` loop that reads and writes multiple persistent storage entries per escrow. For a contract with many escrows, this will exceed Soroban's per-transaction ledger entry limit (typically 64 entries), causing the migration transaction to fail. This complements issue #89 by refactoring the storage module itself rather than adding a new public function, making `migrate_v1_to_v2` accept a `start_id` and `max_count` parameter for caller-controlled batching.

Requirements and Context:
- `contracts/escrow_contract/src/storage.rs` — `StorageManager::migrate_v1_to_v2`, `StorageManager::migrate`
- Add `pub const MAX_MIGRATION_BATCH: u32 = 20;` to `storage.rs`
- Refactor `migrate_v1_to_v2(env: &Env) -> Result<(), EscrowError>` to `migrate_v1_to_v2(env: &Env, start_id: u64, max_count: u32) -> Result<u64, EscrowError>` returning the last migrated ID
- `StorageManager::migrate` calls `migrate_v1_to_v2(env, cursor, MAX_MIGRATION_BATCH)` and stores cursor in `DataKey::MigrationCursor`
- Returns `Ok(())` when cursor >= escrow_counter (migration complete), or a progress indicator

Acceptance Criteria:
- [ ] `MAX_MIGRATION_BATCH: u32 = 20` is defined in `storage.rs` with a `///` doc comment
- [ ] `migrate_v1_to_v2` accepts `start_id` and `max_count` parameters
- [ ] `StorageManager::migrate` uses a `MigrationCursor` to call `migrate_v1_to_v2` incrementally
- [ ] `StorageManager::get_version` returns the version only after migration is fully complete
- [ ] Unit tests verify: 5 escrows migrated in one batch (complete), 25 escrows migrated in two batches (cursor advances)

Branch Suggestion:
refactor/migrate-v1-to-v2-batch-processing

Commit Message Suggestions:
- `refactor: migrate_v1_to_v2 to accept start_id and max_count for batch processing`
- `refactor: add MAX_MIGRATION_BATCH constant and MigrationCursor to storage.rs`
- `test: add batch migration tests with cursor advancement for large escrow sets`

PR Title:
refactor: Refactor `migrate_v1_to_v2` for batch processing to avoid Soroban ledger entry limits

PR Description:
Summary:
This PR refactors `StorageManager::migrate_v1_to_v2` to accept `start_id` and `max_count` parameters, enabling batch-by-batch migration controlled by a `MigrationCursor` stored in instance storage. This prevents the migration transaction from failing due to Soroban's per-transaction ledger entry limits on deployments with many escrows.

Changes:
- Added `pub const MAX_MIGRATION_BATCH: u32 = 20;` to `storage.rs`
- Refactored `migrate_v1_to_v2` to accept `start_id: u64` and `max_count: u32`
- Updated `StorageManager::migrate` to use cursor-based batch migration
- Added unit tests verifying single-batch completion and multi-batch cursor advancement

Testing:
- Run `cargo test -p escrow_contract test_migrate_v1_to_v2_batch_processing`
- Verify cursor advances correctly when `escrow_counter > MAX_MIGRATION_BATCH`

Checklist:
- [ ] Code compiles (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or clearly stated)

--------------------------------------------------
