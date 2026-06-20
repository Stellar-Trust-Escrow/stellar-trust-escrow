/**
 * Chat Encryption Utilities — Web Crypto API
 *
 * Hybrid encryption for dispute chat:
 *   - AES-256-GCM for messages (symmetric)
 *   - ECDH P-256 + AES-KW for room key exchange (asymmetric)
 *
 * No plaintext ever leaves the client.
 */

const ALGO = 'AES-GCM';
const KEY_LEN = 256;

export async function generateRoomKey() {
  return crypto.subtle.generateKey({ name: ALGO, length: KEY_LEN }, true, ['encrypt', 'decrypt']);
}

export async function exportRoomKey(key) {
  return crypto.subtle.exportKey('raw', key);
}

export async function importRoomKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: ALGO, length: KEY_LEN }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function generateEncryptionKeyPair() {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
}

export async function exportPublicKey(publicKey) {
  const raw = await crypto.subtle.exportKey('spki', publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importPublicKey(b64) {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('spki', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

export async function encryptRoomKeyForRecipient(roomKey, recipientPubKey, senderPrivKey) {
  const sharedKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: recipientPubKey },
    senderPrivKey,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey'],
  );
  const wrapped = await crypto.subtle.wrapKey('raw', roomKey, sharedKey, 'AES-KW');
  return btoa(String.fromCharCode(...new Uint8Array(wrapped)));
}

export async function decryptRoomKey(b64Wrapped, senderPubKey, recipientPrivKey) {
  const wrapped = Uint8Array.from(atob(b64Wrapped), (c) => c.charCodeAt(0));
  const sharedKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: senderPubKey },
    recipientPrivKey,
    { name: 'AES-KW', length: 256 },
    false,
    ['unwrapKey'],
  );
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    sharedKey,
    'AES-KW',
    { name: ALGO, length: KEY_LEN },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptMessage(plaintext, roomKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    roomKey,
    new TextEncoder().encode(plaintext),
  );
  const ciphertextBytes = new Uint8Array(encrypted, 0, encrypted.byteLength - 16);
  const tagBytes = new Uint8Array(encrypted, encrypted.byteLength - 16);
  return {
    ciphertext: btoa(String.fromCharCode(...ciphertextBytes)),
    iv: btoa(String.fromCharCode(...iv)),
    tag: btoa(String.fromCharCode(...tagBytes)),
  };
}

export async function decryptMessage({ ciphertext, iv, tag }, roomKey) {
  const ct = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const tg = Uint8Array.from(atob(tag), (c) => c.charCodeAt(0));
  const ivB = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const combined = new Uint8Array(ct.length + tg.length);
  combined.set(ct);
  combined.set(tg, ct.length);
  const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv: ivB }, roomKey, combined);
  return new TextDecoder().decode(decrypted);
}
