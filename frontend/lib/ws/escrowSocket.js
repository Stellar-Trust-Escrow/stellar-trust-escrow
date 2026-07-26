const EVENTS = ['escrow:updated', 'milestone:submitted', 'dispute:raised', 'balance:changed'];
const MAX_RETRIES = 5;

export function createEscrowSocket(url) {
  let ws = null;
  let retries = 0;
  let reconnectTimer = null;
  const listeners = new Map();

  function connect() {
    ws = new WebSocket(url);

    ws.onopen = () => {
      retries = 0;
      emit('connected', { isConnected: true });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (EVENTS.includes(msg.type)) {
          emit(msg.type, msg);
        }
      } catch (e) {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      emit('connected', { isConnected: false });
      if (retries < MAX_RETRIES) {
        const base = Math.min(1000 * Math.pow(2, retries), 30000);
        const jitter = base * 0.2 * (Math.random() * 2 - 1);
        const delay = base + jitter;
        retries++;
        reconnectTimer = setTimeout(connect, delay);
      } else {
        emit('offline', { permanent: true });
      }
    };

    ws.onerror = () => {};
  }

  function on(event, callback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
    return () => listeners.get(event)?.delete(callback);
  }

  function emit(event, data) {
    listeners.get(event)?.forEach(cb => cb(data));
  }

  function close() {
    clearTimeout(reconnectTimer);
    ws?.close();
  }

  connect();
  return { on, close };
}
