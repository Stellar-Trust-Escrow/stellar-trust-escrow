'use strict';

/**
 * Bulk Escrow Import Service
 *
 * Accepts CSV or newline-delimited JSON payloads, validates each row,
 * queues an import job via BullMQ, and exposes job-status queries.
 * Each row is processed individually so a single invalid record never
 * blocks the rest of the batch.
 */

const { Queue, Worker, QueueEvents } = require('bullmq');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// BullMQ setup — the connection config is resolved from environment variables
// ---------------------------------------------------------------------------
const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const importQueue = new Queue('bulk-escrow-import', { connection: REDIS_CONNECTION });

// ---------------------------------------------------------------------------
// Validation constants
// ---------------------------------------------------------------------------
const REQUIRED_FIELDS = ['tenantId', 'buyerId', 'sellerId', 'amount', 'currency', 'title'];
const MAX_AMOUNT = 1_000_000_000;
const SUPPORTED_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'XLM', 'USDC', 'BTC',
]);

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Parse a CSV buffer into an array of row objects. The first row is treated
 * as the header. Returns both successfully parsed rows and any parsing errors.
 *
 * @param {Buffer|string} buffer - Raw CSV content.
 * @returns {{ rows: object[], errors: Array<{index: number, message: string}> }}
 */
function parseCSV(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : buffer;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: [{ index: 0, message: 'CSV must have at least a header and one data row' }] };
  }

  const headers = splitCSVLine(lines[0]);
  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = splitCSVLine(lines[i]);
      if (values.length !== headers.length) {
        errors.push({
          index: i,
          message: `Column count mismatch: expected ${headers.length}, got ${values.length}`,
        });
        continue;
      }
      const row = {};
      headers.forEach((header, idx) => {
        row[header.trim()] = values[idx];
      });
      rows.push(row);
    } catch (err) {
      errors.push({ index: i, message: `Parse error: ${err.message}` });
    }
  }

  return { rows, errors };
}

/**
 * Split a single CSV line into fields, respecting double-quoted values.
 * @param {string} line
 * @returns {string[]}
 */
function splitCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ---------------------------------------------------------------------------
// JSONL parsing
// ---------------------------------------------------------------------------

/**
 * Parse a newline-delimited JSON (JSONL) buffer into row objects.
 *
 * @param {Buffer|string} buffer - Raw JSONL content.
 * @returns {{ rows: object[], errors: Array<{index: number, message: string}> }}
 */
function parseJSONL(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : buffer;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const rows = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const row = JSON.parse(lines[i]);
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        errors.push({ index: i + 1, message: 'Each JSONL line must be a JSON object' });
        continue;
      }
      rows.push(row);
    } catch (err) {
      errors.push({ index: i + 1, message: `Invalid JSON on line ${i + 1}: ${err.message}` });
    }
  }

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

/**
 * Validate a single escrow import row.
 *
 * @param {object} row - The parsed row data.
 * @param {number} index - 1-based row index (for error reporting).
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRow(row, index) {
  const errors = [];

  // Required field presence
  for (const field of REQUIRED_FIELDS) {
    if (row[field] === undefined || row[field] === null || String(row[field]).trim() === '') {
      errors.push(`Row ${index}: missing required field "${field}"`);
    }
  }

  // Amount must be a positive number within bounds
  if (row.amount !== undefined) {
    const amount = Number(row.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Row ${index}: "amount" must be a positive number, got "${row.amount}"`);
    } else if (amount > MAX_AMOUNT) {
      errors.push(`Row ${index}: "amount" exceeds maximum allowed value of ${MAX_AMOUNT}`);
    }
  }

  // Currency must be in the supported set
  if (row.currency && !SUPPORTED_CURRENCIES.has(String(row.currency).toUpperCase())) {
    errors.push(
      `Row ${index}: unsupported currency "${row.currency}". Supported: ${[...SUPPORTED_CURRENCIES].join(', ')}`,
    );
  }

  // Buyer and seller must differ
  if (row.buyerId && row.sellerId && row.buyerId === row.sellerId) {
    errors.push(`Row ${index}: "buyerId" and "sellerId" must not be the same user`);
  }

  // Title length
  if (row.title && String(row.title).length > 200) {
    errors.push(`Row ${index}: "title" must not exceed 200 characters`);
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Queue management
// ---------------------------------------------------------------------------

/**
 * Validate all rows, then enqueue valid ones as a bulk import job.
 *
 * @param {object[]} rows - Parsed escrow row objects.
 * @param {string} tenantId - The tenant performing the import.
 * @returns {Promise<{ jobId: string, queued: number, rejected: number, validationErrors: object[] }>}
 */
