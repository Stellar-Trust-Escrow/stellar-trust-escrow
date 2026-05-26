# Security Bounty Programme

StellarTrustEscrow operates a coordinated vulnerability disclosure and reward programme. We appreciate the work of security researchers who help keep the protocol safe.

**To report a vulnerability, email: [security@stellartrustescrow.example.com](mailto:security@stellartrustescrow.example.com)**

Do **not** open a public GitHub issue for security vulnerabilities.

---

## Scope

### In-Scope

The following are eligible for bounty rewards:

- All smart contracts under `contracts/` in this repository
- Deployed mainnet contract addresses (see [Deployment Registry](../deployment-registry.md))

Specifically, the escrow contract functions are in scope:

| Function | Description |
|---|---|
| `create_escrow` | Escrow initialisation |
| `fund_escrow` / `add_milestone` | Milestone allocation |
| `submit_milestone` | Freelancer submission |
| `approve_milestone` | Client approval |
| `release_funds` | Fund disbursement |
| `dispute_escrow` | Dispute initiation |
| `resolve_dispute` | Dispute resolution |
| `cancel_escrow` | Cancellation flow |

### Out-of-Scope

The following are **not** eligible for bounty rewards:

- Frontend UI bugs (Next.js / React interface)
- Rate limiting and brute-force issues against the backend API
- Denial-of-service via normal usage patterns (e.g., spamming valid transactions)
- Testnet deployments — only mainnet contracts are in scope
- Third-party dependencies (Soroban SDK, Stellar network infrastructure)
- Issues in `node_modules/` or vendored libraries not maintained by this project

---

## Reward Tiers

Rewards are assigned based on the severity of the finding, assessed using the criteria in [`docs/security/audit-report-template.md`](audit-report-template.md).

| Severity | Criteria Summary | Reward Range |
|---|---|---|
| **Critical** | Direct fund loss or theft possible; exploitable without special conditions | $5,000 – $10,000 |
| **High** | Significant fund loss or access control bypass under realistic conditions | $1,000 – $5,000 |
| **Medium** | Partial fund loss, griefing, or logic error with limited impact | $200 – $1,000 |
| **Low** | Best-practice deviation; no direct fund impact | $50 – $200 |

> Informational findings (code quality, gas optimisation suggestions) are not eligible for monetary rewards but may be acknowledged in release notes.

Exact reward amounts within each tier are determined at the discretion of the maintainers based on impact, quality of the report, and novelty of the finding.

---

## Responsible Disclosure Process

1. **Email your report** to [security@stellartrustescrow.example.com](mailto:security@stellartrustescrow.example.com) with the subject line: `[SECURITY] <brief description>`.
2. **Include in your report:**
   - Affected contract function(s) and deployed address(es)
   - Step-by-step reproduction instructions or proof-of-concept code
   - Your assessment of severity and potential impact
   - Any suggested remediation
3. **Acknowledgement:** We will acknowledge receipt of your report within **72 hours**.
4. **Triage:** We will provide an initial severity assessment and remediation timeline within **7 business days**.
5. **Remediation window:** Researchers must allow **90 days** from the date of acknowledgement for us to remediate the vulnerability before any public disclosure.
6. **Coordinated disclosure:** After the 90-day window (or earlier if a fix is deployed and you agree), we will coordinate a joint disclosure. You will be credited in the security advisory unless you prefer to remain anonymous.

---

## Disclosure Timeline

| Milestone | Timeframe |
|---|---|
| Acknowledgement of report | Within 72 hours of receipt |
| Initial severity assessment | Within 7 business days |
| Fix deployed to mainnet | Within 90 days of acknowledgement |
| Public disclosure | After fix deployment, coordinated with researcher |

If exceptional circumstances require more than 90 days, we will communicate this to the researcher and agree on an extended timeline. We will not request indefinite embargo.

---

## Disqualification Conditions

The following conditions will disqualify a submission from receiving a reward:

- **Known findings:** The vulnerability has already been reported by another researcher or identified internally.
- **Out-of-scope components:** The finding affects a component explicitly listed as out-of-scope above.
- **Social engineering:** Attacks that rely on deceiving maintainers, contributors, or users rather than exploiting a technical vulnerability in the contracts.
- **Automated scanning without prior approval:** Submissions consisting solely of output from automated scanning tools (Slither, MythX, etc.) without a manual proof-of-concept demonstrating exploitability. If you wish to run automated scans against production infrastructure, contact us first.
- **No proof-of-concept:** Critical and High severity reports that do not include reproduction steps or a working PoC will not be eligible for reward until a PoC is provided.
- **Duplicate reports:** Only the first reporter of a given vulnerability is eligible for a reward.
- **Violations of this policy:** Any researcher who publicly discloses a vulnerability before the 90-day remediation window expires, or who attempts to exploit a vulnerability beyond what is necessary to demonstrate it, will be disqualified.

---

## Legal Safe Harbour

We will not pursue legal action against researchers who:

- Discover and report vulnerabilities in good faith following this policy
- Avoid accessing, modifying, or exfiltrating user data beyond what is necessary to demonstrate the vulnerability
- Do not disrupt the protocol or its users during testing
- Coordinate disclosure with us before going public

---

## Contact

| Channel | Use |
|---|---|
| [security@stellartrustescrow.example.com](mailto:security@stellartrustescrow.example.com) | Vulnerability reports (preferred) |
| [GitHub Discussions](../../discussions) | General security questions |

PGP key available on request.
