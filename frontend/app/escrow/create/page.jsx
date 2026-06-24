/**
 * Create Escrow Page — /escrow/create
 *
 * 5-step wizard:
 *   1. Parties    — buyer (auto-filled) + seller address
 *   2. Terms      — project description + deadline
 *   3. Amount     — token, total amount, milestones
 *   4. Review     — full summary before signing
 *   5. Confirm    — Freighter signing
 *
 * TODO (contributor — hard, Issue #33):
 * - Step 5: build Soroban transaction with stellar-sdk
 * - Step 5: invoke Freighter signTransaction()
 * - Step 5: POST signed XDR to /api/escrows/broadcast
 * - On success: redirect to /escrow/[id]
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '../../../components/ui/Button';
import TemplateSelector from '../../../components/escrow/TemplateSelector';
import StellarAddressInput from '../../../components/ui/StellarAddressInput';
import XLMAmountInput from '../../../components/ui/XLMAmountInput';
import templatesData from '../../../data/templates.json';
import { useToast } from '../../../contexts/ToastContext';
import { useWallet } from '../../../hooks/useWallet';
import {
  buildCreateEscrowTx,
  broadcastTransaction,
  isValidStellarAddress,
} from '../../../lib/stellar';

const STEPS = [
  { id: 1, label: 'Parties' },
  { id: 2, label: 'Terms' },
  { id: 3, label: 'Amount' },
  { id: 4, label: 'Review' },
  { id: 5, label: 'Confirm' },
];

const DEFAULT_MILESTONE = { title: '', description: '', amount: '' };
const DESCRIPTION_MIN_LENGTH = 10;

function applyTemplateToForm(currentForm, template) {
  const milestones =
    Array.isArray(template.milestones) && template.milestones.length > 0
      ? template.milestones.map((m) => ({
          title: m.title || '',
          description: m.description || '',
          amount: m.amount || '',
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

function isPositiveAmount(value) {
  const n = Number(value);
  return value !== '' && !Number.isNaN(n) && n > 0;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateStep(step, formData) {
  const errors = {};
  if (step === 1) {
    if (!formData.sellerAddress.trim()) {
      errors.sellerAddress = 'Seller address is required.';
    } else if (!isValidStellarAddress(formData.sellerAddress.trim())) {
      errors.sellerAddress = 'Enter a valid Stellar address (G…, 56 characters).';
    }
  }
  if (step === 2) {
    if (formData.briefDescription.trim().length < DESCRIPTION_MIN_LENGTH) {
      errors.briefDescription = `Description must be at least ${DESCRIPTION_MIN_LENGTH} characters.`;
    }
    if (!formData.deadline) {
      errors.deadline = 'Deadline is required.';
    } else if (formData.deadline < todayIso()) {
      errors.deadline = 'Deadline must be today or in the future.';
    }
  }
  if (step === 3) {
    if (!isPositiveAmount(formData.totalAmount)) {
      errors.totalAmount = 'Amount must be a positive number.';
    }
  }
  return errors;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CreateEscrowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateLibrary = templatesData.templates || [];

  const { address, isConnected, signTx } = useWallet();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    sellerAddress: '',
    tokenAddress: 'usdc',
    totalAmount: '',
    briefDescription: '',
    deadline: '',
    milestones: [{ ...DEFAULT_MILESTONE }],
  });
  const [stepErrors, setStepErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [templateNotice, setTemplateNotice] = useState('');
  const [appliedQueryTemplateId, setAppliedQueryTemplateId] = useState(null);

  const { showToast } = useToast();

  useEffect(() => {
    const templateId = searchParams.get('template');
    if (!templateId || templateId === appliedQueryTemplateId) return;
    const template = templateLibrary.find((item) => item.id === templateId);
    if (!template) return;
    setFormData((prev) => applyTemplateToForm(prev, template));
    setCurrentStep(1);
    setTemplateNotice(`Applied template: ${template.name}`);
    setAppliedQueryTemplateId(templateId);
  }, [searchParams, templateLibrary, appliedQueryTemplateId]);

  const handleApplyTemplate = (template) => {
    setFormData((prev) => applyTemplateToForm(prev, template));
    setCurrentStep(1);
    setTemplateNotice(`Applied template: ${template.name}`);
  };

  const handleNext = () => {
    const errors = validateStep(currentStep, formData);
    if (Object.keys(errors).length > 0) {
      setStepErrors(errors);
      return;
    }
    setStepErrors({});
    setCurrentStep((s) => Math.min(STEPS.length, s + 1));
  };

  const handleBack = () => {
    setStepErrors({});
    setCurrentStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      throw new Error('Not implemented — see Issue #33');
    } catch (err) {
      setSubmitError(err.message || 'Failed to create escrow');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addMilestone = () =>
    setFormData((d) => ({ ...d, milestones: [...d.milestones, { ...DEFAULT_MILESTONE }] }));

  const removeMilestone = (index) =>
    setFormData((d) => {
      const next = d.milestones.filter((_, i) => i !== index);
      return { ...d, milestones: next.length > 0 ? next : [{ ...DEFAULT_MILESTONE }] };
    });

  const updateMilestone = (index, field, value) =>
    setFormData((d) => ({
      ...d,
      milestones: d.milestones.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
    }));

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white dark:text-white">Create New Escrow</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Lock funds and define milestones for your project.
        </p>
      </div>

      <TemplateSelector
        baseTemplates={templateLibrary}
        formData={formData}
        onApplyTemplate={handleApplyTemplate}
        compact
      />

      {templateNotice && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-emerald-600 dark:text-emerald-300 text-sm">
          {templateNotice}
        </div>
      )}

      {/* Progress indicator */}
      <nav aria-label="Progress">
        <p className="text-sm text-gray-500 mb-3">
          Step {currentStep} of {STEPS.length}
        </p>
        <ol className="flex items-center gap-2">
          {STEPS.map((step, i) => (
            <li key={step.id} className="flex items-center gap-2">
              <div
                aria-current={currentStep === step.id ? 'step' : undefined}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                  ${currentStep > step.id ? 'bg-indigo-700 text-white' : currentStep === step.id ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}
              >
                {currentStep > step.id ? '✓' : step.id}
              </div>
              <span
                className={`text-sm hidden sm:inline ${currentStep >= step.id ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}
              >
                {step.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className="w-6 h-px bg-gray-300 dark:bg-gray-700 mx-1" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Step Content */}
      <div className="card space-y-6">
        {currentStep === 1 && (
          <StepParties
            formData={formData}
            setFormData={setFormData}
            errors={stepErrors}
            buyerAddress={address}
          />
        )}
        {currentStep === 2 && (
          <StepTerms formData={formData} setFormData={setFormData} errors={stepErrors} />
        )}
        {currentStep === 3 && (
          <StepAmount
            formData={formData}
            setFormData={setFormData}
            errors={stepErrors}
            onAdd={addMilestone}
            onRemove={removeMilestone}
            onUpdate={updateMilestone}
          />
        )}
        {currentStep === 4 && <StepReview formData={formData} buyerAddress={address} />}
        {currentStep === 5 && (
          <StepConfirm onSubmit={handleSubmit} isSubmitting={isSubmitting} error={submitError} />
        )}
      </div>

      {/* Navigation */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <Button
          variant="secondary"
          onClick={handleBack}
          disabled={currentStep === 1}
          className="min-h-[44px]"
        >
          Back
        </Button>
        {currentStep < STEPS.length ? (
          <Button variant="primary" onClick={handleNext} className="min-h-[44px]">
            Next →
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            className="min-h-[44px]"
          >
            Sign & Create Escrow
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Step Sub-components ───────────────────────────────────────────────────────

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-red-500 dark:text-red-400" role="alert">
      {message}
    </p>
  );
}

/**
 * Step 1: Parties — buyer (auto-filled) + seller address.
 */
function StepParties({ formData, setFormData, errors, buyerAddress }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Parties</h2>

      <div>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
          Buyer Address <span className="text-gray-400 text-xs">(your connected wallet)</span>
        </label>
        <input
          type="text"
          readOnly
          value={buyerAddress || 'Not connected'}
          className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-600 dark:text-gray-400 text-sm font-mono cursor-not-allowed"
          aria-label="Buyer Stellar Address (read-only)"
        />
      </div>

      <StellarAddressInput
        id="seller-address"
        label="Seller Stellar Address"
        placeholder="GABCD1234..."
        value={formData.sellerAddress}
        onChange={(val) => setFormData((d) => ({ ...d, sellerAddress: val }))}
        required
        error={errors.sellerAddress}
        errorId="seller-address-error"
      />
      <FieldError id="seller-address-error" message={errors.sellerAddress} />
    </div>
  );
}

/**
 * Step 2: Terms — description + deadline.
 */
function StepTerms({ formData, setFormData, errors }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Terms</h2>

      <div>
        <label htmlFor="brief-description" className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
          Project Description <span className="text-red-500">*</span>
        </label>
        <textarea
          id="brief-description"
          rows={4}
          placeholder="Describe the project scope and deliverables (min 10 characters)…"
          className={`w-full bg-white dark:bg-gray-800 border rounded-lg px-4 py-2.5
            text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none resize-none transition-colors
            ${errors.briefDescription ? 'border-red-500 focus:border-red-400' : 'border-gray-300 dark:border-gray-700 focus:border-indigo-500'}`}
          value={formData.briefDescription}
          aria-invalid={!!errors.briefDescription}
          aria-describedby={errors.briefDescription ? 'brief-description-error' : undefined}
          onChange={(e) => setFormData((d) => ({ ...d, briefDescription: e.target.value }))}
        />
        <FieldError id="brief-description-error" message={errors.briefDescription} />
      </div>

      <div>
        <label htmlFor="deadline" className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
          Deadline <span className="text-red-500">*</span>
        </label>
        <input
          id="deadline"
          type="date"
          min={todayIso()}
          className={`w-full bg-white dark:bg-gray-800 border rounded-lg px-4 py-2.5
            text-gray-900 dark:text-white focus:outline-none transition-colors
            ${errors.deadline ? 'border-red-500 focus:border-red-400' : 'border-gray-300 dark:border-gray-700 focus:border-indigo-500'}`}
          value={formData.deadline}
          aria-invalid={!!errors.deadline}
          aria-describedby={errors.deadline ? 'deadline-error' : undefined}
          onChange={(e) => setFormData((d) => ({ ...d, deadline: e.target.value }))}
        />
        <FieldError id="deadline-error" message={errors.deadline} />
      </div>
    </div>
  );
}

/**
 * Step 3: Amount — token, total, milestones.
 */
function StepAmount({ formData, setFormData, errors, onAdd, onRemove, onUpdate }) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Amount</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="token" className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
            Token
          </label>
          <select
            id="token"
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white"
            value={formData.tokenAddress}
            onChange={(e) => setFormData((d) => ({ ...d, tokenAddress: e.target.value }))}
          >
            <option value="usdc">USDC</option>
            <option value="xlm">XLM</option>
            <option value="custom">Custom…</option>
          </select>
        </div>
        <div>
          <label htmlFor="total-amount" className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
            Total Amount <span className="text-red-500">*</span>
          </label>
          <XLMAmountInput
            id="total-amount"
            value={formData.totalAmount}
            onChange={(e) => setFormData((d) => ({ ...d, totalAmount: e.target.value }))}
            error={errors.totalAmount}
            errorId="total-amount-error"
          />
          <FieldError id="total-amount-error" message={errors.totalAmount} />
        </div>
      </div>

      {/* Milestones */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Milestones</h3>
          <span className="text-sm text-gray-500">
            Total: {formData.milestones.reduce((s, m) => s + Number(m.amount || 0), 0)} /{' '}
            {formData.totalAmount || '—'} {String(formData.tokenAddress || 'USDC').toUpperCase()}
          </span>
        </div>

        {formData.milestones.map((milestone, index) => (
          <div key={index} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Milestone {index + 1}
              </span>
              {formData.milestones.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="text-red-500 text-sm hover:text-red-400 min-h-[44px] px-2"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="Title (e.g. Initial Design Mockups)"
              aria-label={`Milestone ${index + 1} title`}
              className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
                text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
              value={milestone.title}
              onChange={(e) => onUpdate(index, 'title', e.target.value)}
            />
            <textarea
              rows={2}
              placeholder="Milestone description"
              aria-label={`Milestone ${index + 1} description`}
              className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
                text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
              value={milestone.description}
              onChange={(e) => onUpdate(index, 'description', e.target.value)}
            />
            <div className="flex gap-2 items-center">
              <XLMAmountInput
                value={milestone.amount}
                placeholder="Amount"
                aria-label={`Milestone ${index + 1} amount`}
                onChange={(e) => onUpdate(index, 'amount', e.target.value)}
                className="w-32"
                inputClassName="w-32"
              />
              <span className="text-gray-500 text-sm">
                {String(formData.tokenAddress || 'USDC').toUpperCase()}
              </span>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={onAdd}
          className="w-full border border-dashed border-gray-300 dark:border-gray-700 rounded-lg py-3
            text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600 text-sm transition-colors min-h-[44px]"
        >
          + Add Milestone
        </button>
      </div>
    </div>
  );
}

/**
 * Step 4: Review — full summary before signing.
 */
function StepReview({ formData, buyerAddress }) {
  const token = String(formData.tokenAddress || 'USDC').toUpperCase();
  const milestoneTotal = formData.milestones.reduce((s, m) => s + Number(m.amount || 0), 0);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Review Details</h2>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm space-y-3">
        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Parties
          </p>
          <p className="text-gray-600 dark:text-gray-400">
            Buyer: <span className="text-gray-900 dark:text-white font-mono">{buyerAddress || '—'}</span>
          </p>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Seller:{' '}
            <span className="text-gray-900 dark:text-white font-mono">
              {formData.sellerAddress || '—'}
            </span>
          </p>
        </section>

        <hr className="border-gray-200 dark:border-gray-700" />

        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Terms</p>
          <p className="text-gray-600 dark:text-gray-400">
            Description:{' '}
            <span className="text-gray-900 dark:text-white">
              {formData.briefDescription || '—'}
            </span>
          </p>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Deadline: <span className="text-gray-900 dark:text-white">{formData.deadline || '—'}</span>
          </p>
        </section>

        <hr className="border-gray-200 dark:border-gray-700" />

        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Amount
          </p>
          <p className="text-gray-600 dark:text-gray-400">
            Total:{' '}
            <span className="text-gray-900 dark:text-white font-semibold">
              {formData.totalAmount || '—'} {token}
            </span>
          </p>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Milestones:{' '}
            <span className="text-gray-900 dark:text-white">{formData.milestones.length}</span>
            {milestoneTotal > 0 && (
              <span className="text-gray-500 ml-1">
                ({milestoneTotal} {token} allocated)
              </span>
            )}
          </p>
          {formData.milestones.some((m) => m.title) && (
            <ul className="mt-2 space-y-1 pl-4">
              {formData.milestones
                .filter((m) => m.title)
                .map((m, i) => (
                  <li key={i} className="text-gray-500 text-xs">
                    {m.title} — {m.amount || '0'} {token}
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-xs text-gray-500">
        ⚠️ By proceeding, you authorize locking{' '}
        <strong className="text-gray-900 dark:text-white">
          {formData.totalAmount || '0'} {token}
        </strong>{' '}
        in the escrow contract. This action cannot be undone without mutual agreement.
      </p>
    </div>
  );
}

/**
 * Step 5: Confirm & Sign with Freighter.
 */
function StepConfirm({ error }) {
  return (
    <div className="space-y-4 text-center">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Confirm & Sign</h2>
      <p className="text-gray-600 dark:text-gray-400 text-sm">
        Clicking the button below will open your Freighter wallet to sign the transaction. Your
        funds will be locked on-chain once confirmed.
      </p>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
      <p className="text-xs text-amber-600 dark:text-amber-400">
        🚧 Freighter integration is not yet implemented — see Issue #33
      </p>
    </div>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
