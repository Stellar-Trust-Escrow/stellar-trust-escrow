import { render, screen, fireEvent } from '@testing-library/react';
import EmptyState from '../../../components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders the default title when no title prop is given', () => {
    render(<EmptyState />);
    expect(screen.getByText('No escrows found')).toBeInTheDocument();
  });

  it('renders a custom title', () => {
    render(<EmptyState title="Nothing here yet" />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<EmptyState description="Try adjusting your filters." />);
    expect(screen.getByText('Try adjusting your filters.')).toBeInTheDocument();
  });

  it('does not render a description element when omitted', () => {
    render(<EmptyState />);
    // No <p> with description text should be present
    expect(screen.queryByText(/Try adjusting/)).not.toBeInTheDocument();
  });

  it('renders the SVG illustration', () => {
    render(<EmptyState />);
    // The SVG is present (aria-hidden so we find by test-id wrapper)
    expect(screen.getByTestId('empty-state').querySelector('svg')).toBeInTheDocument();
  });

  it('renders a button CTA when onAction is provided', () => {
    render(<EmptyState actionLabel="Clear filters" onAction={() => {}} />);
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('calls onAction when the CTA button is clicked', () => {
    const onAction = jest.fn();
    render(<EmptyState actionLabel="Clear filters" onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders a link CTA when actionHref is provided', () => {
    render(<EmptyState actionLabel="Create Escrow" actionHref="/escrow/create" />);
    const link = screen.getByRole('link', { name: 'Create Escrow' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/escrow/create');
  });

  it('does not render a CTA when neither onAction nor actionHref is given', () => {
    render(<EmptyState actionLabel="Create Escrow" />);
    expect(screen.queryByRole('button', { name: 'Create Escrow' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create Escrow' })).not.toBeInTheDocument();
  });

  it('is centered with the correct container', () => {
    render(<EmptyState />);
    const container = screen.getByTestId('empty-state');
    expect(container).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center', 'text-center');
  });
});
