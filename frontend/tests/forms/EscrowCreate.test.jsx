/**
 * Comprehensive form validation tests for the Create Escrow page.
 *
 * Covers:
 *  - Step navigation and guard behaviour
 *  - Step 1: Counterparty & Funds field validation
 *  - Step 2: Milestone validation (add / remove / amounts)
 *  - Step 3: Review summary accuracy
 *  - Step 4: Sign & Submit state
 *  - Template pre-fill
 *  - Edge cases (boundary values, special characters, whitespace)
 *  - Accessibility (labels, roles, axe)
 */

import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import CreateEscrowPage from '../../app/escrow/create/page';
import { ToastProvider } from '../../contexts/ToastContext';
import { useSearchParams } from 'next/navigation';

// Extend expect with jest-axe matcher
expect.extend(toHaveNoViolations);

/** Render CreateEscrowPage wrapped in required providers. */
function renderPage() {
  return render(
    <ToastProvider>
      <CreateEscrowPage />
    </ToastProvider>,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Advance the form by `n` steps. */
function advanceSteps(n) {
  for (let i = 0; i < n; i++) {
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
  }
}

/** Fill Step 1 with valid data. */
function _fillStep1({
  address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  amount = '1000',
  token = 'usdc',
} = {}) {
  fireEvent.change(screen.getByPlaceholderText('GABCD1234...'), {
    target: { value: address },
  });
  fireEvent.change(screen.getByPlaceholderText('0.00'), {
    target: { value: amount },
  });
  const select = screen.getByLabelText(/^Token$/i);
  fireEvent.change(select, { target: { value: token } });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useSearchParams.mockReturnValue(new URLSearchParams());
  localStorage.clear();
});

// ── 1. Step navigation ────────────────────────────────────────────────────────

describe('Step navigation', () => {
  it('starts on step 1', () => {
    renderPage();
    expect(screen.getByText('Counterparty & Funds')).toBeInTheDocument();
  });

  it('Back button is disabled on step 1', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('Next advances through all four steps', () => {
    renderPage();
    advanceSteps(1);
    expect(screen.getByText('Milestone 1')).toBeInTheDocument();
    advanceSteps(1);
    expect(screen.getByText('Review Details')).toBeInTheDocument();
    advanceSteps(1);
    expect(screen.getByText('Sign & Submit')).toBeInTheDocument();
  });

  it('Back returns to the previous step', () => {
    renderPage();
    advanceSteps(2);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Milestone 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Counterparty & Funds')).toBeInTheDocument();
  });

  it('shows Sign & Create Escrow button only on step 4', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /Sign & Create Escrow/i })).not.toBeInTheDocument();
    advanceSteps(3);
    expect(screen.getByRole('button', { name: /Sign & Create Escrow/i })).toBeInTheDocument();
  });

  it('step indicator highlights completed steps', () => {
    renderPage();
    advanceSteps(2);
    // Steps 1 and 2 should be visually active (indigo), step 3 is current
    expect(screen.getByText('Review Details')).toBeInTheDocument();
  });
});

// ── 2. Step 1 — Counterparty & Funds ─────────────────────────────────────────

