'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import Modal from '../ui/Modal';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ArbiterTable({ arbiters = [], onRefresh, apiKey }) {
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedArbiter, setSelectedArbiter] = useState(null);
  const [newArbiterAddress, setNewArbiterAddress] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/arbiters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-api-key': apiKey,
          'X-TOTP-Code': totpCode,
        },
        body: JSON.stringify({ address: newArbiterAddress }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to register arbiter');
      }

      setShowRegisterModal(false);
      setNewArbiterAddress('');
      setTotpCode('');
      onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(
        `${API_BASE}/api/v1/admin/arbiters/${selectedArbiter.address}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-api-key': apiKey,
            'X-TOTP-Code': totpCode,
          },
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove arbiter');
      }

      setShowRemoveModal(false);
      setSelectedArbiter(null);
      setTotpCode('');
      onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openRemoveModal = (arbiter) => {
    setSelectedArbiter(arbiter);
    setShowRemoveModal(true);
    setTotpCode('');
    setError('');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString();
  };

  const formatWinRate = (rate) => {
    if (rate === null || rate === undefined) return '—';
    return `${rate.toFixed(1)}%`;
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Arbiter Registry</h2>
        <button
          onClick={() => {
            setShowRegisterModal(true);
            setNewArbiterAddress('');
            setTotpCode('');
            setError('');
          }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Register Arbiter
        </button>
      </div>

      {arbiters.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>No arbiters registered</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">
              Table of registered arbiters with their statistics
            </caption>
            <thead>
              <tr className="border-b border-gray-700">
                <th scope="col" className="text-left py-3 px-4 text-gray-400 font-medium">
                  Address
                </th>
                <th scope="col" className="text-left py-3 px-4 text-gray-400 font-medium">
                  Active Disputes
                </th>
                <th scope="col" className="text-left py-3 px-4 text-gray-400 font-medium">
                  Total Resolved
                </th>
                <th scope="col" className="text-left py-3 px-4 text-gray-400 font-medium">
                  Win Rate
                </th>
                <th scope="col" className="text-left py-3 px-4 text-gray-400 font-medium">
                  Registered At
                </th>
                <th scope="col" className="text-right py-3 px-4 text-gray-400 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {arbiters.map((arbiter) => (
                <tr key={arbiter.address} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="py-3 px-4">
                    <code className="text-sm text-indigo-400">{arbiter.address}</code>
                  </td>
                  <td className="py-3 px-4 text-white">{arbiter.activeDisputes ?? 0}</td>
                  <td className="py-3 px-4 text-white">{arbiter.totalResolved ?? 0}</td>
                  <td className="py-3 px-4 text-white">{formatWinRate(arbiter.winRate)}</td>
                  <td className="py-3 px-4 text-gray-400">{formatDate(arbiter.registeredAt)}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => openRemoveModal(arbiter)}
                      className="text-red-400 hover:text-red-300 transition-colors p-2"
                      aria-label={`Remove arbiter ${arbiter.address}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Register Modal */}
      <Modal isOpen={showRegisterModal} onClose={() => setShowRegisterModal(false)}>
        <div className="p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Register New Arbiter</h3>
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="arbiter-address" className="block text-sm text-gray-400 mb-2">
                Stellar Address
              </label>
              <input
                id="arbiter-address"
                type="text"
                value={newArbiterAddress}
                onChange={(e) => setNewArbiterAddress(e.target.value)}
                placeholder="G..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
            <div>
              <label htmlFor="totp-code-register" className="block text-sm text-gray-400 mb-2">
                TOTP Code
              </label>
              <input
                id="totp-code-register"
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="6-digit code"
                maxLength={6}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Registering...' : 'Register'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Remove Confirmation Modal */}
      <Modal isOpen={showRemoveModal} onClose={() => setShowRemoveModal(false)}>
        <div className="p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Remove Arbiter</h3>
          <p className="text-gray-400 mb-4">
            Are you sure you want to remove arbiter{' '}
            <code className="text-indigo-400">{selectedArbiter?.address}</code>?
          </p>
          <form onSubmit={handleRemove} className="space-y-4">
            <div>
              <label htmlFor="totp-code-remove" className="block text-sm text-gray-400 mb-2">
                TOTP Code
              </label>
              <input
                id="totp-code-remove"
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="6-digit code"
                maxLength={6}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowRemoveModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
