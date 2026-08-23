import { jest } from '@jest/globals';

const prismaMock = { featureFlag: { findUnique: jest.fn() } };
jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../../services/featureFlags.js', () => ({
  listFlags: jest.fn(),
  createFlag: jest.fn(),
  updateFlag: jest.fn(),
  deleteFlag: jest.fn(),
}));

let featureFlagController;

beforeAll(async () => {
  featureFlagController = await import('../../api/controllers/featureFlagController.js');
});

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/v1/flags/:key/status', () => {
  it('returns { key, enabled: true } for a globally enabled flag', async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue({
      key: 'enable_blue_green_cutover',
      isEnabled: true,
      percentage: 100,
      targetUsers: [],
    });
    const res = mockRes();

    await featureFlagController.status({ params: { key: 'enable_blue_green_cutover' } }, res);

    expect(res.json).toHaveBeenCalledWith({ key: 'enable_blue_green_cutover', enabled: true });
  });

  it('returns enabled: false for a globally disabled flag, ignoring per-user targeting', async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue({
      key: 'enable_blue_green_cutover',
      isEnabled: false,
      percentage: 50,
      targetUsers: ['some-admin-id'],
    });
    const res = mockRes();

    await featureFlagController.status({ params: { key: 'enable_blue_green_cutover' } }, res);

    expect(res.json).toHaveBeenCalledWith({ key: 'enable_blue_green_cutover', enabled: false });
  });

  it('returns 404 for an unknown flag key', async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue(null);
    const res = mockRes();

    await featureFlagController.status({ params: { key: 'does_not_exist' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('never exposes targetUsers or percentage in the response', async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue({
      key: 'x',
      isEnabled: true,
      percentage: 42,
      targetUsers: ['secret-admin-id'],
    });
    const res = mockRes();

    await featureFlagController.status({ params: { key: 'x' } }, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload).not.toHaveProperty('targetUsers');
    expect(payload).not.toHaveProperty('percentage');
  });
});
