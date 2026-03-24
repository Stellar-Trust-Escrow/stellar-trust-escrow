'use client';

/**
 * KYC Verification Page — /kyc
 *
 * Loads the Sumsub Web SDK widget to guide the user through identity verification.
 * On completion the backend webhook updates the status automatically.
 *
 * Prerequisites:
 *   npm install @sumsub/websdk-react   (frontend)
 */

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

// Sumsub React SDK — loaded client-side only (no SSR)
const SumsubWebSdk = dynamic(() => import('@sumsub/websdk-react'), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const STATUS_MESSAGES = {
  Pending: 'Start verification to unlock full platform access.',
  Init: 'Verification started. Complete the steps below.',
  Processing: 'Your documents are being reviewed. This usually takes a few minutes.',
  Approved: 'Your identity has been verified. ✅',
  Declined: 'Verification was declined. Please review the requirements and try again.',
};

export default function KycPage() {
  // TODO (contributor): replace with real wallet address from WalletProvider context
  const address = 'GABCD1234PLACEHOLDER000000000000000000000000000000000000000';

  const [status, setStatus] = useState(null);
  const [sdkToken, setSdkToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch current KYC status on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/kyc/status/${address}`)
      .then((r) => r.json())
      .then((d) => setStatus(d.status ?? 'Pending'))
      .catch(() => setStatus('Pending'))
      .finally(() => setLoading(false));
  }, [address]);

  const startVerification = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/kyc/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) throw new Error('Failed to get verification token');
      const { token } = await res.json();
      setSdkToken(token);
      setStatus('Init');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSdkMessage = (type) => {
    if (type === 'idCheck.onApplicantSubmitted') setStatus('Processing');
  };

  const handleSdkError = (err) => setError(err?.message ?? 'Verification error');

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Identity Verification</h1>
        <p className="text-gray-400 mt-1">
          KYC verification is required to create or participate in escrows above the platform
          threshold.
        </p>
      </div>

      {/* Status card */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">Verification Status</p>
          <Badge status={status} />
        </div>
        <p className="text-sm text-gray-400 max-w-xs text-right">
          {STATUS_MESSAGES[status] ?? ''}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Show SDK widget when token is available */}
      {sdkToken ? (
        <div className="card p-0 overflow-hidden">
          <SumsubWebSdk
            accessToken={sdkToken}
            expirationHandler={startVerification}
            onMessage={handleSdkMessage}
            onError={handleSdkError}
          />
        </div>
      ) : (
        /* Show start button when not yet verified / declined */
        ['Pending', 'Init', 'Declined'].includes(status) && (
          <button
            onClick={startVerification}
            className="btn-primary w-full py-3 rounded-lg font-semibold"
          >
            {status === 'Declined' ? 'Retry Verification' : 'Start Verification'}
          </button>
        )
      )}

      {/* Admin link — visible only in dev or for admin users */}
      {process.env.NODE_ENV === 'development' && (
        <p className="text-xs text-gray-600 text-center">
          Admin review:{' '}
          <a href="/kyc/admin" className="text-indigo-400 hover:underline">
            /kyc/admin
          </a>
        </p>
      )}
    </div>
  );
}
