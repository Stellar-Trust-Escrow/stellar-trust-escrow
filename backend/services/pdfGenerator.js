/**
 * PDF Generator Service
 *
 * Generates signing-ready escrow contract PDFs using PDFKit.
 * Each PDF is:
 *   1. Rendered with escrow details, milestones, and wallet addresses.
 *   2. SHA-256 hashed and the hash embedded in the document footer.
 *   3. Uploaded to S3 (or local disk in development).
 *   4. Signatures (Stellar keypair signs the PDF hash) are recorded in the DB.
 *
 * Signing flow:
 *   POST /api/escrows/:id/sign-pdf
 *   Body: { walletAddress, signature }
 *   — verifies the Ed25519 signature over the PDF hash using the Stellar SDK,
 *     then persists the signature record.
 *
 * @module services/pdfGenerator
 */

import { createHash } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import PDFDocument from 'pdfkit';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { PassThrough } from 'stream';
import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';
import { enqueueEvent } from '../queues/emailQueue.js';

const logger = createModuleLogger('pdfGenerator');

// ── Config ────────────────────────────────────────────────────────────────────

const USE_S3 = process.env.PDF_STORAGE === 's3';
const S3_BUCKET = process.env.PDF_S3_BUCKET || 'stellar-trust-escrow-pdfs';
const LOCAL_PDF_DIR = process.env.PDF_LOCAL_DIR || '/tmp/escrow-pdfs';
const PRESIGN_EXPIRES_SECONDS = 3600; // 1 hour

const s3 = USE_S3
  ? new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
  : null;

// ── PDF rendering ─────────────────────────────────────────────────────────────

/**
 * Renders an escrow contract PDF and returns the raw Buffer.
 *
 * @param {object} escrow
 * @param {string} escrow.id
 * @param {string} escrow.clientAddress
 * @param {string} escrow.freelancerAddress
 * @param {string} escrow.totalAmount
 * @param {string} escrow.tokenAddress
 * @param {Date}   [escrow.deadline]
 * @param {string} [escrow.briefHash]
 * @param {Array}  escrow.milestones
 * @param {string} [placeholderHash]  — pass '' on first render; embed real hash on second pass
 * @returns {Promise<Buffer>}
 */
async function renderPdf(escrow, placeholderHash = '') {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const {
      id,
      clientAddress,
      freelancerAddress,
      totalAmount,
      tokenAddress,
      deadline,
      milestones = [],
    } = escrow;

    // ── Header ──────────────────────────────────────────────────────────────
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('ESCROW CONTRACT', { align: 'center' })
      .moveDown(0.5);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555555')
      .text(`Contract ID: ${id}`, { align: 'center' })
      .text(`Generated: ${new Date().toUTCString()}`, { align: 'center' })
      .fillColor('#000000')
      .moveDown(1);

    // ── Parties ─────────────────────────────────────────────────────────────
    doc.fontSize(13).font('Helvetica-Bold').text('Parties').moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Client Wallet:     ${clientAddress}`);
    doc.text(`Freelancer Wallet: ${freelancerAddress}`);
    doc.moveDown(1);

    // ── Terms ────────────────────────────────────────────────────────────────
    doc.fontSize(13).font('Helvetica-Bold').text('Contract Terms').moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Amount:  ${totalAmount} (token: ${tokenAddress})`);
    if (deadline) doc.text(`Deadline:      ${new Date(deadline).toUTCString()}`);
    doc.moveDown(1);

    // ── Milestones ───────────────────────────────────────────────────────────
    doc.fontSize(13).font('Helvetica-Bold').text('Milestones').moveDown(0.3);
    doc.fontSize(10).font('Helvetica');

    if (milestones.length === 0) {
      doc.text('No milestones defined.');
    } else {
      milestones.forEach((m, i) => {
        doc
          .font('Helvetica-Bold')
          .text(`${i + 1}. ${m.title ?? `Milestone ${i + 1}`}`)
          .font('Helvetica');
        if (m.description) doc.text(`   Description: ${m.description}`);
        if (m.amount) doc.text(`   Amount:      ${m.amount}`);
        if (m.deadline) doc.text(`   Due:         ${new Date(m.deadline).toUTCString()}`);
        doc.moveDown(0.5);
      });
    }

    // ── Signature blocks ─────────────────────────────────────────────────────
    doc.moveDown(2);
    doc.fontSize(13).font('Helvetica-Bold').text('Signatures').moveDown(0.5);
    doc.fontSize(10).font('Helvetica');

    const sigLine = '_'.repeat(60);
    doc.text(`Client:     ${sigLine}`);
    doc.text(`            ${clientAddress}`).moveDown(1);
    doc.text(`Freelancer: ${sigLine}`);
    doc.text(`            ${freelancerAddress}`).moveDown(2);

    // ── Hash footer ──────────────────────────────────────────────────────────
    doc
      .fontSize(8)
      .fillColor('#888888')
      .text(
        `Document hash (SHA-256): ${placeholderHash || '<computed after render>'}`,
        50,
        doc.page.height - 60,
        { align: 'center', width: doc.page.width - 100 },
      );

    doc.end();
  });
}

/**
 * Generates the PDF twice:
 *   Pass 1 — render without hash to compute the SHA-256 digest.
 *   Pass 2 — re-render with the hash embedded in the footer.
 *
 * @param {object} escrow
 * @returns {Promise<{ buffer: Buffer, hash: string }>}
 */
