# Escrow Summary Card Component for the Dashboard

## Issue Reference
Closes #42

## Summary
Built a rich, scannable escrow summary card component that replaces the plain card with visual hierarchy, status badges, deadline indicators, and action-required highlights. The component is used in the dashboard and explorer list views.

## Changes Made

### 1. Enhanced `EscrowCard` Component
**File:** `frontend/components/escrow/EscrowCard.jsx`

**What changed:**
- **Escrow ID in header**: Added truncated `#id` display at the top of each card for quick identification
- **Counterparty derivation**: When `userAddress` prop is provided, the component automatically derives the user's role (`client`/`freelancer`) and the counterparty address from `clientAddress`/`freelancerAddress` in the escrow data. Falls back to explicit `role`/`counterparty` props for backward compatibility
- **Time remaining display**: Shows deadline countdown using the new `formatRemainingTime` utility. Displays `"3d left"`, `"5h left"`, `"Overdue 1d"` etc. Color-coded: amber for approaching deadlines, red for overdue
- **Action-required highlighting**: Active escrows with deadlines within 24h or overdue get an amber accent border (`border-amber-500/50`) and a pulsing "Action required" badge in the footer
- **Status badge**: Uses the existing `Badge` component with colour-coded variants — green (Active), red (Disputed), blue (Completed), grey (Cancelled)

**Design considerations:**
- All existing functionality preserved (milestone progress bar, transaction hash, CopyButton)
- Backward compatible: cards rendered without `userAddress` continue to work with direct `role`/`counterparty` props
- Responsive: card is full-width on mobile, grid layout controlled by parent container
- Accessible: keyboard navigation via Enter/Space, proper ARIA labels

### 2. Backend Fix — User Escrows API
**File:** `backend/api/controllers/userController.js`

**Problem:** The `getUserEscrows` handler's `ESCROW_SUMMARY_SELECT` was missing `clientAddress` and `freelancerAddress`, preventing the frontend from determining the user's role or counterparty.

**Fix:** Added `clientAddress: true` and `freelancerAddress: true` to the select object, matching the same shape used in the escrow controller. The `getUserProfile` handler already included these fields via spread — now they're part of the base select.

### 3. Dashboard API Response Fix
**File:** `frontend/app/dashboard/page.jsx`

**Problem:** The dashboard was reading `data?.escrows` from the API response, but the backend returns paginated results under the key `data` (not `escrows`). This meant the dashboard never displayed real escrows.

**Fix:** Changed to `data?.data` to match the actual `buildPaginatedResponse` shape.

Also passes `userAddress={address}` to `EscrowCard` so role and counterparty are derived automatically.

### 4. Explorer Normalisation Update
**File:** `frontend/app/explorer/page.jsx`

Added `deadline`, `clientAddress`, and `freelancerAddress` to the `normaliseEscrow` function so explorer cards can also display time-remaining information when `userAddress` is available.

### 5. New Utility — `formatRemainingTime`
**File:** `frontend/lib/formatRemainingTime.js`

A pure function that formats the time between now and a given deadline date:
- Future dates: `"3d left"`, `"5h left"`, `"30m left"`
- Past dates: `"2d overdue"`, `"1h overdue"`
- Returns `null` for missing/empty input

## How to Test

### Automated tests
```bash
cd frontend && npm test -- --testPathPattern=EscrowCard
```

### Manual verification
1. Navigate to the dashboard (`/dashboard`)
2. Verify each escrow card shows:
   - `#ID` and title at the top
   - Counterparty address
   - Amount with USDC symbol
   - Colour-coded status badge
   - Deadline countdown (if deadline is set)
   - Amber border + "Action required" badge for escrows with deadlines within 24h
3. Click a card — verify navigation to `/escrow/{id}`
4. Resize browser — verify cards stack full-width on mobile and display in a 2-column grid on desktop

## Files Changed
| File | Change |
|------|--------|
| `frontend/components/escrow/EscrowCard.jsx` | Enhanced with deadline display, action-required accent border, role derivation |
| `frontend/lib/formatRemainingTime.js` | New utility for deadline countdown formatting |
| `frontend/app/dashboard/page.jsx` | Fixed API response key, pass `userAddress` to cards |
| `frontend/app/explorer/page.jsx` | Added deadline/address fields to normaliseEscrow |
| `backend/api/controllers/userController.js` | Added client/freelancer addresses to ESCROW_SUMMARY_SELECT |

Closes #42
