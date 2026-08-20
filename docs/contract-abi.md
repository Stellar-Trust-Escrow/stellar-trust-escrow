**Contract ABI & Entry Points**

Audience: Developers & Operators — reference for Soroban contract entry-points, call signatures, and quick verification steps.

Overview
- This document lists the exported Soroban contract entry points implemented in `contracts/escrow_contract/src/lib.rs`.
- Use this as a quick reference when building clients, writing integration tests, or auditing contract behaviour.

Quick verification (tested)
- Build the contract (verifies signatures compile):

```bash
cargo build --manifest-path contracts/escrow_contract/Cargo.toml
```

- List exported entry points (search source):

```bash
grep -n "pub fn " contracts/escrow_contract/src/lib.rs
```

Primary exported functions
(function signature → short purpose / caller)

- `initialize(env: Env, admin: Address) -> Result<(), EscrowError>` — set initial admin; one-time.
- `set_admin_multisig(env: Env, caller: Address, admin_signers: Vec<Address>, threshold: u32) -> Result<(), EscrowError>` — admin multisig config.
- `freeze_escrow(env: Env, escrow_id: u64, admin_signers: Vec<Address>) -> Result<(), EscrowError>` — admin freeze.
- `unfreeze_escrow(env: Env, escrow_id: u64, admin_signers: Vec<Address>) -> Result<(), EscrowError>` — admin unfreeze.

- Oracle / price helpers
- `set_oracle(env: Env, caller: Address, oracle: Address) -> Result<(), EscrowError>` — admin sets oracle.
- `set_fallback_oracle(env: Env, caller: Address, oracle: Address) -> Result<(), EscrowError>`
- `set_oracle_stale_threshold(env: Env, caller: Address, threshold_seconds: u64) -> Result<(), EscrowError>`
- `get_price(env: Env, asset: Address) -> Result<i128, EscrowError>` — view price.
- `convert_amount(env: Env, amount: i128, from_asset: Address, to_asset: Address) -> Result<i128, EscrowError>`

- Bridge / wrapped tokens
- `set_wormhole_bridge(env: Env, caller: Address, bridge_addr: Address) -> Result<(), EscrowError>`
- `register_wrapped_token(env: Env, caller: Address, info: bridge::WrappedTokenInfo) -> Result<(), EscrowError>`
- `get_wrapped_token_info(env: Env, token: Address) -> Option<bridge::WrappedTokenInfo>`
- `update_bridge_confirmation(env: Env, token: Address, bridge_protocol: bridge::BridgeProtocol, confirmations: u32) -> Result<(), EscrowError>`
- `get_bridge_confirmation(env: Env, token: Address) -> Option<bridge::BridgeConfirmation>`

- Fee / treasury configuration
- `set_min_arbiter_reputation(env: Env, caller: Address, new_min: u64) -> Result<(), EscrowError>`
- `get_min_arbiter_reputation(env: Env) -> u64`
- `set_governance_contract(env: Env, caller: Address, governance_addr: Address) -> Result<(), EscrowError>`
- `get_governance_contract(env: Env) -> Option<Address>`
- `set_platform_treasury(env: Env, caller: Address, treasury: Address) -> Result<(), EscrowError>`
- `get_platform_treasury(env: Env) -> Option<Address>`
- `set_platform_fee_tiers(env: Env, caller: Address, tiers: Vec<FeeTier>) -> Result<(), EscrowError>`
- `get_platform_fee_tiers(env: Env) -> Vec<FeeTier>`

- Escrow lifecycle & creation
- `create_escrow(env: Env, client: Address, freelancer: Address, token: Address, total_amount: i128, brief_hash: BytesN<32>, arbiter: Option<Address>, deadline: Option<u64>, lock_time: Option<u64>, _timelock: Option<Timelock>, _multisig_config: MultisigConfig) -> Result<u64, EscrowError>` — primary creation call; locks funds.
- `create_escrow_dispute_timeout(..., dispute_timeout_ledger: u32) -> Result<u64, EscrowError>` — create with explicit dispute timeout.
- `create_escrow_with_nft_gate(env: Env, caller: Address, nft_contract: Address, token_id: u64, ...) -> Result<u64, EscrowError>` — NFT-gated creation.
- `create_escrow_with_buyer_signers(env: Env, client: Address, ..., buyer_signers: Vec<Address>) -> Result<u64, EscrowError>`
- `create_recurring_escrow(env: Env, client: Address, freelancer: Address, token: Address, payment_amount: i128, interval: RecurringInterval, start_time: u64, end_date: Option<u64>, number_of_payments: Option<u32>, brief_hash: BytesN<32>) -> Result<u64, EscrowError>`

- Milestones
- `add_milestone(env: Env, caller: Address, escrow_id: u64, title: String, description_hash: BytesN<32>, amount: i128) -> Result<u32, EscrowError>`
- `update_milestone_title(env: Env, caller: Address, escrow_id: u64, milestone_id: u32, new_title: String) -> Result<(), EscrowError>`
- `batch_add_milestones(env: Env, caller: Address, escrow_id: u64, titles: Vec<String>, description_hashes: Vec<BytesN<32>>, amounts: Vec<i128>) -> Result<u32, EscrowError>`
- `batch_approve_milestones(env: Env, caller: Address, escrow_id: u64, milestone_ids: Vec<u32>) -> Result<i128, EscrowError>`
- `batch_release_funds(env: Env, caller: Address, escrow_id: u64, milestone_ids: Vec<u32>) -> Result<i128, EscrowError>`
- `submit_milestone(env: Env, caller: Address, escrow_id: u64, milestone_id: u32) -> Result<(), EscrowError>`
- `approve_milestone(env: Env, caller: Address, escrow_id: u64, milestone_id: u32) -> Result<(), EscrowError>`
- `reject_milestone(env: Env, caller: Address, escrow_id: u64, milestone_id: u32) -> Result<(), EscrowError>`
- `reject_milestone_with_reason(env: Env, caller: Env, escrow_id: u64, milestone_id: u32, reason_hash: BytesN<32>) -> Result<(), EscrowError>`
- `release_funds(env: Env, caller: Address, escrow_id: u64, milestone_id: u32) -> Result<(), EscrowError>` — admin fallback.

