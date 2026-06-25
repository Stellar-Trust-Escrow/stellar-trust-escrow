/** @jest-environment jsdom */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useNotifications } from '../../hooks/useNotifications';

// Mock the API client
jest.mock('../../lib/api/client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

import api from '../../lib/api/client';

const mockNotifications = [
  { id: '1', type: 'escrow_funded', escrowId: 'e1', message: 'Escrow funded', read: false, createdAt: new Date().toISOString() },
  { id: '2', type: 'dispute_raised', escrowId: 'e2', message: 'Dispute raised', read: true, createdAt: new Date().toISOString() },
];

describe('useNotifications', () => {
  let MockWebSocket;
  const wsSent = [];

  beforeEach(() => {
    wsSent.length = 0;
    api.get.mockResolvedValue({ data: { notifications: mockNotifications } });
    api.patch.mockResolvedValue({});

    MockWebSocket = class {
      static OPEN = 1;
      constructor() {
        this.readyState = MockWebSocket.OPEN;
        queueMicrotask(() => this.onopen?.());
      }
      send(data) { wsSent.push(JSON.parse(data)); }
      close() { this.onclose?.(); }
    };

    global.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches notifications on mount', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notifications).toHaveLength(2);
    expect(api.get).toHaveBeenCalledWith('/notifications');
  });

  it('calculates unreadCount correctly', async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Only notification '1' is unread
    expect(result.current.unreadCount).toBe(1);
  });

  it('subscribes to notifications WebSocket topic', async () => {
    const { unmount } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(wsSent.some((m) => m.type === 'subscribe' && m.topic === 'notifications')).toBe(true);
    });

    unmount();
  });

  it('markRead optimistically updates notification', async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.markRead('1'));

    expect(result.current.notifications.find((n) => n.id === '1').read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
    expect(api.patch).toHaveBeenCalledWith('/notifications/1/read');
  });

  it('markAllRead marks all notifications as read', async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.markAllRead());

    expect(result.current.notifications.every((n) => n.read)).toBe(true);
    expect(result.current.unreadCount).toBe(0);
    expect(api.patch).toHaveBeenCalledWith('/notifications/read-all');
  });

  it('appends real-time notification from WebSocket', async () => {
    const sockets = [];
    global.WebSocket = class extends MockWebSocket {
      constructor(url) {
        super(url);
        sockets.push(this);
      }
    };

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newNotif = { id: '3', type: 'dispute_resolved', escrowId: 'e3', message: 'Dispute resolved', read: false, createdAt: new Date().toISOString() };

    act(() => {
      sockets[0].onmessage?.({
        data: JSON.stringify({ topic: 'notifications', payload: newNotif }),
      });
    });

    expect(result.current.notifications[0]).toMatchObject({ id: '3' });
    expect(result.current.unreadCount).toBe(2);
  });

  it('handles fetch error gracefully', async () => {
    api.get.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.notifications).toHaveLength(0);
  });
});
