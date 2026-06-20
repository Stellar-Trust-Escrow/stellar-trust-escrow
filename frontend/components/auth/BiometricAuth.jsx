'use client';

/**
 * BiometricAuth — WebAuthn-Based Cryptographic Signature Authentication Panel
 *
 * Implements WebAuthn client-side biometric registration and login:
 *  - Registration: creates a new credential (TouchID / FaceID / platform key)
 *    and stores the public key on the backend.
 *  - Login: retrieves a challenge from the backend, signs it with the stored
 *    credential, and verifies the assertion to issue a JWT session.
 *  - Fallback: password-based login is always available.
 *
 * Local testing:
 *  1. Run the backend: `cd backend && npm run dev`
 *  2. Run the frontend: `cd frontend && npm run dev`
 *  3. Open http://localhost:3000 in Chrome/Safari/Edge (WebAuthn requires HTTPS
 *     or localhost).
 *  4. Click "Register Biometrics" — the browser will prompt for TouchID/FaceID
 *     or a platform authenticator.
 *  5. After registration, click "Login with Biometrics" to verify the flow.
 *  6. Use "Password Login" to test the fallback path.
 *
 * Backend endpoints expected:
 *  POST /api/auth/webauthn/register-options   → { challenge, rp, user, ... }
 *  POST /api/auth/webauthn/register-verify    → { ok: true }
 *  POST /api/auth/webauthn/login-options      → { challenge, allowCredentials, ... }
 *  POST /api/auth/webauthn/login-verify       → { token }
 *
 * @module components/auth/BiometricAuth
 */