async function generatePdf(escrow) {
  // Pass 1: compute hash
  const draft = await renderPdf(escrow, '');
  const hash = createHash('sha256').update(draft).digest('hex');

  // Pass 2: embed hash
  const buffer = await renderPdf(escrow, hash);
  return { buffer, hash };
}

// ── Storage ───────────────────────────────────────────────────────────────────

/**
 * Stores the PDF buffer in S3 or local disk.
 *
 * @param {string} escrowId
 * @param {Buffer} buffer
 * @returns {Promise<string>} storage key / path
 */
async function storePdf(escrowId, buffer) {
  const key = `escrows/${escrowId}/contract.pdf`;

  if (USE_S3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
        // Server-side encryption
        ServerSideEncryption: 'AES256',
      }),
    );
    logger.info({ message: 'pdf_uploaded_s3', escrowId, key });
  } else {
    // Local fallback for development
    mkdirSync(join(LOCAL_PDF_DIR, 'escrows', escrowId), { recursive: true });
    const filePath = join(LOCAL_PDF_DIR, key);
    const pass = new PassThrough();
    pass.end(buffer);
    await pipeline(pass, createWriteStream(filePath));
    logger.info({ message: 'pdf_saved_local', escrowId, filePath });
  }

  return key;
}

/**
 * Returns a pre-signed S3 URL (or local path) for the stored PDF.
 *
 * @param {string} storageKey
 * @returns {Promise<string>}
 */
async function getPdfUrl(storageKey) {
  if (USE_S3) {
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: storageKey }), {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });
  }
  return join(LOCAL_PDF_DIR, storageKey);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generates, stores, and records the PDF contract for an escrow.
 * Sends an auto-email to both parties with the download link.
 *
 * @param {string} escrowId
 * @returns {Promise<{ storageKey: string, hash: string, url: string }>}
 */
export async function generateEscrowPdf(escrowId) {
  const escrow = await prisma.escrow.findUniqueOrThrow({
    where: { id: BigInt(escrowId) },
    include: { milestones: { orderBy: { index: 'asc' } } },
  });

  const { buffer, hash } = await generatePdf({
    id: String(escrow.id),
    clientAddress: escrow.clientAddress,
    freelancerAddress: escrow.freelancerAddress,
    totalAmount: escrow.totalAmount,
    tokenAddress: escrow.tokenAddress,
    deadline: escrow.deadline,
    milestones: escrow.milestones,
  });

  const storageKey = await storePdf(String(escrow.id), buffer);
  const url = await getPdfUrl(storageKey);

  // Persist PDF record
  await prisma.escrowPdf.upsert({
    where: { escrowId: escrow.id },
    create: { escrowId: escrow.id, storageKey, hash, generatedAt: new Date() },
    update: { storageKey, hash, generatedAt: new Date() },
  });

  // Auto-email both parties
  await enqueueEvent({
    type: 'escrow_contract_pdf',
    payload: {
      recipients: [escrow.clientAddress, escrow.freelancerAddress],
      escrowId: String(escrow.id),
      pdfUrl: url,
      hash,
    },
  }).catch((err) => logger.error({ message: 'pdf_email_enqueue_failed', error: err.message }));

  return { storageKey, hash, url };
}

/**
 * Verifies a wallet signature over the PDF hash and records it.
 *
 * The signer must be either the client or freelancer of the escrow.
 * Signature is an Ed25519 signature (hex) over the UTF-8 PDF hash string,
 * produced by the Freighter wallet or Stellar Keypair.
 *
 * @param {string} escrowId
 * @param {string} walletAddress  - Stellar G-address of the signer
 * @param {string} signature      - Hex-encoded Ed25519 signature
 * @returns {Promise<{ success: boolean, role: string }>}
 */
export async function signPdf(escrowId, walletAddress, signature) {
  const escrow = await prisma.escrow.findUniqueOrThrow({
    where: { id: BigInt(escrowId) },
    select: { clientAddress: true, freelancerAddress: true },
  });

  const role =
    escrow.clientAddress === walletAddress
      ? 'client'
      : escrow.freelancerAddress === walletAddress
        ? 'freelancer'
        : null;

  if (!role) {
    const err = new Error('Wallet address is not a party to this escrow');
    err.statusCode = 403;
    throw err;
  }

  const pdfRecord = await prisma.escrowPdf.findUnique({
    where: { escrowId: BigInt(escrowId) },
    select: { hash: true },
  });

  if (!pdfRecord) {
    const err = new Error('PDF not yet generated for this escrow');
    err.statusCode = 404;
    throw err;
  }

  // Verify Ed25519 signature: signer signed the PDF hash string
  const keypair = Keypair.fromPublicKey(walletAddress);
  const messageBytes = Buffer.from(pdfRecord.hash, 'utf8');
  const sigBytes = Buffer.from(signature, 'hex');

  const valid = keypair.verify(messageBytes, sigBytes);
  if (!valid) {
    const err = new Error('Signature verification failed');
    err.statusCode = 422;
    throw err;
  }

  // Persist signature
  await prisma.escrowPdfSignature.upsert({
    where: { escrowId_walletAddress: { escrowId: BigInt(escrowId), walletAddress } },
    create: { escrowId: BigInt(escrowId), walletAddress, role, signature, signedAt: new Date() },
    update: { signature, signedAt: new Date() },
  });

  logger.info({ message: 'pdf_signed', escrowId, walletAddress, role });
  return { success: true, role };
}

export default { generateEscrowPdf, signPdf };
