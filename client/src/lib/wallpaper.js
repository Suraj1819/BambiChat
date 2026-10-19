/**
 * Chat wallpaper preferences — stored locally (per conversation + global default).
 * Backend has no wallpaper endpoint yet; this keeps UX functional offline-first.
 */

const GLOBAL_KEY = 'bambi-wallpaper-global';
const CONV_PREFIX = 'bambi-wallpaper-conv-';

export const SOLID_COLORS = [
  { id: 'default', label: 'Default', value: null },
  { id: 'dark-teal', label: 'Dark teal', value: '#0B141A' },
  { id: 'deep-green', label: 'Deep green', value: '#0A1F1A' },
  { id: 'slate', label: 'Slate', value: '#15202B' },
  { id: 'charcoal', label: 'Charcoal', value: '#1A1A1A' },
  { id: 'midnight', label: 'Midnight', value: '#0D1117' },
  { id: 'indigo', label: 'Indigo', value: '#12122A' },
  { id: 'warm', label: 'Warm gray', value: '#1C1917' },
];

export const PATTERNS = [
  { id: 'none', label: 'None', css: null },
  {
    id: 'dots',
    label: 'Dots',
    css: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)',
    size: '18px 18px',
  },
  {
    id: 'grid',
    label: 'Grid',
    css: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
    size: '24px 24px',
  },
  {
    id: 'diagonal',
    label: 'Diagonal',
    css: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.03) 10px, rgba(255,255,255,0.03) 11px)',
    size: 'auto',
  },
];

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / private mode */
  }
}

/** @returns {{ type: 'default'|'solid'|'pattern'|'image', value?: string, patternId?: string }} */
export function getGlobalWallpaper() {
  return readJson(GLOBAL_KEY, { type: 'default' });
}

export function setGlobalWallpaper(wallpaper) {
  writeJson(GLOBAL_KEY, wallpaper);
  window.dispatchEvent(new CustomEvent('bambi-wallpaper-change', { detail: { scope: 'global', wallpaper } }));
}

export function getConversationWallpaper(conversationId) {
  if (!conversationId) return null;
  return readJson(`${CONV_PREFIX}${conversationId}`, null);
}

export function setConversationWallpaper(conversationId, wallpaper) {
  if (!conversationId) return;
  writeJson(`${CONV_PREFIX}${conversationId}`, wallpaper);
  window.dispatchEvent(
    new CustomEvent('bambi-wallpaper-change', {
      detail: { scope: 'conversation', conversationId, wallpaper },
    })
  );
}

export function clearConversationWallpaper(conversationId) {
  setConversationWallpaper(conversationId, null);
}

/** Resolve effective wallpaper for a chat (per-conversation overrides global). */
export function resolveWallpaper(conversationId) {
  const local = getConversationWallpaper(conversationId);
  if (local && local.type && local.type !== 'default') return local;
  return getGlobalWallpaper();
}

/** Build CSS style object for the message surface. */
export function wallpaperStyle(wallpaper) {
  if (!wallpaper || wallpaper.type === 'default') {
    return {};
  }
  if (wallpaper.type === 'solid' && wallpaper.value) {
    return { backgroundColor: wallpaper.value };
  }
  if (wallpaper.type === 'pattern') {
    const pat = PATTERNS.find((p) => p.id === wallpaper.patternId) || PATTERNS[1];
    if (!pat.css) return {};
    return {
      backgroundColor: wallpaper.value || '#0B141A',
      backgroundImage: pat.css,
      backgroundSize: pat.size || 'auto',
    };
  }
  if (wallpaper.type === 'image' && wallpaper.value) {
    return {
      backgroundImage: `url(${wallpaper.value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  return {};
}

/** Compress image file to a data URL suitable for wallpaper (max ~1200px, jpeg). */
export function compressImageFile(file, maxEdge = 1200, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('Image must be smaller than 8 MB.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image.'));
    };
    img.src = url;
  });
}
