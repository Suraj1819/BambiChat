/**
 * Group encryption helpers (Stage 6).
 *
 * Design:
 * - Each group has a shared AES-256-GCM key (group key).
 * - Group key is stored in IndexedDB per conversation for the local user.
 * - When creating a group / adding members, the admin encrypts the group key
 *   for each member using pairwise ECDH (same as DM) and sends a key-distribution
 *   payload inside an E2EE system message.
 * - Removing a member rotates the group key; remaining members receive the new key.
 * - Server never stores the group key in plaintext.
 */

import {
  importPublicKey,
  deriveConversationKey,
  encryptMessage,
  decryptMessage,
  PROTOCOL_VERSION,
} from './crypto.js';
import { ensureIdentity } from './keyStore.js';

const DB_NAME = 'bambi-group-keys';
const DB_VERSION = 1;
const STORE = 'keys';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'conversationId' });
      }
    };
  });
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
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

export async function generateGroupKey() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  return { key, keyB64: bufToBase64(raw) };
}

export async function importGroupKey(keyB64) {
  return crypto.subtle.importKey(
    'raw',
    base64ToBuf(keyB64),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function saveGroupKey(conversationId, keyB64, epoch = 1) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ conversationId, keyB64, epoch, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadGroupKey(conversationId) {
  const db = await openDb();
  const rec = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(conversationId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!rec?.keyB64) return null;
  const key = await importGroupKey(rec.keyB64);
  return { key, keyB64: rec.keyB64, epoch: rec.epoch || 1 };
}

export async function encryptGroupMessage(groupKey, plaintext, aad = '') {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const aadBuf = new TextEncoder().encode(aad);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadBuf },
    groupKey,
    encoded
  );
  return {
    ciphertext: JSON.stringify({
      v: 'bambi-e2ee-v1-group',
      iv: bufToBase64(iv),
      ct: bufToBase64(ct),
    }),
    protocolVersion: 'bambi-e2ee-v1-group',
  };
}

export async function decryptGroupMessage(groupKey, ciphertextEnvelope, aad = '') {
  let env;
  try {
    env = JSON.parse(ciphertextEnvelope);
  } catch {
    return '[undecryptable]';
  }
  if (!env.iv || !env.ct) return '[undecryptable]';
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(base64ToBuf(env.iv)),
        additionalData: new TextEncoder().encode(aad),
      },
      groupKey,
      base64ToBuf(env.ct)
    );
    return new TextDecoder().decode(plain);
  } catch {
    return '[decryption failed]';
  }
}

/**
 * Encrypt group key for a single member (pairwise ECDH wrapper).
 */
export async function wrapGroupKeyForMember(localUserId, memberUserId, memberPublicKeyB64, groupKeyB64) {
  const identity = await ensureIdentity(localUserId);
  const peerPub = await importPublicKey(memberPublicKeyB64);
  const aes = await deriveConversationKey(identity.privateKey, peerPub);
  const aad = `group-key|${memberUserId}`;
  const { ciphertextB64, ivB64 } = await encryptMessage(aes, groupKeyB64, aad);
  return { userId: memberUserId, iv: ivB64, ct: ciphertextB64 };
}

export async function unwrapGroupKeyFromMember(
  localUserId,
  senderUserId,
  senderPublicKeyB64,
  wrapped
) {
  const identity = await ensureIdentity(localUserId);
  const peerPub = await importPublicKey(senderPublicKeyB64);
  const aes = await deriveConversationKey(identity.privateKey, peerPub);
  const aad = `group-key|${localUserId}`;
  return decryptMessage(aes, wrapped.ct, wrapped.iv, aad);
}

export { PROTOCOL_VERSION };
