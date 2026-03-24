import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminUsersPage from '../../../app/admin/users/page';

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

global.fetch = jest.fn();

const mockUser = {
  address: 'GABCDEF1234567890ABCDEF',
  totalScore: 150,
  completedEscrows: 5,
  disputedEscrows: 1,
};

describe('AdminUsersPage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('renders page heading', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: [], pagination: { page: 1, total: 0, pages: 1 } }),
    });
    render(<AdminUsersPage />);
    expect(screen.getByText('User Management')).toBeInTheDocument();
  });

  it('renders search input', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: [], pagination: { page: 1, total: 0, pages: 1 } }),
    });
    render(<AdminUsersPage />);
    expect(screen.getByPlaceholderText(/Search by Stellar address/)).toBeInTheDocument();
  });

  it('shows empty state when no users', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: [], pagination: { page: 1, total: 0, pages: 1 } }),
    });
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText('No users found.')).toBeInTheDocument();
    });
  });

  it('renders user rows', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: [mockUser], pagination: { page: 1, total: 1, pages: 1 } }),
    });
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText('150')).toBeInTheDocument();
    });
  });

  it('shows Suspend and Ban buttons for each user', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: [mockUser], pagination: { page: 1, total: 1, pages: 1 } }),
    });
    render(<AdminUsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Suspend')).toBeInTheDocument();
      expect(screen.getByText('Ban')).toBeInTheDocument();
    });
  });

  it('opens action modal when Suspend is clicked', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: [mockUser], pagination: { page: 1, total: 1, pages: 1 } }),
    });
    render(<AdminUsersPage />);
    await waitFor(() => screen.getByText('Suspend'));
    fireEvent.click(screen.getByText('Suspend'));
    expect(screen.getByText('suspend User')).toBeInTheDocument();
  });

  it('opens action modal when Ban is clicked', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: [mockUser], pagination: { page: 1, total: 1, pages: 1 } }),
    });
    render(<AdminUsersPage />);
    await waitFor(() => screen.getByText('Ban'));
    fireEvent.click(screen.getByText('Ban'));
    expect(screen.getByText('ban User')).toBeInTheDocument();
  });

  it('closes modal when Cancel is clicked', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: [mockUser], pagination: { page: 1, total: 1, pages: 1 } }),
    });
    render(<AdminUsersPage />);
    await waitFor(() => screen.getByText('Suspend'));
    fireEvent.click(screen.getByText('Suspend'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('suspend User')).not.toBeInTheDocument();
  });

  it('triggers search on Enter key', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [], pagination: { page: 1, total: 0, pages: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [], pagination: { page: 1, total: 0, pages: 1 } }),
      });
    render(<AdminUsersPage />);
    const input = screen.getByPlaceholderText(/Search by Stellar address/);
    fireEvent.change(input, { target: { value: 'GABC' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
