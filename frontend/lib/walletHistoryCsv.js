/**
 * exportWalletHistoryCsv
 *
 * Exports the full loaded operation list (not just current viewport) to a
 * downloadable CSV: date, type, amount, asset, counterparty, escrow_id,
 * operation_id.
 */
export function operationsToCsv(operations) {
  const header = ['date', 'type', 'amount', 'asset', 'counterparty', 'escrow_id', 'operation_id'];
  const escape = (val) => {
    const str = val === null || val === undefined ? '' : String(val);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const rows = operations.map((op) =>
    [op.createdAt, op.label, op.amount, op.asset, op.counterparty, op.escrowId, op.id]
      .map(escape)
      .join(','),
  );

  return [header.join(','), ...rows].join('\n');
}

export function downloadWalletHistoryCsv(operations, filename = 'wallet-history.csv') {
  const csv = operationsToCsv(operations);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
