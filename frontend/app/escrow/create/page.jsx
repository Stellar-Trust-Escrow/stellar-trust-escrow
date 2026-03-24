/**
 * Create Escrow Page — /escrow/create
 *
 * Multi-step form to create a new escrow agreement.
 *
 * Step 1: Counterparty — enter freelancer address, token, total amount
 * Step 2: Milestones  — add milestone titles, descriptions, amounts
 * Step 3: Review      — confirm all details before signing
 * Step 4: Sign & Submit — Freighter signs, broadcast to Stellar
 *
 * TODO (contributor — hard, Issue #33):
 * - Step 1: validate Stellar address format (G..., 56 chars)
 * - Step 2: validate milestone amounts sum <= total_amount
 * - Step 3: show summary with gas estimate
 * - Step 4: build Soroban transaction with stellar-sdk
 * - Step 4: invoke Freighter signTransaction()
 * - Step 4: POST signed XDR to /api/escrows/broadcast
 * - On success: redirect to /escrow/[id]
 */

'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Button from '../../../components/ui/Button';
import TemplateSelector from '../../../components/escrow/TemplateSelector';
import templatesData from '../../../data/templates.json';

const STEPS = [
  { id: 1, label: 'Counterparty' },
  { id: 2, label: 'Milestones' },
  { id: 3, label: 'Review' },
  { id: 4, label: 'Sign' },
];

const DEFAULT_MILESTONE = { title: '', description: '', amount: '' };

function applyTemplateToForm(currentForm, template) {
  const milestones = Array.isArray(template.milestones) && template.milestones.length > 0
    ? template.milestones.map((milestone) => ({
        title: milestone.title || '',
        description: milestone.description || '',
        amount: milestone.amount || '',
      }))
    : [{ ...DEFAULT_MILESTONE }];

  return {
    ...currentForm,
    tokenAddress: template.tokenAddress || currentForm.tokenAddress || 'usdc',
    totalAmount: template.totalAmount || '',
    briefDescription: template.briefDescription || '',
    deadline: template.deadline || '',
    milestones,
  };
}

