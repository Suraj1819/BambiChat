import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

/** @type {import('pg').Pool | null} */
let pool = null;

export function getPool() {
  if (!env.databaseUrl) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseUrl.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
      max: 10,
    });
    pool.on('error', (err) => {
      console.error('[pg] pool error', err.message);
    });
  }
  return pool;
}

export async function query(text, params = []) {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL not configured');
  return p.query(text, params);
}

export async function testConnection() {
  const p = getPool();
  if (!p) return { ok: false, reason: 'no DATABASE_URL' };
  try {
    const r = await p.query('select now() as now');
    return { ok: true, now: r.rows[0]?.now };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
