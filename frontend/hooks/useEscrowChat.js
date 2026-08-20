import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * @typedef {{ id: string, sender: string, content: string, timestamp: string, read: boolean }} ChatMessage
 * @typedef {'connecting' | 'connected' | 'disconnected'} ConnectionStatus
 */

const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Resolve the WebSocket URL for a given escrow room.
 * @param {string} escrowId
 * @returns {string}
 */
function resolveWsUrl(escrowId) {
  const base =
    (typeof window !== 'undefined' && window.__ENV__?.WS_BASE_URL) ||
    process.env.REACT_APP_WS_BASE_URL ||
    'wss://api.stellar-trust-escrow.app/ws';
  return `${base}/escrow/${escrowId}/chat`;
}

/**
 * Generate a temporary client-side message ID for optimistic updates.
 * @returns {string}
 */
function tempId() {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * React hook that manages a per-escrow real-time chat channel over WebSocket.
 *
 * @param {string} escrowId - The ID of the escrow whose chat to join.
 * @param {string} currentUserId - The ID of the authenticated user.
 * @returns {{
 *   messages: ChatMessage[],
 *   connectionStatus: ConnectionStatus,
 *   sendMessage: (content: string) => void,
 *   markAsRead: (messageId: string) => void,
 *   uploadAttachment: (file: File) => Promise<string>,
 * }}
 */
export function useEscrowChat(escrowId, currentUserId) {
  /** @type {[ChatMessage[], Function]} */
  const [messages, setMessages] = useState([]);
  /** @type {[ConnectionStatus, Function]} */
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  const wsRef = useRef(/** @type {WebSocket|null} */ (null));
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(/** @type {ReturnType<typeof setTimeout>|null} */ (null));
  const unmountedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Internal: send a raw JSON event over the socket
  // ---------------------------------------------------------------------------
  const sendEvent = useCallback((type, payload) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn(`[useEscrowChat] Cannot send "${type}" — socket not open`);
      return false;
    }
    ws.send(JSON.stringify({ type, ...payload }));
    return true;
  }, []);

  // ---------------------------------------------------------------------------
  // Internal: establish the WebSocket connection
  // ---------------------------------------------------------------------------
  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    setConnectionStatus('connecting');

    const url = resolveWsUrl(escrowId);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      reconnectAttemptRef.current = 0;
      setConnectionStatus('connected');
      // Identify ourselves to the server
      ws.send(JSON.stringify({ type: 'join', escrowId, userId: currentUserId }));
    };

    ws.onmessage = (event) => {
      if (unmountedRef.current) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        console.warn('[useEscrowChat] Received unparseable message:', event.data);
        return;
      }

      switch (data.type) {
        case 'message': {
          /** @type {ChatMessage} */
          const incoming = {
            id: data.id,
            sender: data.sender,
            content: data.content,
            timestamp: data.timestamp,
            read: data.sender === currentUserId, // own messages start as read
          };
          setMessages((prev) => {
            // Replace any optimistic placeholder that has the same server-assigned id
            const withoutOptimistic = prev.filter(
              (m) => !(m.id.startsWith('optimistic-') && m.content === incoming.content && m.sender === incoming.sender),
            );
            // Deduplicate by id
            if (withoutOptimistic.some((m) => m.id === incoming.id)) return withoutOptimistic;
            return [...withoutOptimistic, incoming];
          });
          break;
        }

        case 'read_receipt': {
          setMessages((prev) =>
            prev.map((m) => (m.id === data.messageId ? { ...m, read: true } : m)),
          );
          break;
        }

        case 'history': {
          // Server may send a history batch on join
          if (Array.isArray(data.messages)) {
            setMessages(data.messages.map((m) => ({
              id: m.id,
              sender: m.sender,
              content: m.content,
              timestamp: m.timestamp,
              read: m.read ?? false,
            })));
          }
          break;
        }

        default:
          break;
      }
    };

    ws.onclose = (event) => {
      if (unmountedRef.current) return;
      setConnectionStatus('disconnected');

      if (event.wasClean) return; // intentional close — don't reconnect

      const attempt = reconnectAttemptRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`[useEscrowChat] Giving up after ${attempt} reconnect attempts`);
        return;
      }

      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt),
        MAX_RECONNECT_DELAY_MS,
      );
      reconnectAttemptRef.current = attempt + 1;
      console.log(
        `[useEscrowChat] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})`,
      );
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = (err) => {
      console.error('[useEscrowChat] WebSocket error:', err);
    };
  }, [escrowId, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Lifecycle: connect on mount, disconnect on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!escrowId || !currentUserId) return;

    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const ws = wsRef.current;
      if (ws) {
        // Close cleanly (wasClean=true) so the onclose handler won't reschedule
        ws.close(1000, 'component unmounted');
        wsRef.current = null;
      }
    };
  }, [connect, escrowId, currentUserId]);

  // ---------------------------------------------------------------------------
  // Public: send a text message
  // ---------------------------------------------------------------------------
  const sendMessage = useCallback(
    (content) => {
      if (!content || typeof content !== 'string' || !content.trim()) return;

      // Optimistic update
      const placeholder = {
        id: tempId(),
        sender: currentUserId,
        content: content.trim(),
        timestamp: new Date().toISOString(),
        read: true,
      };
      setMessages((prev) => [...prev, placeholder]);

      const sent = sendEvent('message', { content: content.trim(), escrowId });
      if (!sent) {
        // Roll back the optimistic message if the socket isn't open
        setMessages((prev) => prev.filter((m) => m.id !== placeholder.id));
      }
    },
    [currentUserId, escrowId, sendEvent],
  );

  // ---------------------------------------------------------------------------
  // Public: emit a read receipt for a message
  // ---------------------------------------------------------------------------
  const markAsRead = useCallback(
    (messageId) => {
      if (!messageId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, read: true } : m)),
      );
      sendEvent('read_receipt', { messageId, escrowId, userId: currentUserId });
    },
    [escrowId, currentUserId, sendEvent],
  );

  // ---------------------------------------------------------------------------
  // Public: upload an attachment and return the download URL
  // ---------------------------------------------------------------------------
  const uploadAttachment = useCallback(
    async (file) => {
      if (!file || !(file instanceof File)) {
        throw new TypeError('uploadAttachment: argument must be a File instance');
      }

      // Stub: in production this would POST to the attachment upload endpoint
      // and return a pre-signed URL or CDN URL.
      const fakeUrl = `https://cdn.stellar-trust-escrow.app/attachments/${escrowId}/${Date.now()}-${encodeURIComponent(file.name)}`;
      console.log(`[useEscrowChat] Attachment upload stub — would upload "${file.name}" to ${fakeUrl}`);
      return fakeUrl;
    },
    [escrowId],
  );

  return {
    messages,
    connectionStatus,
    sendMessage,
    markAsRead,
    uploadAttachment,
  };
}

export default useEscrowChat;
