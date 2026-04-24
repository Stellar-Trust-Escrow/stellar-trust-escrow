# Bug Bounty Program

## Overview

StellarTrustEscrow rewards security researchers who responsibly disclose vulnerabilities. We value the security community and commit to fast response times and fair rewards.

---

## Terms

- **Safe harbor**: We will not pursue legal action against researchers who follow these rules
- **Responsible disclosure**: Report vulnerabilities privately before public disclosure
- **No unauthorized access**: Do not access, modify, or delete others' data
- **No automated scanning**: Manual testing only; do not use automated scanners
- **Original reports**: Only first reporter eligible for reward
- **Good faith**: Demonstrate impact with clear reproduction steps

---

## Scope

### In Scope

| Asset | Type | Focus Areas |
|-------|------|-------------|
| `stellartrustescrow.example.com` | Web app | XSS, CSRF, authentication bypass |
| `api.stellartrustescrow.example.com` | API | Rate limit bypass, authorization flaws |
| `contracts/escrow_contract` | Smart contract | Fund theft, authorization bypass, arithmetic errors |
| Freighter integration | Wallet | Signature replay, phishing vectors |

### Out of Scope

- DDoS attacks
- Social engineering
- Physical security
- Third-party services (AWS, SendGrid, etc.)
- Testnet deployments (only mainnet eligible)

---

## Rewards

| Severity | Bounty | Examples |
|----------|--------|----------|
| Critical | $5,000 – $10,000 | Smart contract fund theft, auth bypass with fund access |
| High | $1,000 – $5,000 | Unauthorized data access, XSS with session hijack |
| Medium | $200 – $1,000 | CSRF, rate limit bypass with impact |
| Low | $50 – $200 | Information disclosure, minor logic bugs |

**Bonus**: 50% bonus for smart contract vulnerabilities (on-chain impact).

---

## Submission Process

1. Email report to security@stellartrustescrow.example.com
2. Include: description, impact, reproduction steps, PoC
3. PGP preferred: `docs/pgp-key.txt`
4. Response within 24 hours (critical), 72 hours (others)
5. Fix timeline: Critical (7 days), High (14 days), Medium (30 days)
6. Bounty paid within 30 days of fix deployment

---

## Hall of Fame

| Date | Researcher | Vulnerability | Bounty |
|------|-----------|---------------|--------|
| – | – | – | – |

(First submission will be listed here)

---

## Contact

- Email: security@stellartrustescrow.example.com
- PGP key: `docs/pgp-key.txt`
- Response SLA: 24 hours (critical), 72 hours (non-critical)

**Note**: This is a private bug bounty program. Public launch planned after mainnet deployment.