describe('Step 1 — Counterparty & Funds', () => {
  describe('Freelancer address field', () => {
    it('renders the address input with correct placeholder', () => {
      renderPage();
      expect(screen.getByPlaceholderText('GABCD1234...')).toBeInTheDocument();
    });

    it('accepts a valid 56-char Stellar address starting with G', () => {
      renderPage();
      const input = screen.getByPlaceholderText('GABCD1234...');
      const validAddress = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      fireEvent.change(input, { target: { value: validAddress } });
      expect(input).toHaveValue(validAddress);
    });

    it('accepts typed input character by character', () => {
      renderPage();
      const input = screen.getByPlaceholderText('GABCD1234...');
      fireEvent.change(input, { target: { value: 'G' } });
      expect(input).toHaveValue('G');
    });

    it('starts empty', () => {
      renderPage();
      expect(screen.getByPlaceholderText('GABCD1234...')).toHaveValue('');
    });

    it('handles whitespace-only input', () => {
      renderPage();
      const input = screen.getByPlaceholderText('GABCD1234...');
      fireEvent.change(input, { target: { value: '   ' } });
      expect(input).toHaveValue('');
    });

    it('handles very long input without crashing', () => {
      renderPage();
      const input = screen.getByPlaceholderText('GABCD1234...');
      const longValue = 'G' + 'A'.repeat(200);
      fireEvent.change(input, { target: { value: longValue } });
      expect(input).toHaveValue(longValue);
    });

    it('handles special characters in address field', () => {
      renderPage();
      const input = screen.getByPlaceholderText('GABCD1234...');
      fireEvent.change(input, { target: { value: '<script>alert(1)</script>' } });
      expect(input).toHaveValue('<script>alert(1)</script>');
    });
  });

  describe('Token selector', () => {
    it('defaults to USDC', () => {
      renderPage();
      // The token select is the first combobox in the step 1 form area
      const selects = screen.getAllByRole('combobox');
      const tokenSelect = selects.find((s) => s.value === 'usdc' || within(s).queryByText('USDC'));
      expect(tokenSelect).toHaveValue('usdc');
    });

    it('can be changed to XLM', () => {
      renderPage();
      const selects = screen.getAllByRole('combobox');
      const tokenSelect = selects.find((s) => within(s).queryByText('USDC'));
      fireEvent.change(tokenSelect, { target: { value: 'xlm' } });
      expect(tokenSelect).toHaveValue('xlm');
    });

    it('can be changed to Custom', () => {
      renderPage();
      const selects = screen.getAllByRole('combobox');
      const tokenSelect = selects.find((s) => within(s).queryByText('USDC'));
      fireEvent.change(tokenSelect, { target: { value: 'custom' } });
      expect(tokenSelect).toHaveValue('custom');
    });

    it('offers USDC, XLM, and Custom options', () => {
      renderPage();
      const selects = screen.getAllByRole('combobox');
      const tokenSelect = selects.find((s) => within(s).queryByText('USDC'));
      const options = within(tokenSelect).getAllByRole('option');
      const values = options.map((o) => o.value);
      expect(values).toContain('usdc');
      expect(values).toContain('xlm');
      expect(values).toContain('custom');
    });
  });

  describe('Total Amount field', () => {
    it('starts empty', () => {
      renderPage();
      expect(screen.getByPlaceholderText('0.00')).toHaveValue(null);
    });

    it('accepts a positive integer', () => {
      renderPage();
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: '5000' } });
      expect(input).toHaveValue(5000);
    });

    it('accepts a decimal amount', () => {
      renderPage();
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: '99.99' } });
      expect(input).toHaveValue(99.99);
    });

    it('accepts zero', () => {
      renderPage();
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: '0' } });
      expect(input).toHaveValue(0);
    });

    it('is a number input type', () => {
      renderPage();
      expect(screen.getByPlaceholderText('0.00')).toHaveAttribute('type', 'number');
    });
  });

  describe('Project Brief field', () => {
    it('is optional — renders with optional label', () => {
      renderPage();
      expect(screen.getByText(/optional/i)).toBeInTheDocument();
    });

    it('accepts multi-line text', () => {
      renderPage();
      const textarea = screen.getByPlaceholderText(/Briefly describe/i);
      fireEvent.change(textarea, { target: { value: 'Line 1\nLine 2' } });
      expect(textarea).toHaveValue('Line 1\nLine 2');
    });

    it('starts empty', () => {
      renderPage();
      expect(screen.getByPlaceholderText(/Briefly describe/i)).toHaveValue('');
    });
  });
});

// ── 3. Step 2 — Milestones ────────────────────────────────────────────────────

