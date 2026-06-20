import { render, screen, fireEvent } from '@testing-library/react';
import ReputationBadge from '../../../components/ui/ReputationBadge';

describe('ReputationBadge', () => {
  it('renders the score', () => {
    render(<ReputationBadge score={87} />);
    expect(screen.getByText('87')).toBeInTheDocument();
  });

  it('has aria-label with tier and score', () => {
    render(<ReputationBadge score={250} />);
    expect(screen.getByLabelText('Reputation: Good (250 points)')).toBeInTheDocument();
  });

  it('applies amber color for score >= 500', () => {
    const { container } = render(<ReputationBadge score={500} />);
    const badge = container.querySelector('[aria-label*="Excellent"]');
    expect(badge).toHaveClass('text-amber-400');
  });

  it('applies purple color for score >= 250', () => {
    const { container } = render(<ReputationBadge score={250} />);
    const badge = container.querySelector('[aria-label*="Good"]');
    expect(badge).toHaveClass('text-purple-400');
  });

  it('applies indigo color for score >= 100', () => {
    const { container } = render(<ReputationBadge score={100} />);
    const badge = container.querySelector('[aria-label*="Fair"]');
    expect(badge).toHaveClass('text-indigo-400');
  });

  it('applies gray color for score < 100', () => {
    const { container } = render(<ReputationBadge score={50} />);
    const badge = container.querySelector('[aria-label*="New"]');
    expect(badge).toHaveClass('text-gray-400');
  });

  it('applies sm size classes', () => {
    const { container } = render(<ReputationBadge score={50} size="sm" />);
    const badge = container.querySelector('[aria-label*="New"]');
    expect(badge).toHaveClass('w-10', 'h-10');
  });

  it('applies md size classes by default', () => {
    const { container } = render(<ReputationBadge score={50} />);
    const badge = container.querySelector('[aria-label*="New"]');
    expect(badge).toHaveClass('w-12', 'h-12');
  });

  it('applies lg size classes', () => {
    const { container } = render(<ReputationBadge score={50} size="lg" />);
    const badge = container.querySelector('[aria-label*="New"]');
    expect(badge).toHaveClass('w-16', 'h-16');
  });

  describe('Tooltip', () => {
    it('shows tooltip on hover', () => {
      render(<ReputationBadge score={500} />);
      const trigger = screen.getByText('500').closest('[role="button"]');
      fireEvent.mouseEnter(trigger);
      expect(screen.getByText('Excellent • Score: 500')).toBeInTheDocument();
    });

    it('shows correct tier for excellent score', () => {
      render(<ReputationBadge score={600} />);
      const trigger = screen.getByText('600').closest('[role="button"]');
      fireEvent.mouseEnter(trigger);
      expect(screen.getByText('Excellent • Score: 600')).toBeInTheDocument();
    });

    it('shows correct tier for good score', () => {
      render(<ReputationBadge score={300} />);
      const trigger = screen.getByText('300').closest('[role="button"]');
      fireEvent.mouseEnter(trigger);
      expect(screen.getByText('Good • Score: 300')).toBeInTheDocument();
    });

    it('shows correct tier for fair score', () => {
      render(<ReputationBadge score={150} />);
      const trigger = screen.getByText('150').closest('[role="button"]');
      fireEvent.mouseEnter(trigger);
      expect(screen.getByText('Fair • Score: 150')).toBeInTheDocument();
    });

    it('shows correct tier for new score', () => {
      render(<ReputationBadge score={50} />);
      const trigger = screen.getByText('50').closest('[role="button"]');
      fireEvent.mouseEnter(trigger);
      expect(screen.getByText('New • Score: 50')).toBeInTheDocument();
    });

    it('hides tooltip on mouse leave', () => {
      const { container } = render(<ReputationBadge score={500} />);
      const trigger = screen.getByText('500').closest('[role="button"]');
      fireEvent.mouseEnter(trigger);
      fireEvent.mouseLeave(trigger);
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toHaveAttribute('aria-hidden', 'true');
    });

    it('shows tooltip on focus', () => {
      const { container } = render(<ReputationBadge score={500} />);
      const trigger = screen.getByText('500').closest('[role="button"]');
      fireEvent.focus(trigger);
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toHaveAttribute('aria-hidden', 'false');
    });
  });
});
