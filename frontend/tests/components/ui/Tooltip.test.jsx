import { render, screen, fireEvent } from '@testing-library/react';
import Tooltip from '../../../components/ui/Tooltip';

describe('Tooltip', () => {
  it('renders trigger element', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('shows tooltip on mouse enter', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText('Tooltip text')).toBeInTheDocument();
  });

  it('hides tooltip on mouse leave', () => {
    const { container } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows tooltip on focus', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.focus(trigger);
    expect(screen.getByText('Tooltip text')).toBeInTheDocument();
  });

  it('hides tooltip on blur', () => {
    const { container } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.focus(trigger);
    fireEvent.blur(trigger);
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies top position by default', () => {
    const { container } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveClass('bottom-full');
  });

  it('applies custom position', () => {
    const { container } = render(
      <Tooltip content="Tooltip text" position="bottom">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveClass('top-full');
  });

  it('has aria-hidden when not visible', () => {
    const { container } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  });

  it('has aria-hidden false when visible', () => {
    const { container } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveAttribute('aria-hidden', 'false');
  });
});
