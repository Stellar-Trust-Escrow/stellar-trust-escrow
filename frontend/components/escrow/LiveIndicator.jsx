import React from 'react';

/**
 * Coloured dot + label indicating whether the WebSocket feed for an escrow
 * is currently live or disconnected.
 */
export default function LiveIndicator({ isConnected }) {
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}
      aria-label={isConnected ? 'Live connection active' : 'Connection lost'}
      role="status"
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: isConnected ? '#22c55e' : '#ef4444',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      <span>{isConnected ? 'Live' : 'Disconnected'}</span>
    </span>
  );
}
