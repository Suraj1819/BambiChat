/**
 * Per-peer session key cache for bambi-e2ee-v1.
 * Derives AES keys from local identity + peer public keys (ECDH P-256).
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

/** @type {Map<string, { key: CryptoKey, pubFp: string }>} */
const sessionCache = new Map();

function cacheKey(localUserId, peerUserId) {
  return `${localUserId}:${peerUserId}`;
}

function fingerprint(pubB64) {
  // Short stable id so we invalidate when the peer republishes a new key
  return String(pubB64 || '').slice(0, 32) + ':' + String(pubB64 || '').length;
}

/**
 * Get or derive AES key for messaging with a peer.
 * Re-derives when the peer public key changes.
 */
export async function getSessionKey(localUserId, peerUserId, peerPublicKeyB64) {
  if (!peerPublicKeyB64) {
    throw new Error('Peer has no published public key — cannot derive session key');
  }
  const key = cacheKey(localUserId, peerUserId);
  const fp = fingerprint(peerPublicKeyB64);
  const cached = sessionCache.get(key);
  if (cached && cached.pubFp === fp) return cached.key;

  const identity = await ensureIdentity(localUserId);
  const peerPub = await importPublicKey(peerPublicKeyB64);
  const aesKey = await deriveConversationKey(identity.privateKey, peerPub);
  sessionCache.set(key, { key: aesKey, pubFp: fp });
  return aesKey;
}

export function invalidateSessionKey(localUserId, peerUserId) {
  sessionCache.delete(cacheKey(localUserId, peerUserId));
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
  if (!conversationId || !clientMessageId) {
    throw new Error('conversationId and clientMessageId are required to encrypt');
  }
  const aesKey = await getSessionKey(localUserId, peerUserId, peerPublicKeyB64);
  const aad = buildAad(conversationId, localUserId, clientMessageId);
  const { ciphertextB64, ivB64, protocolVersion } = await encryptMessage(
    aesKey,
    plaintext,
    aad
  );
  const envelope = JSON.stringify({
    v: protocolVersion,
    iv: ivB64,
    ct: ciphertextB64,
  });
  return {
    ciphertext: envelope,
    protocolVersion: PROTOCOL_VERSION,
    clientMessageId,
  };
}

/**
 * Decrypt incoming message envelope.
 * Retries once after invalidating the session cache (handles peer key rotation).
 * Falls back to empty AAD only if the strict AAD path fails (legacy envelopes).
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

  // Plaintext legacy (should not appear for E2EE)
  if (typeof ciphertext === 'string' && !ciphertext.trim().startsWith('{')) {
    return ciphertext;
  }

  let envelope;
  try {
    envelope = typeof ciphertext === 'object' ? ciphertext : JSON.parse(ciphertext);
  } catch {
    return '[undecryptable]';
  }
  if (!envelope?.iv || !envelope?.ct) return '[undecryptable]';
  if (!peerPublicKeyB64) return '[no peer key — ask them to open the app once]';

  const aad = buildAad(
    conversationId || '',
    senderId || peerUserId || '',
    clientMessageId || ''
  );

  const tryDecrypt = async (aesKey, aadStr) =>
    decryptMessage(aesKey, envelope.ct, envelope.iv, aadStr);

  try {
    const aesKey = await getSessionKey(localUserId, peerUserId, peerPublicKeyB64);
    try {
      return await tryDecrypt(aesKey, aad);
    } catch {
      // Legacy / mismatched AAD fallback
      try {
        return await tryDecrypt(aesKey, '');
      } catch {
        /* fall through to cache invalidate */
      }
    }
  } catch {
    /* fall through */
  }

  // Peer may have republished keys — drop cache and retry once
  invalidateSessionKey(localUserId, peerUserId);
  try {
    const aesKey = await getSessionKey(localUserId, peerUserId, peerPublicKeyB64);
    try {
      return await tryDecrypt(aesKey, aad);
    } catch {
      return await tryDecrypt(aesKey, '');
    }
  } catch {
    return '[decryption failed]';
  }
}

export function clearSessionCache() {
  sessionCache.clear();
}

export { PROTOCOL_VERSION };
