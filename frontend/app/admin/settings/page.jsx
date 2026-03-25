'use client';

/**
 * Admin — Platform Settings Page
 *
 * Reads and updates platform configuration (fee %, network, etc.).
 */

import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getAdminKey() {
  return typeof window !== 'undefined' ? localStorage.getItem('adminApiKey') || '' : '';
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [feeInput, setFeeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const headers = { 'Content-Type': 'application/json', 'x-admin-api-key': getAdminKey() };

  const fetchSettings = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load settings');
      setSettings(data);
      setFeeInput(data.platformFeePercent);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ platformFeePercent: feeInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');
      setToast('Settings saved.');
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-800 border border-emerald-500/40 text-emerald-100 text-sm px-4 py-3 rounded-lg shadow-xl">
          ✅ {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Settings</h1>
          <p className="text-gray-400 text-sm mt-1">
            Runtime configuration for StellarTrustEscrow.
          </p>
        </div>
        <a
          href="/admin"
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          ← Dashboard
        </a>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 text-center py-12">Loading settings…</div>
      ) : (
        settings && (
          <div className="flex flex-col gap-4 max-w-xl">
            {/* Read-only info */}
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
                Environment
              </h2>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-gray-500">Network</dt>
                <dd className="text-white capitalize">{settings.stellarNetwork}</dd>
                <dt className="text-gray-500">Allowed Origins</dt>
                <dd className="text-gray-300 text-xs break-all">{settings.allowedOrigins}</dd>
              </dl>
            </div>

            {/* Editable fee */}
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
                Fee Configuration
              </h2>
              <form onSubmit={handleSave} className="flex flex-col gap-3">
                <div>
                  <label
                    htmlFor="platform-fee"
                    className="text-xs text-gray-400 uppercase tracking-wider mb-1 block"
                  >
                    Platform Fee (%)
                  </label>
                  <input
                    id="platform-fee"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={feeInput}
                    onChange={(e) => setFeeInput(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white w-48 focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
              <p className="text-xs text-gray-600 mt-3">
                ⓘ Persistence coming in a future release (see Issue #23). Changes are validated but
                not yet stored.
              </p>
            </div>
          </div>
        )
      )}
    </div>
  );
}
