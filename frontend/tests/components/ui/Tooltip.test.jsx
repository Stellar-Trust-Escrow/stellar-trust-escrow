import { render, screen, fireEvent, act } from '@testing-library/react';
import Tooltip from '../../../components/ui/Tooltip';

jest.useFakeTimers();

describe('Tooltip', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  it('renders trigger element', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('shows tooltip on mouse enter after 300ms delay', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.mouseEnter(trigger);

    // Not visible before delay (queryByRole excludes aria-hidden elements)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    // Advance past delay
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Tooltip text');
  });

  it('hides tooltip instantly on mouse leave', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.mouseEnter(trigger);
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows tooltip on focus after delay', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.focus(trigger);
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('hides tooltip on blur', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.focus(trigger);
    act(() => jest.advanceTimersByTime(300));
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('hides tooltip on Escape key', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.mouseEnter(trigger);
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('has role="tooltip"', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.mouseEnter(trigger);
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('wires aria-describedby between trigger and tooltip when visible', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').parentElement;

    // Not visible — no aria-describedby
    expect(trigger).not.toHaveAttribute('aria-describedby');

    fireEvent.mouseEnter(trigger);
    act(() => jest.advanceTimersByTime(300));

    const tooltip = screen.getByRole('tooltip');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('has aria-hidden="true" when not visible', () => {
    const { container } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    // querySelector finds it even when aria-hidden
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  });

  it('has aria-hidden="false" when visible', () => {
    const { container } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.mouseEnter(trigger);
    act(() => jest.advanceTimersByTime(300));
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveAttribute('aria-hidden', 'false');
  });

  it('applies preferred position class', () => {
    render(
      <Tooltip content="Tooltip text" position="bottom">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.mouseEnter(trigger);
    act(() => jest.advanceTimersByTime(300));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.className).toContain('top-full');
  });

  it('clears timer on unmount', () => {
    const { unmount } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.mouseEnter(trigger);
    // Unmount before delay fires
    unmount();
    // Advance — should not throw
    act(() => jest.advanceTimersByTime(300));
  });

  it('cancels previous show timer on re-hover', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.mouseEnter(trigger);
    act(() => jest.advanceTimersByTime(200));
    fireEvent.mouseLeave(trigger);
    // Re-hover resets timer
    fireEvent.mouseEnter(trigger);
    act(() => jest.advanceTimersByTime(200));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(100));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });
});
