# Security Policy

## Overview

This document outlines the security measures implemented in the StellarTrustEscrow smart contract to protect user funds and prevent common attack vectors.

---

## Security Fixes

### 1. Rent Manipulation Prevention via View Call Audit (#673)

**Issue**: `settle_rent_for_access` is called by read functions like `load_escrow_meta_with_rent` to lazily collect rent on every access. An adversary could potentially make thousands of view calls to drain rent faster than the normal schedule.

**Analysis**: The function is safe from rent manipulation because:
- `collect_rent_due` checks that enough time has passed (`elapsed_periods > 0`) before charging rent
- `last_rent_collection_at` is updated after each collection, preventing double-charging within the same period
- Even if called 1000x in the same block, only the first call collects rent (subsequent calls return 0)
- Period boundaries are correctly enforced: rent is only charged for complete periods elapsed

**Conclusion**: No manipulation vector exists. Repeated view calls cannot accelerate rent depletion beyond the normal schedule.

---

### 2. Token Validation on Escrow Creation (#675)

**Issue**: `create_escrow` did not validate that tokens are approved for use as escrow tokens, allowing registered-but-unapproved wrapped tokens to bypass approval gates.

**Fix**: Added `validate_escrow_token` call at the start of `create_escrow` to ensure:
- Registered wrapped tokens with `is_approved = false` are rejected with `BridgeError (54)`
- Registered wrapped tokens with `is_approved = true` are accepted
- Native (non-registered) Stellar tokens bypass the check and are always accepted

**Implementation**: 
```rust
ContractStorage::validate_escrow_token(&env, &token)?;
```

---

### 3. Overflow/Underflow Guards in Rent Collection (#674)

**Issue**: `collect_rent_due` performs timestamp arithmetic that could underflow if ledger timestamps are inconsistent, causing panics in debug mode or wrapping in release mode.

**Fixes Applied**:
- Replaced `now - last_collection` with `now.saturating_sub(last_collection)` to prevent underflow
- Replaced bare multiplication with `checked_mul` for rent calculations
- Added arithmetic safety comment explaining the approach

**Code Changes**:
```rust
let time_since_last = now.saturating_sub(meta.last_rent_collection_at);
let due = rent_per_period
    .checked_mul(i128::from(elapsed_periods))
    .ok_or(EscrowError::AmountMismatch)?;
```

---

### 4. Monotonically Increasing Nonce Enforcement (#676)

**Issue**: `MetaTransaction.nonce` lacked enforcement of strictly monotonically increasing nonces, allowing replay attacks and gap attacks.

**Fixes Applied**:
- Added `DataKey::MetaTxNonce(Address)` to track the last used nonce per signer
- Implemented `validate_and_update_nonce` function that enforces `nonce > last_nonce`
- Updated `MetaTransaction` documentation to explain the security strategy

**Security Guarantees**:
- **Replay Prevention**: Same nonce cannot be reused (nonce must be > last_nonce)
- **Gap Attack Prevention**: Non-sequential nonces are rejected (nonce must be > last_nonce, not just different)
- **Per-Signer Tracking**: Each signer has independent nonce state

**Code**:
```rust
fn validate_and_update_nonce(env: &Env, signer: &Address, nonce: u64) -> Result<(), EscrowError> {
    let key = DataKey::MetaTxNonce(signer.clone());
    let last_nonce: u64 = env.storage().persistent().get(&key).unwrap_or(0);
    
    if nonce <= last_nonce {
        return Err(EscrowError::Unauthorized);
    }
    
    env.storage().persistent().set(&key, &nonce);
    Self::bump_persistent_ttl(env, &key);
    Ok(())
}
```

---

## Testing

All security fixes include comprehensive unit tests:

- `test_settle_rent_for_access_no_repeated_charge`: Verifies repeated view calls don't over-deplete rent
- `test_create_escrow_token_validation`: Tests approved, unapproved, and native token scenarios
- `test_collect_rent_due_extreme_timestamps`: Tests arithmetic safety with extreme u64 values
- `test_meta_transaction_nonce_enforcement`: Tests sequential nonces, replay rejection, and gap rejection

Run all tests with:
```bash
cargo test -p escrow_contract
```

---

## Recommendations for Future Work

1. **Wrapped Token Registry**: Implement a persistent registry of approved wrapped tokens with `is_approved` flags
2. **Nonce Gaps**: Consider allowing configurable nonce gap policies (strict sequential vs. monotonic)
3. **Audit Trail**: Add event logging for all nonce violations and token validation failures
4. **Rate Limiting**: Consider implementing rate limits on view function calls to prevent DOS attacks

---

## Reporting Security Issues

If you discover a security vulnerability, please email security@stellartrustescrow.dev with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

Please do not disclose the vulnerability publicly until we've had time to address it.
