# Security Audit Report — [Contract Name]

> **How to use this template:** Copy this file, fill in every placeholder marked with `[...]`, and delete this instruction block before publishing.

---

## 1. Executive Summary

**Audit title:** [Contract Name] Security Audit  
**Audit period:** YYYY-MM-DD to YYYY-MM-DD  
**Audited commit / tag:** `[commit-sha]`  
**Lead auditor:** [Full Name], [Organisation]  
**Report version:** 1.0

Provide a 2–4 sentence overview of the audit scope, the overall security posture of the reviewed code, and the most significant findings. Highlight any critical or high-severity issues and whether they have been remediated.

**Finding summary:**

| Severity      | Total | Open | In Progress | Resolved | Accepted Risk |
|---------------|------:|-----:|------------:|---------:|--------------:|
| Critical      |     0 |    0 |           0 |        0 |             0 |
| High          |     0 |    0 |           0 |        0 |             0 |
| Medium        |     0 |    0 |           0 |        0 |             0 |
| Low           |     0 |    0 |           0 |        0 |             0 |
| Informational |     0 |    0 |           0 |        0 |             0 |
| **Total**     |     0 |    0 |           0 |        0 |             0 |

---

## 2. Scope

**Contracts reviewed:**

| Path | Description |
|------|-------------|
| `contracts/escrow_contract/src/` | [Brief description] |
| `contracts/[other_contract]/src/` | [Brief description] |

**Explicitly out of scope:**

- Frontend / off-chain components
- Third-party dependencies not modified in this audit
- [Any other exclusions]

**Audit period:** YYYY-MM-DD to YYYY-MM-DD  
**Commit hash:** `[full-40-char-sha]`  
**Branch:** `[branch-name]`

---

## 3. Methodology

**Approach:** This audit combined automated static analysis with manual code review.

**Tools used:**

| Tool | Version | Purpose |
|------|---------|---------|
| Slither | [version] | Automated vulnerability detection |
| `cargo audit` | [version] | Dependency vulnerability scanning |
| Kani Rust Verifier | [version] | Formal verification of critical invariants |
| `cargo-llvm-cov` | [version] | Test coverage measurement |

**Manual review areas:**

- Access control: verified `require_auth()` / `require_admin()` on all state-mutating functions
- Arithmetic safety: verified `checked_*` usage on all numeric operations
- State machine transitions: traced all `EscrowStatus` / `MilestoneStatus` paths
- Cross-contract call ordering: verified checks-effects-interactions pattern
- Storage key namespacing: verified `DataKey` variants do not collide
- Input validation: verified non-zero amount guards, deadline sanity checks, hash length validation

**Severity rating scale:**

| Severity      | Criteria |
|---------------|----------|
| Critical      | Direct fund loss or theft possible; exploitable without special conditions |
| High          | Significant fund loss or access control bypass under realistic conditions |
| Medium        | Partial fund loss, griefing, or logic error with limited impact |
| Low           | Best-practice deviation; no direct fund impact |
| Informational | Code quality, documentation, or gas optimisation suggestion |

---

## 4. Findings Table

| ID           | Title | Severity | Affected Function | Status |
|--------------|-------|----------|-------------------|--------|
| FINDING-001  | [Title] | Critical | `[function_name]` | Open |
| FINDING-002  | [Title] | High | `[function_name]` | Open |
| FINDING-003  | [Title] | Medium | `[function_name]` | Open |
| FINDING-004  | [Title] | Low | `[function_name]` | Open |
| FINDING-005  | [Title] | Informational | `[function_name]` | Open |

> Add or remove rows as needed. Keep IDs sequential and unique across the entire report.

---

## 5. Finding Detail Pages

Each finding gets its own subsection below. Copy the appropriate template (Critical/High or Medium/Low/Informational) for each entry.

---

### FINDING-001 — [Title]

**Severity:** Critical  
**Affected function:** `[contract::module::function_name]`  
**Location:** `contracts/[contract]/src/lib.rs:[line]`  
**Status:** Open

#### Description

[Explain what the vulnerability is, why it exists in this codebase, and what an attacker could achieve by exploiting it.]

#### Recommendation

[Describe the concrete code change required to fix the issue. Reference the relevant Rust/Soroban pattern, e.g., "add `require_auth()` before mutating state", "replace `+` with `checked_add(...).ok_or(EscrowError::Overflow)?`".]

#### Proof of Concept / Reproduction Steps

