# StellarTrustEscrow Glossary

This glossary defines domain-specific terminology used throughout the StellarTrustEscrow platform. All contributors should use these terms consistently to avoid confusion.

---

## Escrow Domain Terms

### Escrow
**Definition:** A financial arrangement where funds are held by a neutral third party (the contract) until conditions are met.  
**Context:** StellarTrustEscrow locks XLM tokens in a Soroban smart contract until milestone conditions are completed.  
**Example:** "The escrow holds $5,000 until all project deliverables are approved."  
**Synonym:** Smart contract agreement, milestone-based agreement  
**See also:** Depositor, Beneficiary, Milestone

---

### Depositor
**Definition:** The party who initiates an escrow and deposits funds into the contract.  
**Context:** In StellarTrustEscrow, the depositor (usually a client or project buyer) locks XLM into the contract at creation.  
**Example:** "The depositor approved the first milestone, releasing 25% of funds."  
**Synonym:** Funder, Client, Buyer, Payer  
**Role:** Creates escrows, approves milestones, receives funds back if escrow is cancelled  
**See also:** Beneficiary, Arbiter

---

### Beneficiary
**Definition:** The party who receives funds from the escrow upon successful milestone completion.  
**Context:** In StellarTrustEscrow, the beneficiary (usually a freelancer or service provider) completes work and claims funds.  
**Example:** "The beneficiary submitted proof of work, and the arbitrator approved the milestone payout."  
**Synonym:** Recipient, Service provider, Contractor, Freelancer  
**Role:** Submits milestone work, receives funds upon approval, can raise disputes  
**See also:** Depositor, Arbiter

---

### Arbiter
**Definition:** A neutral party (DAO-selected) who resolves disputes and enforces milestone approval.  
**Context:** In StellarTrustEscrow, arbiters are DAO-governed governance nodes that prevent abuse by either depositor or beneficiary.  
**Example:** "The arbiter resolved the dispute by awarding 40% to the depositor and 60% to the beneficiary."  
**Synonym:** Mediator, Arbitrator, Dispute resolver, Judge  
**Role:** Reviews dispute evidence, enforces milestone requirements, breaks deadlocks  
**Eligibility:** Must have governance token stake and reputation score > threshold  
**See also:** Depositor, Beneficiary, Dispute

---

### Milestone
**Definition:** A discrete deliverable or condition that must be met to release a portion of escrow funds.  
**Context:** Each escrow is divided into milestones; funds are released milestone-by-milestone, not all at once.  
**Example:** "Milestone 1: Deliver project proposal (25% of funds) → Milestone 2: Complete design (25%) → Milestone 3: Code development (50%)"  
**Status Lifecycle:** Pending → Submitted → Approved/Rejected → Completed  
**Properties:**
- Title and description
- Amount (% or XLM)
- Deadline (optional)
- Evidence requirements (optional)
- Submitter (beneficiary)
- Approver (depositor or arbiter)

**See also:** Escrow, Timelock, Dispute

---

### Timelock
**Definition:** A time-based constraint that prevents actions (e.g., release, cancellation) until a deadline passes.  
**Context:** Timelocks prevent premature fund release and ensure both parties have response time.  
**Example:** "A 7-day timelock on cancellation ensures the beneficiary has time to submit work before the escrow refunds."  
**Implementation:** Enforced at contract level; blocks function calls until block timestamp > deadline  
**See also:** Milestone, Dispute resolution timeout

---

### Dispute
**Definition:** A disagreement between depositor and beneficiary about milestone approval or fund distribution.  
**Context:** Raised when parties cannot agree; escalated to arbiters for resolution.  
**Example:** "The depositor raised a dispute claiming the submitted work did not meet the milestone requirements."  
**Dispute Lifecycle:** Raised → Evidence gathering → Arbiter review → Resolved/Appealed  
**Evidence Types:** Text descriptions, file uploads, off-chain video proof, chat logs  
**Resolution:** Arbiter determines fund split (e.g., 30% depositor, 70% beneficiary) and publishes decision on-chain  
**See also:** Arbiter, Reputation, Appeal

