import prisma from '../lib/prisma.js';
import logger from '../config/logger.js';

const PINATA_JWT = process.env.PINATA_JWT || null;
const PINATA_API_KEY = process.env.PINATA_API_KEY || null;
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY || null;
const IPFS_API_URL = process.env.IPFS_API_URL || 'http://127.0.0.1:5001/api/v0';
const SAFETY_BUFFER_HOURS = parseInt(process.env.GC_SAFETY_BUFFER_HOURS || '24', 10);
const PAGE_LIMIT = 1000;

function hoursAgoDate(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

async function listPinnedCidsFromPinata() {
  const results = [];
  let pageOffset = 0;
  while (true) {
    const url = `https://api.pinata.cloud/data/pinList?status=pinned&pageLimit=${PAGE_LIMIT}&pageOffset=${pageOffset}`;
    const headers = {};
    if (PINATA_JWT) headers.Authorization = `Bearer ${PINATA_JWT}`;
    else if (PINATA_API_KEY && PINATA_SECRET_API_KEY) {
      headers.pinata_api_key = PINATA_API_KEY;
      headers.pinata_secret_api_key = PINATA_SECRET_API_KEY;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Pinata list failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (!Array.isArray(data.rows)) break;
    for (const row of data.rows)
      results.push(row.ipfs_pin_hash || row.id || row.pin || row.cid || row.ipfs_pin_hash);
    if (data.rows.length < PAGE_LIMIT) break;
    pageOffset += PAGE_LIMIT;
  }
  return results.filter(Boolean);
}

async function listPinnedCidsFromIpfsApi() {
  const url = `${IPFS_API_URL.replace(/\/+$/, '')}/pin/ls?type=all`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IPFS pin/ls failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  // data.Keys is an object keyed by CID
  return Object.keys(data.Keys || {});
}

async function unpinFromPinata(cid) {
  const url = `https://api.pinata.cloud/pinning/unpin/${cid}`;
  const headers = {};
  if (PINATA_JWT) headers.Authorization = `Bearer ${PINATA_JWT}`;
  else if (PINATA_API_KEY && PINATA_SECRET_API_KEY) {
    headers.pinata_api_key = PINATA_API_KEY;
    headers.pinata_secret_api_key = PINATA_SECRET_API_KEY;
  }

  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`Pinata unpin failed for ${cid}: ${res.status} ${res.statusText}`);
  return true;
}

async function unpinFromIpfsApi(cid) {
  const url = `${IPFS_API_URL.replace(/\/+$/, '')}/pin/rm?arg=${encodeURIComponent(cid)}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`IPFS pin/rm failed for ${cid}: ${res.status} ${res.statusText}`);
  return true;
}

export async function runGarbageCollector({ dryRun = false } = {}) {
  const log = logger || console;
  log.info('[IPFSGC] Starting garbage collection');

  // 1) Collect in-use CIDs from DB (ipfsCid + thumbnailCid)
  const safetyCutoff = hoursAgoDate(SAFETY_BUFFER_HOURS);

  const usedRows = await prisma.disputeEvidence.findMany({
    where: {
      OR: [{ ipfsCid: { not: null } }, { thumbnailCid: { not: null } }],
      submittedAt: { gte: new Date(0) },
    },
    select: { ipfsCid: true, thumbnailCid: true, submittedAt: true },
  });

  const usedCids = new Set();
  for (const r of usedRows) {
    if (r.ipfsCid) usedCids.add(r.ipfsCid);
    if (r.thumbnailCid) usedCids.add(r.thumbnailCid);
  }

  log.info({ usedCount: usedCids.size }, '[IPFSGC] Found used CIDs in DB');

  // 2) Fetch pinned CIDs (try Pinata first, fall back to IPFS API)
  let pinnedCids = [];
  try {
    if (PINATA_JWT || (PINATA_API_KEY && PINATA_SECRET_API_KEY)) {
      log.info('[IPFSGC] Listing pins from Pinata');
      pinnedCids = await listPinnedCidsFromPinata();
    } else {
      log.info('[IPFSGC] Listing pins from IPFS API');
      pinnedCids = await listPinnedCidsFromIpfsApi();
    }
  } catch (err) {
    log.error({ err }, '[IPFSGC] Failed to list pinned CIDs');
    throw err;
  }

  log.info({ pinnedCount: pinnedCids.length }, '[IPFSGC] Total pinned CIDs');

  // 3) Identify orphans: pinned but not in usedCids and older than safety buffer
  const orphans = [];
  for (const cid of pinnedCids) {
    if (usedCids.has(cid)) continue;
    // Check if recently uploaded: look up any evidence row with this cid and its submittedAt
    const evidence = await prisma.disputeEvidence.findFirst({
      where: {
        OR: [{ ipfsCid: cid }, { thumbnailCid: cid }],
      },
      select: { submittedAt: true },
      orderBy: { submittedAt: 'desc' },
    });

    if (evidence && evidence.submittedAt > safetyCutoff) {
      // preserve recent uploads
      continue;
    }

    orphans.push(cid);
  }

  log.info({ orphansCount: orphans.length }, '[IPFSGC] Orphan CIDs identified');

  // 4) Unpin orphans
  const results = { unpinned: [], failed: [] };
  for (const cid of orphans) {
    try {
      if (dryRun) {
        log.info({ cid }, '[IPFSGC] Dry run - would unpin');
        results.unpinned.push(cid);
        continue;
      }

      if (PINATA_JWT || (PINATA_API_KEY && PINATA_SECRET_API_KEY)) {
        await unpinFromPinata(cid);
      } else {
        await unpinFromIpfsApi(cid);
      }
      log.info({ cid }, '[IPFSGC] Unpinned');
      results.unpinned.push(cid);
    } catch (err) {
      log.error({ err, cid }, '[IPFSGC] Failed to unpin');
      results.failed.push({ cid, error: err.message });
    }
  }

  log.info(
    { unpinned: results.unpinned.length, failed: results.failed.length },
    '[IPFSGC] Completed',
  );
  return results;
}

export default { runGarbageCollector };