> **Required for Critical and High findings. This section must not be left empty.**

1. Deploy the contract to a local Soroban sandbox: `stellar contract deploy ...`
2. Invoke the vulnerable function with the following parameters:
   ```bash
   stellar contract invoke \
     --id [CONTRACT_ID] \
     --fn [function_name] \
     -- \
     --param1 [value] \
     --param2 [value]
   ```
3. Observe that [describe the unexpected/malicious outcome].
4. Expected behaviour: [describe what should have happened].

Alternatively, provide a minimal Rust test that reproduces the issue:

```rust
#[test]
fn poc_finding_001() {
    // Set up environment
    let env = Env::default();
    // ... reproduce the vulnerability ...
    // assert the unexpected outcome
}
```

#### Resolution

> Fill in after the finding is remediated.

[Describe how the issue was fixed, referencing the commit or PR that introduced the fix.]

---

### FINDING-002 — [Title]

**Severity:** High  
**Affected function:** `[contract::module::function_name]`  
**Location:** `contracts/[contract]/src/lib.rs:[line]`  
**Status:** Open

#### Description

[Explain what the vulnerability is and its impact.]

#### Recommendation

[Describe the fix.]

#### Proof of Concept / Reproduction Steps

> **Required for Critical and High findings. This section must not be left empty.**

1. [Step 1]
2. [Step 2]
3. Observe: [outcome]
4. Expected: [correct behaviour]

```rust
#[test]
fn poc_finding_002() {
    // Minimal reproduction
}
```

#### Resolution

> Fill in after the finding is remediated.

---

### FINDING-003 — [Title]

**Severity:** Medium  
**Affected function:** `[contract::module::function_name]`  
**Location:** `contracts/[contract]/src/lib.rs:[line]`  
**Status:** Open

#### Description

[Explain the issue and its limited impact.]

#### Recommendation

[Describe the fix.]

#### Resolution

> Fill in after the finding is remediated.

---

### FINDING-004 — [Title]

**Severity:** Low  
**Affected function:** `[contract::module::function_name]`  
**Location:** `contracts/[contract]/src/lib.rs:[line]`  
**Status:** Open

#### Description

[Describe the best-practice deviation.]

#### Recommendation

[Describe the improvement.]

#### Resolution

> Fill in after the finding is remediated.

---

### FINDING-005 — [Title]

**Severity:** Informational  
**Affected function:** `[contract::module::function_name]`  
**Location:** `contracts/[contract]/src/lib.rs:[line]`  
**Status:** Open

#### Description

[Describe the code quality, documentation, or gas optimisation observation.]

#### Recommendation

[Describe the suggested improvement.]

---

## 6. Remediation Status

Track the resolution of each finding after the initial report is delivered.

| ID           | Severity      | Status        | Resolution commit / PR | Notes |
|--------------|---------------|---------------|------------------------|-------|
| FINDING-001  | Critical      | Open          | —                      |       |
| FINDING-002  | High          | Open          | —                      |       |
| FINDING-003  | Medium        | Open          | —                      |       |
| FINDING-004  | Low           | Open          | —                      |       |
| FINDING-005  | Informational | Open          | —                      |       |

**Status definitions:**

| Status        | Meaning |
|---------------|---------|
| Open          | Finding has been reported; no fix has been submitted yet |
| In Progress   | A fix is being developed or reviewed |
| Resolved      | Fix has been merged and verified by the auditor |
| Accepted Risk | The project team has acknowledged the finding and chosen not to fix it, with documented justification |

**Re-audit note:** After all Critical and High findings reach Resolved or Accepted Risk status, the lead auditor should perform a targeted re-review of the affected functions and update this table accordingly.

---

## 7. Sign-off

By signing below, the lead auditor confirms that:

- The findings in this report accurately reflect the state of the code at the audited commit.
- All Critical and High findings have been either resolved or formally accepted by the project team.
- Static analysis (`slither`) was run against the audited commit with no suppressed High/Critical findings lacking written justification.
- Test coverage meets the minimum threshold defined in `docs/security/testing-requirements.md`.
- The security checklist at `docs/security/security-checklist-template.md` was completed for the audited scope.

| Field              | Value |
|--------------------|-------|
| Lead auditor name  | [Full Name] |
| Organisation       | [Organisation Name] |
| Date               | YYYY-MM-DD |
| Report version     | 1.0 |
| Audited commit     | `[full-40-char-sha]` |
