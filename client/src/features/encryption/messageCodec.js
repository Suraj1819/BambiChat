/**
 * Encode/decode message payloads for DM and group.
 */

export function parseDecryptedBody(text) {
  if (!text || typeof text !== 'string') return { body: text, attachment: null, keyDist: null };
  try {
    const obj = JSON.parse(text);
    if (obj && obj.type === 'attachment' && obj.attachmentId) {
      return {
        body: obj.caption || '',
        attachment: {
          attachmentId: obj.attachmentId,
          filename: obj.filename,
          mime: obj.mime,
          size: obj.size,
          fileKeyB64: obj.fileKeyB64,
          fileIvB64: obj.fileIvB64,
        },
        keyDist: null,
      };
    }
    if (obj && obj.type === 'group_key_dist') {
      return { body: '', attachment: null, keyDist: obj };
    }
  } catch {
    /* plain */
  }
  return { body: text, attachment: null, keyDist: null };
}
