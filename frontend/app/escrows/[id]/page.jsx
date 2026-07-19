import React from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';

const fetcher = (url) => fetch(url).then(r => r.json());

function getStellarExpertUrl(address, network = 'testnet') {
  return \https://stellar.expert/explorer//account/\;
}

function truncateHash(hash) {
  if (!hash || hash.length <= 16) return hash;
  return \${hash.slice(0, 8)}...\;
}

const STATUS_COLORS = { Active: 'green', Pending: 'yellow', Completed: 'blue', Disputed: 'red', Cancelled: 'gray', Funded: 'teal' };

function StatusBadge({ status }) {
  return (<span className={\adge badge-\} aria-label={\Status: \}>{status}</span>);
}

export default function EscrowDetailPage() {
  const { id } = useParams();
  const { data, error, isLoading } = useSWR(\/api/v1/escrows/\, fetcher, { refreshInterval: 10000 });
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading escrow</div>;
  const escrow = data;
  return (<div><h1>Escrow {truncateHash(escrow.id)}</h1><StatusBadge status={escrow.status} /><p>Total: {escrow.totalAmount} XLM</p><a href={getStellarExpertUrl(escrow.counterparty)}>Counterparty</a></div>);
}
