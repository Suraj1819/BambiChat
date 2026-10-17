export {
  generateIdentityKeyPair,
  PROTOCOL_VERSION,
} from './crypto.js';
export { ensureIdentity, clearIdentity } from './keyStore.js';
export {
  encryptOutgoing,
  decryptIncoming,
  getSessionKey,
  clearSessionCache,
} from './sessionManager.js';
