/**
 * IPFS Service — Encrypted, Authenticated Uploads
 *
 * All files are AES-256-GCM encrypted before upload.
 * Uploads are authenticated via Pinata JWT.
 * Decryption keys are stored in-process (keyed by CID) and returned only to
 * callers that pass an authorisation check (client, freelancer, or arbiter).
 *
 * Env vars:
 *   PINATA_JWT          — Pinata API JWT (required for uploads)
 *   PINATA_GATEWAY_URL  — Custom Pinata gateway (optional, falls back to public)
 *   IPFS_GATEWAY_URL    — Public gateway fallback
 *   MAX_FILE_SIZE       — Max upload bytes (default: 10 485 760 = 10 MB)
 *   ALLOWED_MIME_TYPES  — Comma-separated allow-list (default: see below)
 */

import crypto from 'node:crypto';
import sharp from 'sharp';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('service.ipfsService');

// ── Config ────────────────────────────────────────────────────────────────────

const PINATA_API = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const DEFAULT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'video/mp4',
];

function getGateway() {
  return process.env.PINATA_GATEWAY_URL || process.env.IPFS_GATEWAY_URL || 'https://ipfs.io';
}

function getMaxFileSize() {
  return parseInt(process.env.MAX_FILE_SIZE || String(DEFAULT_MAX_FILE_SIZE), 10);
}

function getAllowedMimeTypes() {
  const configured = process.env.ALLOWED_MIME_TYPES?.trim();
  return new Set(
    (configured ? configured.split(',') : DEFAULT_ALLOWED_MIME_TYPES).map((t) => t.trim()),
  );
}

// ── In-process key store  (CID → { key, iv, authorisedAddresses }) ────────────
// In production, replace with a secrets manager (Vault, AWS Secrets Manager, etc.)

/** @type {Map<string, { key: Buffer, iv: Buffer, authorisedAddresses: Set<string> }>} */
const keyStore = new Map();

// ── Encryption helpers ────────────────────────────────────────────────────────

/**
 * Encrypt a buffer with AES-256-GCM.
 * Returns { ciphertext, key, iv, authTag } — all as Buffers.
 */
function encryptBuffer(plaintext) {
  const key = crypto.randomBytes(32); // 256-bit key
  const iv = crypto.randomBytes(12); // 96-bit IV (recommended for GCM)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, key, iv, authTag };
}

/**
 * Decrypt a buffer encrypted by encryptBuffer.
 */
function decryptBuffer(ciphertext, key, iv, authTag) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateFile(buffer, mimeType) {
  const maxFileSize = getMaxFileSize();
  if (buffer.length > maxFileSize) {
    throw Object.assign(new Error(`File exceeds ${maxFileSize} byte limit`), {
      code: 'FILE_TOO_LARGE',
    });
  }
  if (!getAllowedMimeTypes().has(mimeType)) {
    throw Object.assign(new Error(`MIME type not allowed: ${mimeType}`), {
      code: 'MIME_NOT_ALLOWED',
    });
  }
}

// ── Pinata upload ─────────────────────────────────────────────────────────────

async function pinToPinata(encryptedBuffer, filename) {
  const pinataJwt = process.env.PINATA_JWT;
  if (!pinataJwt) throw new Error('PINATA_JWT is not configured');

  const form = new FormData();
  form.append('file', new Blob([encryptedBuffer]), filename);
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  const res = await fetch(PINATA_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pinataJwt}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Pinata upload failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  return { cid: data.IpfsHash, size: data.PinSize };
}

// ── IPFSService ───────────────────────────────────────────────────────────────

class IPFSService {
  /**
   * Encrypt and pin a file to IPFS via Pinata.
   *
   * @param {Buffer}   buffer               — raw file bytes
   * @param {string}   mimeType
   * @param {string}   filename
   * @param {string[]} authorisedAddresses  — Stellar addresses allowed to decrypt
   * @returns {{ cid: string, size: number }}
   */
  async pinFile(buffer, mimeType, filename, authorisedAddresses = []) {
    validateFile(buffer, mimeType);

    const { ciphertext, key, iv, authTag } = encryptBuffer(buffer);

    // Prepend authTag (16 bytes) to ciphertext so we can recover it on decrypt
    const payload = Buffer.concat([authTag, ciphertext]);

    const { cid, size } = await pinToPinata(payload, this.sanitizeFilename(filename));

    keyStore.set(cid, {
      key,
      iv,
      authorisedAddresses: new Set(authorisedAddresses.map((a) => a.toLowerCase())),
    });

    logger.info({
      message: 'ipfs_pin_success',
      cid,
      size,
      authorisedCount: authorisedAddresses.length,
    });
    return { cid, size };
  }

  /**
   * Return the decryption key material for a CID if the caller is authorised.
   *
   * @param {string} cid
   * @param {string} callerAddress — Stellar address of the requester
   * @returns {{ key: string, iv: string }} — hex-encoded key and IV
   */
  getDecryptionKey(cid, callerAddress) {
    const entry = keyStore.get(cid);
    if (!entry) throw Object.assign(new Error('No key found for CID'), { code: 'KEY_NOT_FOUND' });

    if (!entry.authorisedAddresses.has(callerAddress.toLowerCase())) {
      throw Object.assign(new Error('Not authorised to decrypt this file'), {
        code: 'UNAUTHORISED',
      });
    }

    return {
      key: entry.key.toString('hex'),
      iv: entry.iv.toString('hex'),
    };
  }

  /**
   * Decrypt a buffer previously encrypted by pinFile.
   * Caller must supply the key/iv returned by getDecryptionKey.
   *
   * @param {Buffer} encryptedPayload — authTag (16 B) + ciphertext
   * @param {string} keyHex
   * @param {string} ivHex
   * @returns {Buffer}
   */
  decryptFile(encryptedPayload, keyHex, ivHex) {
    const authTag = encryptedPayload.subarray(0, 16);
    const ciphertext = encryptedPayload.subarray(16);
    return decryptBuffer(
      ciphertext,
      Buffer.from(keyHex, 'hex'),
      Buffer.from(ivHex, 'hex'),
      authTag,
    );
  }

  getFileUrl(cid) {
    return `${getGateway()}/ipfs/${cid}`;
  }

  isImage(mimeType) {
    return typeof mimeType === 'string' && mimeType.startsWith('image/');
  }

  sanitizeFilename(filename) {
    if (!filename) return 'unknown';
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255) || 'unknown';
  }

  async generateThumbnail(buffer, mimeType) {
    if (!this.isImage(mimeType)) return null;
    try {
      return await sharp(buffer)
        .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      return null;
    }
  }

  async getFileMetadata(buffer, filename, mimeType) {
    const metadata = {
      filename: this.sanitizeFilename(filename),
      mimeType: mimeType || 'application/octet-stream',
      fileSize: buffer.length,
      uploadedAt: new Date().toISOString(),
    };

    if (this.isImage(mimeType)) {
      try {
        const info = await sharp(buffer).metadata();
        metadata.width = info.width;
        metadata.height = info.height;
        metadata.format = info.format;
      } catch {
        /* non-fatal */
      }
    }

    return metadata;
  }
}

export default new IPFSService();
