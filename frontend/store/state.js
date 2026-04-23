export const APP_STORAGE_KEY = 'ste-app-store';

export const DEFAULT_WALLET_STATE = {
  address: null,
  network: null,
  isConnected: false,
  isFreighterInstalled: false,
  isConnecting: false,
  error: null,
};

export const DEFAULT_ADMIN_STATE = {
  apiKey: '',
};

export function createInitialAppState() {
  return {
    wallet: { ...DEFAULT_WALLET_STATE },
    admin: { ...DEFAULT_ADMIN_STATE },
  };
}

export function selectPersistedState(state) {
  return {
    wallet: {
      address: state.wallet.address,
      network: state.wallet.network,
      isConnected: state.wallet.isConnected,
      isFreighterInstalled: state.wallet.isFreighterInstalled,
      isConnecting: false,
      error: state.wallet.error,
    },
    admin: {
      apiKey: state.admin.apiKey,
    },
  };
}

export function loadPersistedState(storage) {
  if (!storage) return createInitialAppState();

  try {
    const raw = storage.getItem(APP_STORAGE_KEY);
    if (!raw) return createInitialAppState();

    const parsed = JSON.parse(raw);

    return {
      wallet: {
        ...DEFAULT_WALLET_STATE,
        ...(parsed.wallet || {}),
      },
      admin: {
        ...DEFAULT_ADMIN_STATE,
        ...(parsed.admin || {}),
      },
    };
  } catch {
    return createInitialAppState();
  }
}

export function persistState(state, storage) {
  if (!storage) return;

  storage.setItem(APP_STORAGE_KEY, JSON.stringify(selectPersistedState(state)));
}

export function appReducer(state, action) {
  switch (action.type) {
    case 'APP/HYDRATE':
      return {
        ...state,
        ...action.payload,
        wallet: {
          ...state.wallet,
          ...(action.payload.wallet || {}),
        },
        admin: {
          ...state.admin,
          ...(action.payload.admin || {}),
        },
      };
    case 'WALLET/SET_INSTALLATION':
      return {
        ...state,
        wallet: {
          ...state.wallet,
          isFreighterInstalled: action.payload,
        },
      };
    case 'WALLET/CONNECT_START':
      return {
        ...state,
        wallet: {
          ...state.wallet,
          isConnecting: true,
          error: null,
        },
      };
    case 'WALLET/CONNECT_SUCCESS':
      return {
        ...state,
        wallet: {
          ...state.wallet,
          ...action.payload,
          isConnected: true,
          isConnecting: false,
          error: null,
        },
      };
    case 'WALLET/CONNECT_ERROR':
      return {
        ...state,
        wallet: {
          ...state.wallet,
          isConnecting: false,
          error: action.payload,
        },
      };
    case 'WALLET/DISCONNECT':
      return {
        ...state,
        wallet: {
          ...DEFAULT_WALLET_STATE,
          isFreighterInstalled: state.wallet.isFreighterInstalled,
        },
      };
    case 'ADMIN/SET_API_KEY':
      return {
        ...state,
        admin: {
          ...state.admin,
          apiKey: action.payload,
        },
      };
    case 'ADMIN/CLEAR_API_KEY':
      return {
        ...state,
        admin: {
          ...DEFAULT_ADMIN_STATE,
        },
      };
    default:
      return state;
  }
}
