import { render, screen, fireEvent } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import DisputeTermsDiff from '../../../components/dispute/DisputeTermsDiff';

expect.extend(toHaveNoViolations);

const ORIGINAL = 'The freelancer agrees to deliver a complete audit within 14 days.';
const DISPUTE = 'The freelancer delivered the audit 6 days late and missed checklist items.';
const NOW = '2026-05-10T09:00:00Z';
const LATER = '2026-05-28T14:35:00Z';

describe('DisputeTermsDiff', () => {
  it('renders both heading and legend', () => {
    render(
      <DisputeTermsDiff
        originalTerms={ORIGINAL}
        disputeDescription={DISPUTE}
        originalTimestamp={NOW}
        disputeTimestamp={LATER}
      />,
    );
    expect(screen.getByText('Terms vs. dispute claim')).toBeInTheDocument();
    expect(screen.getByText(/Removed \/ changed/i)).toBeInTheDocument();
    expect(screen.getByText(/Added \/ new/i)).toBeInTheDocument();
  });

  it('shows timestamps formatted as local date', () => {
    render(
      <DisputeTermsDiff
        originalTerms={ORIGINAL}
        disputeDescription={DISPUTE}
        originalTimestamp={NOW}
        disputeTimestamp={LATER}
      />,
    );
    const times = document.querySelectorAll('time');
    expect(times.length).toBeGreaterThan(0);
  });

  it('switches to unified view on button click', () => {
    render(
      <DisputeTermsDiff
        originalTerms={ORIGINAL}
        disputeDescription={DISPUTE}
      />,
    );
    const unifiedBtn = screen.getByRole('button', { name: /unified/i });
    fireEvent.click(unifiedBtn);
    expect(unifiedBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('has no critical accessibility violations', async () => {
    const { container } = render(
      <DisputeTermsDiff
        originalTerms={ORIGINAL}
        disputeDescription={DISPUTE}
        originalTimestamp={NOW}
        disputeTimestamp={LATER}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('renders without timestamps gracefully', () => {
    render(<DisputeTermsDiff originalTerms={ORIGINAL} disputeDescription={DISPUTE} />);
    expect(screen.getByText('Terms vs. dispute claim')).toBeInTheDocument();
  });

  it('renders with empty strings without crashing', () => {
    render(<DisputeTermsDiff originalTerms="" disputeDescription="" />);
    expect(screen.getByText('Terms vs. dispute claim')).toBeInTheDocument();
  });
});
