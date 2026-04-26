# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Test coverage for governance quorum-not-reached scenario resulting in `Defeated` proposal status (#658)
- Test coverage for `execute_proposal` rejection on `Defeated` proposals (#658)
- Test coverage for `cast_vote` rejection after `cancel_proposal` (#659)
- Test coverage for double-cancel rejection in governance (#659)
- `ProposalAlreadyCancelled` error variant (code 21) in `GovError` (#659)
- Guard in `cancel_proposal` that returns `ProposalAlreadyCancelled` when the proposal is already in `Cancelled` state (#659)
- Pause test coverage for `reject_milestone`, `release_funds`, `start_timelock`, `extend_lock_time`, and `process_recurring_payments` returning `ContractPaused` (#660)

## [2.0.0] - 2026-04-21

> **Breaking change:** Storage schema migration from v1 to v2. Existing escrow data must be migrated using the provided migration scripts before upgrading.

### Added

- Security hardening: ledger limits, batch operation caps, and admin auditability (#750)
- `get_admin` view function for on-chain admin address inspection (#741)
- `update_arbiter` function to replace the arbiter on an active escrow (#738)
- `get_milestone_approvals` view function for multisig approval state (#737)
- `get_contract_balance` view function (#733)
- `transfer_client_role` function for transferring client address ownership (#732)
- `batch_reject_milestones` as counterpart to `batch_approve_milestones` (#730)
- `update_milestone_description_hash` for revising rejected milestones (#729)
- `admin_changed` event emitted during `initialize` and admin transfers (#728)
- `RecurringScheduleStatus` view, `client_approve_cancellation`, `MAX_BUYER_SIGNERS` cap, and `brief_hash` zero-value validation (#726)
- Batch escrow creation, protocol fees, on-chain arbitration, and proxy upgrade pattern (#723)
- Governance contract: on-chain proposal lifecycle with quorum, approval threshold, and timelock (#721)
- Oracle integration with primary/fallback price feeds and staleness checks (#721)
- Storage migration framework for contract schema upgrades (#721)
- Wormhole bridge integration for cross-chain escrow (#720)
- Slashing mechanism for freelancer penalty enforcement (#720)
- On-chain reputation scoring system (#720)
- Arbiter role guide and dispute resolution documentation (#720)
- IPFS-backed evidence upload for disputes (#588)

### Changed

- Validated that arbiter must be distinct from client and freelancer (#735)
- Validated that freelancer address must differ from client address (#734)
- Maximum escrow amount cap enforced to prevent overflow (#736)

### Fixed

- Security fixes batch: input validation, access control hardening (#749)

## [1.0.0] - 2025-12-01

### Added

- Milestone-based escrow contract on Soroban (Stellar)
- `create_escrow`, `add_milestone`, `submit_milestone`, `approve_milestone` core flow
- Dispute resolution via `raise_dispute` and `resolve_dispute`
- Emergency pause/unpause mechanism (`pause`, `unpause`, `is_paused`)
- On-chain reputation tracking updated on milestone completion
- Recurring payment schedules with configurable intervals and termination conditions
- Timelock support: `start_timelock`, `extend_lock_time`
- Multisig approval configuration for milestone sign-off
- Cancellation request flow with dispute window
- Gas-optimized milestone storage and batch operations
- Backend REST API with Express, PostgreSQL, and Prisma ORM
- Redis caching layer for escrow queries
- Rate limiting on backend API endpoints
- Next.js 14 frontend with Freighter wallet integration
- CI/CD pipeline with GitHub Actions
- Contributor onboarding guide and smart contract security audit checklist

[Unreleased]: https://github.com/Stellar-Trust-Escrow/stellar-trust-escrow/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Stellar-Trust-Escrow/stellar-trust-escrow/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/Stellar-Trust-Escrow/stellar-trust-escrow/releases/tag/v1.0.0
