/**
 * Store selector: Postgres when DATABASE_URL is set, otherwise memory.
 */

import { env } from '../config/env.js';
import { store as memoryStore } from './memoryStore.js';
import { pgStore } from './pgStore.js';
import { testConnection } from '../db/pool.js';

const usePg = env.usePostgres;

/** @type {typeof memoryStore | typeof pgStore} */
export const store = usePg ? pgStore : memoryStore;

export async function initStore() {
  if (!usePg) {
    console.log('[store] Using in-memory store (set DATABASE_URL for Supabase/Postgres)');
    return { backend: 'memory' };
  }
  const probe = await testConnection();
  if (!probe.ok) {
    console.error('[store] Postgres connection failed:', probe.reason);
    console.error('[store] Falling back to in-memory store');
    return { backend: 'memory', error: probe.reason };
  }
  console.log('[store] Connected to Postgres/Supabase at', probe.now);
  return { backend: 'postgres' };
}

export { memoryStore, pgStore };
