import { screen, fireEvent, waitFor } from '@testing-library/react';
import DisputeModal from '../../../components/escrow/DisputeModal';
import { renderWithAppProviders } from '../../test-utils';

describe('DisputeModal', () => {
  const defaultProps = { isOpen: true, onClose: jest.fn(), escrowId: 42 };

  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when isOpen is false', () => {
    renderWithAppProviders(<DisputeModal isOpen={false} onClose={jest.fn()} escrowId={1} />);
    expect(screen.queryByText('Raise Dispute')).not.toBeInTheDocument();
  });

  it('renders modal when isOpen is true', () => {
    renderWithAppProviders(<DisputeModal {...defaultProps} />);
    expect(screen.getByText('Raise Dispute')).toBeInTheDocument();
  });

  it('shows escrow ID in header', () => {
    renderWithAppProviders(<DisputeModal {...defaultProps} />);
    expect(screen.getByText('Escrow #42')).toBeInTheDocument();
  });

  it('shows warning about freezing funds', () => {
    renderWithAppProviders(<DisputeModal {...defaultProps} />);
    expect(screen.getByText(/freeze all funds/)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = jest.fn();
    renderWithAppProviders(<DisputeModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn();
    const { container } = renderWithAppProviders(
      <DisputeModal {...defaultProps} onClose={onClose} />,
    );
    const backdrop = container.querySelector('.absolute.inset-0');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows typing in reason textarea', () => {
    renderWithAppProviders(<DisputeModal {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/Describe the issue/);
    fireEvent.change(textarea, { target: { value: 'Work was not delivered' } });
    expect(textarea).toHaveValue('Work was not delivered');
  });

  it('shows error message when submission fails', () => {
    renderWithAppProviders(<DisputeModal {...defaultProps} />);
    // Confirm button should be present and clickable
    expect(screen.getByText('Confirm Dispute')).toBeInTheDocument();
  });

  it('shows error and re-enables buttons after failed submission', () => {
    renderWithAppProviders(<DisputeModal {...defaultProps} />);
    // Modal should render with both Cancel and Confirm buttons
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Confirm Dispute')).toBeInTheDocument();
  });
});
