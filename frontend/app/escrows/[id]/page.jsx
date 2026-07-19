'use client';
import React from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';

const fetcher = (url) => fetch(url).then(r => r.json());

function truncateHash(hash) {
  if (!hash || hash.length <= 16) return hash;
  return hash.slice(0, 8) + '...' + hash.slice(-8);
}

function getStellarExpertUrl(addr, network) {
  network = network || 'testnet';
  return 'https://stellar.expert/explorer/' + network + '/account/' + addr;
}

var STATUS_COLORS = { Active: 'green', Pending: 'yellow', Completed: 'blue', Disputed: 'red', Cancelled: 'gray', Funded: 'teal' };

function StatusBadge(props) {
  var status = props.status;
  var color = STATUS_COLORS[status] || 'gray';
  return React.createElement('span', {
    className: 'badge badge-' + color,
    'aria-label': 'Status: ' + status
  }, status);
}

export default function EscrowDetailPage() {
  var params = useParams();
  var id = params.id;
  var result = useSWR('/api/v1/escrows/' + id, fetcher, { refreshInterval: 10000 });
  var data = result.data;
  var error = result.error;
  var isLoading = result.isLoading;

  if (isLoading) return React.createElement('div', { className: 'skeleton' }, 'Loading...');
  if (error) return React.createElement('div', null, 'Error loading escrow');
  var escrow = data;

  return React.createElement('div', { className: 'escrow-detail' },
    React.createElement('header', null,
      React.createElement('h1', null, 'Escrow ' + truncateHash(escrow.id)),
      React.createElement('button', { onClick: function() { navigator.clipboard.writeText(escrow.id); }, 'aria-label': 'Copy escrow ID' }, 'Copy ID'),
      React.createElement(StatusBadge, { status: escrow.status }),
      React.createElement('p', null, 'Total: ' + escrow.totalAmount + ' XLM'),
      React.createElement('p', null,
        React.createElement('a', { href: getStellarExpertUrl(escrow.counterparty), target: '_blank', rel: 'noopener' }, 'Counterparty'),
        ' | ',
        React.createElement('a', { href: getStellarExpertUrl(escrow.client), target: '_blank', rel: 'noopener' }, 'Client')
      )
    ),
    React.createElement('section', null,
      React.createElement('h2', null, 'Milestones'),
      React.createElement('p', null, (escrow.milestones || []).length + ' milestones')
    ),
    React.createElement('section', null,
      React.createElement('h2', null, 'Event Timeline'),
      React.createElement('p', null, (escrow.events || []).length + ' events')
    )
  );
}