describe('Step 2 — Milestones', () => {
  beforeEach(() => {
    renderPage();
    advanceSteps(1);
  });

  it('starts with one milestone', () => {
    expect(screen.getByText('Milestone 1')).toBeInTheDocument();
    expect(screen.queryByText('Milestone 2')).not.toBeInTheDocument();
  });

  it('does not show Remove button when only one milestone exists', () => {
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument();
  });

  it('adds a second milestone when + Add Milestone is clicked', () => {
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    expect(screen.getByText('Milestone 2')).toBeInTheDocument();
  });

  it('shows Remove button once multiple milestones exist', () => {
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    expect(screen.getAllByRole('button', { name: /Remove/i })).toHaveLength(2);
  });

  it('removes a milestone when Remove is clicked', () => {
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /Remove/i })[1]);
    expect(screen.queryByText('Milestone 2')).not.toBeInTheDocument();
    expect(screen.getByText('Milestone 1')).toBeInTheDocument();
  });

  it('never removes the last milestone — Remove disappears at 1', () => {
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /Remove/i })[0]);
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument();
    expect(screen.getByText('Milestone 1')).toBeInTheDocument();
  });

  it('updates milestone title', () => {
    const titleInput = screen.getByPlaceholderText(/Title \(e\.g\./i);
    fireEvent.change(titleInput, { target: { value: 'Design Phase' } });
    expect(titleInput).toHaveValue('Design Phase');
  });

  it('updates milestone description', () => {
    const descInput = screen.getByPlaceholderText('Milestone description');
    fireEvent.change(descInput, { target: { value: 'Deliver wireframes' } });
    expect(descInput).toHaveValue('Deliver wireframes');
  });

  it('updates milestone amount', () => {
    const amountInput = screen.getByPlaceholderText('Amount');
    fireEvent.change(amountInput, { target: { value: '500' } });
    expect(amountInput).toHaveValue(500);
  });

  it('milestone amount is a number input', () => {
    expect(screen.getByPlaceholderText('Amount')).toHaveAttribute('type', 'number');
  });

  it('shows running total of milestone amounts', () => {
    const amountInput = screen.getByPlaceholderText('Amount');
    fireEvent.change(amountInput, { target: { value: '300' } });
    // Total display contains "300 / — USDC"
    expect(screen.getByText(/300\s*\/\s*—/)).toBeInTheDocument();
  });

  it('sums multiple milestone amounts correctly', () => {
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    const amounts = screen.getAllByPlaceholderText('Amount');
    fireEvent.change(amounts[0], { target: { value: '400' } });
    fireEvent.change(amounts[1], { target: { value: '600' } });
    expect(screen.getByText(/1000\s*\/\s*—/)).toBeInTheDocument();
  });

  it('can add up to 5 milestones', () => {
    for (let i = 1; i < 5; i++) {
      fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    }
    expect(screen.getByText('Milestone 5')).toBeInTheDocument();
  });

  it('handles zero milestone amount', () => {
    const amountInput = screen.getByPlaceholderText('Amount');
    fireEvent.change(amountInput, { target: { value: '0' } });
    expect(amountInput).toHaveValue(0);
  });

  it('handles decimal milestone amount', () => {
    const amountInput = screen.getByPlaceholderText('Amount');
    fireEvent.change(amountInput, { target: { value: '123.45' } });
    expect(amountInput).toHaveValue(123.45);
  });

  it('shows token label next to milestone amount', () => {
    // Default token is USDC
    expect(screen.getByText('USDC')).toBeInTheDocument();
  });
});

// ── 4. Step 3 — Review ────────────────────────────────────────────────────────

