# Merge Complexity Note

## Current Situation

The auto-merge bot has created a very complex merge situation with:
- Duplicate `#[contract]` and `impl EscrowContract` declarations in lib.rs
- Old broken code (lines 65-234) mixed with new proper implementation
- Storage API changes (`storage::get_escrow` no longer exists, replaced with `ContractStorage::load_escrow`)
- Error codes renumbered (75-76 now used by multisig, need 141-142 for timelock)
- Frontend files with HTML entity corruption

## Recommended Approach

Per the maintainer feedback, **PR #1509 already contains all the necessary fixes** to properly integrate the timelock feature with the current develop branch.

### Option 1: Use PR #1509 (Recommended)
Close this PR and let #1509 land instead. It has:
- ✅ Proper storage API usage (`ContractStorage::load_escrow`)
- ✅ Correct error codes (141-142)
- ✅ Duplicate impl blocks removed
- ✅ Frontend HTML entity fixes
- ✅ Updated tests using proper contract interface

### Option 2: Manual Fix (Complex)
Would require:
1. Removing duplicate contract declaration (lines 65-234 in lib.rs)
2. Adding `Address` to imports
3. Rewriting both timelock functions to use `ContractStorage::load_escrow`
4. Updating tests to use contract client interface
5. Fixing 3 frontend files with template literal corruption
6. Testing everything locally

## Files with Issues

### contracts/escrow_contract/src/lib.rs
- Lines 65-234: Duplicate broken impl block (must be deleted)
- Lines 245+: Real implementation (keep this, add timelock functions here)
- Missing `Address` in use statement (line 63)

### contracts/escrow_contract/src/errors.rs
- ✅ FIXED: Added TimelockNotExpired = 141, InvalidSignature = 142

### contracts/escrow_contract/src/timelock_multisig_tests.rs
- Uses `storage::set_escrow` / `storage::get_escrow` (doesn't exist)
- Needs complete rewrite to use client interface

### Frontend Files  
- `frontend/components/escrow/CreateWizard/index.jsx` (lines 24, 46-48)
- `frontend/hooks/useEscrowSocket.js` (line 15)
- `frontend/hooks/useEscrowDraft.js` (line 37)

## Decision

**Recommended**: Close this PR in favor of #1509 which has all fixes applied correctly.

This avoids spending significant time on complex manual merges when a working solution already exists.
