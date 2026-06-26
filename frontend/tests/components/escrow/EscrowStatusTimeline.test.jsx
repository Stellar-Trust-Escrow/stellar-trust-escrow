import { render, screen } from '@testing-library/react';
import EscrowStatusTimeline from '../../../components/escrow/EscrowStatusTimeline';

describe('EscrowStatusTimeline', () => {
  const mockEvents = [
    {
      state: 'Created',
      timestamp: '2025-06-20T10:00:00Z',
      actor: 'client@example.com',
    },
    {
      state: 'Funded',
      timestamp: '2025-06-20T10:05:00Z',
      actor: 'client@example.com',
    },
    {
      state: 'InProgress',
      timestamp: '2025-06-21T14:30:00Z',
      actor: 'contractor@example.com',
    },
  ];

  it('renders timeline with events', () => {
    render(
      <EscrowStatusTimeline
        events={mockEvents}
        currentState="InProgress"
      />,
    );
    expect(screen.getByTestId('escrow-timeline')).toBeInTheDocument();
  });

  it('displays all state labels', () => {
    render(
      <EscrowStatusTimeline
        events={mockEvents}
        currentState="InProgress"
      />,
    );
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Funded')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('formats timestamps correctly', () => {
    render(
      <EscrowStatusTimeline
        events={mockEvents}
        currentState="InProgress"
      />,
    );
    // Check that date is formatted (exact format depends on locale)
    const timeElements = screen.getAllByText(/Jun/);
    expect(timeElements.length).toBeGreaterThan(0);
  });

  it('displays actor information', () => {
    render(
      <EscrowStatusTimeline
        events={mockEvents}
        currentState="InProgress"
      />,
    );
    expect(screen.getByText(/by client@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/by contractor@example.com/)).toBeInTheDocument();
  });

  it('highlights current state', () => {
    const { container } = render(
      <EscrowStatusTimeline
        events={mockEvents}
        currentState="Funded"
      />,
    );
    // The current state should have the pulse animation
    const circles = container.querySelectorAll('[class*="animate-pulse"]');
    expect(circles.length).toBeGreaterThan(0);
  });

  it('shows completed states with checkmark styling', () => {
    const { container } = render(
      <EscrowStatusTimeline
        events={mockEvents}
        currentState="Funded"
      />,
    );
    // Check for checkmark icons
    const checkIcons = container.querySelectorAll('svg[class*="w-5 h-5"]');
    expect(checkIcons.length).toBeGreaterThan(0);
  });

  it('renders with empty events array', () => {
    render(<EscrowStatusTimeline events={[]} currentState="" />);
    expect(screen.getByTestId('escrow-timeline')).toBeInTheDocument();
  });

  it('handles missing timestamps gracefully', () => {
    const eventsWithoutTimestamp = [
      { state: 'Created', actor: 'client@example.com' },
    ];
    render(
      <EscrowStatusTimeline
        events={eventsWithoutTimestamp}
        currentState="Created"
      />,
    );
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('renders without actor information when not provided', () => {
    const eventsWithoutActor = [
      {
        state: 'Created',
        timestamp: '2025-06-20T10:00:00Z',
      },
    ];
    render(
      <EscrowStatusTimeline
        events={eventsWithoutActor}
        currentState="Created"
      />,
    );
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <EscrowStatusTimeline
        events={mockEvents}
        currentState="InProgress"
        className="custom-class"
      />,
    );
    expect(container.querySelector('[data-testid="escrow-timeline"]')).toHaveClass('custom-class');
  });

  it('handles various state names', () => {
    const allStates = [
      { state: 'Created', timestamp: '2025-06-20T10:00:00Z' },
      { state: 'Funded', timestamp: '2025-06-20T10:05:00Z' },
      { state: 'InProgress', timestamp: '2025-06-21T14:30:00Z' },
      { state: 'ReleaseRequested', timestamp: '2025-06-22T09:00:00Z' },
      { state: 'Released', timestamp: '2025-06-22T10:00:00Z' },
    ];
    render(
      <EscrowStatusTimeline
        events={allStates}
        currentState="Released"
      />,
    );
    expect(screen.getByText('Release Requested')).toBeInTheDocument();
    expect(screen.getByText('Released')).toBeInTheDocument();
  });
});
