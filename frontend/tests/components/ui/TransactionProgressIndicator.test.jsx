import { render, screen, fireEvent } from '@testing-library/react';
import TransactionProgressIndicator from '../../../components/ui/TransactionProgressIndicator';

describe('TransactionProgressIndicator', () => {
  it('does not render when isOpen is false', () => {
    render(<TransactionProgressIndicator isOpen={false} currentStep="signing" />);
    expect(screen.queryByText('Processing Transaction')).not.toBeInTheDocument();
  });

  it('renders when isOpen is true', () => {
    render(<TransactionProgressIndicator isOpen={true} currentStep="signing" />);
    expect(screen.getByText('Processing Transaction')).toBeInTheDocument();
  });

  it('displays all steps', () => {
    render(<TransactionProgressIndicator isOpen={true} currentStep="signing" />);
    expect(screen.getByTestId('step-signing')).toBeInTheDocument();
    expect(screen.getByTestId('step-broadcast')).toBeInTheDocument();
    expect(screen.getByTestId('step-confirming')).toBeInTheDocument();
    expect(screen.getByTestId('step-confirmed')).toBeInTheDocument();
  });

  it('highlights current step', () => {
    render(<TransactionProgressIndicator isOpen={true} currentStep="broadcast" />);
    const broadcastStep = screen.getByTestId('step-broadcast');
    expect(broadcastStep.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('marks completed steps as done', () => {
    render(<TransactionProgressIndicator isOpen={true} currentStep="confirming" />);
    const signingStep = screen.getByTestId('step-signing');
    const broadcastStep = screen.getByTestId('step-broadcast');

    expect(signingStep.textContent).toContain('✓');
    expect(broadcastStep.textContent).toContain('✓');
  });

  it('displays transaction hash link', () => {
    const hash = 'abcd1234efgh5678ijkl9012';
    render(
      <TransactionProgressIndicator
        isOpen={true}
        currentStep="broadcast"
        transactionHash={hash}
      />,
    );
    const link = screen.getByTestId('tx-hash-link');
    expect(link).toBeInTheDocument();
    expect(link.href).toContain(hash);
  });

  it('uses testnet explorer URL by default', () => {
    const hash = 'test123';
    render(
      <TransactionProgressIndicator
        isOpen={true}
        currentStep="broadcast"
        transactionHash={hash}
      />,
    );
    const link = screen.getByTestId('tx-hash-link');
    expect(link.href).toContain('stellar.expert/explorer/testnet');
  });

  it('uses mainnet explorer URL when specified', () => {
    const hash = 'test123';
    render(
      <TransactionProgressIndicator
        isOpen={true}
        currentStep="broadcast"
        transactionHash={hash}
        network="mainnet"
      />,
    );
    const link = screen.getByTestId('tx-hash-link');
    expect(link.href).toContain('stellar.expert/explorer/mainnet');
  });

  it('displays error state', () => {
    render(
      <TransactionProgressIndicator
        isOpen={true}
        currentStep="signing"
        error="User rejected transaction"
      />,
    );
    expect(screen.getByText('Transaction Error')).toBeInTheDocument();
    expect(screen.getByText('User rejected transaction')).toBeInTheDocument();
  });

  it('shows close button on error', () => {
    render(
      <TransactionProgressIndicator
        isOpen={true}
        currentStep="signing"
        error="Transaction failed"
      />,
    );
    expect(screen.getByTestId('close-button')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(
      <TransactionProgressIndicator
        isOpen={true}
        currentStep="signing"
        error="Failed"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('close-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows success button when confirmed', () => {
    render(
      <TransactionProgressIndicator isOpen={true} currentStep="confirmed" />,
    );
    expect(screen.getByTestId('success-button')).toBeInTheDocument();
  });

  it('calls onClose when success button is clicked', () => {
    const onClose = jest.fn();
    render(
      <TransactionProgressIndicator
        isOpen={true}
        currentStep="confirmed"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('success-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows wait message during processing', () => {
    render(<TransactionProgressIndicator isOpen={true} currentStep="confirming" />);
    expect(screen.getByText(/up to 30 seconds/i)).toBeInTheDocument();
  });
});