export default function CreateEscrowPage() {
  const searchParams = useSearchParams();
  const templateLibrary = templatesData.templates || [];

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    freelancerAddress: '',
    tokenAddress: 'usdc',
    totalAmount: '',
    briefDescription: '',
    deadline: '',
    milestones: [{ ...DEFAULT_MILESTONE }],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [templateNotice, setTemplateNotice] = useState('');
  const [appliedQueryTemplateId, setAppliedQueryTemplateId] = useState(null);

  useEffect(() => {
    const templateId = searchParams.get('template');
    if (!templateId || templateId === appliedQueryTemplateId) {
      return;
    }

    const template = templateLibrary.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    setFormData((previous) => applyTemplateToForm(previous, template));
    setCurrentStep(1);
    setTemplateNotice(`Applied template: ${template.name}`);
    setAppliedQueryTemplateId(templateId);
  }, [searchParams, templateLibrary, appliedQueryTemplateId]);

  const handleApplyTemplate = (template) => {
    setFormData((previous) => applyTemplateToForm(previous, template));
    setCurrentStep(1);
    setTemplateNotice(`Applied template: ${template.name}`);
  };

  // TODO (contributor — Issue #33): implement form submission
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      // 1. Build Soroban transaction
      // 2. Sign with Freighter
      // 3. Broadcast
      // 4. Redirect
      throw new Error('Not implemented — see Issue #33');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addMilestone = () => {
    setFormData((data) => ({
      ...data,
      milestones: [...data.milestones, { ...DEFAULT_MILESTONE }],
    }));
  };

  const removeMilestone = (index) => {
    setFormData((data) => {
      const nextMilestones = data.milestones.filter((_, milestoneIndex) => milestoneIndex !== index);
      return {
        ...data,
        milestones: nextMilestones.length > 0 ? nextMilestones : [{ ...DEFAULT_MILESTONE }],
      };
    });
  };

  const updateMilestone = (index, field, value) => {
    setFormData((data) => ({
      ...data,
      milestones: data.milestones.map((milestone, milestoneIndex) =>
        milestoneIndex === index ? { ...milestone, [field]: value } : milestone,
      ),
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Create New Escrow</h1>
        <p className="text-gray-400 mt-1">Lock funds and define milestones for your project.</p>
      </div>

      <TemplateSelector
        baseTemplates={templateLibrary}
        formData={formData}
        onApplyTemplate={handleApplyTemplate}
        compact
      />

      {templateNotice && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-emerald-300 text-sm">
          {templateNotice}
        </div>
      )}

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => (
          <div key={step.id} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                ${
                  currentStep >= step.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-500'
                }`}
            >
              {step.id}
            </div>
            <span
              className={`text-sm hidden sm:inline
                ${currentStep >= step.id ? 'text-white' : 'text-gray-500'}`}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-700 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="card space-y-6">
        {currentStep === 1 && <StepCounterparty formData={formData} setFormData={setFormData} />}
        {currentStep === 2 && (
          <StepMilestones
            formData={formData}
            onAdd={addMilestone}
            onRemove={removeMilestone}
            onUpdate={updateMilestone}
          />
        )}
        {currentStep === 3 && <StepReview formData={formData} />}
        {currentStep === 4 && (
          <StepSign onSubmit={handleSubmit} isSubmitting={isSubmitting} error={error} />
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="secondary"
          onClick={() => setCurrentStep((step) => Math.max(1, step - 1))}
          disabled={currentStep === 1}
        >
          Back
        </Button>
        {currentStep < 4 ? (
          <Button variant="primary" onClick={() => setCurrentStep((step) => step + 1)}>
            Next →
          </Button>
        ) : (
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Signing…' : 'Sign & Create Escrow'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Step Sub-components ───────────────────────────────────────────────────────

/**
 * Step 1: Enter counterparty details.
 */
function StepCounterparty({ formData, setFormData }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Counterparty & Funds</h2>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Freelancer Stellar Address</label>
        <input
          type="text"
          placeholder="GABCD1234..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5
                     text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          value={formData.freelancerAddress}
          onChange={(event) =>
            setFormData((data) => ({ ...data, freelancerAddress: event.target.value }))
          }
        />
        {/* TODO (contributor): add validation error display */}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Token</label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
            value={formData.tokenAddress}
            onChange={(event) =>
              setFormData((data) => ({ ...data, tokenAddress: event.target.value }))
            }
          >
            <option value="usdc">USDC</option>
            <option value="xlm">XLM</option>
            <option value="custom">Custom…</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Total Amount</label>
          <input
            type="number"
            placeholder="0.00"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5
                       text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            value={formData.totalAmount}
            onChange={(event) => setFormData((data) => ({ ...data, totalAmount: event.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">
          Project Brief <span className="text-gray-600">(optional)</span>
        </label>
        <textarea
          rows={3}
          placeholder="Briefly describe the project scope and deliverables…"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5
                     text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
          value={formData.briefDescription}
          onChange={(event) =>
            setFormData((data) => ({ ...data, briefDescription: event.target.value }))
          }
        />
        {/* TODO (contributor): upload to IPFS and store hash */}
      </div>
    </div>
  );
}

/**
 * Step 2: Define milestones.
 */
function StepMilestones({ formData, onAdd, onRemove, onUpdate }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Milestones</h2>
        <span className="text-sm text-gray-500">
          Total: {formData.milestones.reduce((sum, milestone) => sum + Number(milestone.amount || 0), 0)}{' '}
          / {formData.totalAmount || '—'} {String(formData.tokenAddress || 'USDC').toUpperCase()}
        </span>
      </div>

      {formData.milestones.map((milestone, index) => (
        <div key={index} className="bg-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">Milestone {index + 1}</span>
            {formData.milestones.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="text-red-400 text-sm hover:text-red-300"
              >
                Remove
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="Title (e.g. Initial Design Mockups)"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2
                       text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
            value={milestone.title}
            onChange={(event) => onUpdate(index, 'title', event.target.value)}
          />
          <textarea
            rows={2}
            placeholder="Milestone description"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2
                       text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            value={milestone.description}
            onChange={(event) => onUpdate(index, 'description', event.target.value)}
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount"
              className="w-32 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2
                         text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
              value={milestone.amount}
              onChange={(event) => onUpdate(index, 'amount', event.target.value)}
            />
            <span className="text-gray-500 text-sm self-center">
              {String(formData.tokenAddress || 'USDC').toUpperCase()}
            </span>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="w-full border border-dashed border-gray-700 rounded-lg py-3
                   text-gray-500 hover:text-gray-400 hover:border-gray-600 text-sm transition-colors"
      >
        + Add Milestone
      </button>
    </div>
  );
}

/**
 * Step 3: Review summary before signing.
 */
function StepReview({ formData }) {
  const token = String(formData.tokenAddress || 'USDC').toUpperCase();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Review Details</h2>
      <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-400 space-y-2">
        <p>
          Freelancer: <span className="text-white">{formData.freelancerAddress || '—'}</span>
        </p>
        <p>
          Total Amount: <span className="text-white">{formData.totalAmount || '—'} {token}</span>
        </p>
        <p>
          Milestones: <span className="text-white">{formData.milestones.length}</span>
        </p>
      </div>
      <p className="text-xs text-gray-500">
        ⚠️ By proceeding, you authorize locking{' '}
        <strong className="text-white">{formData.totalAmount || '0'} {token}</strong> in the escrow contract.
        This action cannot be undone without mutual agreement.
      </p>
    </div>
  );
}

/**
 * Step 4: Sign with Freighter.
 * TODO (contributor — Issue #33): build and sign the Soroban transaction
 */
function StepSign({ error }) {
  return (
    <div className="space-y-4 text-center">
      <h2 className="text-lg font-semibold text-white">Sign & Submit</h2>
      <p className="text-gray-400 text-sm">
        Clicking the button below will open your Freighter wallet to sign the transaction. Your
        funds will be locked on-chain once confirmed.
      </p>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}
      <p className="text-xs text-amber-400">
        🚧 Freighter integration is not yet implemented — see Issue #33
      </p>
    </div>
  );
}
