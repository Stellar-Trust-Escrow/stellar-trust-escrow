'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

/**
 * DataExport Component
 * Allows users to export their data and import data from backup files
 * Provides data portability as per user rights
 */
export default function DataExport({ address }) {
  const [loading, setLoading] = useState(false);
  const [exportData, setExportData] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importMode, setImportMode] = useState('merge');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Export user data
  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/users/${address}/export`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to export data');
      }

      setExportData(data);
      setMessage('Data exported successfully!');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Download export as file
  const handleDownload = () => {
    if (!exportData) return;

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stellar-trust-export-${address}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setMessage(null);
      setError(null);
    }
  };

  // Import data from file
  const handleImport = async () => {
    if (!importFile) {
      setError('Please select a file to import');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const text = await importFile.text();
      const data = JSON.parse(text);

      const res = await fetch(`${API_BASE}/api/users/${address}/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ data, mode: importMode }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to import data');
      }

      setMessage(`Import successful! ${result.results.escrows.imported} escrows, ${result.results.payments.imported} payments imported.`);
      setImportFile(null);
    } catch (err) {
      if (err instanceof SyntaxError && err.message.includes('JSON')) {
        setError('Invalid JSON file format');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-2">Data Export/Import</h2>
        <p className="text-gray-400 text-sm">
          Export your data for backup or import data from a previous export.
          Your data portability right ensures you can move your data elsewhere.
        </p>
      </div>

      {/* Export Section */}
      <div className="border-t border-gray-700 pt-4">
        <h3 className="text-sm font-medium text-white mb-3">Export Your Data</h3>
        <p className="text-gray-500 text-xs mb-3">
          Download all your escrows, payments, KYC status, and reputation data.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={loading}
            className="btn btn-primary text-sm"
          >
            {loading ? 'Exporting...' : 'Export Data'}
          </button>
          {exportData && (
            <button onClick={handleDownload} className="btn btn-secondary text-sm">
              Download JSON
            </button>
          )}
        </div>
      </div>

      {/* Import Section */}
      <div className="border-t border-gray-700 pt-4">
        <h3 className="text-sm font-medium text-white mb-3">Import Data</h3>
        <p className="text-gray-500 text-xs mb-3">
          Import data from a previously exported file. Existing data will be merged
          or replaced based on your choice.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Select File</label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Import Mode</label>
            <select
              value={importMode}
              onChange={(e) => setImportMode(e.target.value)}
              className="input w-full text-sm"
            >
              <option value="merge">Merge (add new records only)</option>
              <option value="replace">Replace (update existing records)</option>
            </select>
          </div>

          <button
            onClick={handleImport}
            disabled={loading || !importFile}
            className="btn btn-secondary text-sm"
          >
            {loading ? 'Importing...' : 'Import Data'}
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg text-green-400 text-sm">
          {message}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Data Preview */}
      {exportData && (
        <div className="border-t border-gray-700 pt-4">
          <h3 className="text-sm font-medium text-white mb-2">Export Preview</h3>
          <div className="bg-gray-900 rounded-lg p-3 text-xs font-mono text-gray-400 overflow-auto max-h-48">
            <p>
              <span className="text-indigo-400">Version:</span> {exportData.version}
            </p>
            <p>
              <span className="text-indigo-400">Exported:</span> {exportData.exportedAt}
            </p>
            <p>
              <span className="text-indigo-400">Escrows:</span>{' '}
              {exportData.data.escrows?.length || 0}
            </p>
            <p>
              <span className="text-indigo-400">Payments:</span>{' '}
              {exportData.data.payments?.length || 0}
            </p>
            <p>
              <span className="text-indigo-400">KYC:</span>{' '}
              {exportData.data.kyc?.status || 'None'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
