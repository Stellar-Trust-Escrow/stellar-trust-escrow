/**
 * Tests for AppealDeadlineIndicator component — Issue #235
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AppealDeadlineIndicator from '../../../components/dispute/AppealDeadlineIndicator';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FUTURE_DEADLINE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days from now
const PAST_DEADLINE = new Date(Date.now() - 1000).toISOString();

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AppealDeadlineIndicator', () => {
  it('renders the component', () => {
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={FUTURE_DEADLINE}
        appealWindowOpen={true}
      />,
    );
    expect(screen.getByTestId('appeal-deadline-indicator')).toBeInTheDocument();
  });

  it('shows "window open" label when appealWindowOpen is true and deadline is in the future', () => {
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={FUTURE_DEADLINE}
        appealWindowOpen={true}
      />,
    );
    expect(screen.getByTestId('window-open-label')).toBeInTheDocument();
  });

  it('shows the deadline date when window is open', () => {
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={FUTURE_DEADLINE}
        appealWindowOpen={true}
      />,
    );
    expect(screen.getByTestId('deadline-date')).toBeInTheDocument();
  });

  it('shows a countdown when window is open', () => {
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={FUTURE_DEADLINE}
        appealWindowOpen={true}
      />,
    );
    expect(screen.getByTestId('countdown')).toBeInTheDocument();
  });

  it('shows "window closed" label when appealWindowOpen is false', () => {
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={PAST_DEADLINE}
        appealWindowOpen={false}
      />,
    );
    expect(screen.getByTestId('window-closed-label')).toBeInTheDocument();
  });

  it('shows "window closed" when deadline is in the past even if appealWindowOpen is true', () => {
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={PAST_DEADLINE}
        appealWindowOpen={true}
      />,
    );
    expect(screen.getByTestId('window-closed-label')).toBeInTheDocument();
  });

  it('disables the submit button when window is closed', () => {
    const onAppeal = jest.fn();
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={PAST_DEADLINE}
        appealWindowOpen={false}
        onAppeal={onAppeal}
      />,
    );
    const btn = screen.getByTestId('submit-appeal-btn');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
  });

  it('enables the submit button when window is open', () => {
    const onAppeal = jest.fn();
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={FUTURE_DEADLINE}
        appealWindowOpen={true}
        onAppeal={onAppeal}
      />,
    );
    const btn = screen.getByTestId('submit-appeal-btn');
    expect(btn).not.toBeDisabled();
  });

  it('calls onAppeal when the submit button is clicked', async () => {
    const onAppeal = jest.fn().mockResolvedValue(undefined);
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={FUTURE_DEADLINE}
        appealWindowOpen={true}
        onAppeal={onAppeal}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-appeal-btn'));
    });
    expect(onAppeal).toHaveBeenCalledWith({ escrowId: '42', disputeId: 7 });
  });

  it('shows success state after successful appeal submission', async () => {
    const onAppeal = jest.fn().mockResolvedValue(undefined);
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={FUTURE_DEADLINE}
        appealWindowOpen={true}
        onAppeal={onAppeal}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-appeal-btn'));
    });
    await waitFor(() =>
      expect(screen.getByText(/appeal submitted/i)).toBeInTheDocument(),
    );
  });

  it('disables the button after successful appeal submission', async () => {
    const onAppeal = jest.fn().mockResolvedValue(undefined);
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={FUTURE_DEADLINE}
        appealWindowOpen={true}
        onAppeal={onAppeal}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-appeal-btn'));
    });
    await waitFor(() =>
      expect(screen.queryByTestId('submit-appeal-btn')).not.toBeInTheDocument(),
    );
  });

  it('handles backend rejection (409) gracefully and closes the window', async () => {
    const err = new Error('Appeal window is closed on the server');
    err.status = 409;
    const onAppeal = jest.fn().mockRejectedValue(err);

    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={FUTURE_DEADLINE}
        appealWindowOpen={true}
        onAppeal={onAppeal}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-appeal-btn'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('window-closed-label')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Appeal window is closed on the server/i)).toBeInTheDocument();
  });

  it('handles backend rejection (422) gracefully', async () => {
    const err = new Error('deadline has passed');
    err.status = 422;
    const onAppeal = jest.fn().mockRejectedValue(err);

    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={FUTURE_DEADLINE}
        appealWindowOpen={true}
        onAppeal={onAppeal}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-appeal-btn'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('window-closed-label')).toBeInTheDocument(),
    );
  });

  it('shows a generic error for non-deadline backend errors', async () => {
    const onAppeal = jest.fn().mockRejectedValue(new Error('Network error'));
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={FUTURE_DEADLINE}
        appealWindowOpen={true}
        onAppeal={onAppeal}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-appeal-btn'));
    });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/network error/i),
    );
    // Window should still be open
    expect(screen.getByTestId('window-open-label')).toBeInTheDocument();
  });

  it('does not render the submit button when onAppeal is not provided', () => {
    render(
      <AppealDeadlineIndicator
        escrowId="42"
        disputeId={7}
        appealDeadline={FUTURE_DEADLINE}
        appealWindowOpen={true}
      />,
    );
    expect(screen.queryByTestId('submit-appeal-btn')).not.toBeInTheDocument();
  });
});
