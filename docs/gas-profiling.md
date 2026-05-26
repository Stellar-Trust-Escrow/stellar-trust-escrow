# Gas Profiling — StellarTrustEscrow Smart Contracts

Tracks CPU instruction and memory costs for every public function across
`escrow_contract` and `insurance_contract`, using the Soroban SDK's built-in
`env.budget()` API.

---

## How It Works

Each contract has a `gas_profiling` test module
(`contracts/<name>/src/gas_profiling.rs`). Every test:

1. Sets up the minimal state needed to reach the function under test.
2. Calls `env.budget().reset_default()` to zero the counters.
3. Invokes the function.
4. Prints a structured line:

```
GAS_PROFILE | <contract> | <function> | cpu=<n> | mem=<n>
```

The `scripts/gas-profile.sh` script collects these lines and writes
`gas-report.json`.

---

## Running the Profiler

```bash
# Generate a fresh report
bash scripts/gas-profile.sh

# Compare against a saved baseline
cp gas-report.json gas-report.prev.json
# ... make changes ...
bash scripts/gas-profile.sh --compare
```

The report is written to `gas-report.json` at the repo root.

---

## Latest Results

| Contract | Function | CPU Instructions | Memory Bytes |
|---|---|---:|---:|
| escrow_contract | initialize | 29,280 | 3,372 |
| escrow_contract | create_escrow | 254,976 | 35,970 |
| escrow_contract | add_milestone | 157,743 | 24,623 |
| escrow_contract | submit_milestone | 122,167 | 16,721 |
| escrow_contract | approve_milestone | 330,903 | 47,899 |
| escrow_contract | reject_milestone | 123,536 | 17,045 |
| escrow_contract | release_funds | 307,618 | 42,314 |
| escrow_contract | cancel_escrow | 261,241 | 36,149 |
| escrow_contract | raise_dispute | 176,357 | 26,206 |
| escrow_contract | request_cancellation | 169,600 | 25,505 |
| escrow_contract | get_escrow | 66,079 | 7,027 |
| escrow_contract | get_milestone | 48,274 | 5,645 |
| escrow_contract | get_reputation | 36,332 | 4,125 |
| escrow_contract | escrow_count | 33,213 | 3,700 |
| escrow_contract | pause | 62,019 | 7,727 |
| escrow_contract | unpause | 73,573 | 9,327 |
| insurance_contract | initialize | 73,407 | 8,008 |
| insurance_contract | contribute | 309,011 | 44,248 |
| insurance_contract | submit_claim | 172,587 | 25,730 |
| insurance_contract | withdraw_claim | 136,821 | 20,939 |
| insurance_contract | vote | 177,387 | 27,215 |
| insurance_contract | execute_payout | 406,320 | 61,238 |
| insurance_contract | add_governor | 150,555 | 23,285 |
| insurance_contract | remove_governor | 144,511 | 22,150 |
| insurance_contract | set_claim_cap | 130,266 | 21,515 |
| insurance_contract | set_quorum | 130,099 | 21,512 |
| insurance_contract | get_fund_info | 139,181 | 19,910 |
| insurance_contract | get_claim | 99,389 | 13,849 |
| insurance_contract | get_contribution | 42,106 | 7,506 |
| insurance_contract | is_governor | 40,448 | 7,381 |

> Numbers are from the Soroban simulation environment and reflect relative
> cost, not absolute on-chain fees. Re-run `gas-profile.sh` after any
> contract change to keep this table current.

---

## Observations

**Highest-cost functions (escrow_contract)**

- `approve_milestone` (330,903 CPU) — two storage writes + token transfer.
  Already optimised with an O(1) `approved_count` field (see Issue #65).
- `release_funds` (307,618 CPU) — admin auth check + token transfer.
- `create_escrow` / `cancel_escrow` (~255–261k CPU) — token transfer dominates.

**Highest-cost functions (insurance_contract)**

- `execute_payout` (406,320 CPU) — two storage reads, quorum check, token
  transfer, stats update.
- `contribute` (309,011 CPU) — token transfer + two storage writes.

**Read-only functions** are cheap (29k–139k CPU), confirming the granular

## perf/contract-milestone-gas-optimization changes

The following optimizations were applied on this branch:

| Optimization | Mechanism | Expected saving |
|---|---|---|
| Bitflag `MilestoneStatus` | `u32` constant replaces tagged-union enum (~36 bytes/milestone) | ~10–15% per milestone read/write |
| Fixed-capacity milestones | `MAX_MILESTONES = 20` cap, O(1) storage planning | Prevents unbounded growth |
| `submitted_count` counter | O(1) cancel check replaces O(n) milestone scan | Saves N storage reads in `cancel_escrow` |
| `batch_add_milestones` | 1 meta load + N writes + 1 meta save | O(N+1) vs O(2N) |
| `batch_approve_milestones` | 1 meta load + N writes + 1 transfer + 1 meta save | O(N+1) vs O(2N transfers) |
| `batch_release_funds` | 1 meta load + N writes + 1 transfer + 1 meta save | O(N+1) vs O(2N transfers) |

Re-run `gas-profile.sh` after merging to update the table above with measured numbers.
per-entry storage layout is working as intended.

---

## Tracking Over Time

To track regressions in CI, save the current report as a baseline before
merging a PR:

```bash
cp gas-report.json gas-report.prev.json
git add gas-report.prev.json
```

Then run `bash scripts/gas-profile.sh --compare` in CI to surface any
function whose CPU cost increased by more than an acceptable threshold.
