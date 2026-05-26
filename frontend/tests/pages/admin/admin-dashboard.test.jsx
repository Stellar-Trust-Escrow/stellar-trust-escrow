import { screen, fireEvent } from '@testing-library/react';
import AdminDashboard from '../../../app/admin/page';
import { renderWithStore } from '../../../store/test-utils';
import { APP_STORAGE_KEY } from '../../../store/state';

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
    renderWithStore(<AdminDashboard />);
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
  });

  it('shows API key login form when not authenticated', () => {
    renderWithStore(<AdminDashboard />);
    expect(screen.getByText('Admin Authentication')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter admin API key')).toBeInTheDocument();
  });

  it('shows Authenticate button', () => {
    renderWithStore(<AdminDashboard />);
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
    renderWithStore(<AdminDashboard />);
    fireEvent.change(screen.getByPlaceholderText('Enter admin API key'), {
      target: { value: 'test-key' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Authenticate' }).closest('form'));
    const persisted = JSON.parse(localStorageMock.getItem(APP_STORAGE_KEY));
    expect(persisted.admin.apiKey).toBe('test-key');
  });

  it('shows nav items when authenticated', async () => {
    localStorageMock.setItem(APP_STORAGE_KEY, JSON.stringify({ admin: { apiKey: 'test-key' } }));
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        escrows: { total: 10, active: 5, completed: 4, disputed: 1 },
        users: { total: 20 },
        disputes: { open: 1, resolved: 0 },
      }),
    });
    renderWithStore(<AdminDashboard />);
    expect(await screen.findByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Dispute Resolution')).toBeInTheDocument();
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    expect(screen.getByText('Platform Settings')).toBeInTheDocument();
  });

  it('shows error when fetch fails', async () => {
    localStorageMock.setItem(APP_STORAGE_KEY, JSON.stringify({ admin: { apiKey: 'bad-key' } }));
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    });
    renderWithStore(<AdminDashboard />);
    expect(await screen.findByText(/Unauthorized/)).toBeInTheDocument();
  });

  it('signs out and clears key', async () => {
    localStorageMock.setItem(APP_STORAGE_KEY, JSON.stringify({ admin: { apiKey: 'test-key' } }));
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        escrows: { total: 0, active: 0, completed: 0, disputed: 0 },
        users: { total: 0 },
        disputes: { open: 0, resolved: 0 },
      }),
    });
    renderWithStore(<AdminDashboard />);
    const signOut = await screen.findByText('Sign out');
    fireEvent.click(signOut);
    const persisted = JSON.parse(localStorageMock.getItem(APP_STORAGE_KEY));
    expect(persisted.admin.apiKey).toBe('');
    expect(screen.getByText('Admin Authentication')).toBeInTheDocument();
  });
});
