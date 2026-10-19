/**
 * PostgreSQL / Supabase-backed store.
 * Sessions + presence stay in-process; durable data in Postgres.
 * Never stores private encryption keys.
 */

import { randomUUID, createHash, randomBytes } from 'crypto';
import { query } from '../db/pool.js';

const now = () => new Date().toISOString();

/** @type {Map<string, { userId: string, expiresAt: number }>} */
const sessions = new Map();
/** @type {Map<string, { status: string, at: string }>} */
const presence = new Map();

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeUsername(u) {
  return String(u || '').trim().toLowerCase();
}

const otpStore = new Map();
const otpSessions = new Map();
const emailIndexCache = new Map(); // best-effort if no email column

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}
function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}


function publicProfile(row, hasKey = false) {
  if (!row) return null;
  const userId = row.user_id || row.userId;
  return {
    id: userId,
    username: row.username,
    displayName: row.display_name ?? row.displayName ?? row.username,
    avatarUrl: row.avatar_url ?? row.avatarUrl ?? null,
    about: row.about ?? '',
    email: row.email ?? null,
    phone: row.phone ?? null,
    hasIdentityKey: hasKey,
  };
}

async function hasIdentityKey(userId) {
  const r = await query(
    `SELECT 1 FROM devices d
     JOIN device_identity_keys k ON k.device_row_id = d.id
     WHERE d.user_id = $1 AND d.revoked_at IS NULL
     LIMIT 1`,
    [userId]
  );
  return r.rowCount > 0;
}

async function isBlocked(blockerId, blockedId) {
  const r = await query(
    `SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2 LIMIT 1`,
    [blockerId, blockedId]
  );
  return r.rowCount > 0;
}

async function areFriends(a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  const r = await query(
    `SELECT 1 FROM friendships WHERE user_a_id = $1 AND user_b_id = $2 LIMIT 1`,
    [x, y]
  );
  return r.rowCount > 0;
}

