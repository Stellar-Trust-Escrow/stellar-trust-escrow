# Static Analysis Guide

## Overview

[Slither](https://github.com/crytic/slither) is a static analysis framework for smart contracts developed by Trail of Bits. It parses contract source code and runs a suite of detectors that flag common vulnerability patterns — without executing the contract. Running Slither before every pull request catches entire classes of bugs (reentrancy, unchecked arithmetic, access control gaps) at near-zero cost, long before an auditor or fuzzer would find them.

Although Slither was originally designed for Solidity/EVM contracts, many of its detectors map directly onto the vulnerability patterns that also appear in Soroban/Rust contracts compiled to WASM. The curated detector list below focuses on the patterns that are genuinely applicable to this codebase.

---

## Enabled Detectors

The following detectors are enabled in `slither.config.json`. All others are excluded to reduce noise.

| Detector | Severity | Why it matters for Soroban contracts |
|---|---|---|
| `reentrancy-eth` | High | Cross-contract calls in Soroban (e.g. `token_client.transfer()`) can re-enter the calling contract if state is not committed first. This detector flags call-before-state-update patterns. |
| `reentrancy-no-eth` | Medium | Same as above but for non-ETH value flows — relevant when a Soroban contract calls another contract and reads shared storage. |
| `integer-overflow` | High | Unchecked arithmetic on `i128`/`u32` fields can wrap silently. The project uses `checked_*` methods throughout; this detector catches any path that bypasses them. |
| `unchecked-transfer` | High | Token transfers whose return value is not checked can silently fail, leaving the contract in an inconsistent state. |
| `arbitrary-send` | High | Flags code paths where an attacker-controlled address can receive funds — critical for escrow release logic. |
| `controlled-delegatecall` | High | Delegatecall with a caller-controlled target is a common proxy exploit. Flags any such pattern in the contract. |
| `suicidal` | High | Detects functions that allow an arbitrary caller to destroy the contract, wiping all escrow state. |
| `uninitialized-state` | High | State variables read before being written can return zero/default values, breaking invariants (e.g. `remaining_balance` read before `fund_escrow` is called). |
| `uninitialized-storage` | High | Storage pointers that are not initialised before use can corrupt adjacent storage slots. |
| `locked-ether` | Medium | Flags contracts that can receive native tokens but have no withdrawal path — relevant if the contract ever accepts XLM directly. |
| `tx-origin` | Medium | Using `tx.origin` for authentication is bypassable via a forwarding contract. Soroban's `require_auth()` is the correct pattern; this detector catches any `tx.origin` usage that slips in. |

Detectors excluded globally: `naming-convention`, `solc-version`, `low-level-calls` — these produce high-volume false positives for Rust/WASM compilation artefacts and are not actionable.

---

## Running Slither Locally

Install Slither (Python 3.8+ required):

```bash
pip install slither-analyzer
```

Run against the contracts directory using the project config:

```bash
slither contracts/ --config-file slither.config.json
```

This produces two output files:

- `slither-report.json` — machine-readable findings (used by the CI gate)
- `slither-report.sarif` — SARIF format for GitHub Code Scanning upload

To see a human-readable summary in the terminal, omit the `--json` flag or add `--print human-summary`.

---

## How the CI Gate Works

The `contract-static-analysis` job in `.github/workflows/ci.yml` runs on every pull request. After Slither completes, a Python snippet counts findings with `impact` equal to `"High"` or `"Critical"` in `slither-report.json`:

```python
import json
data = json.load(open('slither-report.json'))
findings = data.get('results', {}).get('detectors', [])
high_critical = [f for f in findings if f.get('impact') in ('High', 'Critical')]
```

If the count is greater than zero, the step exits with code 1 and the PR check fails. The error message printed to the Actions log includes the count and instructs the contributor to review `slither-report.json`.

PRs cannot be merged while this check is failing. Contributors must either fix the flagged code or suppress the finding with a documented justification (see below).

---

## Suppressing False Positives

Slither occasionally flags patterns that are safe in the Soroban context (e.g. a deliberate low-level call that is already guarded). To suppress a specific finding on a single line, add the inline annotation **on the line immediately above** the flagged code:

```rust
// slither-disable-next-line <detector-name>
// Justification: <explain why this finding is a false positive in this context>
let result = token_client.transfer(&from, &to, &amount);
```

Rules for suppression annotations:

1. The `// slither-disable-next-line` comment and the justification comment **must both be present**. A suppression without a justification will be rejected in code review.
2. Use the exact detector name from the table above (e.g. `reentrancy-eth`, not `reentrancy`).
3. Suppressions are reviewed during security audits. Unjustified suppressions are treated as findings in their own right.
4. Do not use `// slither-disable-file` or `// slither-disable` (whole-file/whole-block suppressions) — these hide legitimate findings.

Example of an acceptable suppression:

```rust
// slither-disable-next-line reentrancy-eth
// Justification: state (escrow.status = Completed) is committed on the line above
// before this transfer call; the checks-effects-interactions pattern is satisfied.
token_client.transfer(&env, &escrow.client, &escrow.remaining_balance);
```
