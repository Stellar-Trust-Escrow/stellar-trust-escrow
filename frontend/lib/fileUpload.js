/**
 * Client-side helpers for the dispute evidence upload flow: file validation,
 * SHA-256 hashing (the hash anchored on-chain), and chunked upload to the
 * evidence endpoint using a ReadableStream reader.
 */

import { getToken } from './auth/token';

export const MAX_FILES = 5;
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const CHUNK_SIZE_BYTES = 1024 * 1024; // 1 MB
export const ALLOWED_MIME_TYPES = ['application/pdf', 'application/zip'];

/** True for images, PDFs, and ZIP archives. */
export function isAllowedMimeType(mimeType) {
  return typeof mimeType === 'string' && (mimeType.startsWith('image/') || ALLOWED_MIME_TYPES.includes(mimeType));
}

/**
 * Validates a single file against the evidence upload constraints.
 * @param {File} file
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateFile(file) {
  if (!isAllowedMimeType(file.type)) {
    return { valid: false, error: `${file.name} isn't a supported file type. Allowed: images, PDF, ZIP.` };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `${file.name} is larger than the 20 MB limit.` };
  }
  return { valid: true, error: null };
}

/**
 * Computes the SHA-256 digest of a file and returns it as a lowercase hex
 * string — this is the value anchored on-chain for the evidence.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function sha256Hex(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toContentRange(start, end, total) {
  return `bytes ${start}-${end - 1}/${total}`;
}

function concatChunks(a, b) {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

/**
 * Uploads a file in 1 MB chunks, reading it via a ReadableStream so large
 * files never need to be buffered in full. Each chunk is POSTed with a
 * Content-Range header describing its position in the overall file.
 *
 * @param {File} file
 * @param {object} [options]
 * @param {(percent: number) => void} [options.onProgress]
 * @param {string} [options.endpoint]
 * @returns {Promise<any>} the parsed JSON body of the final chunk's response
 */
export async function uploadFileChunked(file, { onProgress, endpoint = '/api/v1/evidence/upload' } = {}) {
  const total = file.size;
  const reader = file.stream().getReader();
  const token = getToken();

  let offset = 0;
  let buffered = new Uint8Array(0);
  let lastResponseBody = null;

  const sendChunk = async (chunk) => {
    const start = offset;
    const end = offset + chunk.length;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Range': toContentRange(start, end, total),
        'X-File-Name': file.name,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: chunk,
    });
    if (!response.ok) {
      throw new Error(`Upload failed for ${file.name} (status ${response.status})`);
    }
    offset = end;
    onProgress?.(total === 0 ? 100 : Math.round((offset / total) * 100));
    if (end === total) {
      lastResponseBody = await response.json().catch(() => null);
    }
  };

  let done = false;
  while (!done) {
    const step = await reader.read();
    done = step.done;
    if (step.value) {
      buffered = concatChunks(buffered, step.value);
    }
    while (buffered.length >= CHUNK_SIZE_BYTES) {
      const chunk = buffered.slice(0, CHUNK_SIZE_BYTES);
      buffered = buffered.slice(CHUNK_SIZE_BYTES);
      await sendChunk(chunk);
    }
  }
  if (buffered.length > 0) {
    await sendChunk(buffered);
  }

  return lastResponseBody;
}
