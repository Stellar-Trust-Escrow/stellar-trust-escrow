# Dispute Resolution

This document explains how disputes are handled in Stellar Trust Escrow, from opening a dispute through evidence submission, arbiter selection, inactive arbiter escalation, and appeals.

## 1. When a dispute is opened

A dispute is opened when either buyer or seller believes the escrow should not be completed as originally agreed.

- The party calls `raise_dispute(escrow_id, reason)` through the app.
- The contract transitions the escrow from `Active` to `Disputed`.
- Funds are frozen in the escrow while the dispute is pending.
- The dispute appears in backend APIs and the app’s dispute view.

## 2. What happens after a dispute is raised

Once the escrow is disputed:

- Both buyer and seller can upload evidence.
- The backend stores evidence off-chain and links it to the dispute.
- The escrow remains `Disputed` until an on-chain resolution transaction completes.
- The dispute resolution process may follow one of several paths:
  - manual arbiter resolution
  - oracle-based auto-resolution
  - governance escalation
  - timeout claim if an arbiter becomes inactive

## 3. Evidence submission and rules

Evidence is the core input for dispute review.

### What can be submitted

- Files: documents, images, PDFs, archives.
- Text descriptions or notes.
- Links or other evidence metadata.

### Key evidence rules

- Evidence upload is available only to dispute participants.
- Files are validated before storage.
- The system enforces:
  - maximum 5 files per upload
  - maximum 10 MiB per file
  - allowed file types such as JPEG, PNG, GIF, WebP, PDF, DOC/DOCX, XLS/XLSX, CSV, TXT, ZIP
  - rejection of executable files and infected uploads
- Files are scanned with ClamAV for malware.
- Files are pinned to IPFS so they can be referenced permanently.

### Good evidence practices

- Upload delivery records, receipts, screenshots, invoices, contracts, and signed approvals.
- Include a short description of why each item is relevant.
- Submit evidence as soon as a dispute is opened.
- Keep evidence focused on the specific disagreement.

## 4. Resolution Paths

### Path A — Manual arbiter resolution

- An arbiter reviews the dispute and evidence.
- The arbiter calls `resolve_dispute(escrow_id, client_amt, freelancer_amt)`.
- The contract splits funds according to the arbiter decision.
- The dispute becomes resolved and the escrow transitions to `Completed`.

### Path B — Oracle-based auto-resolution

- In some scenarios, a trusted oracle can resolve the dispute automatically.
- The contract accepts `oracle_resolve_dispute(escrow_id, payload, signature)`.
- The payload is verified against the oracle’s public key.
- If valid, the contract releases funds according to the oracle decision.

### Path C — Governance escalation

- If an arbiter cannot or does not resolve the dispute in time, governance may escalate it.
- The contract calls `escalate_dispute_to_governance(escrow_id)`.
- Governance then selects a dispute panel, usually a small group of arbitrators.
- The panel votes, and the majority outcome is executed on the escrow contract.

### Path D — Arbiter timeout claim

- If an arbiter is assigned but does not resolve the dispute within the allowed window:
  - anyone can call `claim_dispute_timeout(escrow_id)`.
- The contract will refund the client when the arbiter is inactive.
- This path prevents disputes from remaining unresolved indefinitely.

## 5. Arbiter and governance flow

### Arbiter assignment

- Some disputes are reviewed by a designated arbiter.
- The dispute record may include an `arbiterAddress` when one is assigned.
- If no arbiter is assigned, other resolution mechanisms may be used.

### Governance panel

- Governance escalation assigns a panel of arbitrators.
- The panel decision is recorded on-chain and then applied to the escrow.
- This path is used when the normal arbiter path cannot resolve the dispute.

## 6. Inactive arbiter escalation

Arbiter inactivity is handled to protect buyers and sellers from stalled disputes.

- The system does not wait forever for an arbiter response.
- If the arbiter misses the resolution window, the dispute can move to a timeout claim.
- `claim_dispute_timeout(escrow_id)` refunds the client by default when the arbiter is inactive.
- This ensures the escrow can move toward resolution even when a party is unresponsive.

## 7. Appeals and re-open behavior

### When appeals are allowed

- Appeals can only be filed after a dispute is already resolved.
- The user must submit a reason explaining why the resolution should be reviewed.

### How appeals work

- File an appeal via `POST /api/disputes/:id/appeals` with a non-empty `reason`.
- Only the party filing the appeal may submit one appeal per dispute.
- The appeal is recorded with status `pending`.
- An administrator or reviewer can then update the appeal via `PATCH /api/disputes/appeals/:appealId`.
- The reviewer sets the appeal status to `approved` or `rejected` and may include review notes.

### Important note about current behavior

- Appeals do not automatically re-open the on-chain dispute in the existing system.
- The appeal creates an administrative review record for the resolved dispute.
- Approved appeals should prompt follow-up action by the governance or admin team.

## 8. What users should expect

- Your dispute is a protected state: funds stay frozen until the contract resolves it.
- The faster both sides submit clear evidence, the better the outcome.
- If an arbiter is inactive, the dispute can still be escalated or timeout claimed.
- If you disagree with a final resolution, you can file an appeal, but the appeal needs administrative review.

## 9. Helpful links

- API reference: `docs/api/disputes.md`
- Evidence upload details: `backend/docs/DISPUTE_EVIDENCE_UPLOAD.md`
- Smart contract dispute flow: `docs/ARCHITECTURE.md`
