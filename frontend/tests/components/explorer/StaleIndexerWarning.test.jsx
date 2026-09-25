/**
 * Tests for StaleIndexerWarning component — Issue #234
 */
import { render, screen, fireEvent } from '@testing-library/react';
import StaleIndexerWarning from '../../../components/explorer/StaleIndexerWarning';

describe('StaleIndexerWarning', () => {
  const LAG_THRESHOLD = 50;

  it('does not render when lag is below threshold', () => {
    render(
      <StaleIndexerWarning
        lastProcessedLedger={1000}
        currentLedger={1040}
        lagThreshold={LAG_THRESHOLD}
      />,
    );
    expect(screen.queryByTestId('stale-indexer-warning')).not.toBeInTheDocument();
  });

  it('does not render when lag equals threshold minus one', () => {
    render(
      <StaleIndexerWarning
        lastProcessedLedger={1000}
        currentLedger={1049}
        lagThreshold={LAG_THRESHOLD}
      />,
    );
    expect(screen.queryByTestId('stale-indexer-warning')).not.toBeInTheDocument();
  });

  it('renders when lag equals the threshold', () => {
    render(
      <StaleIndexerWarning
        lastProcessedLedger={1000}
        currentLedger={1050}
        lagThreshold={LAG_THRESHOLD}
      />,
    );
    expect(screen.getByTestId('stale-indexer-warning')).toBeInTheDocument();
  });

  it('renders when lag exceeds the threshold', () => {
    render(
      <StaleIndexerWarning
        lastProcessedLedger={1000}
        currentLedger={1200}
        lagThreshold={LAG_THRESHOLD}
      />,
    );
    expect(screen.getByTestId('stale-indexer-warning')).toBeInTheDocument();
  });

  it('shows the last processed ledger number', () => {
    render(
      <StaleIndexerWarning
        lastProcessedLedger={987654}
        currentLedger={987710}
        lagThreshold={LAG_THRESHOLD}
      />,
    );
    expect(screen.getByText(/987,654/)).toBeInTheDocument();
  });

  it('shows the lag count in the message', () => {
    render(
      <StaleIndexerWarning
        lastProcessedLedger={1000}
        currentLedger={1100}
        lagThreshold={LAG_THRESHOLD}
      />,
    );
    expect(screen.getByText(/100 ledgers/i)).toBeInTheDocument();
  });

  it('uses singular "ledger" when lag is exactly 1 above threshold (artificial threshold=0)', () => {
    // Set threshold to 0 and lag to 1 to get singular
    render(
      <StaleIndexerWarning
        lastProcessedLedger={999}
        currentLedger={1000}
        lagThreshold={0}
      />,
    );
    // "1 ledger" should be shown, not "1 ledgers"
    expect(screen.getByText(/1 ledger\b/i)).toBeInTheDocument();
  });

  it('includes retry guidance text', () => {
    render(
      <StaleIndexerWarning
        lastProcessedLedger={1000}
        currentLedger={1200}
        lagThreshold={LAG_THRESHOLD}
      />,
    );
    expect(screen.getByText(/try refreshing/i)).toBeInTheDocument();
  });

  it('is hidden after the Dismiss button is clicked', () => {
    render(
      <StaleIndexerWarning
        lastProcessedLedger={1000}
        currentLedger={1200}
        lagThreshold={LAG_THRESHOLD}
      />,
    );
    const dismissBtn = screen.getByLabelText(/dismiss stale indexer warning/i);
    fireEvent.click(dismissBtn);
    expect(screen.queryByTestId('stale-indexer-warning')).not.toBeInTheDocument();
  });

  it('has a Retry button', () => {
    render(
      <StaleIndexerWarning
        lastProcessedLedger={1000}
        currentLedger={1200}
        lagThreshold={LAG_THRESHOLD}
      />,
    );
    expect(screen.getByLabelText(/retry/i)).toBeInTheDocument();
  });

  it('does not render while isLoading is true even if lag exceeds threshold', () => {
    render(
      <StaleIndexerWarning
        lastProcessedLedger={1000}
        currentLedger={2000}
        lagThreshold={LAG_THRESHOLD}
        isLoading={true}
      />,
    );
    expect(screen.queryByTestId('stale-indexer-warning')).not.toBeInTheDocument();
  });

  it('renders with default lagThreshold of 50', () => {
    // Should show when lag >= 50 with default threshold
    render(
      <StaleIndexerWarning lastProcessedLedger={1000} currentLedger={1055} />,
    );
    expect(screen.getByTestId('stale-indexer-warning')).toBeInTheDocument();
  });

  it('does not render when currentLedger is 0 (unknown)', () => {
    render(
      <StaleIndexerWarning
        lastProcessedLedger={1000}
        currentLedger={0}
        lagThreshold={LAG_THRESHOLD}
      />,
    );
    expect(screen.queryByTestId('stale-indexer-warning')).not.toBeInTheDocument();
  });

  it('has role=alert for accessibility', () => {
    render(
      <StaleIndexerWarning
        lastProcessedLedger={1000}
        currentLedger={1200}
        lagThreshold={LAG_THRESHOLD}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
