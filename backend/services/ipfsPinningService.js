'use strict';

/**
 * IPFS Evidence Pinning Service
 *
 * Handles uploading evidence files to IPFS via Pinata, anchoring CIDs
 * to escrow records in the database, and cleaning up orphaned pins.
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const PINATA_API_KEY = process.env.PINATA_API_KEY || '';
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY || '';
const PINATA_BASE_URL = 'https://api.pinata.cloud';

const PRIMARY_GATEWAY = 'https://gateway.pinata.cloud/ipfs';
const FALLBACK_GATEWAY = 'https://cloudflare-ipfs.com/ipfs';
const LAST_RESORT_GATEWAY = 'https://ipfs.io/ipfs';

/**
 * Build an axios instance pre-configured with Pinata auth headers.
 * @returns {import('axios').AxiosInstance}
 */
function createPinataClient() {
  return axios.create({
    baseURL: PINATA_BASE_URL,
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
    timeout: 30_000,
  });
}

/**
 * Upload a file buffer to Pinata IPFS and return the resulting CID.
 *
 * @param {Buffer} buffer - The raw file contents to pin.
 * @param {string} filename - The name to assign the file on IPFS.
 * @returns {Promise<string>} The CIDv1 hash returned by Pinata.
 * @throws {Error} When the upload fails or Pinata returns an error status.
 */
async function pinFile(buffer, filename) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('pinFile: buffer must be a Node.js Buffer');
  }
  if (!filename || typeof filename !== 'string') {
    throw new TypeError('pinFile: filename must be a non-empty string');
  }

  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', buffer, { filename });
  form.append(
    'pinataMetadata',
    JSON.stringify({ name: filename, keyvalues: { source: 'stellar-trust-escrow' } }),
  );
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  const client = createPinataClient();

  try {
    const response = await client.post('/pinning/pinFileToIPFS', form, {
      headers: { ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const cid = response.data && response.data.IpfsHash;
    if (!cid) {
      throw new Error('Pinata did not return an IpfsHash in the response');
    }

    console.log(`[ipfsPinningService] Pinned ${filename} → CID ${cid}`);
    return cid;
  } catch (err) {
    const message = err.response
      ? `Pinata API error ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    throw new Error(`pinFile failed for "${filename}": ${message}`);
  }
}

/**
 * Record an association between an escrow record and a pinned CID in the database.
 *
 * @param {string} escrowId - The UUID of the escrow.
 * @param {string} cid - The IPFS CID to associate with the escrow.
 * @returns {Promise<object>} The newly created EscrowEvidence record.
 * @throws {Error} When the Prisma write fails.
 */
async function anchorCID(escrowId, cid) {
  if (!escrowId || typeof escrowId !== 'string') {
    throw new TypeError('anchorCID: escrowId must be a non-empty string');
  }
  if (!cid || typeof cid !== 'string') {
    throw new TypeError('anchorCID: cid must be a non-empty string');
  }

  try {
    const record = await prisma.escrowEvidence.create({
      data: {
        escrowId,
        cid,
        pinnedAt: new Date(),
        gatewayUrl: getGatewayUrl(cid),
      },
    });

    console.log(`[ipfsPinningService] Anchored CID ${cid} to escrow ${escrowId}`);
    return record;
  } catch (err) {
    throw new Error(`anchorCID failed for escrow ${escrowId}, CID ${cid}: ${err.message}`);
  }
}

/**
 * Construct a public HTTP gateway URL for an IPFS CID.
 * Tries the primary Pinata gateway first; falls back to Cloudflare then ipfs.io.
 *
 * @param {string} cid - The IPFS CID to resolve.
 * @param {'primary'|'cloudflare'|'ipfs'} [preferredGateway='primary'] - Which gateway to use.
 * @returns {string} A fully-qualified HTTPS URL for the given CID.
 */
function getGatewayUrl(cid, preferredGateway = 'primary') {
  if (!cid || typeof cid !== 'string') {
    throw new TypeError('getGatewayUrl: cid must be a non-empty string');
  }

  const gatewayMap = {
    primary: PRIMARY_GATEWAY,
    cloudflare: FALLBACK_GATEWAY,
    ipfs: LAST_RESORT_GATEWAY,
  };

  const base = gatewayMap[preferredGateway] || PRIMARY_GATEWAY;
  return `${base}/${cid}`;
}

/**
 * Query Pinata for all currently pinned items, compare against CIDs referenced
 * in the database, and unpin any that are no longer associated with an escrow.
 *
 * @returns {Promise<{ unpinned: string[], errors: Array<{cid: string, error: string}> }>}
 */
async function unpinOrphanedCIDs() {
  const client = createPinataClient();
  const unpinned = [];
  const errors = [];

  let offset = 0;
  const pageSize = 100;
  let hasMore = true;

  // Fetch all CIDs currently in the DB so we can do a set lookup
  const dbRecords = await prisma.escrowEvidence.findMany({
    select: { cid: true },
  });
  const dbCIDs = new Set(dbRecords.map((r) => r.cid));

  while (hasMore) {
    let pinListResponse;
    try {
      pinListResponse = await client.get('/data/pinList', {
        params: { status: 'pinned', pageLimit: pageSize, pageOffset: offset },
      });
    } catch (err) {
      const msg = err.response
        ? `Pinata API ${err.response.status}: ${JSON.stringify(err.response.data)}`
        : err.message;
      throw new Error(`unpinOrphanedCIDs: failed to fetch pin list: ${msg}`);
    }

    const rows = pinListResponse.data && pinListResponse.data.rows;
    if (!rows || rows.length === 0) {
      hasMore = false;
      break;
    }

    for (const pin of rows) {
      const cid = pin.ipfs_pin_hash;
      if (!dbCIDs.has(cid)) {
        // This CID is on Pinata but not referenced in any escrow — unpin it
        try {
          await client.delete(`/pinning/unpin/${cid}`);
          unpinned.push(cid);
          console.log(`[ipfsPinningService] Unpinned orphaned CID ${cid}`);
        } catch (err) {
          const msg = err.response
            ? `status ${err.response.status}`
            : err.message;
          console.error(`[ipfsPinningService] Failed to unpin ${cid}: ${msg}`);
          errors.push({ cid, error: msg });
        }
      }
    }

    offset += pageSize;
    hasMore = rows.length === pageSize;
  }

  console.log(
    `[ipfsPinningService] Orphan sweep complete — unpinned ${unpinned.length}, errors ${errors.length}`,
  );
  return { unpinned, errors };
}

module.exports = {
  pinFile,
  anchorCID,
  getGatewayUrl,
  unpinOrphanedCIDs,
};
