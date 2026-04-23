# Privacy Policy

## Overview

StellarTrustEscrow is a decentralized escrow platform. On-chain data (wallet addresses, escrow amounts, milestones) is public and immutable. Off-chain data (email, KYC documents) is stored securely and processed in compliance with GDPR.

---

## GDPR Compliance

### Data Controller

StellarTrustEscrow operates as a data controller for off-chain user data (email, profile). On-chain data is processed by smart contracts and is outside GDPR's scope (public ledger).

### Legal Basis

| Data Type | Legal Basis | Purpose |
|-----------|-------------|---------|
| Email address | Contract performance | Account management, notifications |
| KYC documents | Legal obligation | Anti-money laundering (AML) compliance |
| Wallet address | Contract performance | Escrow creation, reputation tracking |
| Usage logs | Legitimate interest | Security monitoring, fraud prevention |

### User Rights

| Right | Implementation |
|-------|---------------|
| Access | `GET /api/users/me` |
| Rectification | `PATCH /api/users/me` |
| Erasure | `DELETE /api/users/me` (off-chain data only) |
| Portability | `GET /api/users/me/export` |
| Objection | Contact privacy@stellartrustescrow.example.com |

**Note**: On-chain data (wallet addresses, escrow history) cannot be deleted. Users can disassociate email from wallet by deleting account.

---

## Privacy Guarantees

- **No private key access**: Backend never sees or stores Stellar private keys
- **Minimal data collection**: Only data required for escrow + AML compliance
- **No tracking**: No third-party analytics or ad trackers
- **Transparent storage**: On-chain data visible to all; off-chain data disclosed here
- **Retention limits**: Off-chain logs retained 90 days; KYC documents retained 7 years (legal requirement)

---

## Third-Party Services

| Service | Purpose | Data Shared | GDPR Compliance |
|---------|---------|-------------|-----------------|
| Stellar Network | Smart contract execution | Wallet addresses, escrow data | Public ledger (not GDPR scope) |
| Freighter Wallet | Client-side key management | None (client-side only) | N/A |
| AWS RDS | PostgreSQL hosting | Email, profile, KYC | AWS GDPR DPA |
| SendGrid | Email delivery | Email address | Twilio GDPR DPA |
| KYC Provider | Identity verification | KYC documents | Provider GDPR DPA |

### Risk Assessment

- **Stellar Network**: Public blockchain; data immutable. Mitigation: Only public data on-chain.
- **AWS RDS**: Encrypted at rest, SOC 2 certified. Mitigation: Regular audits, encryption.
- **SendGrid**: Email processed in transit. Mitigation: Minimal data, encrypted transport.
- **KYC Provider**: Highest risk due to document sensitivity. Mitigation: AES-256 encryption, strict access controls, vendor GDPR compliance verified.

---

## Contact

- Data Protection Officer: dpo@stellartrustescrow.example.com
- Privacy inquiries: privacy@stellartrustescrow.example.com
- Supervisory authority: [Your local DPA]
