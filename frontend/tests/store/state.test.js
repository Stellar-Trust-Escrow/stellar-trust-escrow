import {
  APP_STORAGE_KEY,
  appReducer,
  createInitialAppState,
  loadPersistedState,
  persistState,
} from '../../store/state';

describe('app store state helpers', () => {
  it('creates a default app state', () => {
    const state = createInitialAppState();

    expect(state.admin.apiKey).toBe('');
    expect(state.wallet.isConnected).toBe(false);
    expect(state.wallet.address).toBeNull();
  });

  it('loads persisted state from storage', () => {
    const storage = {
      getItem: jest.fn(() =>
        JSON.stringify({
          admin: { apiKey: 'persisted-key' },
          wallet: { address: 'GTEST', isConnected: true, network: 'testnet' },
        }),
      ),
    };

    const state = loadPersistedState(storage);

    expect(state.admin.apiKey).toBe('persisted-key');
    expect(state.wallet.address).toBe('GTEST');
    expect(state.wallet.isConnected).toBe(true);
    expect(state.wallet.network).toBe('testnet');
  });

  it('persists only the serializable store slices', () => {
    const storage = { setItem: jest.fn() };
    const state = {
      ...createInitialAppState(),
      admin: { apiKey: 'admin-key' },
      wallet: {
        address: 'GWALLET',
        network: 'mainnet',
        isConnected: true,
        isFreighterInstalled: true,
        isConnecting: true,
        error: 'ignored by UI later',
      },
    };

    persistState(state, storage);

    expect(storage.setItem).toHaveBeenCalledWith(APP_STORAGE_KEY, expect.any(String));

    const persisted = JSON.parse(storage.setItem.mock.calls[0][1]);
    expect(persisted).toEqual({
      admin: { apiKey: 'admin-key' },
      wallet: {
        address: 'GWALLET',
        network: 'mainnet',
        isConnected: true,
        isFreighterInstalled: true,
        isConnecting: false,
        error: 'ignored by UI later',
      },
    });
  });

  it('handles wallet connect and disconnect actions', () => {
    let state = createInitialAppState();

    state = appReducer(state, { type: 'WALLET/CONNECT_START' });
    expect(state.wallet.isConnecting).toBe(true);

    state = appReducer(state, {
      type: 'WALLET/CONNECT_SUCCESS',
      payload: { address: 'GWALLET', network: 'testnet' },
    });
    expect(state.wallet.isConnected).toBe(true);
    expect(state.wallet.address).toBe('GWALLET');

    state = appReducer(state, { type: 'WALLET/DISCONNECT' });
    expect(state.wallet.isConnected).toBe(false);
    expect(state.wallet.address).toBeNull();
  });

  it('stores and clears the admin api key', () => {
    let state = createInitialAppState();

    state = appReducer(state, { type: 'ADMIN/SET_API_KEY', payload: 'secret' });
    expect(state.admin.apiKey).toBe('secret');

    state = appReducer(state, { type: 'ADMIN/CLEAR_API_KEY' });
    expect(state.admin.apiKey).toBe('');
  });
});