---

### Appeal
**Definition:** A request for re-review of an arbiter's dispute resolution decision.  
**Context:** If a party believes the arbiter decision was unfair, they can appeal to a higher arbitration panel.  
**Example:** "The beneficiary appealed the arbiter's decision within 14 days of resolution."  
**Conditions:** Must be submitted within timelock period; incurs escalation fee  
**Cost:** Appellant must stake tokens; if appeal upheld, fee is returned and loser pays penalty  
**See also:** Dispute, Arbiter, Timelock

---

### Reputation
**Definition:** A score reflecting a user's historical reliability and dispute outcomes.  
**Context:** Users build reputation through successful escrows; reputation affects trustworthiness and fee rates.  
**Formula:** `reputation = completed_escrows - (disputes_lost * weight) + (dispute_wins * bonus)`  
**Tiers:**
- **NEW** (score 0-99): New user, limited visibility
- **TRUSTED** (100-499): Completed multiple escrows, low dispute rate
- **VERIFIED** (500-999): High completion rate, identity verified
- **EXPERT** (1000-4999): Very high success, eligible to become arbiter
- **ELITE** (5000+): Top 1% performers, VIP benefits

**See also:** KYC, Arbiter eligibility

---

### KYC (Know Your Customer)
**Definition:** Identity verification process required to participate in the platform.  
**Context:** Regulatory compliance; depositor and beneficiary must pass KYC to create escrows or withdraw.  
**Statuses:** `Init` → `Processing` → `Approved`/`Declined`  
**Requirements:**
- Government ID (passport, driver's license)
- Proof of address (utility bill, bank statement)
- Face verification (liveness check)

**Impact:** Users below certain reputation thresholds have lower transaction limits until KYC is complete  
**See also:** Reputation, Account

---

### Account
**Definition:** A user's identity and transaction history on the StellarTrustEscrow platform.  
**Context:** Linked to a Stellar public key; holds reputation, KYC status, dispute history.  
**Properties:**
- Stellar public key (unique identifier)
- Profile (name, avatar, bio)
- Reputation score
- KYC status
- Escrow history (depositor and beneficiary)
- Dispute history

**See also:** Reputation, KYC, Depositor, Beneficiary

---

## Stellar-Specific Terms

### Stellar
**Definition:** A decentralized, open-source blockchain optimized for cross-border payments and asset transfers.  
**Context:** StellarTrustEscrow is built on Stellar; the smart contracts run on Soroban (Stellar's WASM runtime).  
**Website:** https://stellar.org  
**Consensus:** Stellar Consensus Protocol (SCP), not proof-of-work  
**Use in escrow:** Secure, low-cost asset transfers; trustlines for custom tokens  
**See also:** Soroban, XLM, Horizon

---

### XLM
**Definition:** The native token of the Stellar blockchain, used for fees and value transfer.  
**Symbol:** XLM  
**Smallest unit:** 1 stroop = 0.0000001 XLM  
**Context:** StellarTrustEscrow escrows are denominated in XLM (or custom Stellar assets).  
**Example:** "The escrow holds 1,000 XLM (10 million stroops)."  
**Fees:** Network fees ≈ 0.00001 XLM per operation; low cost enables high-frequency transactions  
**See also:** Stroop, Stellar, Token

---

### Stroop
**Definition:** The smallest denomination of XLM; 1 XLM = 10,000,000 stroops.  
**Context:** All Stellar operations work with integer stroops; XLM amounts are represented in stroops internally.  
**Example:** "The milestone payout is 50,000,000 stroops (5 XLM)."  
**Calculation:** stroops = XLM × 10^7  
**See also:** XLM

---

### Soroban
**Definition:** Stellar's smart contract platform; executes WebAssembly (WASM) contracts on-chain.  
**Context:** StellarTrustEscrow's escrow contract is written in Rust, compiled to WASM, and deployed on Soroban.  
**Language Support:** Rust, JavaScript (via `stellar-sdk`)  
**Execution Model:** Deterministic, metered gas; state stored in contract instance storage  
**Example:** "The escrow contract is deployed on Soroban testnet at CA..."  
**Advantages:** Low cost, fast finality, developer-friendly  
**See also:** WASM, Smart Contract, Horizon

---

### WASM (WebAssembly)
**Definition:** A binary instruction format for a stack-based virtual machine; portable across platforms.  
**Context:** Soroban smart contracts are compiled to WASM; this ensures deterministic, sandboxed execution.  
**File Extension:** `.wasm`  
**Compilation:** Rust source → WASM (via `wasm32-unknown-unknown` target)  
**Performance:** Near-native speed; more efficient than EVM  
**See also:** Soroban, Smart Contract

---

### Horizon
**Definition:** Stellar's official REST API for reading/writing blockchain data.  
**Context:** StellarTrustEscrow uses Horizon to:
- Submit transactions
- Listen for transaction confirmations
- Query account balances and history
- Monitor smart contract events

**Endpoints:**
- Public: `https://horizon.stellar.org` (mainnet)
- Testnet: `https://horizon-testnet.stellar.org`
- RPC: `https://soroban-rpc.stellar.org` (contract calls)

**Example:** "The indexer polls Horizon every 5 seconds for new escrow events."  
**See also:** Soroban-RPC, Stellar, Transaction

---

### Soroban-RPC
**Definition:** Stellar's JSON-RPC endpoint for Soroban smart contract calls.  
**Context:** Used to invoke read-only contract functions without broadcasting transactions.  
**Example:** "Get the escrow status via `SorobanClient.getContractData(escrow_id)`"  
**Difference from Horizon:** Soroban-RPC is contract-focused; Horizon is general blockchain data  
**See also:** Horizon, Smart Contract

---

### Friendbot
**Definition:** Stellar's test faucet; automatically funds newly-created testnet accounts with XLM.  
**Context:** For development/testing only; provides free XLM to bootstrap testnet accounts.  
**Endpoint:** `https://friendbot.stellar.org` (testnet only)  
**Usage:** `curl "https://friendbot.stellar.org?addr=<public_key>"`  
**Frequency:** Friendly rate limit; ~5 claims per hour per account  
**See also:** Testnet, Stellar

---

### Trustline
**Definition:** A record that allows an account to hold a non-native Stellar asset (not XLM).  
**Context:** To accept a custom token (e.g., USDC), an account must create a trustline first.  
**Example:** "The beneficiary created a trustline for USD issued by Anchor Corp, then received USD payments in the escrow."  
**Storage Impact:** Each trustline requires reserve (0.5 XLM) to maintain  
**XLM Trustline:** Not needed; XLM is native and always held  
**Contract Perspective:** When escrow is denominated in a custom asset, both parties must have trustlines  
**See also:** Token, Asset, Reserve

---

### Sequence Number
**Definition:** A transaction counter for an account; prevents replay attacks and ensures ordering.  
**Context:** Each transaction increments the sequence number; the network rejects transactions with wrong sequence.  
**Example:** "If the account's sequence is 100, the next transaction must have sequence 101."  
**Replay Protection:** A signed transaction with sequence 100 cannot be re-submitted after sequence advances  
**SDK Handles It:** Most SDKs auto-increment sequence; developers rarely need to think about it  
**See also:** Transaction, Account

---

### Fee Bump
**Definition:** A transaction that wraps another transaction and pays a higher fee; useful for priority.  
**Context:** If a transaction is stuck, a fee bump can re-submit with higher fee without changing sequence.  
**Example:** "The dispute resolution transaction was bumped to fee 2,000 stroops to ensure it confirms quickly."  
**Use Case:** Speed up stalled transactions, prioritize urgent operations  
**See also:** Transaction, Fee

---

### Transaction
**Definition:** A signed operation (or batch of operations) submitted to the Stellar network.  
**Context:** All escrow state changes (create, approve milestone, dispute) are Stellar transactions.  
**Properties:**
- Source account (submitter)
- Operations (1 or more actions)
- Fee (paid in stroops)
- Sequence number
- Timebound (optional expiry)
- Signature(s)

**Example:** "The beneficiary submitted a milestone via a single transaction invoking the Soroban contract."  
**Finality:** Confirmed on-chain within 3-5 seconds; irreversible after 15+ confirmations  
**See also:** Operation, Sequence number, Fee

---

### Operation
**Definition:** A single action within a transaction (e.g., payment, contract call, trustline change).  
**Context:** Most escrow operations are `InvokeHostFunction` ops that call the Soroban contract.  
**Common Types:**
- `Payment` — Transfer XLM
- `InvokeHostFunction` — Call Soroban contract
- `ChangeTrust` — Create trustline
- `ManageOffer` — Trade on DEX

**See also:** Transaction, Smart Contract

---

### Contract Address
**Definition:** A 56-character Stellar address starting with 'C' that identifies a deployed smart contract.  
**Context:** The escrow contract has a unique address; milestones and disputes are stored under this address.  
**Format:** Base32-encoded contract ID, always starts with 'C' on mainnet  
**Example:** `CAAAA...` (testnet examples are often shorter for docs)  
**Immutability:** Once deployed, the contract address never changes (unless contract is upgraded)  
**See also:** Account, Public Key, Soroban

---

### Public Key
**Definition:** A 56-character Stellar address starting with 'G'; unique identifier for an account.  
**Context:** Users log in via their public key; all transactions are signed with the corresponding private key.  
**Format:** Base32-encoded public key, always starts with 'G'  
**Example:** `GAAAA...`  
**Privacy:** Public keys are public; private keys must never be shared  
**KYC Link:** Public key is linked to user identity during KYC verification  
**See also:** Private Key, Account, Transaction

---

### Private Key
**Definition:** A secret 56-character value used to sign transactions; proves ownership of funds.  
**Context:** Users access their account via private key (stored in Freighter wallet, never on servers).  
**Security:** Must never be shared, stored on device only, can be backed up via secret seed  
**Example:** Freighter extension stores private key encrypted locally; never transmitted to StellarTrustEscrow backend  
**See also:** Public Key, Freighter, Transaction

---

### Seed Phrase
**Definition:** A 24-word mnemonic that derives a private key; used for wallet backup and recovery.  
**Context:** Freighter generates a seed phrase on wallet creation; storing it offline enables account recovery if device is lost.  
**Example:** "bounce height adjust recall tonight draw rite zone quote quick ready rely..."  
**Recovery:** Entering the seed phrase on a new device regenerates the same private key  
**Security:** Treat seed phrase like a password; anyone with it can access all funds  
**See also:** Private Key, Freighter

---

### Freighter
**Definition:** A browser wallet extension for Stellar; securely stores private keys and signs transactions.  
**Context:** StellarTrustEscrow integrates with Freighter; users click "Connect Wallet" to authenticate via Freighter.  
**Installation:** Available for Chrome, Firefox, Edge  
**Signing Flow:**
  1. User clicks "Create Escrow"
  2. StellarTrustEscrow sends transaction to Freighter
  3. User reviews and approves in Freighter popup
  4. Freighter signs and broadcasts to Stellar network
  5. StellarTrustEscrow confirms and updates UI

**Security:** Private key never leaves Freighter; all signing is local  
**See also:** Wallet, Private Key, Transaction

---

### Wallet
**Definition:** An application or service that stores private keys and signs transactions.  
**Context:** Freighter is the recommended wallet for StellarTrustEscrow; other Stellar wallets (Albedo, Lobstr) also work.  
**Responsibilities:**
- Secure private key storage
- Transaction signing
- Balance display
- Asset management

**See also:** Freighter, Private Key

---

### Asset
**Definition:** A token on Stellar; can be native (XLM) or issued by an anchor/issuer.  
**Context:** StellarTrustEscrow supports escrows in custom assets (e.g., USDC, BRL issued by anchors).  
**Identifier:** `asset_code:issuer_public_key` (e.g., `USDC:GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJZ4VS3YC6GFKBOB5SI23ZY7AP7`)  
**Native Asset:** XLM (no issuer needed)  
**Example:** "The escrow accepts USDC issued by Circle; the beneficiary can withdraw to any USDC-enabled exchange."  
**See also:** Trustline, Issuer, Token

---

### Issuer
**Definition:** An entity that creates and manages a non-native Stellar asset.  
**Context:** Anchors (e.g., exchanges, banks) issue assets like USDC, EUR, BRL on Stellar.  
**Responsibility:** Maintains 1:1 redemption of on-chain tokens for real-world equivalents  
**Example:** "The USDC issuer is Circle; 1 on-chain USDC = 1 real-world USD that Circle backs."  
**Trust Model:** Users must trust the issuer to honor redemptions  
**See also:** Anchor, Asset, Trustline

---

### Anchor
**Definition:** A gateway between Stellar blockchain and traditional financial systems; issues assets and processes deposits/withdrawals.  
**Context:** Anchors enable fiat on/off-ramps; users can deposit USD and receive USDC tokens, or burn USDC to withdraw USD.  
**Examples:** Circle (USDC), Stellar Development Foundation (native currencies in emerging markets)  
**Services:**
- Deposit: USD bank transfer → USDC tokens
- Withdraw: USDC tokens → USD bank transfer
- Settlement: XLM ↔ fiat exchange

**See also:** Issuer, Asset, Trustline

---

### Reserve
**Definition:** The minimum XLM balance an account must maintain on Stellar.  
**Context:** Account reserves prevent spam; deleting trustlines and offers frees up reserves.  
**Calculation:**
- Base reserve: 0.5 XLM per account
- Per trustline: 0.5 XLM
- Per offer: 0.5 XLM

**Example:** "An account with 2 trustlines must maintain 1.5 XLM (0.5 base + 0.5 × 2 trustlines)."  
**Impact:** Users cannot withdraw their full balance; must leave reserves untouched  
**See also:** Account, Trustline, XLM

---

### Testnet
**Definition:** A test blockchain run by Stellar Foundation; mirrors mainnet but uses play money.  
**Context:** StellarTrustEscrow development uses testnet; Friendbot auto-funds accounts for free.  
**Differences from Mainnet:**
- Different ledger (separate blockchain)
- Friendbot faucet available
- No real value; XLM can be created freely
- Network resets occasionally (data loss expected)

**RPC Endpoints:**
- Horizon: `https://horizon-testnet.stellar.org`
- Soroban: `https://soroban-rpc-testnet.stellar.org`

**See also:** Mainnet, Stellar, Friendbot

---

### Mainnet
**Definition:** The production Stellar blockchain where real transactions and real value occur.  
**Context:** StellarTrustEscrow will eventually deploy to mainnet; escrows will hold real XLM and assets.  
**Current State:** StellarTrustEscrow is in beta on testnet; mainnet deployment pending audit completion.  
**Network Resets:** Never; data is permanent and irreversible  
**See also:** Testnet, Stellar

---

### Ledger
**Definition:** A record of all transactions and account state on the Stellar blockchain.  
**Context:** Each new block (typically ~5 seconds) adds transactions to the ledger; history is permanent.  
**Immutability:** Once a transaction is confirmed, it cannot be reversed; the ledger is append-only  
**See also:** Transaction, Block, Blockchain

---

## Cross-Reference Matrix

| Term | Related Terms | Context |
|------|---------------|---------|
| **Escrow** | Depositor, Beneficiary, Arbiter, Milestone | Core concept: locked funds with conditions |
| **Depositor** | Escrow, Beneficiary, Reputation, KYC | Funds the escrow, approves milestones |
| **Beneficiary** | Escrow, Depositor, Milestone, Reputation | Completes work, receives funds, can dispute |
| **Arbiter** | Dispute, Depositor, Beneficiary, Reputation | Resolves conflicts, DAO-governed |
| **Milestone** | Escrow, Timelock, Dispute, Evidence | Unit of work within an escrow |
| **Dispute** | Arbiter, Milestone, Beneficiary, Evidence, Appeal | Disagreement escalation mechanism |
| **Reputation** | Escrow, Dispute, Arbiter eligibility | Trust score based on history |
| **Stellar** | XLM, Soroban, Horizon, Transaction | Blockchain infrastructure |
| **Soroban** | WASM, Smart Contract, Stellar, Contract Address | Smart contract runtime |
| **Trustline** | Asset, Issuer, Anchor, Account | Enable holding non-native tokens |
| **Transaction** | Operation, Sequence number, Fee bump | Atomic state change |

---

## Common Confusions

### ❌ Arbiter vs. Admin

- **Arbiter:** Specialized role for dispute resolution; elected by DAO; NOT full platform admin
- **Admin:** Backend administrative access to servers; separate from arbiter role
- **Usage:** "The arbiter resolved the dispute" ✅, NOT "The admin resolved the dispute" ❌

---

### ❌ Trustline vs. Balance

- **Balance:** How much XLM (or assets) an account holds (e.g., "I have 100 XLM")
- **Trustline:** Permission to hold a non-native asset (e.g., "I created a USD trustline")
- **Relationship:** Balance is the quantity; trustline is the permission to hold

---

### ❌ Stellar vs. Soroban

- **Stellar:** The entire blockchain network (consensus, accounts, transactions)
- **Soroban:** Smart contract platform built on Stellar (one component of Stellar)
- **Analogy:** Stellar is Ethereum, Soroban is the EVM

---

### ❌ Sequence Number vs. Nonce

- **Sequence Number:** Stellar's term for transaction counter; signed into every transaction
- **Nonce:** General term from other blockchains (Ethereum, etc.)
- **Same Concept:** Different terminology between blockchains

---

### ❌ XLM vs. Stroop

- **XLM:** User-facing unit (1 XLM = 7 decimal places)
- **Stroop:** Internal unit (1 stroop = 0.0000001 XLM)
- **Context:** Display prices in XLM to users; store amounts as stroops internally

---

### ❌ Fee vs. Reserve

- **Fee:** Transaction cost (paid once per transaction; destroyed/burned)
- **Reserve:** Minimum account balance (held in account; freed when trustline is deleted)
- **Analogy:** Fee = gas; Reserve = security deposit

---

### ❌ Public Key vs. Account

- **Public Key:** The 56-character address (e.g., `GAAAA...`)
- **Account:** The associated data on-chain (balance, sequence, trustlines)
- **Relationship:** One public key = one account; the public key identifies the account

---

### ❌ Friendbot vs. Faucet

- **Friendbot:** Stellar's specific testnet faucet service
- **Faucet:** General term for any testnet account funding service
- **Relationship:** Friendbot is a faucet; other blockchains have other faucets

---

## Contributing to This Glossary

When adding new terms:

1. **Use a clear, one-sentence definition**
2. **Provide domain context** (how it applies to StellarTrustEscrow)
3. **Include an example sentence** starting with "Example:"
4. **Link related terms** in "See also" section
5. **Add cross-references** if the term conflicts with another

---

## Related Documentation

- [Smart Contract Guide](./smart-contract-guide.md)
- [Arbiter Guide](./arbiter-guide.md)
- [Frontend Guide](./frontend-guide.md)
- [Error Codes](./error-codes.md)
- [Stellar Documentation](https://developers.stellar.org)

---

Last updated: 2026-06-24
