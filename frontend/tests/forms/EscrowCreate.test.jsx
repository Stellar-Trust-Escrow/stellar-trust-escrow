/**
 * Comprehensive form validation tests for the Create Escrow page (5-step wizard).
 *
 * Steps:
 *   1. Parties   — buyer (read-only) + seller address
 *   2. Terms     — description + deadline
 *   3. Amount    — token, total, milestones
 *   4. Review    — summary
 *   5. Confirm   — sign & submit
 */

import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import CreateEscrowPage from '../../app/escrow/create/page';
import { ToastProvider } from '../../contexts/ToastContext';
import { useSearchParams } from 'next/navigation';

expect.extend(toHaveNoViolations);

function renderPage() {
  return render(
    <ToastProvider>
      <CreateEscrowPage />
    </ToastProvider>,
  );
}

/** Advance the wizard by n steps (without validation). */
function advanceSteps(n) {
  for (let i = 0; i < n; i++) {
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
  }
}

/** Fill Step 1 with a valid seller address so Next can advance. */
const VALID_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function fillStep1(address = VALID_ADDRESS) {
  fireEvent.change(screen.getByPlaceholderText('GABCD1234...'), { target: { value: address } });
}

/** Fill Step 2 with valid description + deadline. */
function fillStep2() {
  fireEvent.change(screen.getByPlaceholderText(/Describe the project/i), {
    target: { value: 'Build a decentralized escrow platform with milestones.' },
  });
  // Set deadline to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const iso = tomorrow.toISOString().slice(0, 10);
  fireEvent.change(screen.getByLabelText(/Deadline/i), { target: { value: iso } });
}

beforeEach(() => {
  useSearchParams.mockReturnValue(new URLSearchParams());
  localStorage.clear();
});

// ── 1. Step navigation ────────────────────────────────────────────────────────

describe('Step navigation', () => {
  it('starts on step 1', () => {
    renderPage();
    expect(screen.getByText('Parties')).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
  });

  it('Back button is disabled on step 1', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('shows step 2 label in progress indicator', () => {
    renderPage();
    expect(screen.getByText('Terms')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('advancing without seller address shows validation error', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText(/Seller address is required/i)).toBeInTheDocument();
    // Still on step 1
    expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
  });

  it('advances to step 2 with valid seller address', () => {
    renderPage();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText(/Step 2 of 5/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Project Description/i)).toBeInTheDocument();
  });

  it('step 2 validates description and deadline', () => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument();
  });

  it('advances through all 5 steps with valid data', () => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    fillStep2();
    advanceSteps(1);
    // Step 3: fill amount
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } });
    advanceSteps(1);
    // Step 4: Review
    expect(screen.getByText(/Step 4 of 5/i)).toBeInTheDocument();
    expect(screen.getByText('Review Details')).toBeInTheDocument();
    advanceSteps(1);
    // Step 5: Confirm
    expect(screen.getByText(/Step 5 of 5/i)).toBeInTheDocument();
    expect(screen.getByText('Confirm & Sign')).toBeInTheDocument();
  });

  it('Back returns to the previous step', () => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    expect(screen.getByText(/Step 2 of 5/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
  });

  it('shows Sign & Create Escrow button only on step 5', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /Sign & Create Escrow/i })).not.toBeInTheDocument();
    // Get to step 5 with valid data
    fillStep1();
    advanceSteps(1);
    fillStep2();
    advanceSteps(1);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } });
    advanceSteps(2);
    expect(screen.getByRole('button', { name: /Sign & Create Escrow/i })).toBeInTheDocument();
  });

  it('step indicator shows completed steps', () => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    expect(screen.getByText(/Step 2 of 5/i)).toBeInTheDocument();
  });
});

// ── 2. Step 1 — Parties ───────────────────────────────────────────────────────

