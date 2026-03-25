import { render, screen, waitFor } from '@testing-library/react';
import AdminAuditLogsPage from '../../../app/admin/audit-logs/page';

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

global.fetch = jest.fn();

describe('AdminAuditLogsPage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('renders page heading', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ logs: [], pagination: { page: 1, total: 0, pages: 1 } }),
    });
    render(<AdminAuditLogsPage />);
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ logs: [], pagination: { page: 1, total: 0, pages: 1 } }),
    });
    render(<AdminAuditLogsPage />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty state when no logs', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ logs: [], pagination: { page: 1, total: 0, pages: 1 } }),
    });
    render(<AdminAuditLogsPage />);
    await waitFor(() => {
      expect(screen.getByText('No audit entries yet.')).toBeInTheDocument();
    });
  });

  it('renders log entries', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        logs: [
          {
            id: 1,
            action: 'BAN_USER',
            targetAddress: 'GABC123',
            reason: 'Spam',
            performedAt: '2025-03-01T10:00:00Z',
          },
        ],
        pagination: { page: 1, total: 1, pages: 1 },
      }),
    });
    render(<AdminAuditLogsPage />);
    await waitFor(() => {
      expect(screen.getByText('BAN_USER')).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    });
    render(<AdminAuditLogsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Unauthorized/)).toBeInTheDocument();
    });
  });

  it('renders table headers', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ logs: [], pagination: { page: 1, total: 0, pages: 1 } }),
    });
    render(<AdminAuditLogsPage />);
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('renders back to dashboard link', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ logs: [], pagination: { page: 1, total: 0, pages: 1 } }),
    });
    render(<AdminAuditLogsPage />);
    expect(screen.getByText('← Dashboard')).toBeInTheDocument();
  });
});