import { useState, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── WebAuthn helpers ──────────────────────────────────────────────────────────

/** Convert a base64url string to a Uint8Array (for WebAuthn buffers). */
function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Convert an ArrayBuffer to a base64url string (for sending to the backend). */
function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {string}   props.userId        - Authenticated user ID (for registration).
 * @param {string}   props.userEmail     - User email displayed in the authenticator prompt.
 * @param {Function} props.onAuthSuccess - Called with the JWT token on successful login.
 */
export default function BiometricAuth({ userId, userEmail, onAuthSuccess }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('menu'); // 'menu' | 'password'
  const [password, setPassword] = useState('');

  const isWebAuthnSupported =
    typeof window !== 'undefined' && window.PublicKeyCredential !== undefined;

  // ── Registration ────────────────────────────────────────────────────────────

  const handleRegister = useCallback(async () => {
    if (!isWebAuthnSupported) {
      showToast('WebAuthn is not supported in this browser.', 'error');
      return;
    }
    setLoading(true);
    try {
      // 1. Fetch registration options from backend
      const optRes = await fetch(`${API_BASE}/api/auth/webauthn/register-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, userEmail }),
      });
      if (!optRes.ok) throw new Error('Failed to fetch registration options');
      const options = await optRes.json();

      // 2. Decode binary fields
      options.challenge = base64urlToBuffer(options.challenge);
      options.user.id = base64urlToBuffer(options.user.id);
      if (options.excludeCredentials) {
        options.excludeCredentials = options.excludeCredentials.map((c) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        }));
      }

      // 3. Create credential via browser authenticator
      const credential = await navigator.credentials.create({ publicKey: options });

      // 4. Encode and send to backend for verification + storage
      const verifyRes = await fetch(`${API_BASE}/api/auth/webauthn/register-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId,
          id: credential.id,
          rawId: bufferToBase64url(credential.rawId),
          type: credential.type,
          response: {
            attestationObject: bufferToBase64url(credential.response.attestationObject),
            clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
          },
        }),
      });
      if (!verifyRes.ok) throw new Error('Registration verification failed');

      showToast('Biometric credential registered successfully!', 'success');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        showToast('Biometric prompt was dismissed or denied.', 'error');
      } else {
        showToast(err.message || 'Registration failed.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [userId, userEmail, isWebAuthnSupported, showToast]);

  // ── Login ───────────────────────────────────────────────────────────────────

  const handleBiometricLogin = useCallback(async () => {
    if (!isWebAuthnSupported) {
      showToast('WebAuthn is not supported in this browser.', 'error');
      return;
    }
    setLoading(true);
    try {
      // 1. Fetch authentication options (challenge + allowed credentials)
      const optRes = await fetch(`${API_BASE}/api/auth/webauthn/login-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      });
      if (!optRes.ok) throw new Error('Failed to fetch login options');
      const options = await optRes.json();

      // 2. Decode binary fields
      options.challenge = base64urlToBuffer(options.challenge);
      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map((c) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        }));
      }

      // 3. Get assertion from authenticator
      const assertion = await navigator.credentials.get({ publicKey: options });

      // 4. Send assertion to backend for verification
      const verifyRes = await fetch(`${API_BASE}/api/auth/webauthn/login-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId,
          id: assertion.id,
          rawId: bufferToBase64url(assertion.rawId),
          type: assertion.type,
          response: {
            authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
            clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
            signature: bufferToBase64url(assertion.response.signature),
            userHandle: assertion.response.userHandle
              ? bufferToBase64url(assertion.response.userHandle)
              : null,
          },
        }),
      });
      if (!verifyRes.ok) throw new Error('Biometric login verification failed');
      const { token } = await verifyRes.json();

      showToast('Biometric login successful!', 'success');
      onAuthSuccess?.(token);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        showToast('Biometric prompt was dismissed or denied.', 'error');
      } else {
        showToast(err.message || 'Biometric login failed.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [userId, isWebAuthnSupported, showToast, onAuthSuccess]);

  // ── Password fallback ───────────────────────────────────────────────────────

  const handlePasswordLogin = useCallback(
    async (e) => {
      e.preventDefault();
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: userEmail, password }),
        });
        if (!res.ok) throw new Error('Invalid credentials');
        const { token } = await res.json();
        showToast('Login successful!', 'success');
        onAuthSuccess?.(token);
      } catch (err) {
        showToast(err.message || 'Login failed.', 'error');
      } finally {
        setLoading(false);
        setPassword('');
      }
    },
    [userEmail, password, showToast, onAuthSuccess],
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section
      aria-labelledby="biometric-auth-heading"
      className="w-full max-w-sm mx-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-md"
    >
      <h2
        id="biometric-auth-heading"
        className="text-xl font-semibold text-gray-900 dark:text-white mb-1"
      >
        Sign In
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Use biometrics for a faster, more secure login.
      </p>

      {mode === 'menu' && (
        <div className="space-y-3" role="group" aria-label="Authentication options">
          {/* Biometric login */}
          <button
            type="button"
            onClick={handleBiometricLogin}
            disabled={loading || !isWebAuthnSupported}
            aria-label="Login with biometrics (TouchID or FaceID)"
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <span aria-hidden="true">🔐</span>
            {loading ? 'Verifying…' : 'Login with Biometrics'}
          </button>

          {/* Register biometrics */}
          <button
            type="button"
            onClick={handleRegister}
            disabled={loading || !isWebAuthnSupported}
            aria-label="Register a new biometric credential"
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-indigo-600 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 disabled:opacity-50 font-medium py-2.5 px-4 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <span aria-hidden="true">➕</span>
            Register Biometrics
          </button>

          {!isWebAuthnSupported && (
            <p role="alert" className="text-xs text-amber-600 dark:text-amber-400 text-center">
              WebAuthn is not supported in this browser. Use password login below.
            </p>
          )}

          {/* Divider */}
          <div className="relative my-2" aria-hidden="true">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs text-gray-400">
              <span className="bg-white dark:bg-gray-900 px-2">or</span>
            </div>
          </div>

          {/* Password fallback */}
          <button
            type="button"
            onClick={() => setMode('password')}
            aria-label="Switch to password login"
            className="w-full text-sm text-gray-600 dark:text-gray-400 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
          >
            Use Password Instead
          </button>
        </div>
      )}

      {mode === 'password' && (
        <form onSubmit={handlePasswordLogin} noValidate aria-label="Password login form">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="biometric-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Password
              </label>
              <input
                id="biometric-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-required="true"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !password}
              aria-label="Submit password login"
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => setMode('menu')}
              aria-label="Back to authentication options"
              className="w-full text-sm text-gray-500 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
            >
              ← Back
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
