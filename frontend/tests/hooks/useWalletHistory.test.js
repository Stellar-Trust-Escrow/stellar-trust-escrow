import { renderHook, waitFor, act } from '@testing-library/react';
import { useWalletHistory } from '../../hooks/useWalletHistory';
import api from '../../lib/api/client';

jest.mock('../../lib/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

let mockCall;
jest.mock('@stellar/stellar-sdk', () => {
  const chain = {
    forAccount: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    cursor: jest.fn().mockReturnThis(),
    call: (...args) => mockCall(...args),
  };
  return {
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        operations: jest.fn().mockReturnValue(chain),
      })),
    },
  };
});

const ESCROW_ADDRESS = 'CESCROWCONTRACTADDRESS';
const WALLET = 'GWALLETADDRESS';

function op(overrides) {
  return {
    id: '1',
    paging_token: '1',
    type: 'payment',
    amount: '10.0000000',
    asset_type: 'native',
    to: ESCROW_ADDRESS,
    from: WALLET,
    transaction_hash: 'txhash1',
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('useWalletHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url === '/v1/contracts/addresses') {
        return Promise.resolve({
          data: { contracts: [{ name: 'escrow', address: ESCROW_ADDRESS }] },
        });
      }
      if (url === '/v1/events/escrow-ids-by-tx') {
        return Promise.resolve({ data: { map: { txhash1: '42' } } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('labels a payment to the escrow contract as Funded and groups it under that escrow', async () => {
    mockCall = jest.fn().mockResolvedValue({ records: [op({})] });

    const { result } = renderHook(() => useWalletHistory(WALLET));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].operations[0].label).toBe('Funded');
  });

  it('puts non-escrow operations in "other"', async () => {
    mockCall = jest.fn().mockResolvedValue({
      records: [
        op({ id: '2', paging_token: '2', to: 'GSOMEONEELSE', from: WALLET, transaction_hash: 'unmapped-hash' }),
      ],
    });

    const { result } = renderHook(() => useWalletHistory(WALLET));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toHaveLength(0);
    expect(result.current.other).toHaveLength(1);
    expect(result.current.other[0].label).toBe('Unknown');
  });

  it('does not re-fetch already-loaded operations when loadMore is called', async () => {
    const firstPage = Array.from({ length: 200 }, (_, i) =>
      op({ id: String(i + 1), paging_token: String(i + 1) }),
    );
    mockCall = jest
      .fn()
      .mockResolvedValueOnce({ records: firstPage })
      .mockResolvedValueOnce({ records: [op({ id: '201', paging_token: '201' })] });

    const { result } = renderHook(() => useWalletHistory(WALLET));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allOperations).toHaveLength(200);

    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    const ids = result.current.allOperations.map((o) => o.id);
    expect(ids).toHaveLength(201);
    expect(new Set(ids).size).toBe(201); // no duplicates
  });

  it('sets hasMore to false when a page returns fewer than the page limit', async () => {
    mockCall = jest.fn().mockResolvedValue({ records: [op({})] });

    const { result } = renderHook(() => useWalletHistory(WALLET));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(false);
  });

  it('surfaces an error without throwing when Horizon fails', async () => {
    mockCall = jest.fn().mockRejectedValue(new Error('Horizon unreachable'));

    const { result } = renderHook(() => useWalletHistory(WALLET));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/Horizon unreachable/);
  });
});
