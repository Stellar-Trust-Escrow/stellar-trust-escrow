'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api/client';

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL ||
  (() => {
    try {
      const u = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000');
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.pathname = '';
      u.search = '';
      return u.toString().replace(/\/$/, '');
    } catch {
      return 'ws://localhost:4000';
    }
  })();

/**
 * Manages in-app notifications for escrow lifecycle events.
 *
 * Fetches existing notifications from GET /notifications,
 * then listens on the WebSocket topic "notifications" for real-time pushes.
 *
 * @returns {{
 *   notifications: Array,
 *   unreadCount: number,
 *   loading: boolean,
 *   error: Error|null,
 *   markAllRead: () => void,
 *   markRead: (id: string) => void,
 * }}
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  // Fetch initial notifications
  useEffect(() => {
    let cancelled = false;
    api
      .get('/notifications')
      .then((res) => {
        if (!cancelled) setNotifications(res.data?.notifications ?? res.data ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // WebSocket for real-time pushes
  useEffect(() => {
    let socket;
    let cancelled = false;

    const connect = () => {
      socket = new WebSocket(`${WS_BASE}/api/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (cancelled) return socket.close();
        socket.send(JSON.stringify({ type: 'subscribe', topic: 'notifications' }));
      };

      socket.onmessage = (ev) => {
        let data;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (data.topic === 'notifications' && data.payload) {
          setNotifications((prev) => [data.payload, ...prev]);
        }
      };

      socket.onclose = () => {
        if (!cancelled) setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      try {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'unsubscribe', topic: 'notifications' }));
        }
        socket?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const markRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    api.patch(`/notifications/${id}/read`).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    api.patch('/notifications/read-all').catch(() => {});
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, loading, error, markRead, markAllRead };
}
