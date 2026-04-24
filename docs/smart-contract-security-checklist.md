# Smart Contract Security Checklist

Every PR that touches a contract in `contracts/` must work through this checklist before merge.

---

## Pre-Review

- [ ] Code compiles cleanly (`cargo build --release --target wasm32-unknown-unknown`)
- [ ] All existing tests pass (`cargo test`)
- [ ] No `unwrap()` / `expect()` calls on untrusted input — use `?` or explicit error handling
- [ ] No `unsafe` blocks without a written justification in a comment

---

## Reentrancy

Soroban's execution model prevents classic EVM reentrancy, but cross-contract calls can still cause issues.

- [ ] State is updated **before** any cross-contract call (checks-effects-interactions)
- [ ] No circular call chains between contracts
- [ ] Token transfers happen after all internal state mutations

**Common fix:** move `save_*` calls above any `token_client.transfer(...)` call.

---

## Integer Overflow / Underflow

Rust's debug builds panic on overflow; release builds wrap. Soroban compiles to WASM in release mode.

- [ ] Arithmetic on `i128`/`u32` uses checked ops (`checked_add`, `checked_sub`, `checked_mul`) or saturating ops where appropriate
- [ ] No silent wrapping on balances, vote counts, or claim amounts
- [ ] Boundary values tested (0, `i128::MAX`, `u32::MAX`)

**Example:**
```rust
// bad
let new_balance = balance + amount;

// good
let new_balance = balance.checked_add(amount).ok_or(InsuranceError::Overflow)?;
```

---

## Access Control

- [ ] Every state-mutating function calls `require_admin` or `require_initialized` as appropriate
- [ ] `Address::require_auth()` is called on the correct signer — not just checked, but enforced
- [ ] Governor-only functions verify `is_governor` before proceeding
- [ ] No function exposes admin capabilities without an explicit auth check

---

## Gas Griefing

- [ ] No unbounded loops over user-supplied data
- [ ] Storage keys are bounded — no dynamic-length keys derived from user input
- [ ] Batch operations have a hard cap on iteration count
- [ ] TTL bumps (`bump_instance`, `bump_persistent`) are called only where necessary

---

## Static Analysis (Automated)

Slither runs automatically on every PR via CI (see `.github/workflows/ci.yml` — `contract-static-analysis` job).

To run locally:
```bash
pip install slither-analyzer
slither contracts/ --config-file slither.config.json
```

The config lives at `slither.config.json` in the repo root. Detectors that are intentionally silenced must have a comment in the source explaining why.

- [ ] CI static analysis job passes with no new high/medium findings
- [ ] Any silenced detector has a justification comment

---

## Fuzzing

Fuzz targets live in `contracts/escrow_contract/fuzz/fuzz_targets/`. The `contract-fuzz` CI job runs them on pushes to `main`/`develop`.

- [ ] New public functions have a corresponding fuzz target (or a written reason why one isn't needed)
- [ ] Fuzz targets cover boundary inputs: zero amounts, max values, empty vecs
- [ ] No fuzz-discovered panics left unresolved

To run locally (requires nightly):
```bash
cd contracts/escrow_contract
cargo +nightly fuzz run <target_name> -- -max_total_time=120
```

---

## Formal Verification Checkpoints

Full formal verification isn't required for every PR, but these points should be considered:

- [ ] Invariants are documented as comments near the relevant storage functions (e.g., "total contributions == sum of all contributor balances")
- [ ] State machine transitions are explicit — every `ClaimStatus` transition is intentional and tested
- [ ] For high-value changes, consider running [Certora](https://www.certora.com/) or [Kani](https://github.com/model-checking/kani) before merge

---

## Testing Requirements by Function Type

| Function type | Minimum tests required |
|---|---|
| Initialize / setup | Happy path + double-init rejection |
| State mutation (contribute, vote) | Happy path + auth failure + boundary values |
| Claim lifecycle | Full flow + each invalid transition |
| Admin functions | Auth check + valid update + zero/invalid value rejection |
| View functions | Returns correct data after state changes |

- [ ] Each new function has tests covering the above minimums
- [ ] Tests use `mock_all_auths()` only where intentional — don't mask auth bugs

---

## Before Submitting

- [ ] `cargo clippy -- -D warnings` passes
- [ ] `cargo fmt --check` passes
- [ ] Static analysis CI job is green
- [ ] Checklist above is complete (delete items that genuinely don't apply and note why)

---

## Security Bounty Program

Found a vulnerability outside of a PR review? Report it privately:

- **Email:** security@stellar-trust.io *(update this before going public)*
- **Scope:** All contracts in `contracts/`, deployed contract addresses listed in `ARCHITECTURE.md`
- **Out of scope:** Frontend UI bugs, rate limiting, DoS via normal usage
- **Response SLA:** Acknowledgement within 48 hours, triage within 7 days
- **Rewards:** Based on severity (Critical: up to $10,000 / High: up to $2,500 / Medium: up to $500) — exact amounts TBD pending program launch

Do **not** open a public GitHub issue for security vulnerabilities.
