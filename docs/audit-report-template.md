# Security Audit Report — [Contract Name]

**Date:** YYYY-MM-DD  
**Auditor(s):**  
**Commit / Tag audited:**  
**Scope:** `contracts/[contract_name]/src/`

---

## Summary

| Severity | Count | Resolved | Acknowledged |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 0 | 0 | 0 |
| Informational | 0 | 0 | 0 |

---

## Findings

### [FINDING-001] — Title

**Severity:** Critical / High / Medium / Low / Informational  
**Location:** `src/lib.rs:LINE`  
**Status:** Open / Resolved in commit `abc1234` / Acknowledged

**Description:**  
What the issue is and why it matters.

**Proof of Concept:**  
Minimal code or steps to reproduce.

**Recommendation:**  
What should be changed.

**Resolution:**  
How it was fixed (fill in after resolution).

---

## Static Analysis

- Tool: Slither `vX.X.X`
- Command: `slither contracts/ --config-file slither.config.json`
- Report: attached as `slither-report.json`
- New findings introduced by this audit scope: none / list them

---

## Test Coverage

| Contract | Line coverage | Branch coverage |
|---|---|---|
| escrow_contract | % | % |
| insurance_contract | % | % |

---

## Fuzz Testing

- Targets run:
- Duration per target:
- Crashes found: none / describe

---

## Sign-off

- [ ] All Critical and High findings resolved or formally acknowledged
- [ ] Static analysis clean
- [ ] Coverage meets minimums defined in security checklist
- [ ] Checklist in `docs/smart-contract-security-checklist.md` completed
