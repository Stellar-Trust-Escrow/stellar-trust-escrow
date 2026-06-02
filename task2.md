#931 Issue 129: Add Premium Interactive Stellar Trust Escrow Onboarding Tour
Repo Avatar
Stellar-Trust-Escrow/stellar-trust-escrow
Description:
Web3 onboarding can be confusing for non-technical users. To improve retention, we need a step-by-step interactive product tour on the frontend in `frontend/components/onboarding/DashboardTour.jsx`.

Proposed Solution:
Create an interactive walkthrough using react-joyride or custom modal overlays. Guide users through connecting their wallet, obtaining testnet XLM, defining milestones, funding an escrow, and interacting with disputes. Design visually stunning step indicators with animated tooltips and glowing spotlights on targeted UI elements.

Acceptance Criteria:

 Step-by-step interactive guide on startup
 Glowing overlay spotlights target UI controls
 Guide checks wallet connection progress before proceeding
 Easy skip option and progress saving in localStorage
 Responsive design works flawlessly on tablet and mobile screens
 Accessibility-tested focus navigation inside onboarding steps
Scope: 4–5 hours
Label: frontend

#932 Issue 130: Build Dynamic Interactive Smart Contract Method Execution Inspector
Repo Avatar
Stellar-Trust-Escrow/stellar-trust-escrow
Description:
Developers and advanced users need a way to inspect raw on-chain smart contract variables directly without digging through block explorers. We need a smart contract method inspector on the frontend in `frontend/app/developer/inspector/page.jsx`.

Proposed Solution:
Build an inspector console that parses the Soroban contract WASM ABI. Render form fields dynamically for all contract functions based on their input parameters. Allow users to connect their wallet and invoke read/write methods, showing raw JSON responses and transaction gas metrics.

Acceptance Criteria:

 ABI inspector interface renders dynamic input forms
 Connected wallet execution of contract functions supported
 Raw JSON response viewer with syntax highlighting
 Gas costs and transaction logs captured and displayed
 Premium dark-mode styling with developer console highlights
 Unit tests cover dynamic form rendering
Scope: 5–7 hours
Label: frontend


#933 Issue 131: Setup Automated Nightly High-Load System Chaos Benchmarks
Repo Avatar
Stellar-Trust-Escrow/stellar-trust-escrow
Description:
We must prevent performance degradation under unstable network conditions. We need an automated nightly chaos and high-load testing pipeline in `load-tests/chaos-runner.sh`.

Proposed Solution:
Set up a nightly runner that starts our sandbox environment and runs load tests. During the test, automatically inject chaos actions: kill database nodes, trigger network packet drops, and terminate Redis services. Verify that the platform handles failures gracefully and recovers without losing transactions.

Acceptance Criteria:

 Automated nightly chaos test pipeline configured
 Failures (node drops, latency spikes) injected dynamically during runs
 Platform handles failures gracefully, maintaining data consistency
 Detailed chaos reports generated automatically
 Alerts on recovery failures sent to developer channels
 Chaos actions documented in testing guides
Scope: 5–7 hours
Label: DevOps


