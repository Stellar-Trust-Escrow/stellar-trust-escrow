#889 Issue 87: Build Advanced Real-time Dispute Mediation Workspace for Arbitrators
Repo Avatar
Stellar-Trust-Escrow/stellar-trust-escrow
Description:
Assigned arbitrators require an immersive workspace to analyze complex cases. We need to build an arbitrator dispute mediation workspace on the frontend in `frontend/app/arbitrator/workspace/[id]/page.jsx`.

Proposed Solution:
Create a dashboard containing: chronological evidence explorer, dual-party account information panel, dynamic payout ratio slider, collaborative case notes board, and direct transaction deployment panels with security confirmations.

Acceptance Criteria:

 Immersive multi-panel mediator dashboard built
 Chronological evidence file inspector with multi-format viewers
 Dynamic, slider-based payout split controller
 Collaboration notes save states to backend successfully
 Accessible layout with clear keyboard controls
 Premium glassmorphic interface with clean layout transitions
Scope: 7–9 hours
Label: frontend

#888 Issue 86: Add Premium Dark-mode Interactive Multi-Currency Conversion Widget
Repo Avatar
Stellar-Trust-Escrow/stellar-trust-escrow
Description:
Users depositing and withdrawing escrow funds require precise conversion updates. We need a sleek, interactive multi-currency conversion widget on the frontend in `frontend/components/ui/CurrencyConverter.jsx`.

Proposed Solution:
Create a dual currency converter. Fetch the latest market prices for XLM, USDC, and local fiat currencies. Render a clean card interface with interactive input fields that update dynamically as users type. Add hover glow animations, dynamic fee breakdown grids, and warning banners for high market slippage.

Acceptance Criteria:

 Accurate calculation checks matching live market feeds
 Real-time dynamic updates on conversion fields
 Slippage warning banners trigger on high market congestion
 Deep dark-mode styled panel with glassmorphic highlights
 keyboard controls and screen reader accessibility verified
 Works cleanly inside sidebar modules and main columns
Scope: 3–4 hours
Label: frontend

#838 Issue 36: Add Configurable Governance Parameters via Voting
Repo Avatar
Stellar-Trust-Escrow/stellar-trust-escrow
Description:
The platform's parameters (e.g., fee rates, timeouts, arbitrator requirements) are hardcoded. To ensure community ownership, we need to implement a voting mechanism in `contracts/governance/src/lib.rs` that allows token holders to update these parameters.

Proposed Solution:
Define a GovernanceConfig structure storing all configurable platform variables. Create proposals specifically for updating config elements (e.g., UpdatePlatformFee(u32)). Implement voting logic where token holders lock voting power. If passed, the parameter is updated globally in contract storage.

Acceptance Criteria:

 GovernanceConfig structure added to contract storage
 Parameter update proposal structures and validators created
 Dynamic voting power calculations based on locked token balances
 Automated execution of parameter updates on proposal passage
 Rejection of invalid parameter updates (out of bounds)
 High test coverage for all parameter-changing proposals
Scope: 5–7 hours
Label: contracts