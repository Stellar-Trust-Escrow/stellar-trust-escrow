/** @jest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react';
import { apiUrlToWsBase, useEscrowUpdates } from '../../hooks/useEscrowUpdates.js';

describe('apiUrlToWsBase', () => {
  it('maps http to ws and strips path', () => {
    expect(apiUrlToWsBase('http://localhost:4000/api')).toBe('ws://localhost:4000');
  });

  it('maps https to wss', () => {
    expect(apiUrlToWsBase('https://api.example.com/v1')).toBe('wss://api.example.com');
  });
});

describe('useEscrowUpdates', () => {
  const sent = [];

  beforeEach(() => {
    sent.length = 0;
    delete process.env.NEXT_PUBLIC_WS_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:4000';

    global.WebSocket = class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.OPEN;
        queueMicrotask(() => this.onopen?.());
      }

      send(data) {
        sent.push(String(data));
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.();
      }
    };
  });

  it('subscribes to the escrow room after the socket opens', async () => {
    const { unmount } = renderHook(() => useEscrowUpdates('42', { enabled: true }));

    await waitFor(() => {
      expect(sent.some((m) => m.includes('"type":"subscribe"'))).toBe(true);
    });

    const subscribeMsg = sent.map((m) => JSON.parse(m)).find((o) => o.type === 'subscribe');
    expect(subscribeMsg).toMatchObject({ type: 'subscribe', topic: 'escrow:42' });

    unmount();
  });

  it('returns idle when escrowId is missing', () => {
    const { result } = renderHook(() => useEscrowUpdates(null, { enabled: true }));
    expect(result.current.status).toBe('idle');
    expect(result.current.topic).toBeNull();
  });
});
