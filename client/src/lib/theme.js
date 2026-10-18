/**
 * Theme preference: 'light' | 'dark' | 'system'.
 * Stored in localStorage under the existing 'bambi-theme' key, so users who
 * already chose light or dark keep their choice.
 */
const KEY = 'bambi-theme';
const VALID = ['light', 'dark', 'system'];
let mediaQuery = null;
let mediaListener = null;

export function getThemePreference() {
  try {
    const v = localStorage.getItem(KEY);
    return VALID.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref = getThemePreference()) {
  if (pref === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref;
}

function paint(pref) {
  document.documentElement.classList.toggle('dark', resolveTheme(pref) === 'dark');
}

/** Apply a preference and (when 'system') follow OS changes live. */
export function applyTheme(pref) {
  paint(pref);
  if (mediaQuery && mediaListener) mediaQuery.removeEventListener('change', mediaListener);
  mediaQuery = null;
  mediaListener = null;
  if (pref === 'system' && window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaListener = () => paint('system');
    mediaQuery.addEventListener('change', mediaListener);
  }
}

export function setThemePreference(pref) {
  if (!VALID.includes(pref)) return;
  try { localStorage.setItem(KEY, pref); } catch { /* storage unavailable */ }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent('bambi-theme-change', { detail: pref }));
}

export function cycleTheme() {
  const order = ['light', 'dark', 'system'];
  const next = order[(order.indexOf(getThemePreference()) + 1) % order.length];
  setThemePreference(next);
  return next;
}

export function initTheme() {
  applyTheme(getThemePreference());
}