describe('Step 1 — Parties', () => {
  it('renders heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: /Parties/i })).toBeInTheDocument();
  });

  it('shows buyer address read-only input', () => {
    renderPage();
    expect(screen.getByLabelText(/Buyer Stellar Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Buyer Stellar Address/i)).toHaveAttribute('readOnly');
  });

  it('renders seller address input with placeholder', () => {
    renderPage();
    expect(screen.getByPlaceholderText('GABCD1234...')).toBeInTheDocument();
  });

  it('accepts a valid Stellar address', () => {
    renderPage();
    const input = screen.getByPlaceholderText('GABCD1234...');
    fireEvent.change(input, { target: { value: VALID_ADDRESS } });
    expect(input).toHaveValue(VALID_ADDRESS);
  });

  it('shows error for empty seller address on Next', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText(/Seller address is required/i)).toBeInTheDocument();
  });

  it('clears error when valid address is entered and Next retried', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.queryByText(/Seller address is required/i)).not.toBeInTheDocument();
  });

  it('handles whitespace-only input', () => {
    renderPage();
    const input = screen.getByPlaceholderText('GABCD1234...');
    fireEvent.change(input, { target: { value: '   ' } });
    expect(input).toHaveValue('');
  });
});

// ── 3. Step 2 — Terms ─────────────────────────────────────────────────────────

describe('Step 2 — Terms', () => {
  beforeEach(() => {
    renderPage();
    fillStep1();
    advanceSteps(1);
  });

  it('renders heading', () => {
    expect(screen.getByRole('heading', { level: 2, name: /Terms/i })).toBeInTheDocument();
  });

  it('renders description textarea', () => {
    expect(screen.getByPlaceholderText(/Describe the project/i)).toBeInTheDocument();
  });

  it('renders deadline input', () => {
    expect(screen.getByLabelText(/Deadline/i)).toBeInTheDocument();
  });

  it('shows error when description is too short', () => {
    fireEvent.change(screen.getByPlaceholderText(/Describe the project/i), {
      target: { value: 'Short' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument();
  });

  it('shows error when deadline is missing', () => {
    fireEvent.change(screen.getByPlaceholderText(/Describe the project/i), {
      target: { value: 'Valid description with enough chars.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText(/Deadline is required/i)).toBeInTheDocument();
  });

  it('advances with valid description and future deadline', () => {
    fillStep2();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText(/Step 3 of 5/i)).toBeInTheDocument();
  });
});

// ── 4. Step 3 — Amount ────────────────────────────────────────────────────────

describe('Step 3 — Amount', () => {
  beforeEach(() => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    fillStep2();
    advanceSteps(1);
  });

  it('renders heading', () => {
    expect(screen.getByRole('heading', { level: 2, name: /Amount/i })).toBeInTheDocument();
  });

  it('renders token selector defaulting to USDC', () => {
    const selects = screen.getAllByRole('combobox');
    const tokenSelect = selects.find((s) => within(s).queryByText('USDC'));
    expect(tokenSelect).toHaveValue('usdc');
  });

  it('renders total amount input', () => {
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
  });

  it('shows validation error when amount is empty on Next', () => {
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByText(/Amount must be a positive number/i)).toBeInTheDocument();
  });

  it('starts with one milestone', () => {
    expect(screen.getByText('Milestone 1')).toBeInTheDocument();
    expect(screen.queryByText('Milestone 2')).not.toBeInTheDocument();
  });

  it('does not show Remove button when only one milestone exists', () => {
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument();
  });

  it('adds a second milestone', () => {
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    expect(screen.getByText('Milestone 2')).toBeInTheDocument();
  });

  it('removes a milestone', () => {
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /Remove/i })[1]);
    expect(screen.queryByText('Milestone 2')).not.toBeInTheDocument();
  });

  it('never removes the last milestone', () => {
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /Remove/i })[0]);
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument();
    expect(screen.getByText('Milestone 1')).toBeInTheDocument();
  });

  it('shows running total', () => {
    const amountInput = screen.getByPlaceholderText('Amount');
    fireEvent.change(amountInput, { target: { value: '300' } });
    expect(screen.getByText(/300\s*\/\s*—/)).toBeInTheDocument();
  });

  it('sums multiple milestone amounts', () => {
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    const amounts = screen.getAllByPlaceholderText('Amount');
    fireEvent.change(amounts[0], { target: { value: '400' } });
    fireEvent.change(amounts[1], { target: { value: '600' } });
    expect(screen.getByText(/1000\s*\/\s*—/)).toBeInTheDocument();
  });

  it('shows USDC token label', () => {
    expect(screen.getAllByText('USDC').length).toBeGreaterThan(0);
  });
});

