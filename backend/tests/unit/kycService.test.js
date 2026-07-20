import { jest } from '@jest/globals';

// Mock the logger before any imports
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Use the in-memory Prisma mock (mapped in jest.config.js via moduleNameMapper)
const prisma = (await import('../../lib/prisma.js')).default;

const { initiateKyc, getKycStatus, processWebhook, adminOverride, listPending } =
  await import('../../services/kycService.js');

const TENANT_ID = 'tenant_test';
const ADDRESS = 'GABC123TESTADDRESS';
const APPLICANT_ID = `applicant_${ADDRESS}`;

beforeEach(async () => {
  await prisma.kycVerification.deleteMany({});
  await prisma.kycWebhookLog.deleteMany({});
  await prisma.adminAuditLog.deleteMany({});
});

describe('initiateKyc', () => {
  it('creates a KycVerification record with status Pending', async () => {
    const result = await initiateKyc({ address: ADDRESS, tenantId: TENANT_ID });

    expect(result).toMatchObject({
      applicantId: APPLICANT_ID,
      sdkToken: `token_${ADDRESS}`,
    });

    const record = await prisma.kycVerification.findUnique({ where: { address: ADDRESS } });
    expect(record).not.toBeNull();
    expect(record.status).toBe('Pending');
    expect(record.applicantId).toBe(APPLICANT_ID);
  });

  it('is idempotent — calling twice does not duplicate', async () => {
    await initiateKyc({ address: ADDRESS, tenantId: TENANT_ID });
    await initiateKyc({ address: ADDRESS, tenantId: TENANT_ID });

    const all = await prisma.kycVerification.findMany({ where: { address: ADDRESS } });
    expect(all).toHaveLength(1);
  });

  it('throws 400 when address is missing', async () => {
    await expect(initiateKyc({ address: '', tenantId: TENANT_ID })).rejects.toMatchObject({
      status: 400,
      code: 'MISSING_ADDRESS',
    });
  });
});

describe('getKycStatus', () => {
  it('returns the existing KycVerification record', async () => {
    await initiateKyc({ address: ADDRESS, tenantId: TENANT_ID });
    const record = await getKycStatus({ address: ADDRESS, tenantId: TENANT_ID });
    expect(record.status).toBe('Pending');
    expect(record.address).toBe(ADDRESS);
  });

  it('returns { status: "unverified" } when no record exists', async () => {
    const result = await getKycStatus({ address: 'GNOBODY', tenantId: TENANT_ID });
    expect(result).toEqual({ status: 'unverified' });
  });
});

describe('processWebhook — GREEN (Approved)', () => {
  beforeEach(async () => {
    await initiateKyc({ address: ADDRESS, tenantId: TENANT_ID });
  });

  it('sets status to Approved on GREEN reviewAnswer', async () => {
    const result = await processWebhook({
      applicantId: APPLICANT_ID,
      eventType: 'applicantReviewed',
      reviewAnswer: 'GREEN',
      rejectionLabels: [],
      rawPayload: { applicantId: APPLICANT_ID },
      tenantId: TENANT_ID,
    });

    expect(result).toEqual({ processed: true, status: 'Approved' });

    const record = await prisma.kycVerification.findUnique({ where: { address: ADDRESS } });
    expect(record.status).toBe('Approved');
  });

  it('is idempotent — duplicate GREEN webhook returns same result without double-write', async () => {
    // First webhook
    await processWebhook({
      applicantId: APPLICANT_ID,
      eventType: 'applicantReviewed',
      reviewAnswer: 'GREEN',
      rawPayload: {},
      tenantId: TENANT_ID,
    });

    // Second identical webhook
    const result = await processWebhook({
      applicantId: APPLICANT_ID,
      eventType: 'applicantReviewed',
      reviewAnswer: 'GREEN',
      rawPayload: {},
      tenantId: TENANT_ID,
    });

    expect(result).toEqual({ processed: true, status: 'Approved' });

    // Still only one KycVerification record
    const all = await prisma.kycVerification.findMany({ where: { address: ADDRESS } });
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('Approved');
  });
});

describe('processWebhook — RED (Declined)', () => {
  beforeEach(async () => {
    await initiateKyc({ address: ADDRESS, tenantId: TENANT_ID });
  });

  it('sets status to Declined on RED reviewAnswer', async () => {
    const result = await processWebhook({
      applicantId: APPLICANT_ID,
      eventType: 'applicantReviewed',
      reviewAnswer: 'RED',
      rejectionLabels: ['UNSATISFACTORY_PHOTOS'],
      rawPayload: { applicantId: APPLICANT_ID },
      tenantId: TENANT_ID,
    });

    expect(result).toEqual({ processed: true, status: 'Declined' });

    const record = await prisma.kycVerification.findUnique({ where: { address: ADDRESS } });
    expect(record.status).toBe('Declined');
    expect(record.rejectLabels).toEqual(['UNSATISFACTORY_PHOTOS']);
  });
});

describe('listPending', () => {
  it('returns paginated Pending and Declined records', async () => {
    await initiateKyc({ address: 'GADDR1', tenantId: TENANT_ID });
    await initiateKyc({ address: 'GADDR2', tenantId: TENANT_ID });
    await initiateKyc({ address: 'GADDR3', tenantId: TENANT_ID });

    // Approve one
    await processWebhook({
      applicantId: 'applicant_GADDR1',
      eventType: 'applicantReviewed',
      reviewAnswer: 'GREEN',
      rawPayload: {},
      tenantId: TENANT_ID,
    });

    const { records, total } = await listPending({ tenantId: TENANT_ID, page: 1, limit: 10 });
    expect(total).toBe(2);
    expect(records).toHaveLength(2);
    for (const r of records) {
      expect(['Pending', 'Declined']).toContain(r.status);
    }
  });

  it('respects limit parameter', async () => {
    await initiateKyc({ address: 'GPAG1', tenantId: TENANT_ID });
    await initiateKyc({ address: 'GPAG2', tenantId: TENANT_ID });
    await initiateKyc({ address: 'GPAG3', tenantId: TENANT_ID });

    const page1 = await listPending({ tenantId: TENANT_ID, page: 1, limit: 2 });
    expect(page1.records).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(2);
  });
});
