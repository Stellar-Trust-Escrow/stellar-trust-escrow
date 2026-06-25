# Database Schema

> **Source of truth:** [`backend/database/schema.prisma`](../backend/database/schema.prisma)
> **Last updated:** 2026-06-25
>
> To regenerate the Prisma client after schema changes: `npx prisma generate`
> To apply schema changes: `npx prisma migrate dev --name <description>`

---

## Contents

1. [Overview](#overview)
2. [Entity-Relationship Diagram](#entity-relationship-diagram)
3. [Enums](#enums)
4. [Tables](#tables)
   - [tenants](#tenants)
   - [users](#users)
   - [mfa\_methods](#mfa_methods)
   - [mfa\_attempts](#mfa_attempts)
   - [mfa\_lockouts](#mfa_lockouts)
   - [refresh\_tokens](#refresh_tokens)
   - [escrows](#escrows)
   - [milestones](#milestones)
   - [reputation\_records](#reputation_records)
   - [reputation\_events](#reputation_events)
   - [disputes](#disputes)
   - [dispute\_evidence](#dispute_evidence)
   - [dispute\_appeals](#dispute_appeals)
   - [user\_profiles](#user_profiles)
   - [contract\_events](#contract_events)
   - [webhook\_subscriptions](#webhook_subscriptions)
   - [webhook\_deliveries](#webhook_deliveries)
   - [indexer\_state](#indexer_state)
   - [payments](#payments)
   - [kyc\_verifications](#kyc_verifications)
   - [admin\_audit\_logs](#admin_audit_logs)
   - [audit\_logs](#audit_logs)
   - [feature\_flags](#feature_flags)
   - [chat\_room\_keys](#chat_room_keys)
   - [chat\_messages](#chat_messages)
5. [Patterns](#patterns)
   - [Multi-tenancy](#multi-tenancy-pattern)
   - [Append-only audit logs](#append-only-audit-log-pattern)
   - [Escrow archiving](#escrow-archive-partitioning)
   - [Keeping the ERD in sync](#keeping-the-erd-in-sync)

---

## Overview

The database is PostgreSQL, managed via Prisma. Every domain table carries a `tenant_id` foreign key that scopes all data to a specific tenant. There is no soft-delete pattern — records are either archived (escrows) or retained permanently (audit logs).

**25 tables** across six domains:

| Domain | Tables |
|--------|--------|
| Identity & Auth | `tenants`, `users`, `mfa_methods`, `mfa_attempts`, `mfa_lockouts`, `refresh_tokens` |
| Escrow & Milestones | `escrows`, `milestones` |
| Reputation | `reputation_records`, `reputation_events` |
| Disputes & Chat | `disputes`, `dispute_evidence`, `dispute_appeals`, `chat_room_keys`, `chat_messages` |
| Platform | `user_profiles`, `contract_events`, `webhook_subscriptions`, `webhook_deliveries`, `indexer_state`, `payments`, `kyc_verifications`, `feature_flags` |
| Audit | `admin_audit_logs`, `audit_logs` |

---

## Entity-Relationship Diagram

```mermaid
erDiagram
    tenants ||--o{ users : "has"
    tenants ||--o{ escrows : "has"
    tenants ||--o{ milestones : "has"
    tenants ||--o{ disputes : "has"
    tenants ||--o{ dispute_evidence : "has"
    tenants ||--o{ dispute_appeals : "has"
    tenants ||--o{ reputation_records : "has"
    tenants ||--o{ reputation_events : "has"
    tenants ||--o{ user_profiles : "has"
    tenants ||--o{ contract_events : "has"
    tenants ||--o{ webhook_subscriptions : "has"
    tenants ||--o{ payments : "has"
    tenants ||--o{ kyc_verifications : "has"
    tenants ||--o{ admin_audit_logs : "has"
    tenants ||--o{ audit_logs : "has"

    users ||--o{ mfa_methods : "has"
    users ||--o{ mfa_attempts : "has"
    users ||--o| mfa_lockouts : "has"
    users ||--o{ refresh_tokens : "has"

    escrows ||--o{ milestones : "has"
    escrows ||--o| disputes : "has"

    disputes ||--o{ dispute_evidence : "has"
    disputes ||--o{ dispute_appeals : "has"
    disputes ||--o{ chat_room_keys : "has"
    disputes ||--o{ chat_messages : "has"

    webhook_subscriptions ||--o{ webhook_deliveries : "has"

    tenants {
        string id PK
        string slug UK
        string name
        string status
        string[] domains
        json branding
        json configuration
        json metadata
        datetime created_at
        datetime updated_at
    }

    users {
        int id PK
        string tenant_id FK
        string email UK
        string password
        string wallet_address UK
        string role
        bool mfa_enabled
        bool mfa_enforced
        datetime created_at
        datetime updated_at
    }

    escrows {
        bigint id PK
        string tenant_id FK
        string client_address
        string freelancer_address
        string arbiter_address
        string token_address
        string total_amount
        string remaining_balance
        EscrowStatus status
        string brief_hash
        datetime deadline
        bigint created_ledger
        datetime created_at
        datetime updated_at
    }

    milestones {
        int id PK
        string tenant_id FK
        int milestone_index
        bigint escrow_id FK
        string title
        string description_hash
        string amount
        MilestoneStatus status
        datetime submitted_at
        datetime resolved_at
    }

    disputes {
        int id PK
        string tenant_id FK
        bigint escrow_id FK_UK
        string raised_by_address
        datetime raised_at
        datetime resolved_at
        string client_amount
        string freelancer_amount
        string resolved_by
        string resolution
        string resolution_type
        bool auto_resolved
    }

    dispute_evidence {
        int id PK
        string tenant_id FK
        int dispute_id FK
        string submitted_by
        string role
        string evidence_type
        string content
        string ipfs_cid
        string file_hash
        string merkle_root
        string scan_status
        datetime submitted_at
    }

    dispute_appeals {
        int id PK
        string tenant_id FK
        int dispute_id FK
        string appealed_by
        string reason
        string status
        string reviewed_by
        string review_notes
        datetime created_at
        datetime resolved_at
    }

    reputation_records {
        string address PK
        string tenant_id FK
        bigint total_score
        int completed_escrows
        int disputed_escrows
        int disputes_won
        string total_volume
        datetime last_updated
        datetime updated_at
    }

    reputation_events {
        bigint id PK
        string tenant_id
        string address
        string event_type
        int delta
        bigint escrow_id
        int dispute_id
        bigint ledger
        json metadata
        datetime created_at
    }

    payments {
        string id PK
        string tenant_id FK
        string address
        bigint escrow_id
        string stripe_session_id UK
        string stripe_payment_intent UK
        int amount_fiat
        string amount_crypto
        string currency
        PaymentStatus status
        string refund_id
        datetime created_at
        datetime updated_at
    }

    webhook_subscriptions {
        string id PK
        string tenant_id FK
        string url
        string secret
        string[] event_types
        bool is_active
        string created_by
        datetime created_at
        datetime updated_at
    }

    webhook_deliveries {
        string id PK
        string subscription_id FK
        string event_type
        json payload
        string status
        int attempts
        int response_code
        string error_message
        datetime last_attempt_at
        datetime created_at
    }

    audit_logs {
        bigint id PK
        string tenant_id FK
        string category
        string action
        string actor
        string resource_id
        json metadata
        int status_code
        string ip_address
        datetime created_at
    }
```

---

## Enums

| Enum | Values |
|------|--------|
| `EscrowStatus` | `Active` · `Completed` · `Disputed` · `Cancelled` |
| `MilestoneStatus` | `Pending` · `Submitted` · `Approved` · `Rejected` |
| `MfaType` | `TOTP` · `WEBAUTHN` |
| `KycStatus` | `Pending` · `Init` · `Processing` · `Approved` · `Declined` |
| `PaymentStatus` | `Pending` · `Processing` · `Completed` · `Failed` · `Refunded` |

---

## Tables


### tenants

Root of the multi-tenant hierarchy; every other domain table has a `tenant_id` FK pointing here.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `TEXT` | PK, CUID | Stable identifier used as FK target across all tables |
| `slug` | `TEXT` | UNIQUE NOT NULL | URL-safe tenant identifier |
| `name` | `TEXT` | NOT NULL | Human-readable display name |
| `status` | `TEXT` | NOT NULL DEFAULT `'active'` | Lifecycle state; `active` \| `suspended` |
| `domains` | `TEXT[]` | NOT NULL DEFAULT `{}` | Allowed origin domains for CORS and routing |
| `branding` | `JSONB` | nullable | Logo, colours, custom UI config |
| `configuration` | `JSONB` | nullable | Feature toggles and per-tenant settings |
| `metadata` | `JSONB` | nullable | Free-form operational metadata |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Auto-updated |

**Indexes:** primary key on `id`, unique on `slug`.

---

### users

Platform accounts. Authentication is wallet-based (Stellar address); `email` and `password` support traditional login.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `SERIAL` | PK | |
| `tenant_id` | `TEXT` | FK → tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT | |
| `email` | `TEXT` | UNIQUE NOT NULL | |
| `password` | `TEXT` | NOT NULL | Bcrypt hash |
| `wallet_address` | `TEXT` | UNIQUE nullable | Stellar public key (G…) |
| `role` | `TEXT` | NOT NULL DEFAULT `'user'` | `user` \| `admin` \| `superadmin` |
| `mfa_enabled` | `BOOL` | NOT NULL DEFAULT `false` | User has enrolled at least one MFA method |
| `mfa_enforced` | `BOOL` | NOT NULL DEFAULT `false` | MFA required for high-value operations |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Auto-updated |

**Indexes:** `(tenant_id, created_at DESC)`, `(tenant_id, email)`, `(wallet_address)`, `(role)`.

---

### mfa_methods

TOTP and WebAuthn credentials registered by a user. One user can have multiple methods.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `TEXT` | PK, CUID | |
| `user_id` | `INT` | FK → users(id) ON DELETE CASCADE | |
| `tenant_id` | `TEXT` | NOT NULL | Denormalised for tenant-scoped queries |
| `type` | `MfaType` | NOT NULL | `TOTP` or `WEBAUTHN` |
| `name` | `TEXT` | NOT NULL | User-visible label (e.g. "iPhone 15") |
| `is_active` | `BOOL` | NOT NULL DEFAULT `true` | |
| `is_primary` | `BOOL` | NOT NULL DEFAULT `false` | Preferred method for prompts |
| `totp_secret` | `TEXT` | nullable | Encrypted TOTP seed (TOTP only) |
| `totp_backup_codes` | `TEXT[]` | DEFAULT `{}` | Encrypted one-time backup codes |
| `credential_id` | `TEXT` | UNIQUE nullable | Base64 WebAuthn credential ID |
| `public_key` | `TEXT` | nullable | Base64 WebAuthn public key |
| `counter` | `BIGINT` | DEFAULT `0` | Replay-protection counter (WebAuthn) |
| `transports` | `TEXT[]` | DEFAULT `{}` | `usb` \| `nfc` \| `ble` \| `internal` |
| `aaguid` | `TEXT` | nullable | Authenticator model identifier |
| `last_used_at` | `TIMESTAMPTZ` | nullable | |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Auto-updated |

**Indexes:** `(user_id, tenant_id)`, `(user_id, is_active)`, `(type, is_active)`, `(credential_id)`.

---

### mfa_attempts

Immutable log of every MFA verification attempt; used for brute-force detection and security auditing.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `TEXT` | PK, CUID | |
| `user_id` | `INT` | FK → users(id) ON DELETE CASCADE | |
| `tenant_id` | `TEXT` | NOT NULL | |
| `method_type` | `MfaType` | NOT NULL | |
| `success` | `BOOL` | NOT NULL | |
| `ip_address` | `TEXT` | NOT NULL | |
| `user_agent` | `TEXT` | nullable | |
| `failure_reason` | `TEXT` | nullable | Machine-readable failure code |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` | Append-only; never updated |

**Indexes:** `(user_id, created_at DESC)`, `(user_id, success, created_at DESC)`, `(ip_address, created_at DESC)`, `(created_at)`.

---

### mfa_lockouts

Active lockout record for a user who has exceeded the failed-attempt threshold. One row per user (UNIQUE on `user_id`).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `TEXT` | PK, CUID | |
| `user_id` | `INT` | UNIQUE NOT NULL | No FK — survives user soft-disable |
| `tenant_id` | `TEXT` | NOT NULL | |
| `locked_until` | `TIMESTAMPTZ` | NOT NULL | Lockout expires at this timestamp |
| `reason` | `TEXT` | NOT NULL DEFAULT `'Too many failed MFA attempts'` | |
| `attempts` | `INT` | NOT NULL DEFAULT `0` | Count that triggered the lockout |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Auto-updated |

**Indexes:** `(user_id, locked_until)`, `(locked_until)`.

---

### refresh_tokens

Active refresh token registry. Tokens are stored as SHA-256 hashes; the raw token is never persisted.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `TEXT` | PK, CUID | |
| `user_id` | `INT` | FK → users(id) ON DELETE CASCADE | |
| `tenant_id` | `TEXT` | NOT NULL | |
| `token_hash` | `TEXT` | UNIQUE NOT NULL | SHA-256 of the raw JWT refresh token |
| `device_info` | `JSONB` | nullable | Browser / OS fingerprint |
| `ip_address` | `TEXT` | nullable | IP at token issuance |
| `user_agent` | `TEXT` | nullable | |
| `is_active` | `BOOL` | NOT NULL DEFAULT `true` | Set to `false` on logout or rotation |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL | Hard expiry for token TTL queries |
| `last_used_at` | `TIMESTAMPTZ` | nullable | Updated on each use |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Auto-updated |

**Indexes:** `(user_id, tenant_id)`, `(token_hash)`, `(expires_at)`, `(is_active)`.

---

### escrows

Mirror of on-chain escrow state; the primary key is the contract-assigned `escrow_id` (BigInt). Completed escrows are periodically moved to monthly archive partitions.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `BIGINT` | PK | On-chain escrow ID from the Soroban contract |
| `tenant_id` | `TEXT` | FK → tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT | |
| `client_address` | `TEXT` | NOT NULL | Stellar address of the funder |
| `freelancer_address` | `TEXT` | NOT NULL | Stellar address of the contractor |
| `arbiter_address` | `TEXT` | nullable | Assigned arbiter for dispute resolution |
| `token_address` | `TEXT` | NOT NULL | Stellar asset contract address (e.g. USDC) |
| `total_amount` | `TEXT` | NOT NULL | BigInt serialised as string (contract precision) |
| `remaining_balance` | `TEXT` | NOT NULL | Decrements as milestones are approved |
| `status` | `EscrowStatus` | NOT NULL | `Active` · `Completed` · `Disputed` · `Cancelled` |
| `brief_hash` | `TEXT` | NOT NULL | IPFS CID of the work brief |
| `deadline` | `TIMESTAMPTZ` | nullable | Optional contract deadline |
| `created_ledger` | `BIGINT` | NOT NULL | Stellar ledger sequence at creation |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | Set from ledger close time |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Auto-updated |

**Indexes:** 17 indexes covering all common query patterns — tenant + status, tenant + client/freelancer address, combined status + address + date sorts, and standalone address indexes for cross-tenant reputation lookups.

**Archive:** Monthly partition tables `escrows_archive_YYYY_MM` are created via `CREATE TABLE … LIKE escrows INCLUDING ALL`. The `escrow_partition_manifest` table tracks which partitions exist.

---

### milestones

Individual deliverable units within an escrow. The `(escrow_id, milestone_index)` pair is unique and mirrors the on-chain index.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `SERIAL` | PK | |
| `tenant_id` | `TEXT` | FK → tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT | |
| `milestone_index` | `INT` | NOT NULL | Zero-based index within the escrow |
| `escrow_id` | `BIGINT` | FK → escrows(id) NOT NULL | |
| `title` | `TEXT` | NOT NULL | |
| `description_hash` | `TEXT` | NOT NULL | IPFS CID of milestone deliverable description |
| `amount` | `TEXT` | NOT NULL | BigInt as string — funds released on approval |
| `status` | `MilestoneStatus` | NOT NULL | `Pending` → `Submitted` → `Approved` / `Rejected` |
| `submitted_at` | `TIMESTAMPTZ` | nullable | Set when contractor submits |
| `resolved_at` | `TIMESTAMPTZ` | nullable | Set when client approves or rejects |

**Constraints:** UNIQUE `(escrow_id, milestone_index)`.
**Indexes:** `(tenant_id, escrow_id)`, `(tenant_id, status)`, `(escrow_id)`, `(status)`.

---

### reputation_records

Aggregated reputation score per Stellar address, derived from `reputation_events`. The address is the primary key — one row per wallet across the platform.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `address` | `TEXT` | PK | Stellar wallet address |
| `tenant_id` | `TEXT` | FK → tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT | |
| `total_score` | `BIGINT` | NOT NULL DEFAULT `0` | Sum of all reputation event deltas |
| `completed_escrows` | `INT` | NOT NULL DEFAULT `0` | |
| `disputed_escrows` | `INT` | NOT NULL DEFAULT `0` | |
| `disputes_won` | `INT` | NOT NULL DEFAULT `0` | |
| `total_volume` | `TEXT` | NOT NULL DEFAULT `'0'` | Cumulative contract value (BigInt as string) |
| `last_updated` | `TIMESTAMPTZ` | NOT NULL | Last event timestamp applied |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Auto-updated |

**Indexes:** `(tenant_id, address)`, `(tenant_id, total_score DESC)`, `(total_score DESC)`.

---

### reputation_events

Append-only ledger of every reputation-affecting event. The `reputation_records` aggregate is derived from these rows and can be rebuilt from them at any time.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `BIGINT` | PK, autoincrement | Monotonically increasing |
| `tenant_id` | `TEXT` | NOT NULL | |
| `address` | `TEXT` | NOT NULL | Stellar address whose score changed |
| `event_type` | `TEXT` | NOT NULL | `ESCROW_COMPLETED` · `DISPUTE_WON` · `DISPUTE_LOST` · `ESCROW_CANCELLED` |
| `delta` | `INT` | NOT NULL | Signed score change |
| `escrow_id` | `BIGINT` | nullable | Source escrow |
| `dispute_id` | `INT` | nullable | Source dispute |
| `ledger` | `BIGINT` | nullable | Stellar ledger sequence of the on-chain event |
| `metadata` | `JSONB` | nullable | Resolution details, admin notes |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` | Immutable — never updated |

**Indexes:** `(tenant_id, address, created_at DESC)`, `(address, created_at DESC)`, `(tenant_id, event_type)`, `(escrow_id)`, `(dispute_id)`, `(created_at DESC)`.

---
