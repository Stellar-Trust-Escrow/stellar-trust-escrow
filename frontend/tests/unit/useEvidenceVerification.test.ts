import { renderHook, act } from '@testing-library/react';
import { useEvidenceVerification } from '../../hooks/useEvidenceVerification';

const MOCK_CID = 'QmXfAR8e7Ni5xPkE1iQ2Yq2pNRbHd8kLpK7yF1z3v9t6n';
const EXPECTED_MOCK_HASH = 'a'.repeat(64);
const GATEWAY = '/api/v1/ipfs';

function mockFetchResponse(ok: boolean, bytes: number[]) {
  return jest.fn().mockResolvedValue({
    ok,
    arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array(bytes).buffer),
  });
}

function mockCryptoSubtle(hexResult: string) {
  const digest = jest
    .fn()
    .mockResolvedValue(
      new Uint8Array(hexResult.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))).buffer,
    );
  Object.defineProperty(globalThis, 'crypto', {
    value: { subtle: { digest } },
    configurable: true,
    writable: true,
  });
  return digest;
}

beforeEach(() => {
  global.fetch = jest.fn();
  mockCryptoSubtle(EXPECTED_MOCK_HASH);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useEvidenceVerification', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() =>
      useEvidenceVerification({ cid: MOCK_CID, expectedHash: EXPECTED_MOCK_HASH }),
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.bytes).toBeNull();
  });

  it('transitions to verified on hash match', async () => {
    (global.fetch as jest.Mock).mockImplementation(mockFetchResponse(true, [0x61, 0x61, 0x61]));

    const { result } = renderHook(() =>
      useEvidenceVerification({
        cid: MOCK_CID,
        expectedHash: EXPECTED_MOCK_HASH,
        gateways: [GATEWAY],
      }),
    );

    await act(async () => {
      result.current.verify();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('verified');
    expect(result.current.bytes).toBeInstanceOf(ArrayBuffer);
    expect(result.current.error).toBeNull();
  });

  it('transitions to mismatch when hash does not match', async () => {
    (global.fetch as jest.Mock).mockImplementation(mockFetchResponse(true, [0xff, 0xff, 0xff]));

    mockCryptoSubtle('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    const { result } = renderHook(() =>
      useEvidenceVerification({
        cid: MOCK_CID,
        expectedHash: EXPECTED_MOCK_HASH,
        gateways: [GATEWAY],
      }),
    );

    await act(async () => {
      result.current.verify();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('mismatch');
    expect(result.current.bytes).toBeInstanceOf(ArrayBuffer);
  });

  it('transitions to error when all gateways fail', async () => {
    (global.fetch as jest.Mock).mockImplementation(mockFetchResponse(false, []));

    const { result } = renderHook(() =>
      useEvidenceVerification({
        cid: MOCK_CID,
        expectedHash: EXPECTED_MOCK_HASH,
        gateways: [GATEWAY],
      }),
    );

    await act(async () => {
      result.current.verify();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBeTruthy();
    expect(result.current.bytes).toBeNull();
  });

  it('tries next gateway when first fails', async () => {
    const gateway1 = '/gateway1';
    const gateway2 = '/gateway2';

    (global.fetch as jest.Mock)
      .mockImplementationOnce(mockFetchResponse(false, []))
      .mockImplementationOnce(mockFetchResponse(true, [0x61, 0x61, 0x61]));

    const { result } = renderHook(() =>
      useEvidenceVerification({
        cid: MOCK_CID,
        expectedHash: EXPECTED_MOCK_HASH,
        gateways: [gateway1, gateway2],
      }),
    );

    await act(async () => {
      result.current.verify();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('verified');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(gateway2),
      expect.any(Object),
    );
  });

  it('reset clears state', async () => {
    const { result } = renderHook(() =>
      useEvidenceVerification({ cid: MOCK_CID, expectedHash: EXPECTED_MOCK_HASH }),
    );

    act(() => {
      result.current.verify();
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.bytes).toBeNull();
  });

  it('returns verify and reset functions', () => {
    const { result } = renderHook(() =>
      useEvidenceVerification({ cid: MOCK_CID, expectedHash: EXPECTED_MOCK_HASH }),
    );

    expect(typeof result.current.verify).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('shows progress while verifying', async () => {
    let resolveFetch: (v: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    (global.fetch as jest.Mock).mockReturnValue(fetchPromise);

    const { result } = renderHook(() =>
      useEvidenceVerification({
        cid: MOCK_CID,
        expectedHash: EXPECTED_MOCK_HASH,
        gateways: [GATEWAY],
      }),
    );

    act(() => {
      result.current.verify();
    });

    expect(result.current.status).toBe('verifying');
    expect(result.current.progress).toBeGreaterThanOrEqual(0);

    act(() => {
      resolveFetch!({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([0x61]).buffer),
      } as Response);
    });

    await act(async () => {
      await Promise.resolve();
    });
  });
});
