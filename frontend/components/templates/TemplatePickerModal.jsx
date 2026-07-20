'use client';

import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useTemplates, useTemplate } from '../../hooks/useEscrowTemplates';

/**
 * Modal that lets a user pick an existing escrow template to pre-fill the
 * wizard. Two tabs: "My Templates" (own) and "Public Library" (community).
 *
 * The data-fetching body only mounts while the modal is open, so no API call
 * is made on initial page render.
 */
export default function TemplatePickerModal({ isOpen, onClose, onSelect }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Load template" size="lg">
      {isOpen ? <TemplatePickerBody onClose={onClose} onSelect={onSelect} /> : null}
    </Modal>
  );
}

function TemplatePickerBody({ onClose, onSelect }) {
  const [tab, setTab] = useState('mine'); // 'mine' | 'public'
  const [search, setSearch] = useState('');
  const { templates, loading, error, reload } = useTemplates({ scope: tab, search });

  // Reload whenever the active tab changes.
  useEffect(() => {
    reload({ scope: tab, search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleSelect = async (template) => {
    // Increment usage count, then hand the template back to the wizard.
    try {
      await useTemplate(template.id);
    } catch {
      // Non-fatal: the template is still usable even if the counter fails.
    }
    onSelect?.(template);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div
          role="tablist"
          aria-label="Template source"
          className="inline-flex rounded-lg bg-gray-800 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mine'}
            onClick={() => setTab('mine')}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              tab === 'mine' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            My Templates
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'public'}
            onClick={() => setTab('public')}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              tab === 'public' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Public Library
          </button>
        </div>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search templates…"
          aria-label="Search templates by name"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
                     text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {loading && <p className="text-sm text-gray-400">Loading templates…</p>}
      {error && (
        <p className="text-sm text-red-400" role="alert">
          Could not load templates. Please try again.
        </p>
      )}

      {!loading && !error && templates.length === 0 && (
        <p className="text-sm text-gray-500">
          No templates found. Save the current draft as a template to reuse it later.
        </p>
      )}

      <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {templates.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => handleSelect(template)}
              aria-label={`Load template ${template.name}`}
              className="w-full text-left rounded-xl border border-gray-800 bg-gray-900
                         p-4 hover:border-indigo-500/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{template.name}</p>
                  {template.description && (
                    <p className="text-xs text-gray-400 mt-0.5">{template.description}</p>
                  )}
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  Used {template.usageCount ?? 0}×
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                  {template.milestoneCount ?? 0} milestones
                </span>
                {template.isPublic && (
                  <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    Public
                  </span>
                )}
                <span className="px-2 py-1 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                  {template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : '—'}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose} className="min-h-touch">
          Cancel
        </Button>
      </div>
    </div>
  );
}