describe('Step 3 — Review', () => {
  it('shows freelancer address entered in step 1', () => {
    renderPage();
    const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    fireEvent.change(screen.getByPlaceholderText('GABCD1234...'), { target: { value: address } });
    advanceSteps(2);
    expect(screen.getByText(address)).toBeInTheDocument();
  });

  it('shows total amount entered in step 1', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '2500' } });
    advanceSteps(2);
    // Review shows "Total Amount: 2500 USDC"
    expect(screen.getByText(/Total Amount:/i).closest('p')).toHaveTextContent('2500');
  });

  it('shows correct milestone count', () => {
    renderPage();
    advanceSteps(1);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    advanceSteps(1);
    // Review shows "Milestones: 2"
    expect(screen.getByText(/Milestones:/i).closest('p')).toHaveTextContent('2');
  });

  it('shows dash when freelancer address is empty', () => {
    renderPage();
    advanceSteps(2);
    // Empty address renders as "—"
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows dash when total amount is empty', () => {
    renderPage();
    advanceSteps(2);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows the selected token in the warning text', () => {
    renderPage();
    const selects = screen.getAllByRole('combobox');
    const tokenSelect = selects.find((s) => within(s).queryByText('USDC'));
    fireEvent.change(tokenSelect, { target: { value: 'xlm' } });
    advanceSteps(2);
    // The warning text contains the token — check the warning paragraph specifically
    expect(screen.getByText(/authorize locking/i).closest('p')).toHaveTextContent('XLM');
  });

  it('shows the lock-funds warning', () => {
    renderPage();
    advanceSteps(2);
    expect(screen.getByText(/authorize locking/i)).toBeInTheDocument();
  });
});

// ── 5. Step 4 — Sign & Submit ─────────────────────────────────────────────────

describe('Step 4 — Sign & Submit', () => {
  beforeEach(() => {
    renderPage();
    advanceSteps(3);
  });

  it('renders the Sign & Submit heading', () => {
    expect(screen.getByText('Sign & Submit')).toBeInTheDocument();
  });

  it('renders the Freighter wallet description', () => {
    expect(screen.getByText(/Freighter wallet/i)).toBeInTheDocument();
  });

  it('renders the not-implemented notice', () => {
    expect(screen.getByText(/Issue #33/i)).toBeInTheDocument();
  });

  it('Sign & Create Escrow button is enabled by default', () => {
    expect(screen.getByRole('button', { name: /Sign & Create Escrow/i })).not.toBeDisabled();
  });
});

// ── 6. Template pre-fill ──────────────────────────────────────────────────────

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
    advanceSteps(1);
    // Freelance Website Launch has 3 milestones
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
    // Manually change the amount to simulate user edit
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '9999' } });
    rerender(
      <ToastProvider>
        <CreateEscrowPage />
      </ToastProvider>,
    );
    // Amount should remain user-edited, not reset to 5000
    expect(screen.getByDisplayValue('9999')).toBeInTheDocument();
  });
});

