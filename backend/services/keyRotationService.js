/**
 * Key Rotation Service
 *
 * Manages JWT signing key rotation, overlap windows, and JWKS exposure.
 */

import crypto, { randomUUID } from 'crypto';
import cache from '../lib/cache.js';
import { withTenantScopeBypassed } from '../lib/tenantContext.js';
import { getLogger } from '../config/logger.js';

const log = getLogger();

const ROTATION_OVERLAP_MS = parseInt(process.env.ROTATION_OVERLAP_MS, 10) || 86400000;
const LONG_TTL_SECONDS = 31536000; // 1 year

function generateKeyVersion() {
  return Date.now();
}

async function updateJwks() {
  return withTenantScopeBypassed(async () => {
    const keys = await getValidPublicKeys(false);
    const jwks = keys.map(k => {
      const pubKey = crypto.createPublicKey(k.publicKey);
      const jwk = pubKey.export({ format: 'jwk' });
      return {
        ...jwk,
        kid: k.kid,
        alg: k.algorithm,
        use: 'sig'
      };
    });
    
    await cache.set('signing_keys:jwks', jwks, LONG_TTL_SECONDS);
  });
}

async function rotateKey() {
  return withTenantScopeBypassed(async () => {
    log.info('Starting key rotation...');
    const kid = randomUUID();
    const version = generateKeyVersion();
    
    // Generate RSA-2048 keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const newKeyObj = {
      kid,
      privateKey,
      publicKey,
      algorithm: 'RS256',
      createdAt: Date.now(),
      version
    };

    const currentStr = await cache.get('signing_keys:current');
    
    if (currentStr) {
      const current = typeof currentStr === 'string' ? JSON.parse(currentStr) : currentStr;
      
      // Move current key to archive
      const archiveObj = {
        kid: current.kid,
        publicKey: current.publicKey,
        algorithm: current.algorithm,
        createdAt: current.createdAt,
        expiredAt: Date.now() + ROTATION_OVERLAP_MS
      };
      
      // Store in archive with appropriate TTL
      const ttl = Math.ceil(ROTATION_OVERLAP_MS / 1000) + 3600; 
      await cache.set(`signing_keys:archive:${current.kid}`, archiveObj, ttl);
      
      // Maintain list of archived kids
      let archivesList = await cache.get('signing_keys:archive_kids');
      if (!archivesList) archivesList = [];
      if (typeof archivesList === 'string') archivesList = JSON.parse(archivesList);
      
      archivesList.push(current.kid);
      await cache.set('signing_keys:archive_kids', archivesList, LONG_TTL_SECONDS);
    }

    // Set new key
    await cache.set('signing_keys:current', newKeyObj, LONG_TTL_SECONDS);
    
    // Update public JWKS
    await updateJwks();
    
    log.info({ kid }, 'Key rotation completed.');
    return newKeyObj;
  });
}

async function getCurrentSigningKey() {
  return withTenantScopeBypassed(async () => {
    const current = await cache.get('signing_keys:current');
    if (!current) {
      // Auto-generate the first key if the system has none
      return await rotateKey();
    }
    return typeof current === 'string' ? JSON.parse(current) : current;
  });
}

async function getValidPublicKeys(jwkFormat = false) {
  return withTenantScopeBypassed(async () => {
    if (jwkFormat) {
       let jwks = await cache.get('signing_keys:jwks');
       if (!jwks) {
          await getCurrentSigningKey(); // Initialize keys
          jwks = await cache.get('signing_keys:jwks') || [];
       }
       return typeof jwks === 'string' ? JSON.parse(jwks) : jwks;
    }

    const keys = [];
    const current = await cache.get('signing_keys:current');
    if (current) {
      const currentObj = typeof current === 'string' ? JSON.parse(current) : current;
      keys.push({
        kid: currentObj.kid,
        publicKey: currentObj.publicKey,
        algorithm: currentObj.algorithm
      });
    }

    let archivesList = await cache.get('signing_keys:archive_kids') || [];
    if (typeof archivesList === 'string') archivesList = JSON.parse(archivesList);
    
    for (const kid of archivesList) {
      const archive = await cache.get(`signing_keys:archive:${kid}`);
      if (archive) {
        const archObj = typeof archive === 'string' ? JSON.parse(archive) : archive;
        if (!archObj.expiredAt || archObj.expiredAt > Date.now()) {
           keys.push({
             kid: archObj.kid,
             publicKey: archObj.publicKey,
             algorithm: archObj.algorithm
           });
        }
      }
    }
    
    return keys;
  });
}

async function pruneExpiredKeys() {
  return withTenantScopeBypassed(async () => {
    log.info('Starting key prune job...');
    let archivesList = await cache.get('signing_keys:archive_kids') || [];
    if (typeof archivesList === 'string') archivesList = JSON.parse(archivesList);
    
    let changed = false;
    const validKids = [];
    
    for (const kid of archivesList) {
      const archive = await cache.get(`signing_keys:archive:${kid}`);
      if (archive) {
        const archObj = typeof archive === 'string' ? JSON.parse(archive) : archive;
        if (archObj.expiredAt && archObj.expiredAt <= Date.now()) {
          // It's expired, remove from redis
          await cache.invalidate(`signing_keys:archive:${kid}`);
          changed = true;
        } else {
          validKids.push(kid);
        }
      }
    }
    
    if (changed || archivesList.length !== validKids.length) {
      await cache.set('signing_keys:archive_kids', validKids, LONG_TTL_SECONDS);
      await updateJwks();
      log.info(`Pruned ${archivesList.length - validKids.length} expired keys.`);
    } else {
      log.info('No expired keys to prune.');
    }
  });
}

export default {
  rotateKey,
  getCurrentSigningKey,
  getValidPublicKeys,
  pruneExpiredKeys
};
