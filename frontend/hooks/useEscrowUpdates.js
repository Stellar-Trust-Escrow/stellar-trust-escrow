'use client';

import { useEffect, useRef, useState } from 'react';

const DEFAULT_API = 'http://localhost:4000';

/**
 * @param {string} httpUrl
 * @returns {string} origin with ws: or wss:
 */
export function apiUrlToWsBase(httpUrl) {
  try {
    const u = new URL(httpUrl);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '';
    u.search = '';
    u.hash = '';
    const s = u.toString();
    return s.endsWith('/') ? s.slice(0, -1) : s;
  } catch {
    return 'ws://localhost:4000';
  }
}

/**
 * Subscribe to real-time escrow updates over WebSocket (per-escrow room).
 *
 * Connects to `NEXT_PUBLIC_WS_URL` if set, otherwise derives WebSocket URL from
 * `NEXT_PUBLIC_API_URL`. When the backend has `WS_AUTH_TOKEN` set, pass the same
 * value as `authToken`. If `WS_ESCROW_SUBSCRIBE_REQUIRE_PARTY=true`, pass the
 * viewer's Stellar `address` so the server can verify client/freelancer.
 *
 * @param {string|number|bigint|null|undefined} escrowId
 * @param {object} [options]
 * @param {string} [options.authToken]
 * @param {string} [options.address] — Stellar public key for party-gated subscribe
 * @param {boolean} [options.enabled=true]
 * @param {(payload: object) => void} [options.onEvent] — fired for each escrow update message
 * @returns {{
 *   status: 'idle'|'connecting'|'connected'|'reconnecting'|'disconnected',
 *   lastPayload: object|null,
 *   lastError: Error|null,
 *   topic: string|null,
 * }}
 */
export function useEscrowUpdates(escrowId, options = {}) {
  const { authToken, address, enabled = true, onEvent } = options;

  const idStr =
    escrowId !== null && escrowId !== undefined && escrowId !== '' ? String(escrowId) : null;
  const topic = idStr ? `escrow:${idStr}` : null;

  const [status, setStatus] = useState(() => (topic && enabled ? 'connecting' : 'idle'));
  const [lastPayload, setLastPayload] = useState(null);
  const [lastError, setLastError] = useState(null);

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!topic || !enabled) {
      setStatus('idle');
      setLastError(null);
      return undefined;
    }

    let cancelled = false;
    /** @type {WebSocket | null} */
    let socket = null;
    let attempt = 0;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let reconnectTimer = null;

    const httpBase = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API;
    const wsBase = process.env.NEXT_PUBLIC_WS_URL || apiUrlToWsBase(httpBase);

    const buildUrl = () => {
      const params = new URLSearchParams();
      if (authToken) params.set('token', authToken);
      const q = params.toString();
      return `${wsBase}/api/ws${q ? `?${q}` : ''}`;
    };

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      clearReconnect();
      const exp = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
      const jitter = Math.floor(Math.random() * 400);
      reconnectTimer = setTimeout(() => open(), exp + jitter);
    };

    const open = () => {
      if (cancelled) return;

      clearReconnect();
      setStatus((s) => (s === 'connected' ? s : attempt === 0 ? 'connecting' : 'reconnecting'));
      setLastError(null);

      const url = buildUrl();
      const ws = new WebSocket(url);
      socket = ws;

      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        attempt = 0;
        setStatus('connected');
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            topic,
            ...(address ? { address } : {}),
          }),
        );
      };

      ws.onmessage = (ev) => {
        let data;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }

        if (data.type === 'welcome' || data.type === 'subscribed' || data.type === 'unsubscribed') {
          return;
        }
        if (data.type === 'pong') return;

        if (data.type === 'error') {
          const err = new Error(data.code || 'websocket_error');
          setLastError(err);
          return;
        }

        if (data.topic === topic && data.payload != null) {
          setLastPayload(data.payload);
          onEventRef.current?.(data.payload);
        }
      };

      ws.onerror = () => {
        if (!cancelled) {
          setLastError(new Error('WebSocket connection error'));
        }
      };

      ws.onclose = () => {
        socket = null;
        if (cancelled) {
          setStatus('disconnected');
          return;
        }
        attempt += 1;
        setStatus('reconnecting');
        scheduleReconnect();
      };
    };

    open();

    return () => {
      cancelled = true;
      clearReconnect();
      if (socket) {
        try {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'unsubscribe', topic }));
          }
        } catch {
          /* ignore */
        }
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        socket = null;
      }
      setStatus('disconnected');
    };
  }, [topic, enabled, authToken, address]);

  return {
    status,
    lastPayload,
    lastError,
    topic,
  };
}
