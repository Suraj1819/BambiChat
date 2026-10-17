/**
 * Per-peer session key cache for bambi-e2ee-v1.
 * Derives AES keys from local identity + peer public keys.
 */

import {
  importPublicKey,
  deriveConversationKey,
  encryptMessage,
  decryptMessage,
  buildAad,
  PROTOCOL_VERSION,
} from './crypto.js';
import { ensureIdentity } from './keyStore.js';

/** @type {Map<string, CryptoKey>} cacheKey -> AES key */
const sessionCache = new Map();

function cacheKey(localUserId, peerUserId) {
  return `${localUserId}:${peerUserId}`;
}

/**
 * Get or derive AES key for messaging with a peer.
 */
export async function getSessionKey(localUserId, peerUserId, peerPublicKeyB64) {
  const key = cacheKey(localUserId, peerUserId);
  if (sessionCache.has(key)) return sessionCache.get(key);

  const identity = await ensureIdentity(localUserId);
  const peerPub = await importPublicKey(peerPublicKeyB64);
  const aesKey = await deriveConversationKey(identity.privateKey, peerPub);
  sessionCache.set(key, aesKey);
  return aesKey;
}

/**
 * Encrypt outgoing message body.
 */
export async function encryptOutgoing({
  localUserId,
  peerUserId,
  peerPublicKeyB64,
  conversationId,
  clientMessageId,
  plaintext,
}) {
  if (!peerPublicKeyB64) {
    throw new Error('Peer has no published public key — cannot encrypt');
  }
  const aesKey = await getSessionKey(localUserId, peerUserId, peerPublicKeyB64);
  const aad = buildAad(conversationId, localUserId, clientMessageId);
  const { ciphertextB64, ivB64, protocolVersion } = await encryptMessage(
    aesKey,
    plaintext,
    aad
  );
  // Wire format: iv || ciphertext as single envelope string for storage
  const envelope = JSON.stringify({ v: protocolVersion, iv: ivB64, ct: ciphertextB64 });
  return {
    ciphertext: envelope,
    protocolVersion: PROTOCOL_VERSION,
    clientMessageId,
  };
}

/**
 * Decrypt incoming message envelope.
 */
export async function decryptIncoming({
  localUserId,
  peerUserId,
  peerPublicKeyB64,
  conversationId,
  clientMessageId,
  senderId,
  ciphertext,
}) {
  if (!ciphertext) return '[empty]';
  // Legacy plaintext fallback (should not happen for E2EE messages)
  if (typeof ciphertext === 'string' && !ciphertext.startsWith('{')) {
    return ciphertext;
  }
  let envelope;
  try {
    envelope = JSON.parse(ciphertext);
  } catch {
    return '[undecryptable]';
  }
  if (!envelope.iv || !envelope.ct) return '[undecryptable]';
  if (!peerPublicKeyB64) return '[no peer key]';

  try {
    const aesKey = await getSessionKey(localUserId, peerUserId, peerPublicKeyB64);
    const aad = buildAad(conversationId, senderId, clientMessageId);
    return await decryptMessage(aesKey, envelope.ct, envelope.iv, aad);
  } catch {
    return '[decryption failed]';
  }
}

export function clearSessionCache() {
  sessionCache.clear();
}

export { PROTOCOL_VERSION };
