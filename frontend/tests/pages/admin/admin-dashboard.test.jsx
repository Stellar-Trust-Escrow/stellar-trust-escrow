import { render, screen, fireEvent } from '@testing-library/react';
import AdminDashboard from '../../../app/admin/page';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock fetch
global.fetch = jest.fn();

describe('AdminDashboard', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('renders admin dashboard heading', () => {
    render(<AdminDashboard />);
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
  });

  it('shows API key login form when not authenticated', () => {
    render(<AdminDashboard />);
    expect(screen.getByText('Admin Authentication')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter admin API key')).toBeInTheDocument();
  });

  it('shows Authenticate button', () => {
    render(<AdminDashboard />);
    expect(screen.getByRole('button', { name: 'Authenticate' })).toBeInTheDocument();
  });

  it('submits API key on form submit', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        escrows: { total: 10, active: 5, completed: 4, disputed: 1 },
        users: { total: 20 },
        disputes: { open: 1, resolved: 0 },
      }),
    });
    render(<AdminDashboard />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin API key'), {
      target: { value: 'test-key' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Authenticate' }).closest('form'));
    expect(localStorageMock.getItem('adminApiKey')).toBe('test-key');
  });

  it('shows nav items when authenticated', async () => {
    localStorageMock.setItem('adminApiKey', 'test-key');
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        escrows: { total: 10, active: 5, completed: 4, disputed: 1 },
        users: { total: 20 },
        disputes: { open: 1, resolved: 0 },
      }),
    });
    render(<AdminDashboard />);
    expect(await screen.findByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Dispute Resolution')).toBeInTheDocument();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    expect(screen.getByText('Platform Settings')).toBeInTheDocument();
  });

  it('shows error when fetch fails', async () => {
    localStorageMock.setItem('adminApiKey', 'bad-key');
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    });
    render(<AdminDashboard />);
    expect(await screen.findByText(/Unauthorized/)).toBeInTheDocument();
  });

  it('signs out and clears key', async () => {
    localStorageMock.setItem('adminApiKey', 'test-key');
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        escrows: { total: 0, active: 0, completed: 0, disputed: 0 },
        users: { total: 0 },
        disputes: { open: 0, resolved: 0 },
      }),
    });
    render(<AdminDashboard />);
    const signOut = await screen.findByText('Sign out');
    fireEvent.click(signOut);
    expect(localStorageMock.getItem('adminApiKey')).toBeNull();
    expect(screen.getByText('Admin Authentication')).toBeInTheDocument();
  });
});
