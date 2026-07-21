import { renderHook, act } from '@testing-library/react';
import { useBulkAction } from '../../hooks/useBulkAction';
import { buildCancelEscrowTx, buildBatchApproveMilestonesTx, broadcastTransaction } from '../../lib/stellar';
import { exportToCSV } from '../../lib/csvExport';

jest.mock('../../lib/stellar', () => ({
  buildCancelEscrowTx: jest.fn(),
  buildBatchApproveMilestonesTx: jest.fn(),
  broadcastTransaction: jest.fn(),
}));

jest.mock('../../lib/csvExport', () => ({
  exportToCSV: jest.fn(),
}));

const mockEscrows = [
  { id: '1', title: 'Escrow 1', totalAmount: '100 USDC', counterparty: 'Addr1', status: 'Active' },
  { id: '2', title: 'Escrow 2', totalAmount: '200 USDC', counterparty: 'Addr2', status: 'Active' },
  { id: '3', title: 'Escrow 3', totalAmount: '300 USDC', counterparty: 'Addr3', status: 'Cancelled' },
];

describe('useBulkAction hook', () => {
  let setEscrows: jest.Mock;
  let clearSelection: jest.Mock;
  let signTx: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    setEscrows = jest.fn();
    clearSelection = jest.fn();
    signTx = jest.fn().mockResolvedValue('signed_xdr');
    global.fetch = jest.fn();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes in review step and closed state', () => {
    const { result } = renderHook(() =>
      useBulkAction({
        escrows: mockEscrows,
        setEscrows,
        selectedIds: ['1', '2'],
        clearSelection,
        address: 'GCLIENT',
        signTx,
      })
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.step).toBe('review');
    expect(result.current.actionType).toBeNull();
  });

  it('fetches details and determines eligibility on openDialog', async () => {
    const mockDetail1 = {
      id: 1,
      status: 'Active',
      milestones: [{ id: 10, status: 'Submitted' }, { id: 11, status: 'Submitted' }],
    };
    const mockDetail2 = {
      id: 2,
      status: 'Active',
      milestones: [{ id: 20, status: 'Pending' }], // Ineligible (has pending)
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockDetail1),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockDetail2),
      });

    const { result } = renderHook(() =>
      useBulkAction({
        escrows: mockEscrows,
        setEscrows,
        selectedIds: ['1', '2'],
        clearSelection,
        address: 'GCLIENT',
        signTx,
      })
    );

    await act(async () => {
      await result.current.openDialog('release');
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.actionType).toBe('release');
    expect(result.current.isCheckingEligibility).toBe(false);
    expect(result.current.eligibilityMap['1']).toEqual({ eligible: true });
    expect(result.current.eligibilityMap['2'].eligible).toBe(false);
    expect(result.current.eligibilityMap['2'].reason).toContain('Not all milestones have been submitted');
  });

  it('runs sequential contract calls for eligible items and performs optimistic updates', async () => {
    const mockDetail1 = {
      id: 1,
      status: 'Active',
      milestones: [{ id: 10, status: 'Submitted' }],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue(mockDetail1),
    });

    (buildBatchApproveMilestonesTx as jest.Mock).mockResolvedValue('unsigned_release_xdr');
    (broadcastTransaction as jest.Mock).mockResolvedValue({ hash: 'tx_hash', status: 'SUCCESS' });

    const { result } = renderHook(() =>
      useBulkAction({
        escrows: mockEscrows,
        setEscrows,
        selectedIds: ['1'],
        clearSelection,
        address: 'GCLIENT',
        signTx,
      })
    );

    // 1. Open
    await act(async () => {
      await result.current.openDialog('release');
    });

    // 2. Execute
    await act(async () => {
      await result.current.executeAction();
    });

    expect(buildBatchApproveMilestonesTx).toHaveBeenCalledWith({
      sourceAddress: 'GCLIENT',
      escrowId: '1',
      milestoneIds: [10],
    });
    expect(signTx).toHaveBeenCalledWith('unsigned_release_xdr');
    expect(broadcastTransaction).toHaveBeenCalledWith('signed_xdr');

    expect(result.current.step).toBe('summary');
    expect(result.current.executionProgress['1'].status).toBe('success');

    // 3. Optimistic update and clear selection called
    expect(setEscrows).toHaveBeenCalled();
    expect(clearSelection).toHaveBeenCalled();

    // 4. Undo Toast visible
    expect(result.current.undoToast).toEqual({
      visible: true,
      actionType: 'release',
      affectedIds: ['1'],
    });

    // 5. Toast disappears after 5 seconds
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.undoToast).toBeNull();
  });

  it('supports retrying failed actions', async () => {
    const mockDetail1 = { id: 1, status: 'Active', milestones: [{ id: 10, status: 'Submitted' }] };
    const mockDetail2 = { id: 2, status: 'Active', milestones: [{ id: 20, status: 'Submitted' }] };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(mockDetail1) })
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(mockDetail2) });

    (buildBatchApproveMilestonesTx as jest.Mock).mockResolvedValue('unsigned_release_xdr');
    // First call fails, second succeeds
    (broadcastTransaction as jest.Mock)
      .mockRejectedValueOnce(new Error('Contract Error'))
      .mockResolvedValueOnce({ hash: 'tx_hash', status: 'SUCCESS' });

    const { result } = renderHook(() =>
      useBulkAction({
        escrows: mockEscrows,
        setEscrows,
        selectedIds: ['1', '2'],
        clearSelection,
        address: 'GCLIENT',
        signTx,
      })
    );

    await act(async () => {
      await result.current.openDialog('release');
    });

    await act(async () => {
      await result.current.executeAction();
    });

    expect(result.current.executionProgress['1'].status).toBe('failed');
    expect(result.current.executionProgress['2'].status).toBe('success');

    // Retry failed (re-runs only failed item '1')
    (broadcastTransaction as jest.Mock).mockResolvedValueOnce({ hash: 'tx_hash2', status: 'SUCCESS' });

    await act(async () => {
      await result.current.retryFailed();
    });

    expect(result.current.executionProgress['1'].status).toBe('success');
  });

  it('triggers client-side undo and reverts state', async () => {
    const mockDetail1 = { id: 1, status: 'Active', milestones: [{ id: 10, status: 'Submitted' }] };
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue(mockDetail1) });
    (buildBatchApproveMilestonesTx as jest.Mock).mockResolvedValue('unsigned_release_xdr');
    (broadcastTransaction as jest.Mock).mockResolvedValue({ hash: 'tx_hash', status: 'SUCCESS' });

    const { result } = renderHook(() =>
      useBulkAction({
        escrows: mockEscrows,
        setEscrows,
        selectedIds: ['1'],
        clearSelection,
        address: 'GCLIENT',
        signTx,
      })
    );

    await act(async () => {
      await result.current.openDialog('release');
      await result.current.executeAction();
    });

    expect(result.current.undoToast?.visible).toBe(true);

    // Trigger Undo
    await act(async () => {
      result.current.triggerUndo();
    });

    expect(setEscrows).toHaveBeenLastCalledWith(mockEscrows); // Reverted back to original list
    expect(result.current.undoToast).toBeNull();
  });

  it('triggers client-side CSV export', () => {
    const { result } = renderHook(() =>
      useBulkAction({
        escrows: mockEscrows,
        setEscrows,
        selectedIds: ['1', '2'],
        clearSelection,
        address: 'GCLIENT',
        signTx,
      })
    );

    act(() => {
      result.current.triggerExport();
    });

    expect(exportToCSV).toHaveBeenCalled();
    expect(clearSelection).toHaveBeenCalled();
  });
});
