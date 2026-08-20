**Contract Examples**

Audience: Developers — quick copy-paste examples showing how to build common transactions using the frontend helpers in `frontend/lib/stellar.js`.

Prerequisites
- Ensure environment variables are set in `frontend/.env.local`:

```bash
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_CONTRACT_ADDRESS=<deployed-contract-address>
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Example 1 — Create an escrow (build XDR)

```js
import { buildCreateEscrowTx, broadcastTransaction } from '../frontend/lib/stellar';

async function createEscrowExample() {
  const unsignedXdr = await buildCreateEscrowTx({
    sourceAddress: 'GCLIENTADDRESS...',
    freelancerAddress: 'GFREELANCERADDRESS...',
    tokenAddress: 'GASSETCONTRACT...',
    amount: '1000000', // stroops (1 XLM = 10_000_000 stroops)
    briefHash: 'aabb... (32-byte hex)'
  });

  // Sign with Freighter (wallet) in the UI, then broadcast via backend
  // Example: pass signedXdr to backend endpoint `POST /api/escrows/broadcast`
  const signedXdr = /* sign using Freighter */;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/escrows/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedXdr }),
  });
  return res.json();
}
```

Example 2 — Submit and approve a milestone

```js
import { buildSubmitMilestoneTx, buildApproveMilestoneTx } from '../frontend/lib/stellar';

// Freelancer builds submit XDR
const submitXdr = await buildSubmitMilestoneTx({
  sourceAddress: 'GFREELANCER...',
  escrowId: '1',
  milestoneId: 0,
});

// Client builds approve XDR
const approveXdr = await buildApproveMilestoneTx({
  sourceAddress: 'GCLIENT...',
  escrowId: '1',
  milestoneId: 0,
});

// After signing, both are broadcast similarly via the backend endpoint.
```

Example 3 — Raise a dispute

```js
import { buildRaiseDisputeTx } from '../frontend/lib/stellar';

const disputeXdr = await buildRaiseDisputeTx({
  sourceAddress: 'GCLIENT_OR_FREELANCER...',
  escrowId: '1',
  milestoneId: 0, // optional
});

// Sign + broadcast
```

Notes
- The helpers in `frontend/lib/stellar.js` already include simulation using the configured Soroban RPC. Always simulate before signing to verify the transaction footprint and avoid failed submissions.
- For signing in the browser use Freighter or other wallet integrations; the code above assumes signing is handled by the UI and the signed XDR is submitted to the backend broadcast endpoint.
