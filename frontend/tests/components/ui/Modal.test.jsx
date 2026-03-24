import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../../../components/ui/Modal';

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<Modal isOpen={false} onClose={jest.fn()} title="Test"><p>Content</p></Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders content when isOpen is true', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="My Modal"><p>Hello</p></Modal>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="My Modal"><p>Content</p></Modal>);
    expect(screen.getByText('My Modal')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<Modal isOpen={true} onClose={onClose} title="Test"><p>Content</p></Modal>);
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(
      <Modal isOpen={true} onClose={onClose} title="Test"><p>Content</p></Modal>
    );
    // Click the backdrop (absolute positioned div)
    const backdrop = container.querySelector('.absolute.inset-0');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = jest.fn();
    render(<Modal isOpen={true} onClose={onClose} title="Test"><p>Content</p></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on non-Escape key', () => {
    const onClose = jest.fn();
    render(<Modal isOpen={true} onClose={onClose} title="Test"><p>Content</p></Modal>);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies size classes', () => {
    const { container } = render(
      <Modal isOpen={true} onClose={jest.fn()} size="lg"><p>Content</p></Modal>
    );
    expect(container.querySelector('.max-w-2xl')).toBeInTheDocument();
  });

  it('has aria-modal attribute', () => {
    render(<Modal isOpen={true} onClose={jest.fn()} title="Test"><p>Content</p></Modal>);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
