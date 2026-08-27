import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import DisputeForm from '../../components/dispute/DisputeForm';
import api from '../../lib/api/client';
import { sha256Hex, uploadFileChunked } from '../../lib/fileUpload';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('../../lib/api/client', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

const mockPush = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useRouter.mockReturnValue({ push: mockPush });
  api.post.mockResolvedValue({ data: {} });
});

// ── lib/fileUpload ───────────────────────────────────────────────────────────

describe('sha256Hex', () => {
  it('computes the correct digest for a known input', async () => {
    const file = new File([new Uint8Array([0x61, 0x62, 0x63])], 'abc.txt', {
      type: 'text/plain',
    });
    const hash = await sha256Hex(file);
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('uploadFileChunked', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'evidence-1' }),
    });
  });

  it('sends correct Content-Range headers for each 1 MB chunk', async () => {
    const size = 2.5 * 1024 * 1024; // spans three 1 MB chunks
    const file = new File([new Uint8Array(size)], 'evidence.zip', {
      type: 'application/zip',
    });

    await uploadFileChunked(file, { endpoint: '/api/v1/evidence/upload' });

    expect(global.fetch).toHaveBeenCalledTimes(3);
    const ranges = global.fetch.mock.calls.map(([, init]) => init.headers['Content-Range']);
    expect(ranges).toEqual([
      'bytes 0-1048575/2621440',
      'bytes 1048576-2097151/2621440',
      'bytes 2097152-2621439/2621440',
    ]);
  });
});

// ── DisputeForm ──────────────────────────────────────────────────────────────

describe('DisputeForm', () => {
  it('has an accessible drag-and-drop zone with a keyboard fallback button', () => {
    render(<DisputeForm escrowId="escrow-1" />);
    expect(
      screen.getByRole('button', { name: /drag and drop evidence files/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse files/i })).toBeInTheDocument();
  });

  it('renders the evidence list as an aria-live region', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<DisputeForm escrowId="escrow-1" />);
    const input = document.querySelector('input[type="file"]');
    const file = new File([new Uint8Array(1024)], 'photo.png', { type: 'image/png' });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    const list = await screen.findByLabelText(/evidence files/i);
    expect(list).toHaveAttribute('aria-live', 'polite');
  });

  describe('file validation', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('rejects a file larger than 20 MB before upload starts', async () => {
      render(<DisputeForm escrowId="escrow-1" />);
      const input = document.querySelector('input[type="file"]');
      const bigFile = new File([new Uint8Array(1024)], 'big.png', { type: 'image/png' });
      Object.defineProperty(bigFile, 'size', { value: 21 * 1024 * 1024 });

      await act(async () => {
        fireEvent.change(input, { target: { files: [bigFile] } });
      });

      expect(screen.getByRole('alert')).toHaveTextContent(/20 mb limit/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects a disallowed MIME type with a user-friendly error', async () => {
      render(<DisputeForm escrowId="escrow-1" />);
      const input = document.querySelector('input[type="file"]');
      const file = new File([new Uint8Array(1024)], 'clip.mp4', { type: 'video/mp4' });

      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });

      expect(screen.getByRole('alert')).toHaveTextContent(/isn't a supported file type/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects more than 5 files', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      render(<DisputeForm escrowId="escrow-1" />);
      const input = document.querySelector('input[type="file"]');
      const files = Array.from({ length: 6 }, (_, i) =>
        new File([new Uint8Array(64)], `file-${i}.png`, { type: 'image/png' }),
      );

      await act(async () => {
        fireEvent.change(input, { target: { files } });
      });

      expect(screen.getByRole('alert')).toHaveTextContent(/up to 5 files/i);
    });
  });

  describe('submission flow', () => {
    it('blocks submission until the confirmation modal is confirmed', async () => {
      render(<DisputeForm escrowId="escrow-1" />);
      fireEvent.change(screen.getByLabelText(/reason/i), {
        target: { value: 'Item never arrived' },
      });
      fireEvent.click(screen.getByRole('button', { name: /submit dispute/i }));

      expect(api.post).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/funds will be frozen/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /confirm dispute/i }));

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith('/v1/escrows/escrow-1/dispute', {
          reason: 'Item never arrived',
          evidenceHashes: [],
        }),
      );
      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/escrows/escrow-1'));
    });

    it('does not submit when the confirmation modal is cancelled', () => {
      render(<DisputeForm escrowId="escrow-1" />);
      fireEvent.change(screen.getByLabelText(/reason/i), {
        target: { value: 'Item never arrived' },
      });
      fireEvent.click(screen.getByRole('button', { name: /submit dispute/i }));
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('traps focus within the confirmation modal', async () => {
      render(<DisputeForm escrowId="escrow-1" />);
      fireEvent.change(screen.getByLabelText(/reason/i), {
        target: { value: 'Item never arrived' },
      });
      fireEvent.click(screen.getByRole('button', { name: /submit dispute/i }));

      const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });
      const confirmBtn = screen.getByRole('button', { name: /confirm dispute/i });

      await waitFor(() => expect(cancelBtn).toHaveFocus());

      confirmBtn.focus();
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(cancelBtn).toHaveFocus();

      cancelBtn.focus();
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(confirmBtn).toHaveFocus();
    });
  });
});
