'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { appReducer, createInitialAppState, loadPersistedState, persistState } from './state';

const defaultState = createInitialAppState();

const defaultValue = {
  state: defaultState,
  dispatch: () => {},
  actions: {
    wallet: {
      setFreighterInstalled: () => {},
      startConnect: () => {},
      finishConnect: () => {},
      setConnectError: () => {},
      disconnect: () => {},
    },
    admin: {
      setApiKey: () => {},
      clearApiKey: () => {},
    },
  },
};

const AppStoreContext = createContext(defaultValue);

function getBrowserStorage() {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

function useStoreDevtools(state) {
  const devtoolsRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const extension = window.__REDUX_DEVTOOLS_EXTENSION__;
    if (!extension) return;

    devtoolsRef.current = extension.connect({ name: 'STE Frontend Store' });
    devtoolsRef.current.init(state);

    return () => {
      devtoolsRef.current?.disconnect?.();
    };
  }, []);

  return useCallback((action, nextState) => {
    devtoolsRef.current?.send(action, nextState);
  }, []);
}

export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialAppState);
  const stateRef = useRef(state);
  const sendDevtools = useStoreDevtools(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const storage = getBrowserStorage();
    dispatch({
      type: 'APP/HYDRATE',
      payload: loadPersistedState(storage),
    });
  }, []);

  useEffect(() => {
    const storage = getBrowserStorage();
    persistState(state, storage);
  }, [state]);

  const dispatchWithDevtools = (action) => {
    const nextState = appReducer(stateRef.current, action);
    dispatch(action);
    sendDevtools(action, nextState);
  };

  const actions = useMemo(
    () => ({
      wallet: {
        setFreighterInstalled: (installed) => {
          dispatchWithDevtools({ type: 'WALLET/SET_INSTALLATION', payload: installed });
        },
        startConnect: () => {
          dispatchWithDevtools({ type: 'WALLET/CONNECT_START' });
        },
        finishConnect: (payload) => {
          dispatchWithDevtools({ type: 'WALLET/CONNECT_SUCCESS', payload });
        },
        setConnectError: (message) => {
          dispatchWithDevtools({ type: 'WALLET/CONNECT_ERROR', payload: message });
        },
        disconnect: () => {
          dispatchWithDevtools({ type: 'WALLET/DISCONNECT' });
        },
      },
      admin: {
        setApiKey: (apiKey) => {
          dispatchWithDevtools({ type: 'ADMIN/SET_API_KEY', payload: apiKey });
        },
        clearApiKey: () => {
          dispatchWithDevtools({ type: 'ADMIN/CLEAR_API_KEY' });
        },
      },
    }),
    [sendDevtools],
  );

  const value = useMemo(() => ({ state, dispatch, actions }), [actions, state]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  return useContext(AppStoreContext);
}

export function useWalletStore() {
  const { state, actions } = useAppStore();

  return {
    ...state.wallet,
    ...actions.wallet,
  };
}

export function useAdminStore() {
  const { state, actions } = useAppStore();

  return {
    ...state.admin,
    isAuthenticated: Boolean(state.admin.apiKey),
    ...actions.admin,
  };
}
