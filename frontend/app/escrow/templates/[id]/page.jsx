'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Button from '../../../../components/ui/Button';
import { getTemplate, useTemplate } from '../../../../hooks/useEscrowTemplates';
import { useToast } from '../../../../contexts/ToastContext';

/**
 * Public, shareable template page: /escrow/templates/:id
 *
 * Shows a read-only preview of a template. "Use this template" increments the
 * usage count and navigates to the create-escrow wizard pre-filled via the
 * ?templateId query param.
 */
export default function TemplateDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const found = await getTemplate(id);
        if (!cancelled) setTemplate(found);
      } catch (err) {
        if (!cancelled) {
          const status = err?.response?.status;
          setError(status === 403 ? 'This template is private.' : 'Template not found.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleUse = async () => {
    try {
      await useTemplate(id);
    } catch {
      // Non-fatal: we still navigate to the wizard.
    }
    router.push(`/escrow/create?templateId=${encodeURIComponent(id)}`);
    showToast('Template loaded into the wizard.', 'success');
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-10">
        <p className="text-gray-400">Loading template…</p>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="max-w-3xl mx-auto py-10 space-y-4">
        <h1 className="text-2xl font-bold text-white">Template unavailable</h1>
        <p className="text-gray-400">{error || 'This template could not be loaded.'}</p>
        <Button href="/escrow/templates" variant="secondary">
          Back to templates
        </Button>
      </div>
    );
  }

  const escrow = template.templateData?.escrow || {};
  const milestones = template.templateData?.milestones || [];

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{template.name}</h1>
          {template.description && (
            <p className="text-gray-400 mt-1">{template.description}</p>
          )}
        </div>
        {template.isPublic && (
          <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-xs">
            Public
          </span>
        )}
      </div>

      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-white">Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-gray-400">Token</dt>
            <dd className="text-white">{String(escrow.tokenAddress || 'USDC').toUpperCase()}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Total amount</dt>
            <dd className="text-white">{escrow.totalAmount || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Deadline</dt>
            <dd className="text-white">{escrow.deadline || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Times used</dt>
            <dd className="text-white">{template.usageCount ?? 0}</dd>
          </div>
        </dl>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold text-white">
          Milestones ({milestones.length})
        </h2>
        {milestones.length === 0 && (
          <p className="text-sm text-gray-500">No milestones defined.</p>
        )}
        <ul className="space-y-3">
          {milestones.map((milestone, index) => (
            <li
              key={index}
              className="rounded-lg border border-gray-800 bg-gray-900 p-3 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-medium text-white">
                  {milestone.title || `Milestone ${index + 1}`}
                </p>
                <p className="text-xs text-gray-400">{milestone.amount || '—'}</p>
              </div>
              <span className="text-xs text-gray-500">#{index + 1}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="primary" onClick={handleUse} className="min-h-touch">
          Use this template
        </Button>
        <Button href="/escrow/templates" variant="secondary">
          Back to templates
        </Button>
      </div>
    </div>
  );
}
