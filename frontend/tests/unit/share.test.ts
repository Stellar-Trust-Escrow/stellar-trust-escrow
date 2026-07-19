import { shareContent, copyToClipboard } from '../../lib/share';

describe('share (Web Share API)', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    // Restore a clean navigator between tests.
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  });

  function mockNavigator(overrides = {}) {
    Object.defineProperty(global, 'navigator', {
      value: { ...originalNavigator, ...overrides },
      configurable: true,
      writable: true,
    });
  }

  it('calls navigator.share when available (mobile)', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    mockNavigator({ share });

    const result = await shareContent({ title: 'T', text: 'X', url: 'https://example.com' });

    expect(share).toHaveBeenCalledWith({ title: 'T', text: 'X', url: 'https://example.com' });
    expect(result.method).toBe('native');
    expect(result.shared).toBe(true);
  });

  it('falls back to clipboard copy when navigator.share is missing', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    mockNavigator({ clipboard: { writeText } });

    const result = await shareContent({ url: 'https://example.com/escrow/5' });

    expect(writeText).toHaveBeenCalledWith('https://example.com/escrow/5');
    expect(result.method).toBe('clipboard');
    expect(result.shared).toBe(false);
  });

  it('treats a user-cancelled native share as not shared (no throw)', async () => {
    const share = jest.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    mockNavigator({ share });

    const result = await shareContent({ url: 'https://example.com' });

    expect(result.method).toBe('native');
    expect(result.shared).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('copyToClipboard uses the legacy execCommand fallback when clipboard API is absent', async () => {
    mockNavigator({}); // no clipboard, no share
    const execCommand = jest.fn(() => true);
    document.execCommand = execCommand;

    const ok = await copyToClipboard('https://example.com');
    expect(ok).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
