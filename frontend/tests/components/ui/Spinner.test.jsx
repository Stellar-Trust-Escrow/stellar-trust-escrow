import { render, screen } from '@testing-library/react';
import Spinner from '../../../components/ui/Spinner';

describe('Spinner', () => {
  it('renders with default label', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    render(<Spinner label="Please wait" />);
    expect(screen.getByText('Please wait')).toBeInTheDocument();
  });

  it('label is visually hidden (sr-only)', () => {
    render(<Spinner label="Loading…" />);
    expect(screen.getByText('Loading…')).toHaveClass('sr-only');
  });

  it('applies sm size classes', () => {
    const { container } = render(<Spinner size="sm" />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('w-4', 'h-4');
  });

  it('applies md size classes by default', () => {
    const { container } = render(<Spinner />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('w-6', 'h-6');
  });

  it('applies lg size classes', () => {
    const { container } = render(<Spinner size="lg" />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('w-10', 'h-10');
  });
});
