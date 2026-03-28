import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import prisma from '../lib/prisma.js';

// Mock external services
jest.mock('../services/ipfsService.js');
jest.mock('../services/virusScanner.js');
jest.mock('../lib/prisma.js');

const mockIpfsService = await import('../services/ipfsService.js');
const mockVirusScanner = await import('../services/virusScanner.js');

describe('Dispute Evidence Upload', () => {
  let authToken;
  let testTenant;
  let testDispute;
  let testUser;

  beforeEach(async () => {
    // Setup test data
    testTenant = {
      id: 'test-tenant-id',
      slug: 'test-tenant',
      name: 'Test Tenant'
    };

    testUser = {
      id: 1,
      email: 'test@example.com',
      address: 'GTEST1234567890abcdef'
    };

    testDispute = {
      id: 1,
      tenantId: testTenant.id,
      escrowId: BigInt('12345'),
      raisedByAddress: testUser.address,
      raisedAt: new Date(),
      escrow: {
        clientAddress: testUser.address,
        freelancerAddress: 'GFREELANCER123',
        totalAmount: '1000',
        status: 'Disputed'
      }
    };

    // Mock JWT token
    authToken = 'Bearer valid.jwt.token';
    
    // Mock prisma responses
    prisma.tenant.findFirst.mockResolvedValue(testTenant);
    prisma.dispute.findFirst.mockResolvedValue(testDispute);
    prisma.dispute.create.mockResolvedValue(testDispute);
    prisma.disputeEvidence.create.mockImplementation((data) => ({
      id: Math.floor(Math.random() * 1000),
      ...data.data,
      submittedAt: new Date()
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/disputes/:id/evidence', () => {
    const validFileBuffer = Buffer.from('test file content');
    const imageBuffer = Buffer.from('fake-image-data');

    beforeEach(() => {
      // Mock IPFS service
      mockIpfsService.default.pinFile.mockResolvedValue({
        cid: 'QmTest123456789',
        size: validFileBuffer.length,
        path: 'test-file'
      });

      mockIpfsService.default.generateThumbnail.mockResolvedValue(
        Buffer.from('thumbnail-data')
      );

      mockIpfsService.default.getFileUrl.mockResolvedValue(
        'https://ipfs.io/ipfs/QmTest123456789'
      );

      mockIpfsService.default.isImage.mockReturnValue(false);
      mockIpfsService.default.getFileMetadata.mockResolvedValue({
        filename: 'test.txt',
        mimeType: 'text/plain',
        fileSize: validFileBuffer.length
      });

      // Mock virus scanner
      mockVirusScanner.default.quickScan.mockResolvedValue({
        isInfected: false,
        status: 'clean',
        reason: 'No threats detected'
      });
    });

    it('should upload file evidence successfully', async () => {
      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id)
        .attach('files', validFileBuffer, 'test.txt')
        .field('description', 'Test evidence description');

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Evidence uploaded successfully');
      expect(response.body.evidence).toHaveLength(1);
      expect(response.body.count).toBe(1);

      expect(mockIpfsService.default.pinFile).toHaveBeenCalledWith(validFileBuffer);
      expect(mockVirusScanner.default.quickScan).toHaveBeenCalled();
      expect(prisma.disputeEvidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            disputeId: 1,
            evidenceType: 'file',
            filename: 'test.txt',
            ipfsCid: 'QmTest123456789',
            scanStatus: 'clean'
          })
        })
      );
    });

    it('should upload image evidence with thumbnail', async () => {
      mockIpfsService.default.isImage.mockReturnValue(true);

      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id)
        .attach('files', imageBuffer, 'test.jpg')
        .field('description', 'Test image evidence');

      expect(response.status).toBe(201);
      expect(response.body.evidence[0].evidenceType).toBe('image');
      expect(response.body.evidence[0].thumbnailCid).toBeTruthy();

      expect(mockIpfsService.default.generateThumbnail).toHaveBeenCalledWith(
        imageBuffer,
        'image/jpeg'
      );
    });

    it('should upload multiple files', async () => {
      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id)
        .attach('files', validFileBuffer, 'test1.txt')
        .attach('files', validFileBuffer, 'test2.txt')
        .field('description', 'Multiple files test');

      expect(response.status).toBe(201);
      expect(response.body.evidence).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });

    it('should accept text-only evidence', async () => {
      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id)
        .field('description', 'Text-only evidence submission');

      expect(response.status).toBe(201);
      expect(response.body.evidence[0].evidenceType).toBe('text');
      expect(response.body.evidence[0].content).toBe('Text-only evidence submission');
    });

    it('should reject files larger than 10MB', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id)
        .attach('files', largeBuffer, 'large.txt');

      expect(response.status).toBe(413);
      expect(response.body.error).toContain('File size');
    });

    it('should reject more than 5 files', async () => {
      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id)
        .attach('files', validFileBuffer, 'test1.txt')
        .attach('files', validFileBuffer, 'test2.txt')
        .attach('files', validFileBuffer, 'test3.txt')
        .attach('files', validFileBuffer, 'test4.txt')
        .attach('files', validFileBuffer, 'test5.txt')
        .attach('files', validFileBuffer, 'test6.txt'); // 6th file

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Too many files');
    });

    it('should reject infected files', async () => {
      mockVirusScanner.default.quickScan.mockResolvedValue({
        isInfected: true,
        status: 'infected',
        viruses: ['EICAR-Test-File'],
        reason: 'Malicious content detected'
      });

      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id)
        .attach('files', validFileBuffer, 'infected.txt');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Virus detected');
      expect(response.body.infectedFiles).toHaveLength(1);
    });

    it('should reject unauthorized access', async () => {
      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', 'invalid-token')
        .set('X-Tenant-ID', testTenant.id)
        .attach('files', validFileBuffer, 'test.txt');

      expect(response.status).toBe(401);
    });

    it('should reject access by non-participants', async () => {
      // Mock dispute where user is not a participant
      testDispute.escrow.clientAddress = 'GOTHERUSER123';
      testDispute.raisedByAddress = 'GOTHERUSER123';
      prisma.dispute.findFirst.mockResolvedValue(testDispute);

      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id)
        .attach('files', validFileBuffer, 'test.txt');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });

    it('should handle IPFS upload failures gracefully', async () => {
      mockIpfsService.default.pinFile.mockRejectedValue(
        new Error('IPFS gateway unavailable')
      );

      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id)
        .attach('files', validFileBuffer, 'test.txt');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('IPFS upload failed');
    });
  });

  describe('GET /api/disputes/:id/evidence', () => {
    beforeEach(() => {
      const mockEvidence = [
        {
          id: 1,
          disputeId: 1,
          evidenceType: 'file',
          ipfsCid: 'QmTest123',
          thumbnailCid: null,
          filename: 'test.txt',
          submittedBy: testUser.address,
          submittedAt: new Date()
        },
        {
          id: 2,
          disputeId: 1,
          evidenceType: 'image',
          ipfsCid: 'QmImage456',
          thumbnailCid: 'QmThumb789',
          filename: 'test.jpg',
          submittedBy: testUser.address,
          submittedAt: new Date()
        }
      ];

      prisma.disputeEvidence.findMany.mockResolvedValue(mockEvidence);
      prisma.disputeEvidence.count.mockResolvedValue(2);
      mockIpfsService.default.getFileUrl
        .mockResolvedValueOnce('https://ipfs.io/ipfs/QmTest123')
        .mockResolvedValueOnce('https://ipfs.io/ipfs/QmImage456')
        .mockResolvedValueOnce('https://ipfs.io/ipfs/QmThumb789');
    });

    it('should list evidence with IPFS URLs', async () => {
      const response = await request(app)
        .get('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items[0].fileUrl).toBe('https://ipfs.io/ipfs/QmTest123');
      expect(response.body.items[1].thumbnailUrl).toBe('https://ipfs.io/ipfs/QmThumb789');
      expect(response.body.total).toBe(2);
    });

    it('should filter by evidence type', async () => {
      await request(app)
        .get('/api/disputes/1/evidence?evidenceType=image')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id);

      expect(prisma.disputeEvidence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            evidenceType: 'image'
          })
        })
      );
    });
  });

  describe('Virus Scanner Integration', () => {
    it('should handle EICAR test signature', async () => {
      const eicarBuffer = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');

      mockVirusScanner.default.quickScan.mockImplementation((buffer) => {
        if (buffer.toString().includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
          return Promise.resolve({
            isInfected: true,
            status: 'infected',
            viruses: ['EICAR-Test-File'],
            reason: 'EICAR test signature detected'
          });
        }
        return Promise.resolve({
          isInfected: false,
          status: 'clean',
          reason: 'No threats detected'
        });
      });

      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id)
        .attach('files', eicarBuffer, 'eicar.txt');

      expect(response.status).toBe(400);
      expect(response.body.infectedFiles[0].viruses).toContain('EICAR-Test-File');
    });

    it('should allow uploads when scanner is unavailable', async () => {
      mockVirusScanner.default.quickScan.mockResolvedValue({
        isInfected: false,
        status: 'error',
        reason: 'Scanner unavailable'
      });

      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id)
        .attach('files', validFileBuffer, 'test.txt');

      expect(response.status).toBe(201);
      expect(response.body.evidence[0].scanStatus).toBe('error');
    });
  });

  describe('File Type Validation', () => {
    const validMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    validMimeTypes.forEach(mimeType => {
      it(`should accept ${mimeType} files`, async () => {
        const response = await request(app)
          .post('/api/disputes/1/evidence')
          .set('Authorization', authToken)
          .set('X-Tenant-ID', testTenant.id)
          .attach('files', validFileBuffer, `test.${mimeType.split('/')[1]}`)
          .field('description', 'Valid file type test');

        expect(response.status).toBe(201);
      });
    });

    it('should reject executable files', async () => {
      const response = await request(app)
        .post('/api/disputes/1/evidence')
        .set('Authorization', authToken)
        .set('X-Tenant-ID', testTenant.id)
        .attach('files', validFileBuffer, 'test.exe')
        .field('description', 'Executable file test');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('File type application/x-msdownload is not allowed');
    });
  });
});
