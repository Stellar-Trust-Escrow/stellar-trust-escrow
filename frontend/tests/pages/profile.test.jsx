import { render, screen } from '@testing-library/react';
import ProfilePage from '../../app/profile/[address]/page';

const params = { address: 'GABCD1234EFGH5678IJKL9012MNOP3456QRST7890UVWX1234YZ56' };

describe('ProfilePage', () => {
  async function renderProfilePage() {
    render(await ProfilePage({ params }));
  }

  it('renders truncated address', async () => {
    await renderProfilePage();
    expect(screen.getByText(/GABCD1/)).toBeInTheDocument();
  });

  it('renders reputation badge', async () => {
    await renderProfilePage();
    expect(screen.getByText('87')).toBeInTheDocument();
  });

  it('renders member since', async () => {
    await renderProfilePage();
    expect(screen.getByText(/January 2025/)).toBeInTheDocument();
  });

  it('renders stats', async () => {
    await renderProfilePage();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Disputed')).toBeInTheDocument();
    expect(screen.getByText('Volume')).toBeInTheDocument();
    expect(screen.getByText('Completion Rate')).toBeInTheDocument();
  });

  it('renders stat values', async () => {
    await renderProfilePage();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('18,450 USDC')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
  });

  it('renders TRUSTED badge', async () => {
    await renderProfilePage();
    expect(screen.getByText('TRUSTED')).toBeInTheDocument();
  });
});