// ── 5. Step 4 — Review ────────────────────────────────────────────────────────

describe('Step 4 — Review', () => {
  const SELLER = VALID_ADDRESS;

  function goToReview() {
    renderPage();
    fillStep1(SELLER);
    advanceSteps(1);
    fillStep2();
    advanceSteps(1);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '2500' } });
    advanceSteps(1);
  }

  it('renders Review Details heading', () => {
    goToReview();
    expect(screen.getByRole('heading', { level: 2, name: /Review Details/i })).toBeInTheDocument();
  });

  it('shows seller address', () => {
    goToReview();
    expect(screen.getByText(SELLER)).toBeInTheDocument();
  });

  it('shows total amount', () => {
    goToReview();
    expect(screen.getByText(/2500/)).toBeInTheDocument();
  });

  it('shows milestone count', () => {
    goToReview();
    expect(screen.getByText(/Milestones:/i).closest('p')).toHaveTextContent('1');
  });

  it('shows lock-funds warning', () => {
    goToReview();
    expect(screen.getByText(/authorize locking/i)).toBeInTheDocument();
  });

  it('shows token in lock warning', () => {
    goToReview();
    expect(screen.getByText(/authorize locking/i).closest('p')).toHaveTextContent('USDC');
  });
});

// ── 6. Step 5 — Confirm ───────────────────────────────────────────────────────

describe('Step 5 — Confirm', () => {
  function goToConfirm() {
    renderPage();
    fillStep1();
    advanceSteps(1);
    fillStep2();
    advanceSteps(1);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } });
    advanceSteps(2);
  }

  it('renders Confirm & Sign heading', () => {
    goToConfirm();
    expect(screen.getByRole('heading', { level: 2, name: /Confirm & Sign/i })).toBeInTheDocument();
  });

  it('renders Freighter description', () => {
    goToConfirm();
    expect(screen.getByText(/Freighter wallet/i)).toBeInTheDocument();
  });

  it('renders not-implemented notice', () => {
    goToConfirm();
    expect(screen.getByText(/Issue #33/i)).toBeInTheDocument();
  });

  it('Sign & Create Escrow button is present', () => {
    goToConfirm();
    expect(screen.getByRole('button', { name: /Sign & Create Escrow/i })).toBeInTheDocument();
  });
});

// ── 7. Template pre-fill ──────────────────────────────────────────────────────

describe('Template pre-fill', () => {
  it('pre-fills total amount from a selected template', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Use This Template' }));
    expect(screen.getByDisplayValue('4800')).toBeInTheDocument();
  });

  it('shows a template-applied notice', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Use This Template' }));
    expect(screen.getByText(/Applied template:/i)).toBeInTheDocument();
  });

  it('pre-fills milestones from a template', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Use This Template' }));
    fillStep1();
    advanceSteps(1);
    fillStep2();
    advanceSteps(1);
    expect(screen.getByText('Milestone 3')).toBeInTheDocument();
  });

  it('applies template from query param on mount', () => {
    useSearchParams.mockReturnValue(new URLSearchParams('template=retainer-monthly-support'));
    renderPage();
    expect(screen.getByDisplayValue('5000')).toBeInTheDocument();
    expect(screen.getByText('Applied template: Monthly Retainer Support')).toBeInTheDocument();
  });

  it('ignores unknown template query param', () => {
    useSearchParams.mockReturnValue(new URLSearchParams('template=does-not-exist'));
    renderPage();
    expect(screen.queryByText(/Applied template:/i)).not.toBeInTheDocument();
  });

  it('does not re-apply the same query param template on re-render', () => {
    useSearchParams.mockReturnValue(new URLSearchParams('template=retainer-monthly-support'));
    const { rerender } = renderPage();
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '9999' } });
    rerender(
      <ToastProvider>
        <CreateEscrowPage />
      </ToastProvider>,
    );
    expect(screen.getByDisplayValue('9999')).toBeInTheDocument();
  });
});