- Cancellation & partial flows
- `transfer_client_role(env: Env, escrow_id: u64, new_client: Address) -> Result<(), EscrowError>`
- `cancel_escrow(env: Env, caller: Address, escrow_id: u64) -> Result<(), EscrowError>` — full cancel and refunds.
- `split_escrow(env: Env, caller: Address, escrow_id: u64, split_amount: i128, new_brief_hash: BytesN<32>) -> Result<(u64,u64), EscrowError>`
- `partial_cancel(env: Env, caller: Address, escrow_id: u64) -> Result<i128, EscrowError>`

- Time locks & recurring
- `start_timelock(env: Env, caller: Address, escrow_id: u64, duration_ledger: u64) -> Result<(), EscrowError>`
- `extend_lock_time(env: Env, caller: Address, escrow_id: u64, new_lock_time: u64) -> Result<(), EscrowError>`
- `process_recurring_payments(env: Env, escrow_id: u64) -> Result<u32, EscrowError>`
- `pause_recurring_schedule(env: Env, caller: Address, escrow_id: u64) -> Result<(), EscrowError>`
- `resume_recurring_schedule(env: Env, caller: Address, escrow_id: u64) -> Result<(), EscrowError>`
- `cancel_recurring_escrow(env: Env, caller: Address, escrow_id: u64) -> Result<(), EscrowError>`

- Dispute resolution
- `raise_dispute(env: Env, caller: Address, escrow_id: u64, milestone_id: Option<u32>) -> Result<(), EscrowError>`
- `claim_dispute_timeout(env: Env, caller: Address, escrow_id: u64) -> Result<(), EscrowError>`
- `resolve_dispute(env: Env, caller: Address, escrow_id: u64, client_amount: i128, freelancer_amount: i128) -> Result<(), EscrowError>`
- `escalate_dispute_to_governance(env: Env, caller: Address, escrow_id: u64) -> Result<u64, EscrowError>`
- `set_trusted_oracle_key(env: Env, caller: Address, pubkey: BytesN<32>) -> Result<(), EscrowError>`
- `oracle_resolve_dispute(env: Env, escrow_id: u64, payload: types::OracleResolutionPayload, grace_period_seconds: u64) -> Result<(), EscrowError>`

- Reputation & admin
- `update_reputation(env: Env, address: Address, completed: bool, disputed: bool, volume: i128) -> Result<(), EscrowError>`
- `upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) -> Result<(), EscrowError>`
- `pause(env: Env, caller: Address) -> Result<(), EscrowError>`
- `unpause(env: Env, caller: Address) -> Result<(), EscrowError>`
- `is_paused(env: Env) -> bool`
- `get_admin(env: Env) -> Result<Address, EscrowError>`
- `propose_admin(env: Env, caller: Address, new_admin: Address) -> Result<(), EscrowError>`
- `accept_admin(env: Env, caller: Address) -> Result<(), EscrowError>`

- Token whitelist & templates
- `add_approved_token(env: Env, caller: Address, token: Address) -> Result<(), EscrowError>`
- `remove_approved_token(env: Env, caller: Address, token: Address) -> Result<(), EscrowError>`
- `set_token_whitelist_enabled(env: Env, caller: Address, enabled: bool) -> Result<(), EscrowError>`
- `create_template(env: Env, caller: Address, name: String, milestones: Vec<MilestoneTemplate>) -> Result<u64, EscrowError>`
- `get_template(env: Env, template_id: u64) -> Result<EscrowTemplate, EscrowError>`
- `create_escrow_from_template(env: Env, caller: Address, template_id: u64, ...) -> Result<u64, EscrowError>`

- Read-only / views
- `get_escrow(env: Env, escrow_id: u64) -> Result<EscrowState, EscrowError>`
- `get_escrow_meta(env: Env, escrow_id: u64) -> Result<EscrowMeta, EscrowError>`
- `get_reputation(env: Env, address: Address) -> Result<ReputationRecord, EscrowError>`
- `get_milestone(env: Env, escrow_id: u64, milestone_id: u32) -> Result<Milestone, EscrowError>`
- `get_milestone_approvals(env: Env, escrow_id: u64, milestone_id: u32) -> Result<Vec<ApprovalRecord>, EscrowError>`
- `get_escrow_ids_by_participant(env: Env, participant: Address, offset: u32, limit: u32) -> Vec<u64>`
- `get_escrow_ids_by_status(env: Env, status: EscrowStatus, offset: u32, limit: u32) -> Vec<u64>`
- `escrow_count(env: Env) -> u64`

Notes & recommendations
- Prefer batch APIs (`batch_add_milestones`, `batch_approve_milestones`, `batch_release_funds`) when operating on multiple milestones to reduce gas and token transfer calls.
- All mutating calls that change contract state require the caller to `require_auth()` (Stellar transaction signer) and typically require client/freelancer/admin role checks — consult function docstrings in source for exact auth rules.
- Events are emitted for key lifecycle changes (milestone added/submitted/approved/rejected, dispute events, rent events, etc.) — frontends should subscribe to events during UX flows.

Where to read source
- Contract implementation: [contracts/escrow_contract/src/lib.rs](contracts/escrow_contract/src/lib.rs)

See practical examples in `docs/contract-examples.md` which use the frontend helpers in `frontend/lib/stellar.js`.
