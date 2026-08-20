
/**
 * @fileoverview GDPR-compliant per-tenant data export pipeline.
 *
 * Handles the full lifecycle of a tenant data export request:
 * job creation → data collection → compression → S3 upload →
 * signed-URL generation → TTL-based expiry.
 */

import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import { Readable } from 'stream';

const gzip = promisify(zlib.gzip);

// ---------------------------------------------------------------------------
// Stub dependencies — replace with real singletons in production
// ---------------------------------------------------------------------------

/** @type {import('@prisma/client').PrismaClient} */
import prismaModule from '../config/prisma.js';
const prisma = global.__prisma || prismaModule;

/**
 * Minimal S3 stub.  Swap for `new S3Client(…)` from @aws-sdk/client-s3.
 */
const s3 = {
  /**
   * @param {{ Bucket: string, Key: string, Body: Buffer, ContentType: string, ContentEncoding: string }} params
   * @returns {Promise<void>}
   */
  putObject: async (params) => {
    // Stub: in production this would call s3Client.send(new PutObjectCommand(params))
    console.log(`[gdprExport] s3.putObject → s3://${params.Bucket}/${params.Key} (${params.Body.length} bytes)`);
  },

  /**
   * @param {{ Bucket: string, Key: string, Expires: number }} params
   * @returns {Promise<string>}
   */
  getSignedUrl: async (params) => {
    // Stub: in production this would use getSignedUrl(s3Client, new GetObjectCommand(…), { expiresIn })
    return `https://${params.Bucket}.s3.amazonaws.com/${params.Key}?X-Amz-Expires=${params.Expires}&X-Amz-Signature=stub`;
  },

  /**
   * @param {{ Bucket: string, Key: string }} params
   * @returns {Promise<void>}
   */
  deleteObject: async (params) => {
    console.log(`[gdprExport] s3.deleteObject → s3://${params.Bucket}/${params.Key}`);
  },
};

/** Simple in-process job store — swap for Redis or a DB table. */
const jobStore = new Map();

const S3_BUCKET = process.env.GDPR_EXPORT_S3_BUCKET || 'stellar-trust-gdpr-exports';
const EXPORT_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const SIGNED_URL_EXPIRES_S = 48 * 60 * 60; // 48 hours in seconds

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random export job ID.
 * @returns {string}
 */
