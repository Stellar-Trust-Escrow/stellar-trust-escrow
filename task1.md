#883 Issue 81: Add Distributed Session Rate-Limiter with Sliding Window Counter
Repo Avatar
Stellar-Trust-Escrow/stellar-trust-escrow
Description:
Basic rate limiters are inaccurate because they resets counts at fixed intervals, making them susceptible to burst request abuses at interval boundaries. We need a sliding window rate limiter using Redis sorted sets in `backend/api/middleware/slidingRateLimiter.js`.

Proposed Solution:
Implement a sliding window limiter. For each request, record the timestamp in a Redis sorted set (ZADD). Remove timestamps older than the window limit (ZREMRANGEBYSCORE). Query the card (ZCARD) of the set; if count exceeds threshold, reject the request. Store limiter counters distributed across nodes.

Acceptance Criteria:

 Redis sliding window rate-limiting middleware implemented
 sliding window accurate count validation verified
 429 response returning correct dynamic headers
 Performance testing shows negligible CPU latency impacts on Redis pools
 Automated unit tests cover rapid burst requests and boundary counts
 Clean whitelisting handles internal service networks
Scope: 4–5 hours
Label: backend


#884 Issue 82: Implement Real-time Database Replica Query Routing for Explorer Read Heavy Workloads
Repo Avatar
Stellar-Trust-Escrow/stellar-trust-escrow
Description:
Under peak usage, read operations from users browsing active escrows on the explorer compete with high-priority contract write transactions, overloading the primary database. We need real-time replica read routing in `backend/config/prismaClient.js`.

Proposed Solution:
Deploy secondary read-replica databases. In the Prisma client initialization, configure read-replicas. Implement custom routing middleware that routes all GET queries to database read-replicas, while routing POST, PUT, and DELETE queries exclusively to the primary write instance.

Acceptance Criteria:

 Multi-database replica pool connection built
 Smart read/write query routing middleware implemented
 Replicas fallback gracefully to primary on replica connection drop
 Query latencies and DB load levels monitored and logged
 Integration tests verify exact sync consistency between DB nodes
 Zero database deadlocks under high volume simulations
Scope: 5–6 hours
Label: backend

#885 Issue 83: Build Interactive On-chain Governance Parameter Simulator
Repo Avatar
Stellar-Trust-Escrow/stellar-trust-escrow
Description:
Users find voting on parameter changes confusing without understanding their long-term system impacts. We need an interactive governance simulator on the frontend in `frontend/components/governance/ParameterSimulator.jsx`.

Proposed Solution:
Create a simulator interface with interactive slider controls. Allow users to adjust parameter values (e.g., increasing platform fee, decreasing dispute timeouts). Render real-time charts showing projected platform revenues, project completion trends, and arbitrator dispute backlog estimates based on historic datasets.

Acceptance Criteria:

 Slider controls adjusting governance parameters
 Real-time chart visualization rendering projected trends
 Dynamic math calculations verify calculations accurately
 High contrast styled layouts match the glassmorphic theme
 Fully responsive on mobile, tablet, and desktop screens
 Keyboard commands support slider navigation
Scope: 5–6 hours
Label: frontend


#887 Issue 85: Build Comprehensive Wallet Network Swapping and Automatic Alert System
Repo Avatar
Stellar-Trust-Escrow/stellar-trust-escrow
Description:
Users often have their wallet extension connected to the wrong network (e.g., Stellar Mainnet instead of Testnet), causing failed transactions. We need an automated network monitoring hook on the frontend in `frontend/hooks/useNetworkGuard.js`.

Proposed Solution:
Implement a hook that queries the connected wallet network environment. If a mismatch is detected, show a modal blocking interactions. The modal should explain the conflict, show the current and target networks, and provide a one-click button that triggers a wallet network swap command directly via the wallet SDK.

Acceptance Criteria:

 Wallet network checks execute automatically on connection changes
 Warning overlay locks action controls on network mismatches
 Wallet network swap prompt triggers via Freighter SDK
 Modal displays target RPC environments and troubleshooting steps
 Responsive UI fits mobile and desktop screens
 Screen readers declare network swap alerts immediately
Scope: 3–4 hours
Label: frontend


