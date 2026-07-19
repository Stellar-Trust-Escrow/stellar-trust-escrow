// frontend/tests/components/TwoFactor.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TwoFactorSetup from '../../app/settings/security/page.jsx';
import { TwoFactorChallenge } from '../../components/auth/TwoFactorChallenge.jsx';

// Mock fetch globally
global.fetch = jest.fn();

afterEach(() => {
  jest.clearAllMocks();
});

describe('TwoFactorSetup component', () => {
  test('auto‑submits after 6 digits and calls verify API', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ otpauth_url: 'otpauth://totp/test', secret: 'ABCDEF' }),
    }); // setup
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ backup_codes: ['code1', 'code2'] }),
    }); // verify

    render(<TwoFactorSetup />);

    // Wait for QR generation (fetch called)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    const input = screen.getByLabelText(/Enter 6‑digit code:/i);
    fireEvent.change(input, { target: { value: '123456' } });

    // Should trigger second fetch (verify)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/auth/2fa/verify',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('TwoFactorChallenge component', () => {
  test('auto‑submits after 6 digits and calls challenge API', async () => {
    const token = 'pending-token';
    fetch.mockResolvedValueOnce({ ok: true });

    render(<TwoFactorChallenge mfaPendingToken={token} />);

    const input = screen.getByLabelText(/Authentication code/i);
    fireEvent.change(input, { target: { value: '654321' } });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/auth/2fa/challenge',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: '654321', mfaPendingToken: token }),
        }),
      ),
    );
  });

  test('shows use backup code toggle button', () => {
    render(<TwoFactorChallenge mfaPendingToken="t" />);
    expect(screen.getByText(/Use backup code/i)).toBeInTheDocument();
  });
});
