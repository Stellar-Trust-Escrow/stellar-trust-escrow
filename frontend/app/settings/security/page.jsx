// frontend/app/settings/security/page.jsx
'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import styles from './security.module.css'; // assume CSS module for styling

const QR_SIZE = 200;

function TwoFactorSetup() {
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [totp, setTotp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [backupCodes, setBackupCodes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [savedChecked, setSavedChecked] = useState(false);
  const [disableTotp, setDisableTotp] = useState('');
  const [disabling, setDisabling] = useState(false);

  // Step 1: request setup data
  useEffect(() => {
    async function initSetup() {
      const resp = await fetch('/api/v1/auth/2fa/setup', { method: 'POST' });
      if (!resp.ok) return; // handle errors in production
      const data = await resp.json();
      setOtpauthUrl(data.otpauth_url);
      setSecret(data.secret);
    }
    initSetup();
  }, []);

  // Step 2: generate QR when otpauthUrl is ready
  useEffect(() => {
    if (!otpauthUrl) return;
    QRCode.toDataURL(otpauthUrl, { width: QR_SIZE })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [otpauthUrl]);

  // Step 3: handle TOTP auto‑submit
  useEffect(() => {
    if (totp.length === 6) {
      submitTotp();
    }
  }, [totp]);

  async function submitTotp() {
    setVerifying(true);
    const resp = await fetch('/api/v1/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: totp }),
    });
    setVerifying(false);
    if (resp.ok) {
      const data = await resp.json();
      setBackupCodes(data.backup_codes || []);
      setSetupComplete(true);
      setShowModal(true);
    } else {
      alert('Invalid token');
    }
  }

  function copyAll() {
    navigator.clipboard.writeText(backupCodes.join('\n'));
  }

  function downloadTxt() {
    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'backup_codes.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleDisable() {
    if (!disableTotp) return;
    setDisabling(true);
    await fetch('/api/v1/auth/2fa', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: disableTotp }),
    });
    setDisabling(false);
    // reset UI
    setSetupComplete(false);
    setTotp('');
    setBackupCodes([]);
    setShowModal(false);
    setSavedChecked(false);
    setDisableTotp('');
  }

  return (
    <div className={styles.container}>
      <h1>Two‑Factor Authentication Setup</h1>
      {!setupComplete && (
        <div>
          <p>Scan the QR code with your authenticator app or enter the secret manually.</p>
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR code for 2FA"
              aria-label="QR code for 2FA, manual entry alternative available"
              width={QR_SIZE}
              height={QR_SIZE}
            />
          ) : (
            <p>Loading QR code…</p>
          )}
          <p>
            Secret: <code>{secret}</code>
          </p>
          <label>
            Enter 6‑digit code:
            <input
              type="text"
              maxLength={6}
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-describedby="totp-desc"
              autoFocus
            />
          </label>
          <div id="totp-desc">
            Enter the 6‑digit code from your authenticator app. Auto‑submits when 6 digits are
            entered.
          </div>
          {verifying && <p>Verifying…</p>}
        </div>
      )}
      {setupComplete && (
        <div>
          <button onClick={() => setShowModal(true)} disabled={disabling}>
            Disable 2FA
          </button>
          {showModal && (
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
            >
              <h2 id="modal-title">Backup Codes</h2>
              <p>Save these backup codes in a safe place. They will not be shown again.</p>
              <pre className={styles.backupGrid}>
                {backupCodes.map((c, i) => <span key={i}>{c}</span>).join('\n')}
              </pre>
              <button onClick={copyAll}>Copy all</button>
              <button onClick={downloadTxt}>Download as .txt</button>
              <div>
                <label>
                  <input
                    type="checkbox"
                    checked={savedChecked}
                    onChange={(e) => setSavedChecked(e.target.checked)}
                  />{' '}
                  I've saved these
                </label>
              </div>
              <button onClick={() => setShowModal(false)} disabled={!savedChecked}>
                Close
              </button>
              <hr />
              <h3>Disable 2FA</h3>
              <label>
                Current TOTP:
                <input
                  type="text"
                  value={disableTotp}
                  onChange={(e) => setDisableTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                />
              </label>
              <button onClick={handleDisable} disabled={disableTotp.length !== 6 || disabling}>
                Confirm Disable
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TwoFactorSetup;
