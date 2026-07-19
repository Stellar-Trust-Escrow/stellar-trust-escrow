'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useToast } from '../../contexts/ToastContext';
import { createTemplate } from '../../hooks/useEscrowTemplates';
import { buildTemplateDataFromForm } from '../../lib/templates';

/**
 * Modal shown on the review step of the create-escrow wizard. Captures a name
 * and visibility for the current draft and persists it as a reusable template.
 */
export default function SaveTemplateModal({ isOpen, onClose, formData }) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a template name.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const templateData = buildTemplateDataFromForm(formData);
      const created = await createTemplate({
        name: name.trim(),
        description: description.trim() || null,
        isPublic,
        templateData,
      });
      showToast(`Saved template: ${created.name}`, 'success');
      setName('');
      setDescription('');
      setIsPublic(false);
      onClose?.();
    } catch (err) {
      const message = err?.response?.data?.error?.message || err?.message || 'Failed to save template.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Save as template" size="md">
      <div className="space-y-4">
        <div>
          <label htmlFor="template-name" className="block text-sm text-gray-400 mb-1">
            Template name
          </label>
          <input
            id="template-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Monthly Freelance Retainer"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
                       text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="template-description" className="block text-sm text-gray-400 mb-1">
            Description <span className="text-gray-600">(optional)</span>
          </label>
          <textarea
            id="template-description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this template for?"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
                       text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-800"
          />
          Make this template public (anyone can use it)
        </label>

        {error && (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="min-h-touch" disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} className="min-h-touch" isLoading={saving}>
            Save template
          </Button>
        </div>
      </div>
    </Modal>
  );
}
