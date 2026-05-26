import { renderHook, act } from '@testing-library/react';
import { useWallet } from '../../hooks/useWallet';
import { AppStoreProvider } from '../../store/app-store';

function wrapper({ children }) {
  return <AppStoreProvider>{children}</AppStoreProvider>;
}

describe('useWallet', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns initial disconnected state', () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
    expect(result.current.network).toBeNull();
    expect(result.current.isFreighterInstalled).toBe(false);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('exposes connect, disconnect, signTx functions', () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
    expect(typeof result.current.signTx).toBe('function');
  });

  it('sets error when connect is called (not implemented)', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.error).toMatch(/not yet implemented/i);
    expect(result.current.isConnecting).toBe(false);
  });

  it('disconnect clears state', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    act(() => {
      result.current.disconnect();
    });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
    expect(result.current.network).toBeNull();
  });

  it('signTx throws when wallet not connected', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await expect(result.current.signTx('some-xdr')).rejects.toThrow('Wallet not connected');
  });
});
