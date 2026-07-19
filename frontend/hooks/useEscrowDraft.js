import { useReducer, useEffect } from 'react';

const STORAGE_KEY = 'escrow-draft';

const initialState = {
  step: 1,
  counterparty: '',
  arbiter: '',
  milestones: [{ description: '', amount: '' }],
  deadline: '',
  timelock: false,
  sequential: false,
  terms: '',
  termsHash: '',
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'ADD_MILESTONE':
      if (state.milestones.length >= 10) return state;
      return { ...state, milestones: [...state.milestones, { description: '', amount: '' }] };
    case 'REMOVE_MILESTONE':
      if (state.milestones.length <= 1) return state;
      return { ...state, milestones: state.milestones.filter((_, i) => i !== action.index) };
    case 'UPDATE_MILESTONE':
      return {
        ...state,
        milestones: state.milestones.map((m, i) =>
          i === action.index ? { ...m, [action.field]: action.value } : m
        ),
      };
    case 'REORDER_MILESTONES':
      const reordered = [...state.milestones];
      const [removed] = reordered.splice(action.from, 1);
      reordered.splice(action.to, 0, removed);
      return { ...state, milestones: reordered };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function useEscrowDraft() {
  const [draft, dispatch] = useReducer(reducer, initialState, (initial) => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...initial, ...parsed };
      }
    } catch (e) {
      // ignore parse errors
    }
    return initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (e) {
      // ignore storage full
    }
  }, [draft]);

  const milestonesTotal = draft.milestones.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
  const isValidStep1 = draft.counterparty.length > 0 && draft.arbiter.length > 0;
  const isValidStep2 = draft.milestones.length >= 1 && draft.milestones.every(m => m.description && parseFloat(m.amount) > 0);
  const isValidStep3 = draft.deadline.length > 0;

  return { draft, dispatch, milestonesTotal, isValidStep1, isValidStep2, isValidStep3 };
}

export function validateStellarAddress(address) {
  return /^G[A-Z2-7]{55}$/.test(address);
}

export async function computeSHA256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
