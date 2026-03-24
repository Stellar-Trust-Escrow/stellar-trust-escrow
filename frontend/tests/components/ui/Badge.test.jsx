import { render, screen } from '@testing-library/react';
import Badge from '../../../components/ui/Badge';

describe('Badge', () => {
  const escrowStatuses = ['Active', 'Completed', 'Disputed', 'Cancelled'];
  const milestoneStatuses = ['Pending', 'Submitted', 'Approved', 'Rejected'];
  const reputationBadges = ['NEW', 'TRUSTED', 'VERIFIED', 'EXPERT', 'ELITE'];

  escrowStatuses.forEach((status) => {
    it(`renders escrow status: ${status}`, () => {
      render(<Badge status={status} />);
      expect(screen.getByText(status)).toBeInTheDocument();
    });
  });

  milestoneStatuses.forEach((status) => {
    it(`renders milestone status: ${status}`, () => {
      render(<Badge status={status} />);
      expect(screen.getByText(status)).toBeInTheDocument();
    });
  });

  reputationBadges.forEach((badge) => {
    it(`renders reputation badge: ${badge}`, () => {
      render(<Badge status={badge} />);
      expect(screen.getByText(badge)).toBeInTheDocument();
    });
  });

  it('applies sm size class', () => {
    const { container } = render(<Badge status="Active" size="sm" />);
    expect(container.firstChild).toHaveClass('text-xs', 'px-1.5');
  });

  it('applies md size class by default', () => {
    const { container } = render(<Badge status="Active" />);
    expect(container.firstChild).toHaveClass('text-xs', 'px-2');
  });

  it('falls back gracefully for unknown status', () => {
    render(<Badge status="Unknown" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
