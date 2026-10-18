/**
 * Device-local preferences (the backend has no preference-sync endpoint).
 */
import { useSyncExternalStore } from 'react';

const KEY = 'bambi-preferences';

export const DEFAULT_PREFERENCES = {
  enterToSend: true,
  ringtone: true,
  browserNotifications: true,
  micId: '',
  cameraId: '',
  speakerId: '',
  echoCancellation: true,
  noiseSuppression: true,
};

let cache = null;
const listeners = new Set();

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    // Migrate the older notifications key once.
    if (stored.browserNotifications === undefined && localStorage.getItem('bambi-notifications') === 'off') {
      stored.browserNotifications = false;
    }
    return { ...DEFAULT_PREFERENCES, ...stored };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function getPreferences() {
  if (!cache) cache = read();
  return cache;
}

export function setPreferences(patch) {
  cache = { ...getPreferences(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreferences() {
  return useSyncExternalStore(subscribe, getPreferences, getPreferences);
}
