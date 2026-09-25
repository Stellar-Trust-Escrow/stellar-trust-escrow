/**
 * Tests for SlippageControl component — Issue #236
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SlippageControl from '../../../components/escrow/SlippageControl';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SlippageControl', () => {
  it('renders the component', () => {
    render(<SlippageControl />);
    expect(screen.getByTestId('slippage-control')).toBeInTheDocument();
  });

  it('renders all preset buttons (0.1%, 0.5%, 1.0%)', () => {
    render(<SlippageControl />);
    expect(screen.getByTestId('preset-0.1')).toBeInTheDocument();
    expect(screen.getByTestId('preset-0.5')).toBeInTheDocument();
    expect(screen.getByTestId('preset-1')).toBeInTheDocument();
  });

  it('marks the default 0.5% preset as selected', () => {
    render(<SlippageControl />);
    const btn = screen.getByTestId('preset-0.5');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onChange when a preset is clicked', () => {
    const onChange = jest.fn();
    render(<SlippageControl onChange={onChange} />);
    fireEvent.click(screen.getByTestId('preset-1'));
    expect(onChange).toHaveBeenCalledWith(1.0);
  });

  it('renders a custom slippage input', () => {
    render(<SlippageControl />);
    expect(screen.getByTestId('slippage-custom-input')).toBeInTheDocument();
  });

  it('calls onChange when a valid custom value is entered', () => {
    const onChange = jest.fn();
    render(<SlippageControl onChange={onChange} />);
    const input = screen.getByTestId('slippage-custom-input');
    fireEvent.change(input, { target: { value: '2.5' } });
    expect(onChange).toHaveBeenCalledWith(2.5);
  });

  it('shows a validation error when custom input is empty and blurred', () => {
    render(<SlippageControl value={0.5} onChange={() => {}} />);
    const input = screen.getByTestId('slippage-custom-input');
    fireEvent.focus(input); // triggers isCustom
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(screen.getByTestId('slippage-error')).toBeInTheDocument();
    expect(screen.getByTestId('slippage-error')).toHaveTextContent(/required/i);
  });

  it('shows a validation error when slippage exceeds 50%', () => {
    render(<SlippageControl value={0.5} onChange={() => {}} />);
    const input = screen.getByTestId('slippage-custom-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '51' } });
    fireEvent.blur(input);
    expect(screen.getByTestId('slippage-error')).toHaveTextContent(/maximum/i);
  });

  it('shows a validation error when slippage is below minimum (0.01%)', () => {
    render(<SlippageControl value={0.5} onChange={() => {}} />);
    const input = screen.getByTestId('slippage-custom-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '0.001' } });
    fireEvent.blur(input);
    expect(screen.getByTestId('slippage-error')).toHaveTextContent(/minimum/i);
  });

  it('shows high-slippage warning when slippage >= 3%', () => {
    render(<SlippageControl onChange={() => {}} />);
    fireEvent.click(screen.getByTestId('preset-0.5')); // ensure touched
    // Click a non-preset value via custom input to get 5%
    const input = screen.getByTestId('slippage-custom-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    expect(screen.getByTestId('high-slippage-warning')).toBeInTheDocument();
    expect(screen.getByTestId('high-slippage-warning')).toHaveTextContent(/high slippage/i);
  });

  it('does not show high-slippage warning when slippage < 3%', () => {
    render(<SlippageControl onChange={() => {}} />);
    fireEvent.click(screen.getByTestId('preset-1')); // 1% — below threshold
    expect(screen.queryByTestId('high-slippage-warning')).not.toBeInTheDocument();
  });

  it('renders estimated output section', () => {
    render(<SlippageControl sendAmount={1000} estimatedRate={1} />);
    expect(screen.getByTestId('estimated-output')).toBeInTheDocument();
  });

  it('calculates minimum received correctly (1000 * 1 * (1 - 0.5/100) = 995)', () => {
    render(<SlippageControl sendAmount={1000} estimatedRate={1} value={0.5} />);
    const minReceive = screen.getByTestId('min-receive-value');
    expect(minReceive).toHaveTextContent('995');
  });

  it('shows "—" when sendAmount is 0', () => {
    render(<SlippageControl sendAmount={0} estimatedRate={1} value={0.5} />);
    const minReceive = screen.getByTestId('min-receive-value');
    expect(minReceive).toHaveTextContent('—');
  });

  it('shows the receiveAsset ticker in the estimated output', () => {
    render(<SlippageControl sendAmount={100} estimatedRate={1} value={0.5} receiveAsset="XLM" />);
    expect(screen.getByTestId('min-receive-value')).toHaveTextContent('XLM');
  });

  it('uses controlled value prop', () => {
    render(<SlippageControl value={1.5} onChange={() => {}} />);
    const btn05 = screen.getByTestId('preset-0.5');
    expect(btn05).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not show high-slippage warning for exactly 3%', () => {
    render(<SlippageControl onChange={() => {}} />);
    const input = screen.getByTestId('slippage-custom-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    expect(screen.getByTestId('high-slippage-warning')).toBeInTheDocument();
  });
});
