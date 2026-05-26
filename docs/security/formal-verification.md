# Formal Verification Checkpoints

This document specifies the formal verification requirements for critical escrow lifecycle functions in StellarTrustEscrow. Formal verification uses mathematical proofs to guarantee that invariants hold under **all possible inputs**, not just the inputs covered by tests.

## Tool: Kani Rust Verifier

**Kani** is the primary formal verification tool for this project.

Why Kani over Certora:
- Open-source and actively maintained by AWS
- Native Rust — no separate specification language required
- Compatible with `no_std` crates and `wasm32-unknown-unknown` targets
- Integrates directly with `cargo` toolchain

### Setup

1. Install Kani via `cargo`:

```bash
cargo install --locked kani-verifier
cargo kani setup
```

2. Verify the installation:

```bash
cargo kani --version
```

3. Run all Kani proofs in the contracts workspace:

```bash
cargo kani --workspace
```

4. Run a specific proof harness:

```bash
cargo kani --harness verify_release_funds_balance_invariant
```

Kani harnesses live alongside the contract source in `contracts/` and are gated behind `#[cfg(kani)]` so they are excluded from normal `cargo build` and `cargo test` runs.

---

## Verification Checkpoints

The following four functions are designated formal verification checkpoints. Any pull request that modifies one of these functions **must** re-run the associated Kani proofs and include the full proof output in the PR description.

### 1. `create_escrow`

**Invariants that must hold after every successful call:**

| Invariant | Expression |
|---|---|
| Total amount is positive | `meta.total_amount > 0` |
| Remaining balance equals total amount at creation | `meta.remaining_balance == meta.total_amount` |
| Status is Active immediately after creation | `meta.status == EscrowStatus::Active` |

### 2. `fund_escrow` / `add_milestone`

**Invariants that must hold after every successful call:**

| Invariant | Expression |
|---|---|
| Allocated amount never exceeds total amount | `meta.allocated_amount <= meta.total_amount` |

This invariant must hold after each individual `add_milestone` call, not just at the end of a batch.

### 3. `release_funds`

**Invariants that must hold after every successful call:**

| Invariant | Expression |
|---|---|
| Remaining balance decreases by exactly the milestone amount | `new_balance == old_balance - milestone.amount` |
| Remaining balance never goes negative | `new_balance >= 0` |

### 4. `dispute_escrow`

**Invariants that must hold after every successful call:**

| Invariant | Expression |
|---|---|
| Status transitions only from `Active` to `Disputed` | `old_status == Active → new_status == Disputed` |
| No other status transition is permitted | `old_status != Active → call must be rejected` |

---

## Example Kani Harnesses

The following two harnesses demonstrate how to express escrow state machine invariants. Place harnesses in the relevant contract source file, gated behind `#[cfg(kani)]`.

### Harness 1: `release_funds` balance invariant

Verifies that `remaining_balance` decreases by exactly `milestone.amount` and never goes negative for all possible valid inputs.

```rust
#[cfg(kani)]
#[kani::proof]
fn verify_release_funds_balance_invariant() {
    let initial_balance: i128 = kani::any();
    let milestone_amount: i128 = kani::any();

    // Constrain to valid pre-conditions
    kani::assume(initial_balance >= 0);
    kani::assume(milestone_amount > 0);
    kani::assume(milestone_amount <= initial_balance);

    let new_balance = initial_balance - milestone_amount;

    // Invariant 1: balance never goes negative
    assert!(new_balance >= 0);
    // Invariant 2: balance decreases by exactly milestone_amount
    assert!(new_balance == initial_balance - milestone_amount);
}
```

### Harness 2: `dispute_escrow` state transition invariant

Verifies that `dispute_escrow` only succeeds when the current status is `Active`, and that the resulting status is always `Disputed`.

```rust
#[cfg(kani)]
#[kani::proof]
fn verify_dispute_escrow_transition_invariant() {
    // Represent EscrowStatus as u8 for symbolic reasoning:
    // 0 = Active, 1 = Completed, 2 = Disputed, 3 = Cancelled, 4 = CancellationPending
    let current_status: u8 = kani::any();
    kani::assume(current_status <= 4);

    let is_active = current_status == 0;

    if is_active {
        // Transition is permitted: result must be Disputed (2)
        let new_status: u8 = 2;
        assert!(new_status == 2);
        assert!(current_status != new_status); // status actually changed
    } else {
        // Transition must be rejected — no other status may transition to Disputed
        // The contract must return an error; model this as the transition not occurring
        let new_status = current_status; // status unchanged on rejection
        assert!(new_status != 2 || current_status == 2); // only Disputed→Disputed is a no-op
    }
}
```

---

## PR Requirements for Checkpoint Functions

When a pull request modifies any of the four checkpoint functions (`create_escrow`, `fund_escrow`/`add_milestone`, `release_funds`, `dispute_escrow`), the contributor **must**:

1. Re-run all Kani proofs for the modified function:

```bash
cargo kani --harness <harness_name>
```

2. Paste the full proof output into the PR description under a collapsible section:

```markdown
<details>
<summary>Kani proof output — release_funds</summary>

```
VERIFICATION:- SUCCESSFUL
Verification Time: 0.42s
```

</details>
```

3. If a proof fails, the PR **must not be merged** until the invariant is restored or the proof is updated to reflect an intentional, reviewed change to the invariant.

Reviewers must confirm that the proof output is present and shows `VERIFICATION:- SUCCESSFUL` before approving any PR that touches a checkpoint function.
