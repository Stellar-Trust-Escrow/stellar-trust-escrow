import { render, screen } from '@testing-library/react';
import TransactionHash from '../../../components/ui/TransactionHash';

describe('TransactionHash', () => {
  const mockHash = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2';

  it('renders transaction hash', () => {
    render(<TransactionHash hash={mockHash} />);
    expect(screen.getByText(mockHash)).toBeInTheDocument();
  });

  it('renders default label', () => {
    render(<TransactionHash hash={mockHash} />);
    expect(screen.getByText('Transaction Hash')).toBeInTheDocument();
  });

  it('renders custom label', () => {
    render(<TransactionHash hash={mockHash} label="TX ID" />);
    expect(screen.getByText('TX ID')).toBeInTheDocument();
  });

  it('renders copy button', () => {
    render(<TransactionHash hash={mockHash} />);
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('renders explorer link when explorerUrl is provided', () => {
    const explorerUrl = 'https://stellar.expert/explorer/testnet/tx/' + mockHash;
    render(<TransactionHash hash={mockHash} explorerUrl={explorerUrl} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', explorerUrl);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render explorer link when explorerUrl is not provided', () => {
    render(<TransactionHash hash={mockHash} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders dash when hash is empty', () => {
    render(<TransactionHash hash="" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash when hash is null', () => {
    render(<TransactionHash hash={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('has correct view button title', () => {
    const explorerUrl = 'https://example.com';
    render(<TransactionHash hash={mockHash} explorerUrl={explorerUrl} />);
    expect(screen.getByTitle('View on block explorer')).toBeInTheDocument();
  });
});
