# Fuzzing Requirements

This document defines the fuzzing coverage requirements for StellarTrustEscrow Soroban smart contract functions. All contributors adding or modifying contract functions must satisfy these requirements before a pull request can be merged.

---

## Function Categories and Requirements

### 1. State-Mutating Functions

Functions that write to contract storage (e.g., `create_escrow`, `fund_escrow`, `release_funds`, `dispute_escrow`, `add_milestone`).

**Requirements:**

- At least **one fuzz target** that exercises all numeric parameters at boundary values (0, `i128::MAX`, `u32::MAX`, and values just above/below valid ranges).
- Minimum **10,000 iterations** per fuzz target.
- The fuzz target must assert that no unhandled panic occurs for any input within the valid type range — unexpected panics must be caught and mapped to `EscrowError` variants.

### 2. View / Query Functions

Functions that only read from contract storage (e.g., `get_escrow`, `get_milestone`, `list_milestones`).

**Requirements:**

- At least **one fuzz target** that constructs arbitrary valid contract state and calls the view function, verifying no panic occurs.
- Minimum **10,000 iterations** per fuzz target.
- The fuzz target must cover the full range of valid storage states, including empty storage, single-entry storage, and maximum-capacity storage.

### 3. Administrative Functions

Functions restricted to privileged callers (e.g., `update_admin`, `set_fee`, `cancel_escrow` when called by admin).

**Requirements:**

- At least **one fuzz target** that generates arbitrary caller addresses and asserts the function rejects any caller that is not the authorised admin/role.
- Minimum **10,000 iterations** per fuzz target.
- The fuzz target must assert the function returns an `EscrowError::Unauthorized` or `EscrowError::AdminOnly` variant — not a panic — for every non-authorised caller.

---

## Iteration Count Configuration

The minimum iteration count is **10,000**. When using `proptest`, configure this via `ProptestConfig`:

```rust
proptest_config: ProptestConfig {
    cases: 10_000,
    ..ProptestConfig::default()
},
```

When using `cargo fuzz` (libFuzzer), the corpus will naturally grow beyond 10,000 executions; set a minimum run count with:

```sh
cargo +nightly fuzz run <target> -- -runs=10000
```

> **Do not lower the iteration count below 10,000.** The `proptest` default of 256 is insufficient for boundary-value coverage of `i128` parameters.

---

## Proptest-Based Template Fuzz Test

Contributors can adapt the following template for their specific function. Place fuzz tests in the contract's `#[cfg(test)]` module or a dedicated `fuzz/` directory.

```rust
// Feature: smart-contract-security-checklist, Property 5: serialisation round-trip
// Feature: smart-contract-security-checklist, Property 6: fuzz boundary coverage

#[cfg(test)]
mod fuzz_tests {
    use super::*;
    use proptest::prelude::*;
    use soroban_sdk::testutils::Env as _;

    proptest! {
        // Override the default 256-case limit to meet the 10,000-iteration requirement.
        #![proptest_config(ProptestConfig {
            cases: 10_000,
            ..ProptestConfig::default()
        })]

        /// Template: state-mutating function boundary fuzz.
        /// Replace `your_function` and parameter types with the actual function under test.
        #[test]
        fn fuzz_state_mutating_boundary(
            amount in 0_i128..=i128::MAX,
            milestone_count in 0_u32..=u32::MAX,
        ) {
            // Feature: smart-contract-security-checklist, Property 6: fuzz boundary coverage
            let env = Env::default();
            // TODO: initialise contract client
            // let client = YourContractClient::new(&env, &env.register_contract(None, YourContract));

            // Call the function under test and assert it either succeeds or returns
            // a known EscrowError variant — never an unhandled panic.
            // let result = client.your_function(&amount, &milestone_count);
            // prop_assert!(result.is_ok() || matches!(result, Err(EscrowError::InvalidAmount | EscrowError::Overflow)));
            let _ = (amount, milestone_count); // remove when wired up
        }

        /// Template: view/query function no-panic fuzz.
        #[test]
        fn fuzz_view_no_panic(
            escrow_id in any::<u64>(),
        ) {
            let env = Env::default();
            // TODO: initialise contract client and populate arbitrary state
            // let result = client.get_escrow(&escrow_id);
            // prop_assert!(result.is_ok() || result.is_err()); // must not panic
            let _ = escrow_id;
        }

        /// Template: administrative function auth-rejection fuzz.
        /// Generates arbitrary caller addresses and asserts rejection.
        #[test]
        fn fuzz_admin_auth_rejection(
            caller_seed in any::<[u8; 32]>(),
        ) {
            // Feature: smart-contract-security-checklist, Property 12: auth rejection
            let env = Env::default();
            let caller = soroban_sdk::Address::from_contract_id(
                &soroban_sdk::BytesN::from_array(&env, &caller_seed),
            );
            // TODO: call the administrative function as `caller` and assert rejection.
            // let result = client.update_admin(&caller, &new_admin);
            // prop_assert!(matches!(result, Err(EscrowError::AdminOnly | EscrowError::Unauthorized)));
            let _ = caller;
        }
    }
}
```

