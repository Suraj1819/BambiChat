/**
 * Client-side last-message previews for E2EE chats.
 * Server only stores ciphertext, so plaintext previews live on-device.
 */
const KEY = 'bambi-message-previews';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/**
 * @param {string} conversationId
 * @param {{ text: string, at?: string, senderId?: string }} preview
 */
export function setMessagePreview(conversationId, preview) {
  if (!conversationId || !preview?.text) return;
  const all = readAll();
  all[String(conversationId)] = {
    text: String(preview.text).slice(0, 200),
    at: preview.at || new Date().toISOString(),
    senderId: preview.senderId || null,
  };
  writeAll(all);
}

export function getMessagePreview(conversationId) {
  if (!conversationId) return null;
  return readAll()[String(conversationId)] || null;
}

/** Merge server conversation list with local plaintext previews. */
export function applyPreviewsToConversations(list) {
  if (!Array.isArray(list)) return list;
  const all = readAll();
  return list.map((c) => {
    const p = all[String(c.id)];
    if (!p?.text) return c;
    const serverAt = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
    const localAt = p.at ? new Date(p.at).getTime() : 0;
    // Prefer local text when timestamps are equal or local is newer / server only has placeholder
    const serverIsPlaceholder =
      !c.lastMessage ||
      c.lastMessage === 'Encrypted message' ||
      c.lastMessage === 'Message';
    if (serverIsPlaceholder || localAt >= serverAt) {
      return {
        ...c,
        lastMessage: p.text,
        lastMessageAt: localAt >= serverAt ? p.at : c.lastMessageAt,
      };
    }
    return c;
  });
}

export function previewTextFromBody(body, attachment, call) {
  if (call) {
    const kind = call.kind === 'video' ? 'Video' : 'Voice';
    const st = call.status || 'ended';
    if (st === 'missed' || st === 'declined') return `📞 Missed ${kind.lower()} call`;
    if (st === 'cancelled') return `📞 Cancelled ${kind.lower()} call`;
    return `📞 ${kind} call`;
  }
  if (attachment?.mime?.startsWith('audio/') || attachment?.filename?.match(/\.(webm|ogg|m4a|mp3)$/i)) {
    return '🎤 Voice message';
  }
  if (attachment?.mime?.startsWith('image/')) return '📷 Photo';
  if (attachment?.mime?.startsWith('video/')) return '🎥 Video';
  if (attachment) return `📎 ${attachment.filename || 'File'}`;
  const t = (body || '').trim();
  if (!t) return '';
  if (t === '[attachment]') return '📎 Attachment';
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}
