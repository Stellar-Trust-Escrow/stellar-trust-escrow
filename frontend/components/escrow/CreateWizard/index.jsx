import React from 'react';
import { useEscrowDraft, validateStellarAddress, computeSHA256 } from '../../../hooks/useEscrowDraft';

const STEPS = ['Parties', 'Milestones', 'Terms & Timelock', 'Review & Sign'];

export default function CreateWizard() {
  const { draft, dispatch, milestonesTotal, isValidStep1, isValidStep2, isValidStep3 } = useEscrowDraft();

  const nextStep = () => draft.step < 4 && dispatch({ type: 'SET_STEP', step: draft.step + 1 });
  const prevStep = () => draft.step > 1 && dispatch({ type: 'SET_STEP', step: draft.step - 1 });

  const handleTermsChange = async (value) => {
    dispatch({ type: 'SET_FIELD', field: 'terms', value });
    if (value) {
      const hash = await computeSHA256(value);
      dispatch({ type: 'SET_FIELD', field: 'termsHash', value: hash });
    }
  };

  return (
    <div className="create-wizard" role="region" aria-label="Escrow Creation Wizard">
      <div className="wizard-progress" aria-live="polite">
        {STEPS.map((label, i) => (
          <div key={i} className={wizard-step  }>
            <span className="step-number">{i + 1}</span>
            <span className="step-label">{label}</span>
          </div>
        ))}
      </div>

      {draft.step === 1 && (
        <fieldset>
          <legend>Step 1: Parties</legend>
          <label htmlFor="counterparty">Counterparty Stellar Address</label>
          <input id="counterparty" value={draft.counterparty} onChange={e => dispatch({ type: 'SET_FIELD', field: 'counterparty', value: e.target.value })} placeholder="G..." />
          <label htmlFor="arbiter">Arbiter Address</label>
          <input id="arbiter" value={draft.arbiter} onChange={e => dispatch({ type: 'SET_FIELD', field: 'arbiter', value: e.target.value })} placeholder="G..." />
        </fieldset>
      )}

      {draft.step === 2 && (
        <fieldset>
          <legend>Step 2: Milestones</legend>
          {draft.milestones.map((m, i) => (
            <div key={i} className="milestone-row">
              <input aria-label={Milestone  description} value={m.description} onChange={e => dispatch({ type: 'UPDATE_MILESTONE', index: i, field: 'description', value: e.target.value })} placeholder="Description" />
              <input aria-label={Milestone  amount} type="number" value={m.amount} onChange={e => dispatch({ type: 'UPDATE_MILESTONE', index: i, field: 'amount', value: e.target.value })} placeholder="Amount (XLM)" />
              {draft.milestones.length > 1 && <button type="button" onClick={() => dispatch({ type: 'REMOVE_MILESTONE', index: i })} aria-label={Remove milestone }>Remove</button>}
            </div>
          ))}
          {draft.milestones.length < 10 && <button type="button" onClick={() => dispatch({ type: 'ADD_MILESTONE' })}>+ Add Milestone</button>}
          <p>Total: {milestonesTotal} XLM</p>
        </fieldset>
      )}

      {draft.step === 3 && (
        <fieldset>
          <legend>Step 3: Terms & Timelock</legend>
          <label htmlFor="deadline">Deadline</label>
          <input id="deadline" type="date" value={draft.deadline} onChange={e => dispatch({ type: 'SET_FIELD', field: 'deadline', value: e.target.value })} min={new Date(Date.now() + 86400000).toISOString().split('T')[0]} />
          <label><input type="checkbox" checked={draft.timelock} onChange={e => dispatch({ type: 'SET_FIELD', field: 'timelock', value: e.target.checked })} /> Enable Timelock</label>
          <label><input type="checkbox" checked={draft.sequential} onChange={e => dispatch({ type: 'SET_FIELD', field: 'sequential', value: e.target.checked })} /> Sequential Milestones</label>
          <label htmlFor="terms">Terms</label>
          <textarea id="terms" value={draft.terms} onChange={e => handleTermsChange(e.target.value)} />
          {draft.termsHash && <p>SHA-256: {draft.termsHash}</p>}
        </fieldset>
      )}

      {draft.step === 4 && (
        <div>
          <h3>Review & Sign</h3>
          <p><strong>Counterparty:</strong> {draft.counterparty}</p>
          <p><strong>Arbiter:</strong> {draft.arbiter}</p>
          <p><strong>Milestones:</strong> {draft.milestones.length} ({milestonesTotal} XLM)</p>
          <p><strong>Deadline:</strong> {draft.deadline}</p>
          <p><strong>Timelock:</strong> {draft.timelock ? 'Yes' : 'No'}</p>
          <button type="button" onClick={() => alert('Transaction would be signed via Freighter')}>Sign & Create</button>
        </div>
      )}

      <div className="wizard-nav">
        {draft.step > 1 && <button type="button" onClick={prevStep}>Back</button>}
        {draft.step < 4 && <button type="button" onClick={nextStep} disabled={draft.step === 1 ? !isValidStep1 : draft.step === 2 ? !isValidStep2 : !isValidStep3}>Next</button>}
      </div>
    </div>
  );
}
