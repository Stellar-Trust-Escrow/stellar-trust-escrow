import React, { useState, useEffect, useCallback } from 'react';

export default function SecuritySettings({ walletAddress }) {
  const [credentials, setCredentials] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCredentials = useCallback(async () => {
    if (!walletAddress) return;
    const res = await fetch(`/api/v1/auth/passkey/credentials/${walletAddress}`);
    const data = await res.json();
    setCredentials(data);
  }, [walletAddress]);

  useEffect(() => { loadCredentials(); }, [loadCredentials]);

  async function registerPasskey() {
    setLoading(true);
    setStatus('');
    try {
      const startRes = await fetch('/api/v1/auth/passkey/register/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      const options = await startRes.json();

      const credential = await navigator.credentials.create({ publicKey: {
        ...options,
        challenge: Uint8Array.from(atob(options.challenge), c => c.charCodeAt(0)),
        user: { ...options.user, id: Uint8Array.from(atob(options.user.id), c => c.charCodeAt(0)) },
      }});

      const finishRes = await fetch('/api/v1/auth/passkey/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, credential: { id: credential.id, response: {} } }),
      });
      const result = await finishRes.json();
      if (result.success) {
        setStatus('Passkey registered successfully.');
        await loadCredentials();
      } else {
        setStatus('Registration failed: ' + result.error);
      }
    } catch (err) {
      setStatus('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function removePasskey(credentialId) {
    await fetch(`/api/v1/auth/passkey/credentials/${walletAddress}/${credentialId}`, { method: 'DELETE' });
    await loadCredentials();
  }

  return (
    <div style={{ maxWidth: 520, padding: '24px 0' }}>
      <h3 style={{ marginBottom: 8 }}>Security Keys (Passkeys)</h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--muted, #64748b)', marginBottom: 16 }}>
        Register a FIDO2 passkey for passwordless sign-in.
      </p>
      <button
        onClick={registerPasskey}
        disabled={loading || !walletAddress}
        style={{ padding: '8px 16px', cursor: 'pointer', marginBottom: 16 }}
      >
        {loading ? 'Registering…' : 'Register New Passkey'}
      </button>
      {status && <p style={{ fontSize: '0.875rem', marginBottom: 12 }}>{status}</p>}
      {credentials.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--muted, #64748b)' }}>No passkeys registered.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {credentials.map(c => (
            <li key={c.credentialId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
              <span style={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>
                {c.credentialId.slice(0, 12)}… &mdash; {new Date(c.createdAt).toLocaleDateString()}
              </span>
              <button onClick={() => removePasskey(c.credentialId)} style={{ fontSize: '0.75rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
