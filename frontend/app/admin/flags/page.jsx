'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminStore } from '../../../store/app-store';
import { buildAdminHeaders } from '../../../store/admin';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const EMPTY_FORM = { key: '', description: '', isEnabled: false, percentage: 0, targetUsers: '' };

export default function FeatureFlagsPage() {
  const { apiKey } = useAdminStore();
  const [flags, setFlags] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingKey, setEditingKey] = useState(null);

  const headers = buildAdminHeaders(apiKey);

  const fetchFlags = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/flags`, { headers });
      const json = await res.json();
      setFlags(json.data ?? []);
    } catch {
      setError('Failed to load flags.');
    }
  }, [apiKey]);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);

  async function saveFlag(e) {
    e.preventDefault();
    const payload = {
      ...form,
      percentage: Number(form.percentage),
      targetUsers: form.targetUsers.split(',').map((s) => s.trim()).filter(Boolean),
    };

    const url = editingKey
      ? `${API_BASE}/api/admin/flags/${editingKey}`
      : `${API_BASE}/api/admin/flags`;
    const method = editingKey ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? 'Save failed.');
      return;
    }

    setForm(EMPTY_FORM);
    setEditingKey(null);
    fetchFlags();
  }

  async function toggleFlag(flag) {
    await fetch(`${API_BASE}/api/admin/flags/${flag.key}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled: !flag.isEnabled }),
    });
    fetchFlags();
  }

  async function deleteFlag(key) {
    if (!confirm(`Delete flag "${key}"?`)) return;
    await fetch(`${API_BASE}/api/admin/flags/${key}`, { method: 'DELETE', headers });
    fetchFlags();
  }

  function startEdit(flag) {
    setEditingKey(flag.key);
    setForm({
      key: flag.key,
      description: flag.description,
      isEnabled: flag.isEnabled,
      percentage: flag.percentage,
      targetUsers: flag.targetUsers.join(', '),
    });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Feature Flags</h1>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {/* ── Create / Edit Form ── */}
      <form onSubmit={saveFlag} className="card mb-8 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          {editingKey ? `Edit: ${editingKey}` : 'New Flag'}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <input
            className="input col-span-2"
            placeholder="Flag key (e.g. new-dashboard)"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
            disabled={!!editingKey}
            required
          />
          <input
            className="input col-span-2"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <label className="flex items-center gap-2 text-gray-300">
            <input
              type="checkbox"
              checked={form.isEnabled}
              onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
            />
            Enabled
          </label>

          <label className="flex flex-col text-gray-300 text-sm">
            Rollout: {form.percentage}%
            <input
              type="range"
              min={0}
              max={100}
              value={form.percentage}
              onChange={(e) => setForm({ ...form, percentage: Number(e.target.value) })}
              className="mt-1"
            />
          </label>

          <input
            className="input col-span-2"
            placeholder="Beta user IDs (comma-separated)"
            value={form.targetUsers}
            onChange={(e) => setForm({ ...form, targetUsers: e.target.value })}
          />
        </div>

        <div className="flex gap-2">
          <button type="submit" className="btn-primary">
            {editingKey ? 'Update' : 'Create'}
          </button>
          {editingKey && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setEditingKey(null); setForm(EMPTY_FORM); }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* ── Flags Table ── */}
      <div className="space-y-3">
        {flags.length === 0 && <p className="text-gray-500">No flags defined yet.</p>}
        {flags.map((flag) => (
          <div key={flag.key} className="card flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-mono font-semibold text-white">{flag.key}</p>
              {flag.description && <p className="text-sm text-gray-400">{flag.description}</p>}
              <p className="text-xs text-gray-500 mt-1">
                Rollout: {flag.percentage}%
                {flag.targetUsers.length > 0 && ` · ${flag.targetUsers.length} targeted user(s)`}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Toggle switch */}
              <button
                onClick={() => toggleFlag(flag)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  flag.isEnabled ? 'bg-green-500' : 'bg-gray-600'
                }`}
                aria-label={`Toggle ${flag.key}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    flag.isEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>

              <button
                onClick={() => startEdit(flag)}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Edit
              </button>
              <button
                onClick={() => deleteFlag(flag.key)}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