// ── 8. State preservation ─────────────────────────────────────────────────────

describe('State preservation', () => {
  it('preserves step 1 data when navigating forward and back', () => {
    renderPage();
    fillStep1(VALID_ADDRESS);
    advanceSteps(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByPlaceholderText('GABCD1234...')).toHaveValue(VALID_ADDRESS);
  });

  it('preserves step 2 data when navigating back', () => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    const description = 'This is my project description for the escrow.';
    fireEvent.change(screen.getByPlaceholderText(/Describe the project/i), {
      target: { value: description },
    });
    fillStep2();
    advanceSteps(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByPlaceholderText(/Describe the project/i)).toHaveValue(description);
  });

  it('preserves milestone data when navigating back', () => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    fillStep2();
    advanceSteps(1);
    fireEvent.change(screen.getByPlaceholderText(/Title \(e\.g\./i), {
      target: { value: 'My Milestone' },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } });
    advanceSteps(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByPlaceholderText(/Title \(e\.g\./i)).toHaveValue('My Milestone');
  });
});

// ── 9. Edge cases ─────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('renders without crashing', () => {
    renderPage();
    expect(screen.getByText(/Create New Escrow/i)).toBeInTheDocument();
  });

  it('milestone total shows 0 when no amounts entered', () => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    fillStep2();
    advanceSteps(1);
    expect(screen.getByText(/Total:\s*0\s*\/\s*—\s*USDC/i)).toBeInTheDocument();
  });

  it('handles very large total amount', () => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    fillStep2();
    advanceSteps(1);
    const input = screen.getByPlaceholderText('0.00');
    fireEvent.change(input, { target: { value: '999999999' } });
    expect(input).toHaveValue(999999999);
  });

  it('handles unicode in description', () => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    const textarea = screen.getByPlaceholderText(/Describe the project/i);
    fireEvent.change(textarea, { target: { value: '日本語テスト 🚀 with enough length here' } });
    expect(textarea).toHaveValue('日本語テスト 🚀 with enough length here');
  });

  it('milestone amount total stays correct after removing a milestone', () => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    fillStep2();
    advanceSteps(1);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    const amounts = screen.getAllByPlaceholderText('Amount');
    fireEvent.change(amounts[0], { target: { value: '300' } });
    fireEvent.change(amounts[1], { target: { value: '700' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Remove/i })[1]);
    expect(screen.getByText(/300\s*\/\s*—/)).toBeInTheDocument();
  });
});

// ── 10. Accessibility ─────────────────────────────────────────────────────────

describe('Accessibility', () => {
  it('page heading is an h1', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: /Create New Escrow/i }),
    ).toBeInTheDocument();
  });

  it('step 1 heading is h2', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: /Parties/i })).toBeInTheDocument();
  });

  it('navigation buttons have accessible names', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
  });

  it('step 1 has no axe violations', async () => {
    const { container } = renderPage();
    const results = await axe(container, {
      rules: { 'nested-interactive': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it('step 2 heading is h2', () => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    expect(screen.getByRole('heading', { level: 2, name: /Terms/i })).toBeInTheDocument();
  });

  it('step 3 heading is h2', () => {
    renderPage();
    fillStep1();
    advanceSteps(1);
    fillStep2();
    advanceSteps(1);
    expect(screen.getByRole('heading', { level: 2, name: /Amount/i })).toBeInTheDocument();
  });
});
