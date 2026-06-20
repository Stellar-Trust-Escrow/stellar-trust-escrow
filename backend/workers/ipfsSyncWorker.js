/**
 * IPFS Sync Worker — Async Dispute Evidence Pre-fetcher
 *
 * When a dispute event is indexed, the CID is pushed to this worker via
 * syncCid(). The worker downloads JSON metadata from the IPFS gateway,
 * validates the structure, and caches the content in the dispute_evidence
 * table so the UI can serve evidence instantly (<50ms) without hitting
 * a public gateway.
 *
 * Usage (from escrow indexer on dis_rai event):
 *   import { syncCid } from '../workers/ipfsSyncWorker.js';
 *   syncCid(cid, disputeId);
 */

import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('ipfsSyncWorker');

const GATEWAY = process.env.IPFS_GATEWAY_URL || 'https://ipfs.io';
const FETCH_TIMEOUT = parseInt(process.env.IPFS_FETCH_TIMEOUT_MS || '15000', 10);
const MAX_RETRIES = parseInt(process.env.IPFS_SYNC_MAX_RETRIES || '3', 10);
const RETRY_DELAY_MS = parseInt(process.env.IPFS_SYNC_RETRY_DELAY_MS || '2000', 10);

/** In-flight CIDs — prevents duplicate concurrent fetches. */
const inFlight = new Set();

/**
 * Validate that the parsed metadata object has the expected shape.
 * @param {unknown} data
 * @returns {boolean}
 */
function isValidMetadata(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    typeof data.description === 'string' &&
    typeof data.evidenceType === 'string'
  );
}

/**
 * Fetch JSON metadata from the IPFS gateway with a timeout.
 * @param {string} cid
 * @returns {Promise<object>}
 */
async function fetchMetadata(cid) {
  const url = `${GATEWAY}/ipfs/${cid}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`IPFS gateway returned ${res.status} for CID ${cid}`);
  const data = await res.json();
  if (!isValidMetadata(data)) throw new Error(`Invalid metadata structure for CID ${cid}`);
  return data;
}

/**
 * Persist the fetched metadata into the dispute_evidence row that owns this CID.
 * @param {string} cid
 * @param {object} metadata
 */
async function cacheMetadata(cid, metadata) {
  const updated = await prisma.disputeEvidence.updateMany({
    where: { ipfsCid: cid, description: null },
    data: {
      description: metadata.description,
      evidenceType: metadata.evidenceType,
      filename: metadata.filename ?? null,
      mimeType: metadata.mimeType ?? null,
      fileSize: metadata.fileSize ?? null,
    },
  });
  log.info({ message: 'ipfs_metadata_cached', cid, rowsUpdated: updated.count });
}

/**
 * Download and cache a single CID with retry logic.
 * @param {string} cid
 */
async function processCid(cid) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const metadata = await fetchMetadata(cid);
      await cacheMetadata(cid, metadata);
      return;
    } catch (err) {
      lastErr = err;
      log.warn({ message: 'ipfs_sync_retry', cid, attempt, error: err.message });
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  }
  log.error({ message: 'ipfs_sync_failed', cid, error: lastErr?.message });
}

/**
 * Enqueue a CID for async background sync. Fire-and-forget — never throws.
 *
 * @param {string} cid       — IPFS content identifier
 * @param {number} [disputeId] — for logging context only
 */
export function syncCid(cid, disputeId) {
  if (!cid || inFlight.has(cid)) return;

  inFlight.add(cid);
  log.info({ message: 'ipfs_sync_enqueued', cid, disputeId });

  processCid(cid).finally(() => inFlight.delete(cid));
}

export default { syncCid };
