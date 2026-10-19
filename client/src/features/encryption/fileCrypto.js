/**
 * File-level encryption for attachments.
 * Random AES-256-GCM key per file; key is sent only inside the E2EE message payload.
 */

function bufToBase64(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function base64ToBuf(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Encrypt a File/Blob. Returns ciphertext ArrayBuffer + key material (base64).
 */
export async function encryptFile(file) {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await file.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  const rawKey = await crypto.subtle.exportKey('raw', key);
  return {
    ciphertext,
    fileKeyB64: bufToBase64(rawKey),
    fileIvB64: bufToBase64(iv),
    size: data.byteLength,
  };
}

/**
 * Decrypt ciphertext ArrayBuffer using key material from the E2EE message.
 */
export async function decryptFile(ciphertext, fileKeyB64, fileIvB64) {
  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBuf(fileKeyB64),
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(base64ToBuf(fileIvB64)) },
    key,
    ciphertext
  );
  return plain;
}

export function isAllowedMime(mime) {
  if (!mime) return false;
  const allowed = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'video/mp4',
    'video/webm',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  return (
    allowed.includes(mime) ||
    mime.startsWith('image/') ||
    mime.startsWith('audio/') ||
    mime.startsWith('video/')
  );
}

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