export const pgStore = {
  async register({ username, displayName, phone }) {
    const uname = normalizeUsername(username);
    const digits = String(phone || '').replace(/\D/g, '');
    if (!/^[a-z][a-z0-9_]{2,29}$/.test(uname)) {
      return {
        error: {
          code: 'INVALID_USERNAME',
          message: 'Username must be 3–30 chars, start with a letter, only a-z 0-9 _',
        },
      };
    }
    if (digits && (digits.length < 8 || digits.length > 15)) {
      return { error: { code: 'INVALID_PHONE', message: 'Enter a valid phone number (8–15 digits)' } };
    }
    const exists = await query(`SELECT 1 FROM profiles WHERE lower(username) = $1`, [uname]);
    if (exists.rowCount > 0) {
      return { error: { code: 'USERNAME_TAKEN', message: 'Username is already taken' } };
    }
    if (digits) {
      try {
        const ph = await query(
          `SELECT 1 FROM profiles WHERE phone = $1 LIMIT 1`,
          [digits]
        );
        if (ph.rowCount > 0) {
          return { error: { code: 'PHONE_TAKEN', message: 'This phone number is already registered' } };
        }
      } catch {
        /* phone column may not exist yet */
      }
    }
    const userId = randomUUID();
    const dn = (displayName || uname).trim().slice(0, 80);
    try {
      await query(
        `INSERT INTO profiles (user_id, username, display_name, phone)
         VALUES ($1, $2, $3, $4)`,
        [userId, uname, dn, digits || null]
      );
    } catch {
      await query(
        `INSERT INTO profiles (user_id, username, display_name)
         VALUES ($1, $2, $3)`,
        [userId, uname, dn]
      );
    }
    await query(
      `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [userId]
    );
    return { data: publicProfile({ user_id: userId, username: uname, display_name: dn }) };
  },

  async login(username, phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits) {
      try {
        const r = await query(`SELECT * FROM profiles WHERE phone = $1 LIMIT 1`, [digits]);
        if (!r.rowCount) {
          return { error: { code: 'USER_NOT_FOUND', message: 'No account with that phone number' } };
        }
        const hasKey = await hasIdentityKey(r.rows[0].user_id);
        return { data: publicProfile(r.rows[0], hasKey) };
      } catch {
        return { error: { code: 'USER_NOT_FOUND', message: 'No account with that phone number' } };
      }
    }
    const uname = normalizeUsername(username);
    const r = await query(`SELECT * FROM profiles WHERE lower(username) = $1 LIMIT 1`, [uname]);
    if (!r.rowCount) {
      return { error: { code: 'USER_NOT_FOUND', message: 'No account with that username' } };
    }
    const hasKey = await hasIdentityKey(r.rows[0].user_id);
    return { data: publicProfile(r.rows[0], hasKey) };
  },


  async requestOtp({ email, purpose = 'login' }) {
    const em = normalizeEmail(email);
    if (!isValidEmail(em)) {
      return { error: { code: 'INVALID_EMAIL', message: 'Enter a valid email address' } };
    }
    if (!['login', 'register'].includes(purpose)) {
      return { error: { code: 'VALIDATION', message: 'Invalid purpose' } };
    }
    let exists = false;
    try {
      const r = await query(
        `SELECT user_id FROM profiles WHERE lower(coalesce(email, '')) = $1 LIMIT 1`,
        [em]
      );
      exists = r.rowCount > 0;
      if (exists) emailIndexCache.set(em, r.rows[0].user_id);
    } catch {
      exists = emailIndexCache.has(em);
    }
    if (purpose === 'login' && !exists) {
      return { error: { code: 'USER_NOT_FOUND', message: 'No account with that email' } };
    }
    if (purpose === 'register' && exists) {
      return { error: { code: 'EMAIL_TAKEN', message: 'This email is already registered. Please log in.' } };
    }
    const code = generateOtpCode();
    otpStore.set(em, { code, purpose, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });
    return {
      data: {
        email: em,
        purpose,
        expiresInSec: 600,
        devCode: code,
        message: 'OTP sent to your email',
      },
    };
  },

  async verifyOtp({ email, code, purpose = 'login' }) {
    const em = normalizeEmail(email);
    const entry = otpStore.get(em);
    if (!entry || entry.purpose !== purpose) {
      return { error: { code: 'OTP_INVALID', message: 'Invalid or expired code' } };
    }
    if (entry.expiresAt < Date.now()) {
      otpStore.delete(em);
      return { error: { code: 'OTP_EXPIRED', message: 'Code expired. Request a new one.' } };
    }
    entry.attempts += 1;
    if (entry.attempts > 5) {
      otpStore.delete(em);
      return { error: { code: 'OTP_LOCKED', message: 'Too many attempts. Request a new code.' } };
    }
    if (String(code).trim() !== entry.code) {
      return { error: { code: 'OTP_INVALID', message: 'Incorrect code' } };
    }
    otpStore.delete(em);

    if (purpose === 'login') {
      let userId = emailIndexCache.get(em);
      let row = null;
      try {
        const r = await query(
          `SELECT * FROM profiles WHERE lower(coalesce(email, '')) = $1 LIMIT 1`,
          [em]
        );
        if (r.rowCount) {
          row = r.rows[0];
          userId = row.user_id;
        }
      } catch {
        /* ignore */
      }
      if (!userId) {
        return { error: { code: 'USER_NOT_FOUND', message: 'No account with that email' } };
      }
      const token = this.createSession(userId);
      const hasKey = await hasIdentityKey(userId);
      return {
        data: {
          token,
          user: publicProfile(row || { user_id: userId }, hasKey),
          verified: true,
        },
      };
    }

    const sessionToken = randomBytes(24).toString('hex');
    otpSessions.set(hashToken(sessionToken), {
      email: em,
      purpose: 'register',
      expiresAt: Date.now() + 15 * 60 * 1000,
    });
    return { data: { otpToken: sessionToken, email: em, verified: true } };
  },

  async completeRegistration({ otpToken, username, displayName }) {
    const rec = otpSessions.get(hashToken(otpToken || ''));
    if (!rec || rec.purpose !== 'register' || rec.expiresAt < Date.now()) {
      return { error: { code: 'OTP_SESSION_EXPIRED', message: 'Verification expired. Start again.' } };
    }
    const em = rec.email;
    const uname = normalizeUsername(username);
    if (!/^[a-z][a-z0-9_]{2,29}$/.test(uname)) {
      return {
        error: {
          code: 'INVALID_USERNAME',
          message: 'Username must be 3–30 chars, start with a letter, only a-z 0-9 _',
        },
      };
    }
    const exists = await query(`SELECT 1 FROM profiles WHERE lower(username) = $1`, [uname]);
    if (exists.rowCount > 0) {
      return { error: { code: 'USERNAME_TAKEN', message: 'Username is already taken' } };
    }
    const userId = randomUUID();
    const dn = (displayName || uname).trim().slice(0, 80);
    try {
      await query(
        `INSERT INTO profiles (user_id, username, display_name, email)
         VALUES ($1, $2, $3, $4)`,
        [userId, uname, dn, em]
      );
    } catch {
      // Schema without email column
      await query(
        `INSERT INTO profiles (user_id, username, display_name)
         VALUES ($1, $2, $3)`,
        [userId, uname, dn]
      );
    }
    try {
      await query(
        `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [userId]
      );
    } catch {
      /* optional */
    }
    emailIndexCache.set(em, userId);
    otpSessions.delete(hashToken(otpToken));
    const token = this.createSession(userId);
    return {
      data: {
        token,
        user: publicProfile({ user_id: userId, username: uname, display_name: dn, email: em }),
      },
    };
  },


  async findUserIdByEmail(email) {
    const em = normalizeEmail(email);
    try {
      const r = await query(
        `SELECT user_id FROM profiles WHERE lower(coalesce(email, '')) = $1 LIMIT 1`,
        [em]
      );
      if (r.rowCount) return r.rows[0].user_id;
    } catch {
      /* no email column */
    }
    return emailIndexCache.get(em) || null;
  },

  async registerWithEmail({ email, username, displayName }) {
    const em = normalizeEmail(email);
    if (!isValidEmail(em)) {
      return { error: { code: 'INVALID_EMAIL', message: 'Enter a valid email address' } };
    }
    const existing = await this.findUserIdByEmail(em);
    if (existing) {
      return { error: { code: 'EMAIL_TAKEN', message: 'This email is already registered' } };
    }
    const uname = normalizeUsername(username);
    if (!/^[a-z][a-z0-9_]{2,29}$/.test(uname)) {
      return {
        error: {
          code: 'INVALID_USERNAME',
          message: 'Username must be 3–30 chars, start with a letter, only a-z 0-9 _',
        },
      };
    }
    const exists = await query(`SELECT 1 FROM profiles WHERE lower(username) = $1`, [uname]);
    if (exists.rowCount > 0) {
      return { error: { code: 'USERNAME_TAKEN', message: 'Username is already taken' } };
    }
    const userId = randomUUID();
    const dn = (displayName || uname).trim().slice(0, 80);
    try {
      await query(
        `INSERT INTO profiles (user_id, username, display_name, email)
         VALUES ($1, $2, $3, $4)`,
        [userId, uname, dn, em]
      );
    } catch (e) {
      // Fallback without email column
      try {
        await query(
          `INSERT INTO profiles (user_id, username, display_name)
           VALUES ($1, $2, $3)`,
          [userId, uname, dn]
        );
      } catch (e2) {
        return { error: { code: 'DB_ERROR', message: e2.message || 'Could not create profile' } };
      }
    }
    try {
      await query(
        `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [userId]
      );
    } catch {
      /* optional */
    }
    emailIndexCache.set(em, userId);
    return {
      data: publicProfile({
        user_id: userId,
        username: uname,
        display_name: dn,
        email: em,
      }),
    };
  },

  createSession(userId) {
    const token = randomBytes(32).toString('hex');
    sessions.set(hashToken(token), {
      userId,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
    });
    return token;
  },

  resolveSession(token) {
    if (!token) return null;
    const rec = sessions.get(hashToken(token));
    if (!rec || rec.expiresAt < Date.now()) {
      if (rec) sessions.delete(hashToken(token));
      return null;
    }
    return { userId: rec.userId, profile: { userId: rec.userId } };
  },

  async resolveSessionAsync(token) {
    const base = this.resolveSession(token);
    if (!base) return null;
    const r = await query(`SELECT * FROM profiles WHERE user_id = $1`, [base.userId]);
    if (!r.rowCount) return null;
    return { userId: base.userId, profile: r.rows[0] };
  },

  revokeSession(token) {
    if (token) sessions.delete(hashToken(token));
  },

  async getProfile(userId) {
    const r = await query(`SELECT * FROM profiles WHERE user_id = $1`, [userId]);
    if (!r.rowCount) return null;
    const row = r.rows[0];
    return {
      id: row.user_id,
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      about: row.about || '',
      phoneDiscoverable: false,
    };
  },

  async updateProfile(userId, { displayName, about, avatarUrl }) {
    const sets = [];
    const params = [];
    let i = 1;
    if (displayName !== undefined) {
      sets.push(`display_name = $${i++}`);
      params.push(String(displayName).trim().slice(0, 80));
    }
    if (about !== undefined) {
      sets.push(`about = $${i++}`);
      params.push(String(about).trim().slice(0, 500));
    }
    if (avatarUrl !== undefined) {
      sets.push(`avatar_url = $${i++}`);
      params.push(avatarUrl);
    }
    if (!sets.length) {
      const p = await this.getProfile(userId);
      return p
        ? { data: publicProfile({ user_id: p.userId, username: p.username, display_name: p.displayName, avatar_url: p.avatarUrl, about: p.about }) }
        : { error: { code: 'NOT_FOUND', message: 'Profile not found' } };
    }
    params.push(userId);
    const r = await query(
      `UPDATE profiles SET ${sets.join(', ')}, updated_at = now()
       WHERE user_id = $${i} RETURNING *`,
      params
    );
    if (!r.rowCount) return { error: { code: 'NOT_FOUND', message: 'Profile not found' } };
    return { data: publicProfile(r.rows[0]) };
  },

  async searchByUsername(q, currentUserId, limit = 20) {
    const raw = String(q || '').trim().replace(/^@+/, '');
    const term = normalizeUsername(raw);
    // Only match username (the @handle), not display name
    if (!term || term.length < 1) return [];
    const r = await query(
      `SELECT p.* FROM profiles p
       WHERE p.user_id <> $1
         AND lower(p.username) = $2
       ORDER BY p.username ASC
       LIMIT $3`,
      [
        currentUserId,
        term,
        limit,
      ]
    );
    const out = [];
    for (const row of r.rows) {
      if (await isBlocked(row.user_id, currentUserId)) continue;
      if (await isBlocked(currentUserId, row.user_id)) continue;
      out.push(publicProfile(row, await hasIdentityKey(row.user_id)));
    }
    return out;
  },

  async publishIdentityKey(userId, { publicKeyB64, deviceId = 1, registrationId = 1, protocolVersion = 'bambi-e2ee-v1' }) {
    if (!publicKeyB64) {
      return { error: { code: 'VALIDATION', message: 'publicKeyB64 is required' } };
    }
    let dev = await query(
      `SELECT id FROM devices WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId]
    );
    let deviceRowId;
    if (!dev.rowCount) {
      const ins = await query(
        `INSERT INTO devices (user_id, device_id, label, platform)
         VALUES ($1, $2, 'web', 'web') RETURNING id`,
        [userId, deviceId]
      );
      deviceRowId = ins.rows[0].id;
    } else {
      deviceRowId = dev.rows[0].id;
      await query(`UPDATE devices SET last_active_at = now() WHERE id = $1`, [deviceRowId]);
    }
    const keyBuf = Buffer.from(String(publicKeyB64), 'utf8');
    await query(
      `INSERT INTO device_identity_keys (device_row_id, identity_key, registration_id, protocol_version)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (device_row_id) DO UPDATE SET
         identity_key = EXCLUDED.identity_key,
         registration_id = EXCLUDED.registration_id,
         protocol_version = EXCLUDED.protocol_version`,
      [deviceRowId, keyBuf, registrationId, protocolVersion]
    );
    return {
      data: {
        userId,
        deviceId,
        protocolVersion,
        updatedAt: now(),
      },
    };
  },

  async getIdentityKey(userId) {
    const r = await query(
      `SELECT k.identity_key, k.registration_id, k.protocol_version, d.device_id, d.user_id
       FROM devices d
       JOIN device_identity_keys k ON k.device_row_id = d.id
       WHERE d.user_id = $1 AND d.revoked_at IS NULL
       ORDER BY d.last_active_at DESC
       LIMIT 1`,
      [userId]
    );
    if (!r.rowCount) return null;
    const row = r.rows[0];
    return {
      userId: row.user_id,
      publicKeyB64: Buffer.from(row.identity_key).toString('utf8'),
      deviceId: row.device_id,
      registrationId: row.registration_id,
      protocolVersion: row.protocol_version,
      updatedAt: now(),
    };
  },

  async listPendingIncoming(userId) {
    const r = await query(
      `SELECT fr.*, p.username, p.display_name, p.avatar_url, p.user_id AS from_uid
       FROM friend_requests fr
       JOIN profiles p ON p.user_id = fr.from_user_id
       WHERE fr.to_user_id = $1 AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [userId]
    );
    return r.rows.map((row) => ({
      id: row.id,
      fromUserId: row.from_user_id,
      toUserId: row.to_user_id,
      status: row.status,
      createdAt: row.created_at,
      from: publicProfile({
        user_id: row.from_uid,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
      }),
    }));
  },

  async listPendingOutgoing(userId) {
    const r = await query(
      `SELECT fr.*, p.username, p.display_name, p.avatar_url, p.user_id AS to_uid
       FROM friend_requests fr
       JOIN profiles p ON p.user_id = fr.to_user_id
       WHERE fr.from_user_id = $1 AND fr.status = 'pending'`,
      [userId]
    );
    return r.rows.map((row) => ({
      id: row.id,
      fromUserId: row.from_user_id,
      toUserId: row.to_user_id,
      status: row.status,
      createdAt: row.created_at,
      to: publicProfile({
        user_id: row.to_uid,
        username: row.username,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
      }),
    }));
  },

  async sendFriendRequest(fromUserId, toUserId) {
    if (fromUserId === toUserId) {
      return { error: { code: 'SELF_REQUEST', message: 'Cannot send request to yourself' } };
    }
    const target = await query(`SELECT user_id FROM profiles WHERE user_id = $1`, [toUserId]);
    if (!target.rowCount) {
      return { error: { code: 'USER_NOT_FOUND', message: 'User not found' } };
    }
    if (await areFriends(fromUserId, toUserId)) {
      return { error: { code: 'ALREADY_FRIENDS', message: 'Already friends' } };
    }
    if (await isBlocked(toUserId, fromUserId) || await isBlocked(fromUserId, toUserId)) {
      return { error: { code: 'BLOCKED', message: 'Cannot send request' } };
    }
    const existing = await query(
      `SELECT id FROM friend_requests
       WHERE status = 'pending'
         AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))
       LIMIT 1`,
      [fromUserId, toUserId]
    );
    if (existing.rowCount) {
      return { error: { code: 'REQUEST_EXISTS', message: 'A request already exists' } };
    }
    const ins = await query(
      `INSERT INTO friend_requests (from_user_id, to_user_id, status)
       VALUES ($1, $2, 'pending') RETURNING *`,
      [fromUserId, toUserId]
    );
    const row = ins.rows[0];
    const toProf = await query(`SELECT * FROM profiles WHERE user_id = $1`, [toUserId]);
    return {
      data: {
        id: row.id,
        fromUserId: row.from_user_id,
        toUserId: row.to_user_id,
        status: row.status,
        createdAt: row.created_at,
        to: publicProfile(toProf.rows[0]),
      },
    };
  },

  async acceptFriendRequest(requestId, userId) {
    const r = await query(
      `SELECT * FROM friend_requests WHERE id = $1 AND to_user_id = $2 AND status = 'pending'`,
      [requestId, userId]
    );
    if (!r.rowCount) {
      return { error: { code: 'NOT_FOUND', message: 'Request not found' } };
    }
    const req = r.rows[0];
    await query(
      `UPDATE friend_requests SET status = 'accepted', updated_at = now() WHERE id = $1`,
      [requestId]
    );
    const [a, b] = req.from_user_id < req.to_user_id
      ? [req.from_user_id, req.to_user_id]
      : [req.to_user_id, req.from_user_id];
    await query(
      `INSERT INTO friendships (user_a_id, user_b_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [a, b]
    );
    return {
      data: {
        id: req.id,
        fromUserId: req.from_user_id,
        toUserId: req.to_user_id,
        status: 'accepted',
      },
    };
  },

  async rejectFriendRequest(requestId, userId) {
    const r = await query(
      `UPDATE friend_requests SET status = 'rejected', updated_at = now()
       WHERE id = $1 AND to_user_id = $2 AND status = 'pending' RETURNING *`,
      [requestId, userId]
    );
    if (!r.rowCount) return { error: { code: 'NOT_FOUND', message: 'Request not found' } };
    return { data: { id: r.rows[0].id, status: 'rejected' } };
  },

  async cancelFriendRequest(requestId, userId) {
    const r = await query(
      `UPDATE friend_requests SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND from_user_id = $2 AND status = 'pending' RETURNING *`,
      [requestId, userId]
    );
    if (!r.rowCount) return { error: { code: 'NOT_FOUND', message: 'Request not found' } };
    return { data: { id: r.rows[0].id, status: 'cancelled' } };
  },

  async listFriends(userId) {
    const r = await query(
      `SELECT p.* FROM friendships f
       JOIN profiles p ON p.user_id = CASE WHEN f.user_a_id = $1 THEN f.user_b_id ELSE f.user_a_id END
       WHERE f.user_a_id = $1 OR f.user_b_id = $1`,
      [userId]
    );
    const out = [];
    for (const row of r.rows) {
      if (await isBlocked(userId, row.user_id)) continue;
      out.push(publicProfile(row, await hasIdentityKey(row.user_id)));
    }
    return out;
  },

  async removeFriend(userId, otherId) {
    const [a, b] = userId < otherId ? [userId, otherId] : [otherId, userId];
    const r = await query(
      `DELETE FROM friendships WHERE user_a_id = $1 AND user_b_id = $2 RETURNING id`,
      [a, b]
    );
    if (!r.rowCount) return { error: { code: 'NOT_FRIENDS', message: 'Not friends' } };
    return { data: { ok: true } };
  },

  async blockUser(blockerId, blockedId) {
    if (blockerId === blockedId) {
      return { error: { code: 'SELF_BLOCK', message: 'Cannot block yourself' } };
    }
    await query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [blockerId, blockedId]
    );
    const [a, b] = blockerId < blockedId ? [blockerId, blockedId] : [blockedId, blockerId];
    await query(`DELETE FROM friendships WHERE user_a_id = $1 AND user_b_id = $2`, [a, b]);
    await query(
      `UPDATE friend_requests SET status = 'cancelled', updated_at = now()
       WHERE status = 'pending'
         AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))`,
      [blockerId, blockedId]
    );
    return { data: { ok: true } };
  },

  async unblockUser(blockerId, blockedId) {
    await query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [
      blockerId,
      blockedId,
    ]);
    return { data: { ok: true } };
  },

  async listBlocked(userId) {
    const r = await query(
      `SELECT p.* FROM blocks b JOIN profiles p ON p.user_id = b.blocked_id WHERE b.blocker_id = $1`,
      [userId]
    );
    return r.rows.map((row) => publicProfile(row));
  },

  async isMember(conversationId, userId) {
    const r = await query(
      `SELECT 1 FROM conversation_members
       WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [conversationId, userId]
    );
    return r.rowCount > 0;
  },

  async getMemberIds(conversationId) {
    const r = await query(
      `SELECT user_id FROM conversation_members
       WHERE conversation_id = $1 AND left_at IS NULL`,
      [conversationId]
    );
    return r.rows.map((x) => x.user_id);
  },

  async listConversations(userId) {
    const r = await query(
      `SELECT c.*, cm.role
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id
       WHERE cm.user_id = $1 AND cm.left_at IS NULL
       ORDER BY c.updated_at DESC`,
      [userId]
    );
    const result = [];
    for (const conv of r.rows) {
      const members = await query(
        `SELECT user_id FROM conversation_members
         WHERE conversation_id = $1 AND left_at IS NULL`,
        [conv.id]
      );
      let name = conv.title;
      let avatarUrl = conv.avatar_url;
      let peerUserId = null;
      if (conv.type === 'direct') {
        const other = members.rows.find((m) => m.user_id !== userId);
        if (other) {
          peerUserId = other.user_id;
          const p = await query(`SELECT * FROM profiles WHERE user_id = $1`, [peerUserId]);
          if (p.rowCount) {
            name = p.rows[0].display_name || p.rows[0].username;
            avatarUrl = p.rows[0].avatar_url;
          }
        }
      }
      const last = await query(
        `SELECT created_at, protocol_version FROM messages
         WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [conv.id]
      );
      const lastAt = last.rows[0]?.created_at || conv.updated_at;
      const lastPreview = last.rowCount ? 'Encrypted message' : null;
      const online = peerUserId ? presence.get(peerUserId)?.status === 'online' : false;
      result.push({
        id: conv.id,
        type: conv.type,
        name,
        avatarUrl,
        peerUserId,
        lastMessage: lastPreview,
        lastMessageAt: lastAt,
        unreadCount: 0,
        isOnline: online,
        isGroup: conv.type === 'group',
        memberCount: members.rowCount,
      });
    }
    return result.sort((a, b) =>
      String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || ''))
    );
  },

  async getOrCreateDirectConversation(userId, otherUserId) {
    if (userId === otherUserId) {
      return { error: { code: 'SELF_CHAT', message: 'Cannot chat with yourself' } };
    }
    if (!(await areFriends(userId, otherUserId))) {
      return { error: { code: 'NOT_FRIENDS', message: 'You must be friends to start a chat' } };
    }
    if (await isBlocked(userId, otherUserId) || await isBlocked(otherUserId, userId)) {
      return { error: { code: 'BLOCKED', message: 'Cannot start conversation' } };
    }
    const existing = await query(
      `SELECT c.id FROM conversations c
       WHERE c.type = 'direct'
         AND EXISTS (
           SELECT 1 FROM conversation_members m1
           WHERE m1.conversation_id = c.id AND m1.user_id = $1 AND m1.left_at IS NULL
         )
         AND EXISTS (
           SELECT 1 FROM conversation_members m2
           WHERE m2.conversation_id = c.id AND m2.user_id = $2 AND m2.left_at IS NULL
         )
         AND (
           SELECT count(*) FROM conversation_members m
           WHERE m.conversation_id = c.id AND m.left_at IS NULL
         ) = 2
       LIMIT 1`,
      [userId, otherUserId]
    );
    if (existing.rowCount) {
      return { data: { id: existing.rows[0].id, existing: true, peerUserId: otherUserId } };
    }
    const ins = await query(
      `INSERT INTO conversations (type, created_by) VALUES ('direct', $1) RETURNING id`,
      [userId]
    );
    const id = ins.rows[0].id;
    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, role) VALUES
       ($1, $2, 'member'), ($1, $3, 'member')`,
      [id, userId, otherUserId]
    );
    return { data: { id, existing: false, peerUserId: otherUserId } };
  },

  async getMessages(conversationId, userId, limit = 50, before = null) {
    if (!(await this.isMember(conversationId, userId))) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } };
    }
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
    let r;
    if (before) {
      r = await query(
        `SELECT * FROM messages
         WHERE conversation_id = $1
           AND created_at < (SELECT created_at FROM messages WHERE id = $2)
         ORDER BY created_at DESC
         LIMIT $3`,
        [conversationId, before, lim]
      );
    } else {
      r = await query(
        `SELECT * FROM messages WHERE conversation_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [conversationId, lim]
      );
    }
    const rows = r.rows.reverse();
    const hasMore = r.rows.length === lim;
    return {
      data: rows.map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_user_id,
        senderDeviceId: m.sender_device_id,
        clientMessageId: m.client_message_id,
        ciphertext: Buffer.from(m.ciphertext).toString('utf8'),
        protocolVersion: m.protocol_version,
        messageType: m.message_type,
        createdAt: m.created_at,
        status: 'sent',
        deliveredTo: [],
        readBy: [],
      })),
      hasMore,
    };
  },

  async sendMessage(conversationId, userId, payload) {
    if (!(await this.isMember(conversationId, userId))) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } };
    }
    const {
      ciphertext,
      protocolVersion = 'bambi-e2ee-v1',
      clientMessageId,
      senderDeviceId = 1,
      messageType = 'text',
    } = payload || {};
    if (!clientMessageId) {
      return { error: { code: 'VALIDATION', message: 'clientMessageId is required' } };
    }
    if (!ciphertext || typeof ciphertext !== 'string') {
      return {
        error: {
          code: 'ENCRYPTION_REQUIRED',
          message: 'ciphertext is required — plaintext messages are not accepted',
        },
      };
    }
    if (protocolVersion.startsWith('bambi-e2ee') && payload.body) {
      return {
        error: {
          code: 'PLAINTEXT_FORBIDDEN',
          message: 'Do not send plaintext body with E2EE protocol version',
        },
      };
    }
    const dup = await query(
      `SELECT * FROM messages
       WHERE conversation_id = $1 AND sender_user_id = $2 AND client_message_id = $3`,
      [conversationId, userId, clientMessageId]
    );
    if (dup.rowCount) {
      const m = dup.rows[0];
      return {
        data: {
          id: m.id,
          conversationId: m.conversation_id,
          senderId: m.sender_user_id,
          clientMessageId: m.client_message_id,
          ciphertext: Buffer.from(m.ciphertext).toString('utf8'),
          protocolVersion: m.protocol_version,
          messageType: m.message_type,
          createdAt: m.created_at,
          status: 'sent',
        },
      };
    }
    const ins = await query(
      `INSERT INTO messages (
         conversation_id, sender_user_id, sender_device_id, client_message_id,
         ciphertext, protocol_version, message_type
       ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        conversationId,
        userId,
        senderDeviceId,
        clientMessageId,
        Buffer.from(ciphertext, 'utf8'),
        protocolVersion,
        messageType,
      ]
    );
    await query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [
      conversationId,
    ]);
    const m = ins.rows[0];
    return {
      data: {
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_user_id,
        senderDeviceId: m.sender_device_id,
        clientMessageId: m.client_message_id,
        ciphertext: Buffer.from(m.ciphertext).toString('utf8'),
        protocolVersion: m.protocol_version,
        messageType: m.message_type,
        createdAt: m.created_at,
        status: 'sent',
        deliveredTo: [],
        readBy: [],
      },
    };
  },

  async markDelivered(conversationId, messageId, userId) {
    if (!(await this.isMember(conversationId, userId))) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member' } };
    }
    const r = await query(`SELECT * FROM messages WHERE id = $1 AND conversation_id = $2`, [
      messageId,
      conversationId,
    ]);
    if (!r.rowCount) return { error: { code: 'NOT_FOUND', message: 'Message not found' } };
    const msg = r.rows[0];
    if (msg.sender_user_id !== userId) {
      await query(
        `INSERT INTO message_receipts (message_id, user_id, status)
         VALUES ($1, $2, 'delivered') ON CONFLICT DO NOTHING`,
        [messageId, userId]
      );
    }
    return {
      data: {
        id: msg.id,
        senderId: msg.sender_user_id,
        status: 'delivered',
      },
    };
  },

  async markRead(conversationId, messageIds, userId) {
    if (!(await this.isMember(conversationId, userId))) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member' } };
    }
    const updated = [];
    for (const id of messageIds || []) {
      const r = await query(`SELECT * FROM messages WHERE id = $1 AND conversation_id = $2`, [
        id,
        conversationId,
      ]);
      if (!r.rowCount || r.rows[0].sender_user_id === userId) continue;
      await query(
        `INSERT INTO message_receipts (message_id, user_id, status)
         VALUES ($1, $2, 'delivered') ON CONFLICT DO NOTHING`,
        [id, userId]
      );
      await query(
        `INSERT INTO message_receipts (message_id, user_id, status)
         VALUES ($1, $2, 'read') ON CONFLICT DO NOTHING`,
        [id, userId]
      );
      updated.push({ id, senderId: r.rows[0].sender_user_id, status: 'read' });
    }
    return { data: updated };
  },

  async createGroup(creatorId, { title, memberIds = [] }) {
    const name = String(title || '').trim().slice(0, 80);
    if (!name) return { error: { code: 'VALIDATION', message: 'Group name is required' } };
    const unique = [...new Set(memberIds.filter((id) => id && id !== creatorId))];
    const ins = await query(
      `INSERT INTO conversations (type, title, created_by) VALUES ('group', $1, $2) RETURNING *`,
      [name, creatorId]
    );
    const id = ins.rows[0].id;
    await query(
      `INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [id, creatorId]
    );
    for (const mid of unique) {
      await query(
        `INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, 'member')
         ON CONFLICT DO NOTHING`,
        [id, mid]
      );
    }
    const members = await query(
      `SELECT cm.*, p.username, p.display_name, p.avatar_url
       FROM conversation_members cm JOIN profiles p ON p.user_id = cm.user_id
       WHERE cm.conversation_id = $1 AND cm.left_at IS NULL`,
      [id]
    );
    return {
      data: {
        id,
        type: 'group',
        title: name,
        memberCount: members.rowCount,
        members: members.rows.map((m) => ({
          userId: m.user_id,
          role: m.role,
          profile: publicProfile({
            user_id: m.user_id,
            username: m.username,
            display_name: m.display_name,
            avatar_url: m.avatar_url,
          }),
        })),
      },
    };
  },

  async getGroupDetails(conversationId, userId) {
    if (!(await this.isMember(conversationId, userId))) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member' } };
    }
    const c = await query(`SELECT * FROM conversations WHERE id = $1 AND type = 'group'`, [
      conversationId,
    ]);
    if (!c.rowCount) return { error: { code: 'NOT_FOUND', message: 'Group not found' } };
    const members = await query(
      `SELECT cm.*, p.username, p.display_name, p.avatar_url
       FROM conversation_members cm JOIN profiles p ON p.user_id = cm.user_id
       WHERE cm.conversation_id = $1 AND cm.left_at IS NULL`,
      [conversationId]
    );
    const conv = c.rows[0];
    return {
      data: {
        id: conv.id,
        title: conv.title,
        avatarUrl: conv.avatar_url,
        createdBy: conv.created_by,
        createdAt: conv.created_at,
        members: members.rows.map((m) => ({
          userId: m.user_id,
          role: m.role,
          joinedAt: m.joined_at,
          profile: publicProfile({
            user_id: m.user_id,
            username: m.username,
            display_name: m.display_name,
            avatar_url: m.avatar_url,
          }),
        })),
      },
    };
  },

  async getMemberRole(conversationId, userId) {
    const r = await query(
      `SELECT role FROM conversation_members
       WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [conversationId, userId]
    );
    return r.rows[0]?.role || null;
  },

  async updateGroup(conversationId, userId, { title, avatarUrl }) {
    const role = await this.getMemberRole(conversationId, userId);
    if (role !== 'owner' && role !== 'admin') {
      return { error: { code: 'FORBIDDEN', message: 'Only admins can update group info' } };
    }
    if (title !== undefined) {
      const name = String(title).trim().slice(0, 80);
      if (!name) return { error: { code: 'VALIDATION', message: 'Invalid name' } };
      await query(
        `UPDATE conversations SET title = $1, updated_at = now() WHERE id = $2`,
        [name, conversationId]
      );
    }
    if (avatarUrl !== undefined) {
      await query(
        `UPDATE conversations SET avatar_url = $1, updated_at = now() WHERE id = $2`,
        [avatarUrl, conversationId]
      );
    }
    const c = await query(`SELECT * FROM conversations WHERE id = $1`, [conversationId]);
    return {
      data: {
        id: c.rows[0].id,
        title: c.rows[0].title,
        avatarUrl: c.rows[0].avatar_url,
      },
    };
  },

  async addGroupMembers(conversationId, actorId, memberIds = []) {
    const role = await this.getMemberRole(conversationId, actorId);
    if (role !== 'owner' && role !== 'admin') {
      return { error: { code: 'FORBIDDEN', message: 'Only admins can add members' } };
    }
    const added = [];
    for (const mid of memberIds) {
      await query(
        `INSERT INTO conversation_members (conversation_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL, role = 'member'`,
        [conversationId, mid]
      );
      added.push(mid);
    }
    const details = await this.getGroupDetails(conversationId, actorId);
    return { data: { added, members: details.data?.members || [] } };
  },

  async removeGroupMember(conversationId, actorId, targetId) {
    const isSelf = actorId === targetId;
    if (!isSelf) {
      const role = await this.getMemberRole(conversationId, actorId);
      if (role !== 'owner' && role !== 'admin') {
        return { error: { code: 'FORBIDDEN', message: 'Only admins can remove members' } };
      }
    }
    await query(
      `UPDATE conversation_members SET left_at = now()
       WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [conversationId, targetId]
    );
    return { data: { removed: targetId, left: isSelf } };
  },

  async setMemberRole(conversationId, actorId, targetId, newRole) {
    if (!['admin', 'member'].includes(newRole)) {
      return { error: { code: 'VALIDATION', message: 'Invalid role' } };
    }
    if ((await this.getMemberRole(conversationId, actorId)) !== 'owner') {
      return { error: { code: 'FORBIDDEN', message: 'Only owner can change roles' } };
    }
    await query(
      `UPDATE conversation_members SET role = $1
       WHERE conversation_id = $2 AND user_id = $3 AND left_at IS NULL AND role <> 'owner'`,
      [newRole, conversationId, targetId]
    );
    return { data: { userId: targetId, role: newRole } };
  },

  async createAttachment({ conversationId, uploaderUserId, storageKey, sizeBytes, contentType }) {
    if (!(await this.isMember(conversationId, uploaderUserId))) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } };
    }
    const ins = await query(
      `INSERT INTO attachments (conversation_id, uploader_user_id, storage_key, size_bytes, content_type)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [conversationId, uploaderUserId, storageKey, sizeBytes, contentType || 'application/octet-stream']
    );
    const a = ins.rows[0];
    return {
      data: {
        id: a.id,
        conversationId: a.conversation_id,
        uploaderUserId: a.uploader_user_id,
        storageKey: a.storage_key,
        sizeBytes: Number(a.size_bytes),
        contentType: a.content_type,
        createdAt: a.created_at,
      },
    };
  },

  async getAttachment(attachmentId, userId) {
    const r = await query(`SELECT * FROM attachments WHERE id = $1`, [attachmentId]);
    if (!r.rowCount) return { error: { code: 'NOT_FOUND', message: 'Attachment not found' } };
    const a = r.rows[0];
    if (!(await this.isMember(a.conversation_id, userId))) {
      return { error: { code: 'FORBIDDEN', message: 'Not authorized to access this attachment' } };
    }
    return {
      data: {
        id: a.id,
        conversationId: a.conversation_id,
        uploaderUserId: a.uploader_user_id,
        storageKey: a.storage_key,
        sizeBytes: Number(a.size_bytes),
        contentType: a.content_type,
        createdAt: a.created_at,
      },
    };
  },

  async addReaction(messageId, conversationId, userId, emoji) {
    if (!(await this.isMember(conversationId, userId))) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member' } };
    }
    const e = String(emoji || '').slice(0, 16);
    if (!e) return { error: { code: 'VALIDATION', message: 'emoji required' } };
    await query(
      `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`,
      [messageId, userId, e]
    );
    const list = await query(
      `SELECT user_id, emoji, created_at FROM message_reactions WHERE message_id = $1`,
      [messageId]
    );
    return {
      data: list.rows.map((x) => ({
        userId: x.user_id,
        emoji: x.emoji,
        createdAt: x.created_at,
      })),
    };
  },

  async removeReaction(messageId, userId, emoji) {
    await query(
      `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji]
    );
    const list = await query(
      `SELECT user_id, emoji, created_at FROM message_reactions WHERE message_id = $1`,
      [messageId]
    );
    return {
      data: list.rows.map((x) => ({
        userId: x.user_id,
        emoji: x.emoji,
        createdAt: x.created_at,
      })),
    };
  },

  async setConversationUserState(conversationId, userId, patch) {
    if (!(await this.isMember(conversationId, userId))) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member' } };
    }
    await query(
      `INSERT INTO conversation_user_state (conversation_id, user_id, muted_until, archived_at, pinned_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET
         muted_until = COALESCE($3, conversation_user_state.muted_until),
         archived_at = COALESCE($4, conversation_user_state.archived_at),
         pinned_at = COALESCE($5, conversation_user_state.pinned_at)`,
      [
        conversationId,
        userId,
        patch.mutedUntil ?? null,
        patch.archivedAt ?? null,
        patch.pinnedAt ?? null,
      ]
    );
    return { data: patch };
  },

  setPresence(userId, status) {
    const prev = presence.get(userId);
    const at = now();
    const lastSeen =
      status === 'offline' ? at : prev?.lastSeen || prev?.at || null;
    presence.set(userId, {
      status,
      at,
      lastSeen: status === 'offline' ? at : lastSeen,
    });
    return presence.get(userId);
  },

  getPresence(userId) {
    return presence.get(userId) || { status: 'offline', at: null, lastSeen: null };
  },

  async getPresenceForViewer(targetUserId, viewerUserId) {
    const p = this.getPresence(targetUserId);
    let prefs = { lastSeen: 'everyone', onlineStatus: 'everyone' };
    try {
      const r = await query(
        `SELECT last_seen_privacy, online_privacy FROM user_privacy WHERE user_id = $1`,
        [targetUserId]
      );
      if (r.rowCount) {
        prefs.lastSeen = r.rows[0].last_seen_privacy || 'everyone';
        prefs.onlineStatus = r.rows[0].online_privacy || 'everyone';
      }
    } catch {
      /* table may not exist yet */
    }
    let friends = false;
    try {
      const fl = await this.listFriends(viewerUserId);
      friends = fl.some((f) => f.id === targetUserId);
    } catch {
      /* ignore */
    }
    const allowOnline =
      prefs.onlineStatus === 'nobody' ? false : prefs.onlineStatus === 'contacts' ? friends : true;
    const allowLastSeen =
      prefs.lastSeen === 'nobody' ? false : prefs.lastSeen === 'contacts' ? friends : true;
    return {
      status: allowOnline ? p.status : 'offline',
      lastSeen: allowLastSeen && p.status !== 'online' ? p.lastSeen || p.at : null,
      onlineVisible: allowOnline,
    };
  },

  async getPrivacy(userId) {
    try {
      const r = await query(`SELECT * FROM user_privacy WHERE user_id = $1`, [userId]);
      if (r.rowCount) {
        const row = r.rows[0];
        return {
          lastSeen: row.last_seen_privacy || 'everyone',
          onlineStatus: row.online_privacy || 'everyone',
          profilePhoto: row.profile_photo_privacy || 'everyone',
          readReceipts: row.read_receipts !== false,
        };
      }
    } catch {
      /* table may not exist */
    }
    return {
      lastSeen: 'everyone',
      onlineStatus: 'everyone',
      profilePhoto: 'everyone',
      readReceipts: true,
    };
  },

  async setPrivacy(userId, patch) {
    const cur = await this.getPrivacy(userId);
    const next = { ...cur, ...patch };
    try {
      await query(
        `INSERT INTO user_privacy (user_id, last_seen_privacy, online_privacy, profile_photo_privacy, read_receipts)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           last_seen_privacy = EXCLUDED.last_seen_privacy,
           online_privacy = EXCLUDED.online_privacy,
           profile_photo_privacy = EXCLUDED.profile_photo_privacy,
           read_receipts = EXCLUDED.read_receipts`,
        [
          userId,
          next.lastSeen,
          next.onlineStatus,
          next.profilePhoto,
          next.readReceipts !== false,
        ]
      );
    } catch {
      /* table may not exist */
    }
    return { data: next };
  },

  async isBlocked(blockerId, blockedId) {
    return isBlocked(blockerId, blockedId);
  },

  async canCall(callerId, calleeId) {
    if (callerId === calleeId) return false;
    try {
      const friends = await this.listFriends(callerId);
      if (!friends.some((f) => f.id === calleeId)) return false;
      if ((await isBlocked(callerId, calleeId)) || (await isBlocked(calleeId, callerId))) return false;
      return true;
    } catch {
      return false;
    }
  },


  async insertCallLogMessage(conversationId, {
    callerId,
    calleeId,
    kind = 'audio',
    status = 'ended',
    durationMs = 0,
    callId = null,
  }) {
    if (!conversationId) {
      return { error: { code: 'NOT_FOUND', message: 'Conversation not found' } };
    }
    const id = randomUUID();
    const clientMessageId = `call-${callId || id}`;
    const payload = JSON.stringify({
      type: 'call',
      callId,
      callerId,
      calleeId,
      kind,
      status,
      durationMs: durationMs || 0,
    });
    try {
      const ins = await query(
        `INSERT INTO messages (
           id, conversation_id, sender_user_id, sender_device_id, client_message_id,
           ciphertext, protocol_version, message_type
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          id,
          conversationId,
          callerId,
          0,
          clientMessageId,
          Buffer.from(payload, 'utf8'),
          'bambi-system-v1',
          'call',
        ]
      );
      const m = ins.rows[0];
      return {
        data: {
          id: m.id,
          conversationId: m.conversation_id,
          senderId: m.sender_user_id,
          senderDeviceId: m.sender_device_id,
          clientMessageId: m.client_message_id,
          ciphertext: payload,
          protocolVersion: m.protocol_version,
          messageType: 'call',
          createdAt: m.created_at,
          status: 'sent',
          call: {
            callId,
            callerId,
            calleeId,
            kind,
            status,
            durationMs: durationMs || 0,
          },
        },
      };
    } catch (e) {
      return { error: { code: 'DB_ERROR', message: e.message || 'Could not save call log' } };
    }
  },

  async saveCallRecord(record) {
    try {
      await query(
        `INSERT INTO call_records (id, caller_id, callee_id, conversation_id, kind, status, started_at, ended_at, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, ended_at = EXCLUDED.ended_at, duration_ms = EXCLUDED.duration_ms`,
        [
          record.id || randomUUID(),
          record.callerId,
          record.calleeId,
          record.conversationId || null,
          record.kind || 'audio',
          record.status || 'ended',
          record.startedAt || now(),
          record.endedAt || now(),
          record.durationMs || 0,
        ]
      );
    } catch {
      /* table may not exist yet */
    }
    return { data: record };
  },

  async listCallHistory(userId, limit = 50) {
    try {
      const r = await query(
        `SELECT c.*,
                CASE WHEN c.caller_id = $1 THEN c.callee_id ELSE c.caller_id END AS peer_id,
                p.username, p.display_name, p.avatar_url
         FROM call_records c
         LEFT JOIN profiles p ON p.user_id = CASE WHEN c.caller_id = $1 THEN c.callee_id ELSE c.caller_id END
         WHERE c.caller_id = $1 OR c.callee_id = $1
         ORDER BY c.started_at DESC
         LIMIT $2`,
        [userId, limit]
      );
      return r.rows.map((row) => ({
        id: row.id,
        callerId: row.caller_id,
        calleeId: row.callee_id,
        conversationId: row.conversation_id,
        kind: row.kind,
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        durationMs: row.duration_ms,
        direction: row.caller_id === userId ? 'outgoing' : 'incoming',
        peer: {
          id: row.peer_id,
          username: row.username,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
        },
      }));
    } catch {
      return [];
    }
  },
};
