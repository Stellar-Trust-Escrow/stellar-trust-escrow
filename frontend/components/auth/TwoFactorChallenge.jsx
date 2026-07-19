'use client';

import React, { useEffect, useState } from 'react';
import styles from '../../app/auth/2fa/twofa.module.css';

export function TwoFactorChallenge({ mfaPendingToken }) {
  const [code, setCode] = useState('');
  const [usingBackup, setUsingBackup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.getElementById('code-input')?.focus();
  }, []);

  async function submit() {
    if (code.length < 6) return;
    setSubmitting(true);
    setError('');
    const endpoint = usingBackup
      ? '/api/v1/auth/2fa/challenge/backup'
      : '/api/v1/auth/2fa/challenge';
    const body = usingBackup
      ? { backup_code: code, token: mfaPendingToken }
      : { token: code, mfaPendingToken };
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!resp.ok) {
      setError('Invalid code');
    }
  }

  useEffect(() => {
    if (code.length === 6) {
      submit();
    }
  }, [code]);

  return (
    <div className={styles.container}>
      <h1>Two‑Factor Authentication</h1>
      <p>Please enter the 6‑digit code from your authenticator app.</p>
      <label htmlFor="code-input" className="sr-only">
        Authentication code
      </label>
      <input
        id="code-input"
        type="text"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-describedby="code-desc"
        disabled={submitting}
      />
      <div id="code-desc">
        Enter the 6‑digit code. Submits automatically when 6 digits are entered.
      </div>
      <button onClick={() => setUsingBackup(!usingBackup)} type="button">
        {usingBackup ? 'Use authenticator app' : 'Use backup code'}
      </button>
      {error && (
        <p role="alert" style={{ color: 'red' }}>
          {error}
        </p>
      )}
      <p>
        <a href="/support">Lost access? Contact support</a>
      </p>
    </div>
  );
}

export default TwoFactorChallenge;
