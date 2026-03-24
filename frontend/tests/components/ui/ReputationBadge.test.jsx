import { render, screen } from '@testing-library/react';
import ReputationBadge from '../../../components/ui/ReputationBadge';

describe('ReputationBadge', () => {
  it('renders the score', () => {
    render(<ReputationBadge score={87} />);
    expect(screen.getByText('87')).toBeInTheDocument();
  });

  it('has title attribute with score', () => {
    const { container } = render(<ReputationBadge score={250} />);
    expect(container.firstChild).toHaveAttribute('title', 'Reputation score: 250');
  });

  it('applies amber color for score >= 500', () => {
    const { container } = render(<ReputationBadge score={500} />);
    expect(container.firstChild).toHaveClass('text-amber-400');
  });

  it('applies purple color for score >= 250', () => {
    const { container } = render(<ReputationBadge score={250} />);
    expect(container.firstChild).toHaveClass('text-purple-400');
  });

  it('applies indigo color for score >= 100', () => {
    const { container } = render(<ReputationBadge score={100} />);
    expect(container.firstChild).toHaveClass('text-indigo-400');
  });

  it('applies gray color for score < 100', () => {
    const { container } = render(<ReputationBadge score={50} />);
    expect(container.firstChild).toHaveClass('text-gray-400');
  });

  it('applies sm size classes', () => {
    const { container } = render(<ReputationBadge score={50} size="sm" />);
    expect(container.firstChild).toHaveClass('w-10', 'h-10');
  });

  it('applies md size classes by default', () => {
    const { container } = render(<ReputationBadge score={50} />);
    expect(container.firstChild).toHaveClass('w-12', 'h-12');
  });

  it('applies lg size classes', () => {
    const { container } = render(<ReputationBadge score={50} size="lg" />);
    expect(container.firstChild).toHaveClass('w-16', 'h-16');
  });
});