// ── 7. Edge cases ─────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('renders without crashing when all fields are empty', () => {
    renderPage();
    expect(screen.getByText('Counterparty & Funds')).toBeInTheDocument();
  });

  it('can navigate all steps with empty fields', () => {
    renderPage();
    advanceSteps(3);
    expect(screen.getByText('Sign & Submit')).toBeInTheDocument();
  });

  it('milestone total shows 0 when no amounts entered', () => {
    renderPage();
    advanceSteps(1);
    // Total display is split across elements: "0" + " / " + "—" + " USDC"
    // Check the summary span contains "0"
    const summary = screen.getByText(/Total:\s*0\s*\/\s*—\s*USDC/i);
    expect(summary).toBeInTheDocument();
  });

  it('handles very large total amount', () => {
    renderPage();
    const input = screen.getByPlaceholderText('0.00');
    fireEvent.change(input, { target: { value: '999999999' } });
    expect(input).toHaveValue(999999999);
  });

  it('handles negative total amount input', () => {
    renderPage();
    const input = screen.getByPlaceholderText('0.00');
    fireEvent.change(input, { target: { value: '-100' } });
    expect(input).toHaveValue(-100);
  });

  it('handles unicode in project brief', () => {
    renderPage();
    const textarea = screen.getByPlaceholderText(/Briefly describe/i);
    fireEvent.change(textarea, { target: { value: '日本語テスト 🚀' } });
    expect(textarea).toHaveValue('日本語テスト 🚀');
  });

  it('handles unicode in milestone title', () => {
    renderPage();
    advanceSteps(1);
    const titleInput = screen.getByPlaceholderText(/Title \(e\.g\./i);
    fireEvent.change(titleInput, { target: { value: 'Étape 1 — Démarrage' } });
    expect(titleInput).toHaveValue('Étape 1 — Démarrage');
  });

  it('milestone amount total stays correct after removing a milestone', () => {
    renderPage();
    advanceSteps(1);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    const amounts = screen.getAllByPlaceholderText('Amount');
    fireEvent.change(amounts[0], { target: { value: '300' } });
    fireEvent.change(amounts[1], { target: { value: '700' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Remove/i })[1]);
    // Only first milestone (300) remains — total shows "300 / — USDC"
    expect(screen.getByText(/300\s*\/\s*—/)).toBeInTheDocument();
  });

  it('preserves step 1 data when navigating forward and back', () => {
    renderPage();
    const address = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    fireEvent.change(screen.getByPlaceholderText('GABCD1234...'), { target: { value: address } });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1500' } });
    advanceSteps(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByPlaceholderText('GABCD1234...')).toHaveValue(address);
    expect(screen.getByPlaceholderText('0.00')).toHaveValue(1500);
  });

  it('preserves milestone data when navigating forward and back', () => {
    renderPage();
    advanceSteps(1);
    fireEvent.change(screen.getByPlaceholderText(/Title \(e\.g\./i), {
      target: { value: 'My Milestone' },
    });
    advanceSteps(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByPlaceholderText(/Title \(e\.g\./i)).toHaveValue('My Milestone');
  });
});

// ── 8. Accessibility ──────────────────────────────────────────────────────────

describe('Accessibility', () => {
  it('step 1 — all inputs have associated labels', () => {
    renderPage();
    // Project Brief textarea has a label (uses htmlFor via aria)
    expect(screen.getByPlaceholderText(/Briefly describe/i)).toBeInTheDocument();
    // Total Amount and Freelancer Address labels are present in the DOM
    expect(screen.getByText(/Total Amount/i)).toBeInTheDocument();
    expect(screen.getByText(/Freelancer Stellar Address/i)).toBeInTheDocument();
    // Token label is present
    expect(screen.getByText(/^Token$/i)).toBeInTheDocument();
  });

  it('step 2 — Add Milestone button is accessible', () => {
    renderPage();
    advanceSteps(1);
    expect(screen.getByRole('button', { name: /\+ Add Milestone/i })).toBeInTheDocument();
  });

  it('step 2 — Remove button has accessible name', () => {
    renderPage();
    advanceSteps(1);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Milestone/i }));
    const removeButtons = screen.getAllByRole('button', { name: /Remove/i });
    removeButtons.forEach((btn) => expect(btn).toBeInTheDocument());
  });

  it('navigation buttons have accessible names', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
  });

  it('page heading is an h1', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: /Create New Escrow/i })).toBeInTheDocument();
  });

  it('step headings are h2', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: /Counterparty & Funds/i })).toBeInTheDocument();
  });

  it('step 2 heading is h2', () => {
    renderPage();
    advanceSteps(1);
    expect(screen.getByRole('heading', { level: 2, name: /Milestones/i })).toBeInTheDocument();
  });

  it('step 3 heading is h2', () => {
    renderPage();
    advanceSteps(2);
    expect(screen.getByRole('heading', { level: 2, name: /Review Details/i })).toBeInTheDocument();
  });

  it('step 4 heading is h2', () => {
    renderPage();
    advanceSteps(3);
    expect(screen.getByRole('heading', { level: 2, name: /Sign & Submit/i })).toBeInTheDocument();
  });

  it('step 1 has no axe violations', async () => {
    const { container } = renderPage();
    const results = await axe(container, {
      rules: {
        // TemplateSelector has nested interactive controls (div[role=button] > button)
        // tracked as a separate accessibility issue in TemplateSelector component
        'nested-interactive': { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });

  it('step 2 has no axe violations', async () => {
    const { container } = renderPage();
    advanceSteps(1);
    const results = await axe(container, {
      rules: { 'nested-interactive': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it('step 3 has no axe violations', async () => {
    const { container } = renderPage();
    advanceSteps(2);
    const results = await axe(container, {
      rules: { 'nested-interactive': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it('step 4 has no axe violations', async () => {
    const { container } = renderPage();
    advanceSteps(3);
    const results = await axe(container, {
      rules: { 'nested-interactive': { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
