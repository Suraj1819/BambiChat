/**
 * IndexedDB key store for identity private keys.
 * Never stores private material in localStorage.
 */

const DB_NAME = 'bambi-crypto';
const DB_VERSION = 1;
const STORE = 'identity';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'userId' });
      }
    };
  });
}

/**
 * Load or create identity keys for a user.
 * Returns { publicKeyB64, privateKey (CryptoKey), deviceId, registrationId }
 */
export async function ensureIdentity(userId) {
  const db = await openDb();
  const existing = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(userId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (existing?.privateKeyB64 && existing?.publicKeyB64) {
    const { importPrivateKey } = await import('./crypto.js');
    const privateKey = await importPrivateKey(existing.privateKeyB64);
    return {
      publicKeyB64: existing.publicKeyB64,
      privateKey,
      deviceId: existing.deviceId || 1,
      registrationId: existing.registrationId || 1,
      createdAt: existing.createdAt,
    };
  }

  // Generate new identity
  const { generateIdentityKeyPair } = await import('./crypto.js');
  const pair = await generateIdentityKeyPair();
  const record = {
    userId,
    publicKeyB64: pair.publicKeyB64,
    privateKeyB64: pair.privateKeyB64,
    deviceId: 1,
    registrationId: Math.floor(Math.random() * 16380) + 1,
    createdAt: new Date().toISOString(),
  };

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  return {
    publicKeyB64: pair.publicKeyB64,
    privateKey: pair.privateKey,
    deviceId: record.deviceId,
    registrationId: record.registrationId,
    createdAt: record.createdAt,
  };
}

/**
 * Clear identity for logout / device revoke simulation.
 */
export async function clearIdentity(userId) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(userId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
