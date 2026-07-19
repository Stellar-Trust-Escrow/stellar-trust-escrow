import React from 'react';

export default function OfflineBanner({ permanent = false }) {
  return (
    <div
      className="offline-banner"
      role="alert"
      aria-live={permanent ? 'assertive' : 'polite'}
    >
      {permanent
        ? 'Connection lost. Please refresh the page to reconnect.'
        : 'Reconnecting...'}
    </div>
  );
}