---

## Round-Trip Fuzz Property for `#[contracttype]` Structs

For every struct annotated with `#[contracttype]`, the following round-trip property must hold:

> **For all valid values `x` of a `#[contracttype]` struct:**
> `from_val(env, &to_val(env, &x)) == x`

This verifies that the Soroban SDK's `ScVal` serialisation and deserialisation are lossless for all contract data types.

### Example Round-Trip Test

```rust
// Feature: smart-contract-security-checklist, Property 5: serialisation round-trip

#[cfg(test)]
mod roundtrip_tests {
    use super::*;
    use proptest::prelude::*;
    use soroban_sdk::{Env, IntoVal, TryFromVal, Val};

    proptest! {
        #![proptest_config(ProptestConfig {
            cases: 10_000,
            ..ProptestConfig::default()
        })]

        /// Validates: Requirements 4.6
        /// For all valid EscrowMeta values, serialising to ScVal and deserialising
        /// must produce a value equal to the original.
        #[test]
        fn prop_escrow_meta_roundtrip(
            total_amount in 1_i128..=i128::MAX,
            milestone_count in 0_u32..50_u32,
        ) {
            // Feature: smart-contract-security-checklist, Property 5: serialisation round-trip
            let env = Env::default();

            // Construct a minimal EscrowMeta with the generated field values.
            // Adjust field names to match the actual struct definition.
            let original = EscrowMeta {
                total_amount,
                milestone_count,
                // ... other required fields with sensible defaults
            };

            // Serialise to Val (ScVal under the hood) then deserialise.
            let serialised: Val = original.clone().into_val(&env);
            let roundtripped = EscrowMeta::try_from_val(&env, &serialised)
                .expect("deserialisation must not fail for a valid EscrowMeta");

            prop_assert_eq!(original, roundtripped);
        }
    }
}
```

Apply the same pattern to every other `#[contracttype]` struct in the contract (e.g., `Milestone`, `EscrowStatus`, `MilestoneStatus`).

---

## Regression Test Requirement

When `cargo fuzz` discovers a panic or unexpected error, the contributor **must**:

1. Identify the exact input that triggered the panic from the `cargo fuzz` crash artifact (found in `fuzz/artifacts/<target>/`).
2. Add a `#[test]` that reproduces the exact failing input **before** the fix is merged. The test must fail on the unfixed code and pass after the fix.
3. Name the regression test descriptively, e.g., `test_regression_release_funds_overflow_discovered_by_fuzzer`.

### Regression Test Template

```rust
/// Regression test for panic discovered by cargo fuzz on <date>.
/// Fuzz target: fuzz_state_mutating_boundary
/// Failing input: amount = 170141183460469231731687303715884105727 (i128::MAX), milestone_count = 0
#[test]
fn test_regression_<function>_<short_description>() {
    let env = Env::default();
    // TODO: wire up contract client
    // let result = client.your_function(&i128::MAX, &0);
    // assert!(matches!(result, Err(EscrowError::Overflow)));
}
```

The regression test must be committed in the same pull request as the fix and must be reviewed alongside the fix to confirm it reproduces the original crash.

---

## Running Fuzz Tests Locally

### Using proptest

```sh
# Run all tests including proptest fuzz tests (single execution, no watch mode)
cargo test --package <your-contract-package>
```

### Using cargo fuzz (libFuzzer)

```sh
# Install the nightly toolchain if not already present
rustup install nightly

# Run a specific fuzz target for at least 10,000 executions
cargo +nightly fuzz run fuzz_state_mutating_boundary -- -runs=10000

# List all available fuzz targets
cargo +nightly fuzz list
```

Crash artifacts are written to `fuzz/artifacts/<target>/`. Reproduce a crash with:

```sh
cargo +nightly fuzz run <target> fuzz/artifacts/<target>/crash-<hash>
```

---

## Checklist for Contributors

Before opening a pull request that adds or modifies a contract function, confirm:

- [ ] At least one fuzz target exists for each new/modified function in the appropriate category (state-mutating, view/query, or administrative).
- [ ] Each fuzz target runs a minimum of 10,000 iterations.
- [ ] State-mutating fuzz targets exercise boundary values: `0`, `i128::MAX`, `u32::MAX`.
- [ ] Administrative fuzz targets assert `EscrowError::Unauthorized` or `EscrowError::AdminOnly` for arbitrary non-authorised callers.
- [ ] All `#[contracttype]` structs have a round-trip serialisation fuzz test (`from_val(env, &to_val(env, &x)) == x`).
- [ ] If `cargo fuzz` discovered a panic during development, a regression `#[test]` reproducing the exact input has been added and passes after the fix.
- [ ] All fuzz tests pass with `cargo test` before the pull request is submitted.
