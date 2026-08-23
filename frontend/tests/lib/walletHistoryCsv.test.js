import { operationsToCsv } from '../../lib/walletHistoryCsv';

describe('operationsToCsv', () => {
  it('includes the required header columns in order', () => {
    const csv = operationsToCsv([]);
    expect(csv).toBe('date,type,amount,asset,counterparty,escrow_id,operation_id');
  });

  it('renders one row per operation with all fields', () => {
    const csv = operationsToCsv([
      {
        createdAt: '2026-08-01T00:00:00Z',
        label: 'Funded',
        amount: '100.0000000',
        asset: 'XLM',
        counterparty: 'GABC...',
        escrowId: '42',
        id: 'op1',
      },
    ]);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('2026-08-01T00:00:00Z,Funded,100.0000000,XLM,GABC...,42,op1');
  });

  it('escapes commas and quotes in field values', () => {
    const csv = operationsToCsv([
      {
        createdAt: '2026-08-01T00:00:00Z',
        label: 'Note, with comma',
        amount: null,
        asset: null,
        counterparty: 'has "quotes"',
        escrowId: null,
        id: 'op2',
      },
    ]);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('"Note, with comma"');
    expect(lines[1]).toContain('"has ""quotes"""');
  });

  it('renders empty strings for null/undefined fields', () => {
    const csv = operationsToCsv([
      { createdAt: null, label: 'Unknown', amount: null, asset: null, counterparty: null, escrowId: null, id: 'op3' },
    ]);
    expect(csv.split('\n')[1]).toBe(',Unknown,,,,,op3');
  });
});
