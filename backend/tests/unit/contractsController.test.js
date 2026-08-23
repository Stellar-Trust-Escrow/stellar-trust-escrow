import { jest } from '@jest/globals';

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
  logControllerError: jest.fn(),
}));

let contractsController;

beforeAll(async () => {
  contractsController = (await import('../../api/controllers/contractsController.js')).default;
});

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ESCROW_CONTRACT_ID;
  delete process.env.CONTRACT_ADDRESS;
  delete process.env.REFERRAL_REGISTRY_CONTRACT_ID;
  delete process.env.GOVERNANCE_CONTRACT_ID;
  delete process.env.INSURANCE_CONTRACT_ID;
  global.fetch = jest.fn();
});

describe('getAddresses', () => {
  it('omits contracts with no configured address', async () => {
    process.env.ESCROW_CONTRACT_ID = 'CESCROW...';
    const res = mockRes();

    await contractsController.getAddresses({}, res);

    expect(res.json).toHaveBeenCalledWith({ contracts: [{ name: 'escrow', address: 'CESCROW...' }] });
  });

  it('includes all configured contracts', async () => {
    process.env.ESCROW_CONTRACT_ID = 'CESCROW...';
    process.env.REFERRAL_REGISTRY_CONTRACT_ID = 'CREFERRAL...';
    const res = mockRes();

    await contractsController.getAddresses({}, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.contracts).toHaveLength(2);
    expect(payload.contracts.map((c) => c.name)).toEqual(['escrow', 'referral_registry']);
  });

  it('returns an empty list when nothing is configured', async () => {
    const res = mockRes();
    await contractsController.getAddresses({}, res);
    expect(res.json).toHaveBeenCalledWith({ contracts: [] });
  });
});

describe('getStatus', () => {
  it('returns connected: true when Soroban RPC reports healthy', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ result: { status: 'healthy' } }) });
    const res = mockRes();

    await contractsController.getStatus({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ connected: true });
  });

  it('returns connected: false with 503 when RPC reports unhealthy', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ result: { status: 'unhealthy' } }) });
    const res = mockRes();

    await contractsController.getStatus({}, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ connected: false });
  });

  it('returns connected: false with 503 when the RPC call throws', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    const res = mockRes();

    await contractsController.getStatus({}, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ connected: false });
  });
});
