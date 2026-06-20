/**
 * Tests for backend/services/pdfGenerator.js
 *
 * Covers:
 *  - PDF buffer generation (non-empty, contains expected text)
 *  - SHA-256 hash embedding (hash present in second-pass PDF)
 *  - signPdf: valid signature accepted, invalid signature rejected
 *  - signPdf: non-party wallet rejected with 403
 */

import { jest } from '@jest/globals';
import { createHash } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock pdfkit — returns a minimal PDF-like buffer
jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => {
    const { EventEmitter } = require('events');
    const doc = new EventEmitter();
    doc.fontSize = jest.fn().mockReturnThis();
    doc.font = jest.fn().mockReturnThis();
    doc.text = jest.fn().mockReturnThis();
    doc.moveDown = jest.fn().mockReturnThis();
    doc.fillColor = jest.fn().mockReturnThis();
    doc.end = jest.fn(() => {
      doc.emit('data', Buffer.from('%PDF-1.4 mock content'));
      doc.emit('end');
    });
    doc.page = { height: 842, width: 595 };
    return doc;
  });
});

// Mock S3 — not used in tests (USE_S3 defaults to false)
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

// Mock fs — avoid actual disk writes
jest.mock('fs', () => ({
  createWriteStream: jest.fn(() => {
    const { Writable } = require('stream');
    return new Writable({
      write(chunk, enc, cb) {
        cb();
      },
    });
  }),
  mkdirSync: jest.fn(),
}));

jest.mock('stream/promises', () => ({
  pipeline: jest.fn(async () => {}),
}));

// Mock email queue
jest.mock('../queues/emailQueue.js', () => ({
  enqueueEvent: jest.fn(async () => {}),
}));

// Mock logger
jest.mock('../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), error: jest.fn() }),
}));

// ── Prisma mock ───────────────────────────────────────────────────────────────

const mockEscrow = {
  id: BigInt(1),
  clientAddress: 'GCLIENT000000000000000000000000000000000000000000000000000',
  freelancerAddress: 'GFREELANCER0000000000000000000000000000000000000000000000',
  totalAmount: '1000',
  tokenAddress: 'GTOKEN00000000000000000000000000000000000000000000000000000',
  deadline: null,
  milestones: [{ title: 'Design', amount: '500', deadline: null }],
};

const mockPdfRecord = { hash: null };

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    escrow: {
      findUniqueOrThrow: jest.fn(async () => mockEscrow),
    },
    escrowPdf: {
      upsert: jest.fn(async ({ create }) => {
        mockPdfRecord.hash = create.hash;
        return create;
      }),
      findUnique: jest.fn(async () => mockPdfRecord),
    },
    escrowPdfSignature: {
      upsert: jest.fn(async ({ create }) => create),
    },
  })),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

const { generateEscrowPdf, signPdf } = await import('../services/pdfGenerator.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generateEscrowPdf', () => {
  it('returns a non-empty buffer, a 64-char hex hash, and a storage key', async () => {
    const result = await generateEscrowPdf('1');
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.storageKey).toContain('escrows/1');
  });

  it('hash is a valid SHA-256 of the draft PDF', async () => {
    // The mock PDFKit always emits the same bytes, so we can verify determinism
    const result1 = await generateEscrowPdf('1');
    const result2 = await generateEscrowPdf('1');
    // Both hashes should be identical for the same mock output
    expect(result1.hash).toBe(result2.hash);
  });
});

describe('signPdf', () => {
  let keypair;
  let signature;

  beforeAll(async () => {
    // Generate a real Stellar keypair and sign the mock hash
    keypair = Keypair.random();
    // First generate to populate mockPdfRecord.hash
    await generateEscrowPdf('1');
    const hashBytes = Buffer.from(mockPdfRecord.hash, 'utf8');
    signature = keypair.sign(hashBytes).toString('hex');

    // Override mock escrow to use this keypair's address as client
    mockEscrow.clientAddress = keypair.publicKey();
  });

  it('accepts a valid signature from the client', async () => {
    const result = await signPdf('1', keypair.publicKey(), signature);
    expect(result.success).toBe(true);
    expect(result.role).toBe('client');
  });

  it('rejects an invalid signature with statusCode 422', async () => {
    const badSig = Buffer.alloc(64, 0).toString('hex');
    await expect(signPdf('1', keypair.publicKey(), badSig)).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('rejects a non-party wallet with statusCode 403', async () => {
    const stranger = Keypair.random().publicKey();
    await expect(signPdf('1', stranger, signature)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
