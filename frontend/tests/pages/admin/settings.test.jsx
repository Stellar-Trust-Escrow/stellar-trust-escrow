import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminSettingsPage from '../../../app/admin/settings/page';

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

const mockSettings = {
  platformFeePercent: 2.5,
  stellarNetwork: 'testnet',
  allowedOrigins: 'http://localhost:3000',
};

describe('AdminSettingsPage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('renders page heading', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    });
    render(<AdminSettingsPage />);
    expect(screen.getByText('Platform Settings')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    });
    render(<AdminSettingsPage />);
    expect(screen.getByText('Loading settings…')).toBeInTheDocument();
  });

  it('renders settings after load', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    });
    render(<AdminSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('testnet')).toBeInTheDocument();
    });
  });

  it('renders fee input with current value', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    });
    render(<AdminSettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Platform Fee/)).toHaveValue(2.5);
    });
  });

  it('allows updating fee input', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    });
    render(<AdminSettingsPage />);
    await waitFor(() => screen.getByLabelText(/Platform Fee/));
    fireEvent.change(screen.getByLabelText(/Platform Fee/), { target: { value: '3.0' } });
    expect(screen.getByLabelText(/Platform Fee/)).toHaveValue(3);
  });

  it('shows Save Changes button', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSettings,
    });
    render(<AdminSettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    });
    render(<AdminSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Unauthorized/)).toBeInTheDocument();
    });
  });

  it('shows success toast after saving', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockSettings })
      .mockResolvedValueOnce({ ok: true, json: async () => mockSettings });
    render(<AdminSettingsPage />);
    await waitFor(() => screen.getByRole('button', { name: 'Save Changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => {
      expect(screen.getByText(/Settings saved/)).toBeInTheDocument();
    });
  });
});