async function queueImportJob(rows, tenantId) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError('queueImportJob: rows must be a non-empty array');
  }
  if (!tenantId || typeof tenantId !== 'string') {
    throw new TypeError('queueImportJob: tenantId must be a non-empty string');
  }

  const validRows = [];
  const validationErrors = [];

  for (let i = 0; i < rows.length; i++) {
    const { valid, errors } = validateRow(rows[i], i + 1);
    if (valid) {
      validRows.push({ ...rows[i], tenantId });
    } else {
      validationErrors.push({ rowIndex: i + 1, errors });
    }
  }

  if (validRows.length === 0) {
    return { jobId: null, queued: 0, rejected: rows.length, validationErrors };
  }

  const job = await importQueue.add(
    'process-bulk-import',
    { rows: validRows, tenantId, submittedAt: new Date().toISOString() },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: false,
      removeOnFail: false,
    },
  );

  console.log(
    `[bulkImportService] Queued import job ${job.id} — ${validRows.length} rows valid, ${validationErrors.length} rejected`,
  );

  return {
    jobId: job.id,
    queued: validRows.length,
    rejected: validationErrors.length,
    validationErrors,
  };
}

/**
 * Retrieve the current status and per-row results for an import job.
 *
 * @param {string} jobId - The BullMQ job ID returned by queueImportJob.
 * @returns {Promise<{ jobId: string, state: string, progress: number, results: object[]|null, failedReason: string|null }>}
 */
async function getJobStatus(jobId) {
  if (!jobId || typeof jobId !== 'string') {
    throw new TypeError('getJobStatus: jobId must be a non-empty string');
  }

  const job = await importQueue.getJob(jobId);
  if (!job) {
    throw new Error(`getJobStatus: job ${jobId} not found`);
  }

  const state = await job.getState();
  const progress = typeof job.progress === 'number' ? job.progress : 0;

  return {
    jobId,
    state,
    progress,
    results: job.returnvalue || null,
    failedReason: job.failedReason || null,
  };
}

// ---------------------------------------------------------------------------
// Row processor (called inside the BullMQ worker)
// ---------------------------------------------------------------------------

/**
 * Create a single escrow record from an import row.
 *
 * @param {object} row - A validated escrow row with tenantId.
 * @returns {Promise<{ success: boolean, escrowId: string|null, error: string|null }>}
 */
async function processRow(row) {
  try {
    const escrow = await prisma.escrow.create({
      data: {
        tenantId: row.tenantId,
        buyerId: row.buyerId,
        sellerId: row.sellerId,
        amount: parseFloat(row.amount),
        currency: String(row.currency).toUpperCase(),
        title: row.title,
        description: row.description || null,
        status: 'pending',
        importedAt: new Date(),
      },
    });

    return { success: true, escrowId: escrow.id, error: null };
  } catch (err) {
    console.error(`[bulkImportService] processRow failed: ${err.message}`);
    return { success: false, escrowId: null, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// BullMQ worker (registers itself when this module is loaded in worker context)
// ---------------------------------------------------------------------------
if (process.env.START_BULK_IMPORT_WORKER === 'true') {
  const worker = new Worker(
    'bulk-escrow-import',
    async (job) => {
      const { rows } = job.data;
      const results = [];

      for (let i = 0; i < rows.length; i++) {
        const result = await processRow(rows[i]);
        results.push({ rowIndex: i + 1, ...result });
        await job.updateProgress(Math.round(((i + 1) / rows.length) * 100));
      }

      return results;
    },
    { connection: REDIS_CONNECTION, concurrency: 5 },
  );

  worker.on('completed', (job) => {
    console.log(`[bulkImportService] Worker completed job ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[bulkImportService] Worker failed job ${job && job.id}: ${err.message}`);
  });
}

module.exports = {
  parseCSV,
  parseJSONL,
  validateRow,
  queueImportJob,
  getJobStatus,
  processRow,
  // Exported for testing
  _splitCSVLine: splitCSVLine,
};
