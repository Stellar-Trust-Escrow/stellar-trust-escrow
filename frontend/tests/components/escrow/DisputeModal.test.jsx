import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DisputeModal from '../../../components/escrow/DisputeModal';

describe('DisputeModal', () => {
  const defaultProps = { isOpen: true, onClose: jest.fn(), escrowId: 42 };

  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when isOpen is false', () => {
    render(<DisputeModal isOpen={false} onClose={jest.fn()} escrowId={1} />);
    expect(screen.queryByText('Raise Dispute')).not.toBeInTheDocument();
  });

  it('renders modal when isOpen is true', () => {
    render(<DisputeModal {...defaultProps} />);
    expect(screen.getByText('Raise Dispute')).toBeInTheDocument();
  });

  it('shows escrow ID in header', () => {
    render(<DisputeModal {...defaultProps} />);
    expect(screen.getByText('Escrow #42')).toBeInTheDocument();
  });

  it('shows warning about freezing funds', () => {
    render(<DisputeModal {...defaultProps} />);
    expect(screen.getByText(/freeze all funds/)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = jest.fn();
    render(<DisputeModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(<DisputeModal {...defaultProps} onClose={onClose} />);
    const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/70');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows typing in reason textarea', () => {
    render(<DisputeModal {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/Describe the issue/);
    fireEvent.change(textarea, { target: { value: 'Work was not delivered' } });
    expect(textarea).toHaveValue('Work was not delivered');
  });

  it('shows error message when submission fails', async () => {
    render(<DisputeModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Confirm Dispute'));
    await waitFor(() => {
      expect(screen.getByText(/Not implemented/)).toBeInTheDocument();
    });
  });

  it('shows error and re-enables buttons after failed submission', async () => {
    render(<DisputeModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Confirm Dispute'));
    // After the async throw resolves, error is shown and buttons are re-enabled
    await waitFor(() => {
      expect(screen.getByText(/Not implemented/)).toBeInTheDocument();
    });
    expect(screen.getByText('Cancel')).not.toBeDisabled();
  });
});
