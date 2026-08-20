import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmationDialog from '../../../components/ui/ConfirmationDialog';

describe('ConfirmationDialog', () => {
  it('does not render when isOpen is false', () => {
    render(
      <ConfirmationDialog
        isOpen={false}
        title="Confirm Action"
        description="Are you sure?"
      />,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renders when isOpen is true', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Confirm Action"
        description="Are you sure?"
      />,
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
  });

  it('displays title and description', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Delete Item"
        description="This will permanently delete the item."
      />,
    );
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(screen.getByText('This will permanently delete the item.')).toBeInTheDocument();
  });

  it('renders default button labels', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Confirm"
        description="Test"
      />,
    );
    expect(screen.getByTestId('confirm-button')).toHaveTextContent('Confirm');
    expect(screen.getByTestId('cancel-button')).toHaveTextContent('Cancel');
  });

  it('renders custom button labels', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Confirm"
        description="Test"
        confirmLabel="Release Funds"
        cancelLabel="Go Back"
      />,
    );
    expect(screen.getByTestId('confirm-button')).toHaveTextContent('Release Funds');
    expect(screen.getByTestId('cancel-button')).toHaveTextContent('Go Back');
  });

  it('displays details object', () => {
    const details = {
      Amount: '1000 USDC',
      'Recipient Address': 'GXXXXXX...',
    };
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Confirm"
        description="Release funds"
        details={details}
      />,
    );
    expect(screen.getByText('Amount:')).toBeInTheDocument();
    expect(screen.getByText('1000 USDC')).toBeInTheDocument();
    expect(screen.getByText('Recipient Address:')).toBeInTheDocument();
  });

  it('shows danger warning when isDangerous is true', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Delete"
        description="Permanent action"
        isDangerous={true}
      />,
    );
    expect(screen.getByText(/This action cannot be undone/i)).toBeInTheDocument();
  });

  it('applies red styling for dangerous actions', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Delete"
        description="Permanent action"
        isDangerous={true}
      />,
    );
    const confirmBtn = screen.getByTestId('confirm-button');
    expect(confirmBtn).toHaveClass('bg-red-600');
  });

  it('applies indigo styling for non-dangerous actions', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Confirm"
        description="Action"
        isDangerous={false}
      />,
    );
    const confirmBtn = screen.getByTestId('confirm-button');
    expect(confirmBtn).toHaveClass('bg-indigo-600');
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = jest.fn();
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Confirm"
        description="Action"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByTestId('confirm-button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = jest.fn();
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Confirm"
        description="Action"
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId('cancel-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key press', () => {
    const onCancel = jest.fn();
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Confirm"
        description="Action"
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('has focus on cancel button by default', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Confirm"
        description="Action"
      />,
    );
    expect(screen.getByTestId('cancel-button')).toHaveFocus();
  });

  it('is keyboard accessible', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Confirm"
        description="Action"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const confirmBtn = screen.getByTestId('confirm-button');
    const cancelBtn = screen.getByTestId('cancel-button');

    expect(confirmBtn).toBeInTheDocument();
    expect(cancelBtn).toBeInTheDocument();
    expect(confirmBtn).toHaveClass('focus-visible:ring-2');
    expect(cancelBtn).toHaveClass('focus-visible:ring-2');
  });

  it('has role alertdialog', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Confirm"
        description="Action"
      />,
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('has aria-labelledby and aria-describedby', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        title="Confirm"
        description="Action"
      />,
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'dialog-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'dialog-description');
  });
});
