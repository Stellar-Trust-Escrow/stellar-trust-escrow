import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CancelEscrowModal from '../../../components/escrow/CancelEscrowModal';

describe('CancelEscrowModal', () => {
  it('renders nothing when isOpen is false', () => {
    render(
      <CancelEscrowModal
        isOpen={false}
        onClose={jest.fn()}
        escrowId={1}
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal when isOpen is true', () => {
    render(
      <CancelEscrowModal
        isOpen={true}
        onClose={jest.fn()}
        escrowId={1}
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cancel Escrow' })).toBeInTheDocument();
  });

  it('displays escrow ID', () => {
    render(
      <CancelEscrowModal
        isOpen={true}
        onClose={jest.fn()}
        escrowId={42}
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.getByText('Escrow #42')).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = jest.fn();
    render(
      <CancelEscrowModal
        isOpen={true}
        onClose={onClose}
        escrowId={1}
        onConfirm={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    render(
      <CancelEscrowModal
        isOpen={true}
        onClose={jest.fn()}
        escrowId={1}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel Escrow/ }));
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('calls onClose after successful confirmation', async () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    render(
      <CancelEscrowModal
        isOpen={true}
        onClose={onClose}
        escrowId={1}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel Escrow/ }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('displays error message on confirmation failure', async () => {
    const onConfirm = jest.fn().mockRejectedValue(new Error('Network error'));
    render(
      <CancelEscrowModal
        isOpen={true}
        onClose={jest.fn()}
        escrowId={1}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel Escrow/ }));
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows warning message', () => {
    render(
      <CancelEscrowModal
        isOpen={true}
        onClose={jest.fn()}
        escrowId={1}
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.getByText(/return all funds/i)).toBeInTheDocument();
  });
});
