import { render, screen } from '@testing-library/react';
import ProfilePage from '../../app/profile/[address]/page';

const params = { address: 'GABCD1234EFGH5678IJKL9012MNOP3456QRST7890UVWX1234YZ56' };

describe('ProfilePage', () => {
  it('renders truncated address', () => {
    render(<ProfilePage params={params} />);
    expect(screen.getByText(/GABCD1/)).toBeInTheDocument();
  });

  it('renders reputation badge', () => {
    render(<ProfilePage params={params} />);
    expect(screen.getByText('87')).toBeInTheDocument();
  });

  it('renders member since', () => {
    render(<ProfilePage params={params} />);
    expect(screen.getByText(/January 2025/)).toBeInTheDocument();
  });

  it('renders stats', () => {
    render(<ProfilePage params={params} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Disputed')).toBeInTheDocument();
    expect(screen.getByText('Volume')).toBeInTheDocument();
    expect(screen.getByText('Completion Rate')).toBeInTheDocument();
  });

  it('renders stat values', () => {
    render(<ProfilePage params={params} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('18,450 USDC')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
  });

  it('renders reputation breakdown section', () => {
    render(<ProfilePage params={params} />);
    expect(screen.getByText('Reputation Breakdown')).toBeInTheDocument();
  });

  it('renders completed escrows section', () => {
    render(<ProfilePage params={params} />);
    expect(screen.getByText('Completed Escrows')).toBeInTheDocument();
  });

  it('renders TRUSTED badge', () => {
    render(<ProfilePage params={params} />);
    expect(screen.getByText('TRUSTED')).toBeInTheDocument();
  });
});
