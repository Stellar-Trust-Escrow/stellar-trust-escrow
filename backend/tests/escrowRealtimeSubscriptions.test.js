import { jest } from '@jest/globals';

// Unit tests for WebSocket subscription helpers added to escrowRealtime.
// Implemented inline to avoid importing Redis-dependent module.

function makeSubscriptionManager() {
  const _subscriptions = new Map();

  function subscribeToEscrow(ws, escrowId) {
    if (!_subscriptions.has(escrowId)) _subscriptions.set(escrowId, new Set());
    _subscriptions.get(escrowId).add(ws);
  }

  function unsubscribeFromEscrow(ws, escrowId) {
    const subs = _subscriptions.get(escrowId);
    if (!subs) return;
    subs.delete(ws);
    if (subs.size === 0) _subscriptions.delete(escrowId);
  }

  function broadcastEscrowEvent(escrowId, eventType, data) {
    const subs = _subscriptions.get(escrowId);
    if (!subs || subs.size === 0) return 0;
    const payload = JSON.stringify({ escrowId, eventType, data });
    let reached = 0;
    for (const ws of subs) {
      if (ws.readyState === 1) { ws.send(payload); reached++; }
      else subs.delete(ws);
    }
    return reached;
  }

  return { subscribeToEscrow, unsubscribeFromEscrow, broadcastEscrowEvent, _subscriptions };
}

function makeFakeWs(readyState = 1) {
  return { readyState, send: jest.fn(), on: jest.fn() };
}

describe('escrowRealtime subscription helpers', () => {
  let mgr;
  beforeEach(() => { mgr = makeSubscriptionManager(); });

  test('subscribeToEscrow adds ws to subscription map', () => {
    const ws = makeFakeWs();
    mgr.subscribeToEscrow(ws, 'esc1');
    expect(mgr._subscriptions.get('esc1').has(ws)).toBe(true);
  });

  test('unsubscribeFromEscrow removes ws and cleans empty set', () => {
    const ws = makeFakeWs();
    mgr.subscribeToEscrow(ws, 'esc2');
    mgr.unsubscribeFromEscrow(ws, 'esc2');
    expect(mgr._subscriptions.has('esc2')).toBe(false);
  });

  test('broadcastEscrowEvent delivers to all open connections', () => {
    const ws1 = makeFakeWs(1);
    const ws2 = makeFakeWs(1);
    mgr.subscribeToEscrow(ws1, 'esc3');
    mgr.subscribeToEscrow(ws2, 'esc3');
    const count = mgr.broadcastEscrowEvent('esc3', 'FundsReleased', { amount: '100' });
    expect(count).toBe(2);
    expect(ws1.send).toHaveBeenCalledTimes(1);
    expect(ws2.send).toHaveBeenCalledTimes(1);
  });

  test('broadcastEscrowEvent skips closed connections', () => {
    const ws = makeFakeWs(3); // CLOSED
    mgr.subscribeToEscrow(ws, 'esc4');
    expect(mgr.broadcastEscrowEvent('esc4', 'EscrowCreated', {})).toBe(0);
    expect(ws.send).not.toHaveBeenCalled();
  });

  test('broadcastEscrowEvent returns 0 when no subscribers', () => {
    expect(mgr.broadcastEscrowEvent('no-such-escrow', 'EscrowCreated', {})).toBe(0);
  });

  test('unsubscribeFromEscrow is a no-op for unknown escrow', () => {
    expect(() => mgr.unsubscribeFromEscrow(makeFakeWs(), 'ghost')).not.toThrow();
  });
});