function generateJobId() {
  return `gdpr-export-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Persist a job record in the store.
 * @param {string} jobId
 * @param {Partial<ExportJob>} fields
 */
function updateJob(jobId, fields) {
  const existing = jobStore.get(jobId) || {};
  jobStore.set(jobId, { ...existing, ...fields, updatedAt: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ExportJob
 * @property {string}  jobId
 * @property {string}  tenantId
 * @property {'pending'|'collecting'|'compressing'|'uploading'|'ready'|'expired'|'failed'} status
 * @property {string}  [s3Key]
 * @property {string}  [downloadUrl]
 * @property {string}  [error]
 * @property {string}  createdAt
 * @property {string}  updatedAt
 * @property {string}  [expiresAt]
 */

/**
 * Initiate a GDPR data export for a given tenant.
 *
 * Kicks off the full pipeline asynchronously and returns immediately with the
 * job ID so the caller can poll `getExportStatus`.
 *
 * @param {string} tenantId  UUID of the tenant requesting the export.
 * @returns {Promise<{ jobId: string }>}
 */
async function initiateExport(tenantId) {
  if (!tenantId) throw new Error('tenantId is required');

  const jobId = generateJobId();
  const now = new Date().toISOString();

  updateJob(jobId, {
    jobId,
    tenantId,
    status: 'pending',
    createdAt: now,
  });

  // Run the pipeline asynchronously — do NOT await here
  _runExportPipeline(jobId, tenantId).catch((err) => {
    console.error(`[gdprExport] Pipeline failed for job ${jobId}:`, err);
    updateJob(jobId, { status: 'failed', error: err.message });
  });

  return { jobId };
}

/**
 * Collect all data belonging to a tenant across every relevant Prisma model.
 *
 * Uses `findMany` with cursor-based pagination to avoid loading the entire
 * dataset into memory at once; yields plain objects suitable for JSON
 * serialisation.
 *
 * @param {string} tenantId
 * @returns {Promise<Record<string, unknown[]>>}  Keyed by model name.
 */
async function collectTenantData(tenantId) {
  if (!tenantId) throw new Error('tenantId is required');

  const PAGE_SIZE = 500;

  /**
   * Paginate through a Prisma model and return all records for the tenant.
   * @param {Function} model  e.g. prisma.escrow
   * @param {Record<string,unknown>} where  Additional where clause fields.
   * @param {string} cursorField  Primary key / unique field to use as cursor.
   */
  async function paginate(model, where, cursorField = 'id') {
    const results = [];
    let cursor;

    while (true) {
      const page = await model.findMany({
        where,
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { [cursorField]: cursor }, skip: 1 } : {}),
        orderBy: { [cursorField]: 'asc' },
      });

      results.push(...page);

      if (page.length < PAGE_SIZE) break;
      cursor = page[page.length - 1][cursorField];
    }

    return results;
  }

  const [escrows, users, disputes, auditLogs] = await Promise.all([
    paginate(prisma.escrow,    { tenantId }),
    paginate(prisma.user,      { tenantId }),
    paginate(prisma.dispute,   { tenantId }),
    paginate(prisma.auditLog,  { tenantId }),
  ]);

  return {
    metadata: {
      tenantId,
      exportedAt: new Date().toISOString(),
      recordCounts: {
        escrows: escrows.length,
        users: users.length,
        disputes: disputes.length,
        auditLogs: auditLogs.length,
      },
    },
    escrows,
    users,
    disputes,
    auditLogs,
  };
}

/**
 * GZIP-compress the collected data as JSON and upload it to S3.
 *
 * @param {Record<string, unknown>} data  Object returned by `collectTenantData`.
 * @param {string} tenantId
 * @returns {Promise<string>}  The S3 object key for the uploaded file.
 */
async function compressAndUpload(data, tenantId) {
  if (!data)     throw new Error('data is required');
  if (!tenantId) throw new Error('tenantId is required');

  const json = JSON.stringify(data, null, 2);
  const compressed = await gzip(Buffer.from(json, 'utf8'));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const s3Key = `exports/${tenantId}/${timestamp}.json.gz`;

  await s3.putObject({
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: compressed,
    ContentType: 'application/json',
    ContentEncoding: 'gzip',
  });

  return s3Key;
}

/**
 * Generate a pre-signed S3 download URL valid for 48 hours.
 *
 * @param {string} s3Key  The object key returned by `compressAndUpload`.
 * @returns {Promise<string>}  A time-limited download URL.
 */
async function generateSignedUrl(s3Key) {
  if (!s3Key) throw new Error('s3Key is required');

  const url = await s3.getSignedUrl({
    Bucket: S3_BUCKET,
    Key: s3Key,
    Expires: SIGNED_URL_EXPIRES_S,
  });

  return url;
}

/**
 * Schedule deletion of an export job and its S3 object after the 48-hour TTL.
 *
 * In production you would use a job queue (Bull, BullMQ, etc.) or a cron.
 * This implementation uses a plain `setTimeout` as a self-contained stub.
 *
 * @param {string} jobId
 * @returns {void}
 */
function scheduleExpiry(jobId) {
  if (!jobId) throw new Error('jobId is required');

  const expiresAt = new Date(Date.now() + EXPORT_TTL_MS).toISOString();
  updateJob(jobId, { expiresAt });

  setTimeout(async () => {
    const job = jobStore.get(jobId);
    if (!job) return;

    if (job.s3Key) {
      try {
        await s3.deleteObject({ Bucket: S3_BUCKET, Key: job.s3Key });
      } catch (err) {
        console.error(`[gdprExport] Failed to delete S3 object ${job.s3Key}:`, err);
      }
    }

    updateJob(jobId, { status: 'expired', downloadUrl: null });
    console.log(`[gdprExport] Export job ${jobId} expired and cleaned up.`);
  }, EXPORT_TTL_MS);
}

/**
 * Retrieve the current status of an export job.
 *
 * @param {string} jobId
 * @returns {Promise<ExportJob>}
 * @throws {Error} When the job is not found.
 */
async function getExportStatus(jobId) {
  if (!jobId) throw new Error('jobId is required');

  const job = jobStore.get(jobId);
  if (!job) throw new Error(`Export job not found: ${jobId}`);

  return { ...job };
}

// ---------------------------------------------------------------------------
// Internal pipeline orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the full export pipeline for a job.
 * Called from `initiateExport`; errors are caught by the caller.
 *
 * @param {string} jobId
 * @param {string} tenantId
 * @returns {Promise<void>}
 */
async function _runExportPipeline(jobId, tenantId) {
  updateJob(jobId, { status: 'collecting' });
  const data = await collectTenantData(tenantId);

  updateJob(jobId, { status: 'compressing' });
  // compressAndUpload covers both compression and the upload step
  updateJob(jobId, { status: 'uploading' });
  const s3Key = await compressAndUpload(data, tenantId);

  const downloadUrl = await generateSignedUrl(s3Key);

  updateJob(jobId, { status: 'ready', s3Key, downloadUrl });
  scheduleExpiry(jobId);

  console.log(`[gdprExport] Job ${jobId} ready — download URL generated.`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default {
  initiateExport,
  collectTenantData,
  compressAndUpload,
  generateSignedUrl,
  scheduleExpiry,
  getExportStatus,
};
