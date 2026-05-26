# Security Model

## Overview

StellarTrustEscrow uses a hybrid security model combining on-chain smart contract enforcement with off-chain API authentication and encryption. Funds are secured by Soroban smart contracts; user data is protected by JWT-based access control and TLS encryption in transit.

---

## Security Architecture

| Layer | Technology | Purpose |
|-------|------------|---------|
| Smart Contract | Soroban (Rust) | Fund locking, milestone release, authorization |
| API Authentication | JWT + refresh tokens | User identity, session management |
| Admin Access | x-admin-api-key header | Operational endpoints |
| Transport | TLS 1.3 | Encryption in transit |
| Database | PostgreSQL + Prisma | Encrypted at rest (provider-managed) |

---

## Data Classification

| Data Type | Classification | Storage | Access |
|-----------|---------------|---------|--------|
| Wallet addresses | Public | On-chain (Stellar) | Anyone |
| Escrow amounts | Public | On-chain | Anyone |
| Milestone descriptions | Public | On-chain + off-chain | Parties + public |
| Email addresses | Private | Off-chain (PostgreSQL) | User + admin |
| Password hashes | Private | Off-chain (bcrypt) | System only |
| KYC documents | Private | Off-chain (encrypted) | KYC provider + admin |

---

## Encryption

### At Rest
- PostgreSQL: Encrypted volumes (AWS RDS / managed provider)
- Application secrets: Environment variables, not in code
- KYC documents: AES-256 encryption before storage

### In Transit
- All API endpoints: TLS 1.3
- Wallet signatures: Ed25519 (Stellar native)
- Webhooks: HMAC-SHA256 signature verification

---

## Key Management

| Key Type | Generation | Storage | Rotation |
|----------|-----------|---------|----------|
| JWT secret | Random 256-bit | Environment variable | Every 90 days |
| Admin API key | Random 128-bit | Environment variable | On compromise |
| Stellar secret key | User-generated | Freighter wallet (client-side) | User-controlled |
| Webhook signing key | Random 256-bit | Environment variable | On compromise |

**Procedure**: Never log or transmit secret keys. Use environment injection at deploy time.

---

## Wallet Integration

- **Wallet**: Freighter browser extension
- **Authentication**: User signs message with Stellar secret key; backend verifies signature
- **Authorization**: Wallet address bound to JWT; enforced on wallet-scoped endpoints
- **Key storage**: Client-side only; backend never sees private keys

---

## Incident Response

See [`docs/incidents/README.md`](incidents/README.md) for full runbooks.

### Severity Levels

| Level | Response Time | Examples |
|-------|---------------|----------|
| SEV1 | < 5 min | Smart contract exploit, funds at risk |
| SEV2 | < 15 min | API authentication bypass, data leak |
| SEV3 | < 1 hour | Rate limit failure, indexer lag |
| SEV4 | Next business day | Minor UI bug, non-critical log noise |

### Response Steps

1. Acknowledge incident in Slack/PagerDuty
2. Triage severity and assign owner
3. Execute relevant runbook from `docs/incidents/runbooks/`
4. Communicate status to stakeholders
5. Conduct post-mortem within 72 hours

---

## Bug Bounty

See [`docs/BUG_BOUNTY.md`](BUG_BOUNTY.md) for full terms, scope, and rewards.

---

## Contact

- Security issues: security@stellartrustescrow.example.com
- PGP key: `docs/pgp-key.txt`
- Response SLA: 24 hours (critical), 72 hours (non-critical)
