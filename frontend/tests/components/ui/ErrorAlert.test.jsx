import { render, screen, fireEvent } from '@testing-library/react';
import ErrorAlert from '../../../components/ui/ErrorAlert';

describe('ErrorAlert', () => {
  it('renders nothing when message is empty', () => {
    const { container } = render(<ErrorAlert message="" onDismiss={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when message is null', () => {
    const { container } = render(<ErrorAlert message={null} onDismiss={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders error message', () => {
    render(<ErrorAlert message="Something went wrong" onDismiss={jest.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders default title', () => {
    render(<ErrorAlert message="Error message" onDismiss={jest.fn()} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    render(
      <ErrorAlert message="Error message" onDismiss={jest.fn()} title="Validation Error" />,
    );
    expect(screen.getByText('Validation Error')).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = jest.fn();
    render(<ErrorAlert message="Error message" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss error'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('has error styling', () => {
    const { container } = render(<ErrorAlert message="Error message" onDismiss={jest.fn()} />);
    const alert = container.querySelector('.bg-red-500\\/10');
    expect(alert).toBeInTheDocument();
  });

  it('handles long error messages', () => {
    const longMessage =
      'This is a very long error message that might wrap to multiple lines and should still display properly without breaking the layout';
    render(<ErrorAlert message={longMessage} onDismiss={jest.fn()} />);
    expect(screen.getByText(longMessage)).toBeInTheDocument();
  });
});
