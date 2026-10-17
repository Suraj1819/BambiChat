/**
 * Bambi E2EE v1 — Web Crypto based encryption adapter.
 *
 * Protocol: ECDH P-256 + HKDF-SHA-256 + AES-256-GCM
 * Private keys stay in the browser (IndexedDB via keyStore).
 * See docs/security-model.md for limitations and threat model.
 */

const PROTOCOL_VERSION = 'bambi-e2ee-v1';
const ECDH_PARAMS = { name: 'ECDH', namedCurve: 'P-256' };
const AES_PARAMS = { name: 'AES-GCM', length: 256 };

function bufToBase64(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBuf(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Generate a new identity key pair (ECDH P-256).
 */
export async function generateIdentityKeyPair() {
  const keyPair = await crypto.subtle.generateKey(ECDH_PARAMS, true, [
    'deriveBits',
    'deriveKey',
  ]);
  const publicSpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privatePkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyB64: bufToBase64(publicSpki),
    privateKeyB64: bufToBase64(privatePkcs8),
  };
}

/**
 * Import public key from base64 SPKI.
 */
export async function importPublicKey(publicKeyB64) {
  return crypto.subtle.importKey(
    'spki',
    base64ToBuf(publicKeyB64),
    ECDH_PARAMS,
    true,
    []
  );
}

/**
 * Import private key from base64 PKCS8.
 */
export async function importPrivateKey(privateKeyB64) {
  return crypto.subtle.importKey(
    'pkcs8',
    base64ToBuf(privateKeyB64),
    ECDH_PARAMS,
    false,
    ['deriveBits', 'deriveKey']
  );
}

/**
 * Derive a conversation AES key from local private + peer public identity keys.
 */
export async function deriveConversationKey(privateKey, peerPublicKey) {
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256
  );
  // HKDF extract/expand
  const baseKey = await crypto.subtle.importKey('raw', bits, 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('bambi-e2ee-v1-salt'),
      info: new TextEncoder().encode('conversation-message-key'),
    },
    baseKey,
    AES_PARAMS,
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a plaintext string for a conversation.
 * Returns { ciphertextB64, ivB64, protocolVersion }.
 */
export async function encryptMessage(aesKey, plaintext, aadString = '') {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const aad = new TextEncoder().encode(aadString);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    aesKey,
    encoded
  );
  return {
    ciphertextB64: bufToBase64(cipherBuf),
    ivB64: bufToBase64(iv),
    protocolVersion: PROTOCOL_VERSION,
  };
}

/**
 * Decrypt ciphertext to UTF-8 string.
 */
export async function decryptMessage(aesKey, ciphertextB64, ivB64, aadString = '') {
  const aad = new TextEncoder().encode(aadString);
  const plainBuf = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(base64ToBuf(ivB64)),
      additionalData: aad,
    },
    aesKey,
    base64ToBuf(ciphertextB64)
  );
  return new TextDecoder().decode(plainBuf);
}

/**
 * Build AAD string binding message metadata (prevents mix-and-match).
 */
export function buildAad(conversationId, senderId, clientMessageId) {
  return `${conversationId}|${senderId}|${clientMessageId}`;
}

export { PROTOCOL_VERSION };
