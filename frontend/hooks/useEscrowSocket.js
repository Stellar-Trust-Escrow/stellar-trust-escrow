import { useState, useEffect, useRef, useCallback } from 'react';
import { createEscrowSocket } from '../lib/ws/escrowSocket';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'wss://api.stellar-trust-escrow.com/ws';

export function useEscrowSocket(escrowId) {
  const [status, setStatus] = useState(null);
  const [latestEvent, setLatestEvent] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const optimisticRef = useRef(null);

  useEffect(() => {
    if (!escrowId) return;
    const socket = createEscrowSocket(${WS_URL}?escrowId=);

    const unsub1 = socket.on('connected', ({ isConnected: connected }) => {
      setIsConnected(connected);
      if (connected) setIsOffline(false);
    });

    const unsub2 = socket.on('escrow:updated', (msg) => {
      if (msg.escrowId === escrowId) {
        setStatus(msg.payload.status);
        setLatestEvent(msg);
      }
    });

    const unsub3 = socket.on('milestone:submitted', (msg) => {
      if (msg.escrowId === escrowId) setLatestEvent(msg);
    });

    const unsub4 = socket.on('dispute:raised', (msg) => {
      if (msg.escrowId === escrowId) setLatestEvent(msg);
    });

    const unsub5 = socket.on('offline', () => setIsOffline(true));

    return () => {
      unsub1(); unsub2(); unsub3(); unsub4(); unsub5();
      socket.close();
    };
  }, [escrowId]);

  const optimisticUpdate = useCallback(async (apiCall, rollbackState) => {
    const previous = optimisticRef.current;
    optimisticRef.current = rollbackState;
    try {
      await apiCall();
    } catch (e) {
      optimisticRef.current = previous;
      throw e;
    }
  }, []);

  return { status, latestEvent, isConnected, isOffline, optimisticUpdate };
}
