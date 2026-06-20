/**
 * IPFS Hash & Merkle Verification Service
 *
 * Provides:
 *   - SHA-256 hashing of file buffers
 *   - Merkle root calculation for multi-file evidence sets
 *   - Verification of files against stored hashes
 *
 * The Merkle root is included when transmitting dispute state to the
 * smart contract so evidence integrity can be verified on-chain.
 */

import crypto from 'crypto';

// ── SHA-256 ───────────────────────────────────────────────────────────────────

/**
 * Computes the SHA-256 hash of a Buffer or string.
 * @param {Buffer|string} data
 * @returns {string} hex digest
 */
export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Computes SHA-256 of a file buffer and returns hex + base64 representations.
 * @param {Buffer} buffer
 * @returns {{ hex: string, base64: string }}
 */
export function hashFile(buffer) {
  const hash = crypto.createHash('sha256').update(buffer);
  return { hex: hash.copy().digest('hex'), base64: hash.digest('base64') };
}

// ── Merkle tree ───────────────────────────────────────────────────────────────

/**
 * Builds a Merkle tree from an array of hex leaf hashes and returns the root.
 *
 * Algorithm: binary Merkle tree, SHA-256(left || right).
 * Odd number of leaves: duplicate the last leaf.
 *
 * @param {string[]} leaves — array of hex SHA-256 hashes
 * @returns {string} Merkle root as hex string
 */
export function merkleRoot(leaves) {
  if (!leaves || leaves.length === 0) return sha256('empty');
  if (leaves.length === 1) return leaves[0];

  let level = [...leaves];

  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left; // duplicate last if odd
      next.push(sha256(left + right));
    }
    level = next;
  }

  return level[0];
}

/**
 * Hashes an array of file buffers and returns individual hashes + Merkle root.
 *
 * @param {Buffer[]} buffers
 * @returns {{ hashes: string[], root: string }}
 */
export function hashFiles(buffers) {
  const hashes = buffers.map((b) => hashFile(b).hex);
  const root = merkleRoot(hashes);
  return { hashes, root };
}

/**
 * Verifies a single file buffer against a stored SHA-256 hex hash.
 *
 * @param {Buffer} buffer
 * @param {string} storedHash — hex SHA-256
 * @returns {boolean}
 */
export function verifyFile(buffer, storedHash) {
  return hashFile(buffer).hex === storedHash;
}

/**
 * Verifies a set of file buffers against stored hashes and a Merkle root.
 *
 * @param {Buffer[]} buffers
 * @param {string[]} storedHashes
 * @param {string}   storedRoot
 * @returns {{ valid: boolean, fileResults: boolean[], rootMatch: boolean }}
 */
export function verifyFiles(buffers, storedHashes, storedRoot) {
  if (buffers.length !== storedHashes.length) {
    return { valid: false, fileResults: [], rootMatch: false };
  }
  const fileResults = buffers.map((b, i) => verifyFile(b, storedHashes[i]));
  const recomputedRoot = merkleRoot(fileResults.map((ok, i) => (ok ? storedHashes[i] : 'invalid')));
  const rootMatch = recomputedRoot === storedRoot;
  return { valid: fileResults.every(Boolean) && rootMatch, fileResults, rootMatch };
}

export default { sha256, hashFile, hashFiles, merkleRoot, verifyFile, verifyFiles };
