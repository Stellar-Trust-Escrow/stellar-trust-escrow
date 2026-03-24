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
 * - Implement multi-step form state management
 * - Step 1: validate Stellar address format (G..., 56 chars)
 * - Step 1: token selector (USDC, XLM, custom)
 * - Step 2: add/remove milestones dynamically
 * - Step 2: validate milestone amounts sum <= total_amount
 * - Step 3: show summary with gas estimate
 * - Step 4: build Soroban transaction with stellar-sdk
 * - Step 4: invoke Freighter signTransaction()
 * - Step 4: POST signed XDR to /api/escrows/broadcast
 * - On success: redirect to /escrow/[id]
 */



'use client';

import { useState } from 'react';
import Button from '../../../components/ui/Button';

const STEPS = [
  { id: 1, label: 'Counterparty' },
  { id: 2, label: 'Milestones' },
  { id: 3, label: 'Review' },
  { id: 4, label: 'Sign' },
];

export default function CreateEscrowPage() {
  // TODO (contributor): lift this into a useCreateEscrow() custom hook
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    freelancerAddress: '',
    tokenAddress: '',
    totalAmount: '',
    briefDescription: '',
    deadline: '',
    milestones: [{ title: '', description: '', amount: '' }],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

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
    // TODO (contributor): append empty milestone to formData.milestones
  };

  const removeMilestone = (_index) => {
    // TODO (contributor): remove milestone at index
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Create New Escrow</h1>
        <p className="text-gray-400 mt-1">Lock funds and define milestones for your project.</p>
      </div>

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
            setFormData={setFormData}
            onAdd={addMilestone}
            onRemove={removeMilestone}
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
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
          disabled={currentStep === 1}
        >
          Back
        </Button>
        {currentStep < 4 ? (
          <Button variant="primary" onClick={() => setCurrentStep((s) => s + 1)}>
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
 * TODO (contributor — Issue #33): wire up form fields to formData state
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
          onChange={(e) => setFormData((d) => ({ ...d, freelancerAddress: e.target.value }))}
        />
        {/* TODO (contributor): add validation error display */}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Token</label>
          {/* TODO (contributor — Issue #33): implement token selector dropdown */}
          <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white">
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
            onChange={(e) => setFormData((d) => ({ ...d, totalAmount: e.target.value }))}
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
          onChange={(e) => setFormData((d) => ({ ...d, briefDescription: e.target.value }))}
        />
        {/* TODO (contributor): upload to IPFS and store hash */}
      </div>
    </div>
  );
}

/**
 * Step 2: Define milestones.
 * TODO (contributor — Issue #33): implement add/remove and validate amounts
 */
function StepMilestones({ formData, setFormData: _setFormData, onAdd, onRemove }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Milestones</h2>
        <span className="text-sm text-gray-500">
          Total: {formData.milestones.reduce((s, m) => s + Number(m.amount || 0), 0)} /{' '}
          {formData.totalAmount || '—'}
        </span>
      </div>

      {formData.milestones.map((m, i) => (
        <div key={i} className="bg-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">Milestone {i + 1}</span>
            {formData.milestones.length > 1 && (
              <button
                onClick={() => onRemove(i)}
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
            value={m.title}
            onChange={(_e) => {
              // TODO (contributor): update milestone at index i
            }}
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount"
              className="w-32 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2
                         text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
              value={m.amount}
              onChange={(_e) => {
                // TODO (contributor): update amount at index i
              }}
            />
            <span className="text-gray-500 text-sm self-center">USDC</span>
          </div>
        </div>
      ))}

      <button
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
 * TODO (contributor — Issue #33): display formData as a read-only summary
 */
function StepReview({ formData }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Review Details</h2>
      <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-400 space-y-2">
        <p>
          Freelancer: <span className="text-white">{formData.freelancerAddress || '—'}</span>
        </p>
        <p>
          Total Amount: <span className="text-white">{formData.totalAmount || '—'} USDC</span>
        </p>
        <p>
          Milestones: <span className="text-white">{formData.milestones.length}</span>
        </p>
      </div>
      <p className="text-xs text-gray-500">
        ⚠️ By proceeding, you authorize locking{' '}
        <strong className="text-white">{formData.totalAmount} USDC</strong> in the escrow contract.
        This action cannot be undone without mutual agreement.
      </p>
    </div>
  );
}

/**
 * Step 4: Sign with Freighter.
 * TODO (contributor — Issue #33): build and sign the Soroban transaction
 */
function StepSign({ onSubmit: _onSubmit, isSubmitting: _isSubmitting, error }) {
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
