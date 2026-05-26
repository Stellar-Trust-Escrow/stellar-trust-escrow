# Frontend Developer Guide

Everything you need to contribute to the Next.js frontend.

---

## Setup

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with your local API URL and contract address
npm run dev
```

Visit `http://localhost:3000`.

### Testing

```bash
cd frontend
npm run test:unit
npm run test:integration
npm run test:a11y
npm run test:coverage
npm run test:e2e
```

Use `npm run test:visual:update` when intentional UI changes require new Playwright snapshot baselines.

---

## Project Structure

```
frontend/
├── app/                        # Next.js 14 App Router
│   ├── layout.jsx              # Root layout — Header, Footer, Providers
│   ├── globals.css             # Tailwind + custom CSS variables
│   ├── page.jsx                # Landing page (/)
│   ├── dashboard/page.jsx      # Dashboard (/dashboard)
│   ├── escrow/
│   │   ├── create/page.jsx     # Create escrow form (/escrow/create)
│   │   └── [id]/page.jsx       # Escrow details (/escrow/:id)
│   ├── profile/[address]/page.jsx
│   └── explorer/page.jsx
│
├── components/
│   ├── layout/                 # Header, Footer
│   ├── escrow/                 # EscrowCard, MilestoneList, MilestoneItem, DisputeModal
│   └── ui/                     # Button, Badge, Modal, Spinner, ReputationBadge, StatCard
│
├── hooks/
│   ├── useWallet.js            # Freighter connection state
│   ├── useEscrow.js            # SWR escrow data fetching
│   └── useReputation.js        # SWR reputation fetching
│
└── lib/
    └── stellar.js              # Transaction building helpers
```

---

## Key Patterns

### Fetching Data with SWR

```jsx
import useSWR from 'swr';

const fetcher = (url) => fetch(url).then((r) => r.json());

export function useEscrow(id) {
  return useSWR(id ? `/api/escrows/${id}` : null, fetcher, { refreshInterval: 10_000 });
}
```

### Using the Wallet Hook

```jsx
import { useWallet } from '../hooks/useWallet';

export default function MyComponent() {
  const { address, isConnected, connect, signTx } = useWallet();

  if (!isConnected) {
    return <button onClick={connect}>Connect Wallet</button>;
  }

  return <p>Connected: {address}</p>;
}
```

### Building a Transaction

```jsx
import { buildApproveMilestoneTx, broadcastTransaction } from '../lib/stellar';
import { useWallet } from '../hooks/useWallet';

const { signTx, address } = useWallet();

const handleApprove = async (milestoneId) => {
  // 1. Build unsigned tx
  const unsignedXdr = await buildApproveMilestoneTx({
    sourceAddress: address,
    escrowId,
    milestoneId,
  });

  // 2. Sign with Freighter
  const signedXdr = await signTx(unsignedXdr);

  // 3. Broadcast via backend
  const { hash } = await broadcastTransaction(signedXdr);
  console.log('Tx confirmed:', hash);
};
```

### State Management
See the [comprehensive guide](frontend-state-management.md) covering SWR data fetching, WebSocket real-time updates, global Zustand-like store, optimistic patterns, error boundaries, loading skeletons, sync strategies, performance tips, and testing.

---

## Adding a New Component


1. Create file in `components/ui/` or `components/escrow/`
2. Export a default function component
3. Add JSDoc with `@param` types
4. Add `// TODO` comments for unimplemented logic
5. Import in the relevant page

---

## Code Standards

- `"use client"` at top only if using React state/effects (otherwise server component)
- Props should have JSDoc `@param` types
- Keep components under ~150 lines — extract sub-components if larger
- Use Tailwind utility classes only — no inline style objects unless truly dynamic
- All user-visible text should be in plain English (i18n can come later)

---

## Open Issues

| Issue | Task                                            | Difficulty |
| ----- | ----------------------------------------------- | ---------- |
| #18   | Implement Freighter wallet connection in Header | easy       |
| #29   | Implement `WalletProvider` context              | medium     |
| #28   | Implement Create Escrow multi-step form         | hard       |
| #30   | Implement User Profile data fetching            | medium     |
| #31   | Explorer filters with URL query params          | medium     |
| #35   | Full Freighter signing flow                     | hard       |
| #39   | Implement all SWR hooks                         | medium     |
| #42   | Add loading skeletons                           | easy       |
