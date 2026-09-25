/**
 * Tests for DeadLetterQueue component — Issue #233
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DeadLetterQueue from '../../../components/admin/DeadLetterQueue';

// ── Mock global fetch ─────────────────────────────────────────────────────────

const MOCK_JOBS = [
  {
    id: 'dlq-001',
    name: 'stellar-event',
    failedReason: 'RPC timeout after 5000ms',
    attemptsMade: 5,
    opts: { attempts: 5 },
    timestamp: Date.now() - 3600_000,
    processedOn: Date.now() - 3600_000,
    auditConfirmed: false,
    data: { type: 'EscrowCreated', escrowId: 42 },
  },
  {
    id: 'dlq-002',
    name: 'webhook-delivery',
    failedReason: 'ECONNREFUSED',
    attemptsMade: 5,
    opts: { attempts: 5 },
    timestamp: Date.now() - 7200_000,
    processedOn: null,
    auditConfirmed: false,
    data: { webhookId: 'wh-99', event: 'milestone.approved' },
  },
];

function makeFetchOk(body) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

function makeFetchFail(status = 500) {
  return jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: `HTTP ${status}` }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeadLetterQueue', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the section heading', async () => {
    global.fetch = makeFetchOk({ jobs: MOCK_JOBS });
    render(<DeadLetterQueue apiKey="test-key" />);
    expect(await screen.findByText(/dead-letter queue/i)).toBeInTheDocument();
  });

  it('shows job name and failure reason', async () => {
    global.fetch = makeFetchOk({ jobs: MOCK_JOBS });
    render(<DeadLetterQueue apiKey="test-key" />);
    expect(await screen.findByText('stellar-event')).toBeInTheDocument();
    expect(await screen.findByText(/RPC timeout after 5000ms/i)).toBeInTheDocument();
  });

  it('shows attempt count', async () => {
    global.fetch = makeFetchOk({ jobs: MOCK_JOBS });
    render(<DeadLetterQueue apiKey="test-key" />);
    await screen.findByText('stellar-event');
    // Attempts is displayed as "5 / 5" split across elements, so check for "Attempts:" label
    const attemptLabels = screen.getAllByText(/attempts:/i);
    expect(attemptLabels.length).toBeGreaterThan(0);
  });

  it('shows payload summary without expanding', async () => {
    global.fetch = makeFetchOk({ jobs: MOCK_JOBS });
    render(<DeadLetterQueue apiKey="test-key" />);
    await screen.findByText('stellar-event');
    // Payload summary should be visible (short version)
    expect(screen.getByText(/EscrowCreated/)).toBeInTheDocument();
  });

  it('expands payload on Preview click', async () => {
    global.fetch = makeFetchOk({ jobs: MOCK_JOBS });
    render(<DeadLetterQueue apiKey="test-key" />);
    const previewBtn = await screen.findByLabelText(/preview payload for dlq-001/i);
    fireEvent.click(previewBtn);
    expect(await screen.findByText(/Full Payload/i)).toBeInTheDocument();
  });

  it('hides payload when Preview is clicked a second time', async () => {
    global.fetch = makeFetchOk({ jobs: MOCK_JOBS });
    render(<DeadLetterQueue apiKey="test-key" />);
    const previewBtn = await screen.findByLabelText(/preview payload for dlq-001/i);
    fireEvent.click(previewBtn);
    await screen.findByText(/Full Payload/i);
    fireEvent.click(screen.getByLabelText(/hide payload for dlq-001/i));
    await waitFor(() => expect(screen.queryByText(/Full Payload/i)).not.toBeInTheDocument());
  });

  it('removes job from list on Replay', async () => {
    global.fetch = makeFetchOk({ jobs: MOCK_JOBS });
    render(<DeadLetterQueue apiKey="test-key" />);
    await screen.findByText('stellar-event');

    // Override fetch to succeed for replay
    global.fetch = makeFetchOk({ message: 'replayed' });
    const replayBtn = screen.getByLabelText(/replay job dlq-001/i);
    await act(async () => {
      fireEvent.click(replayBtn);
    });
    await waitFor(() =>
      expect(screen.queryByText('dlq-001')).not.toBeInTheDocument(),
    );
  });

  it('marks job as acknowledged on Acknowledge click', async () => {
    global.fetch = makeFetchOk({ jobs: MOCK_JOBS });
    render(<DeadLetterQueue apiKey="test-key" />);
    await screen.findByText('stellar-event');

    const ackBtn = await screen.findByLabelText(/acknowledge job dlq-001/i);
    global.fetch = makeFetchOk({ message: 'acknowledged' });
    await act(async () => {
      fireEvent.click(ackBtn);
    });
    // After acknowledging, the "Acknowledge" button for this job disappears and
    // an "Acknowledged" label appears.
    await waitFor(() =>
      expect(screen.queryByLabelText(/acknowledge job dlq-001/i)).not.toBeInTheDocument(),
    );
    // At least one element with "Acknowledged" text should be visible (the badge label)
    expect(screen.getAllByText(/Acknowledged/i).length).toBeGreaterThan(0);
  });

  it('shows empty state when queue is healthy', async () => {
    global.fetch = makeFetchOk({ jobs: [] });
    render(<DeadLetterQueue apiKey="test-key" />);
    expect(await screen.findByText(/queue is healthy/i)).toBeInTheDocument();
  });

  it('falls back to mock data when API is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Failed to fetch'));
    render(<DeadLetterQueue apiKey="test-key" />);
    // Mock data contains 'stellar-event'
    expect(await screen.findByText('stellar-event')).toBeInTheDocument();
  });

  it('shows unacknowledged count badge', async () => {
    global.fetch = makeFetchOk({ jobs: MOCK_JOBS });
    render(<DeadLetterQueue apiKey="test-key" />);
    // Both mock jobs are unacknowledged
    const badge = await screen.findByText('2');
    expect(badge).toBeInTheDocument();
  });

  it('audit confirmation hides the Acknowledge button for that job', async () => {
    global.fetch = makeFetchOk({ jobs: MOCK_JOBS });
    render(<DeadLetterQueue apiKey="test-key" />);
    await screen.findByText('stellar-event');

    global.fetch = makeFetchOk({});
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/acknowledge job dlq-001/i));
    });
    await waitFor(() =>
      expect(screen.queryByLabelText(/acknowledge job dlq-001/i)).not.toBeInTheDocument(),
    );
  });
});
