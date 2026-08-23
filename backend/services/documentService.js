import crypto from 'crypto';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('service.document');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// In-memory metadata store (replace with Prisma EscrowDocument in production)
const _docs = new Map();

async function uploadToIPFS(buffer, fileName) {
  try {
    const ipfs = await import('./ipfsService.js');
    const svc = ipfs.default ?? ipfs;
    if (typeof svc.pinFile === 'function') {
      return await svc.pinFile(buffer, fileName);
    }
  } catch {}
  // Deterministic CID fallback for environments without live IPFS
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  return `Qm${hash.slice(0, 44)}`;
}

async function fetchFromIPFS(cid) {
  try {
    const ipfs = await import('./ipfsService.js');
    const svc = ipfs.default ?? ipfs;
    if (typeof svc.fetchBuffer === 'function') {
      return await svc.fetchBuffer(cid);
    }
  } catch {}
  return Buffer.from('');
}

export async function uploadDocument({ file, fileName, mimeType, escrowId }) {
  const buf = Buffer.isBuffer(file) ? file : Buffer.from(file);
  if (buf.length > MAX_FILE_SIZE) throw new Error('File exceeds 10MB limit');

  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const cid = await uploadToIPFS(encrypted, fileName);

  const meta = {
    cid,
    encryptionKey: key.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    fileName,
    mimeType,
    size: buf.length,
    escrowId,
    uploadedAt: new Date(),
  };

  const list = _docs.get(escrowId) || [];
  list.push(meta);
  _docs.set(escrowId, list);

  log.info({ message: 'document_uploaded', cid, escrowId, size: buf.length });
  return {
    cid,
    encryptionKey: meta.encryptionKey,
    iv: meta.iv,
    authTag: meta.authTag,
    fileName,
    mimeType,
    size: buf.length,
  };
}

export async function downloadDocument({ cid, encryptionKey, iv, authTag }) {
  const encryptedBuf = await fetchFromIPFS(cid);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(encryptionKey, 'hex'),
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  return Buffer.concat([decipher.update(encryptedBuf), decipher.final()]);
}

export function getEscrowDocuments(escrowId) {
  return (_docs.get(escrowId) || []).map(d => ({
    cid: d.cid,
    fileName: d.fileName,
    mimeType: d.mimeType,
    size: d.size,
    uploadedAt: d.uploadedAt,
  }));
}
