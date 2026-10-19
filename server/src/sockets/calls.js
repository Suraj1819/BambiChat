/**
 * Call signalling relay — authenticated Socket.IO handlers.
 * Media is peer-to-peer (WebRTC); this module only forwards signalling JSON.
 * Uses socket.userId set by the existing auth middleware in index.js.
 */

import { randomUUID } from 'crypto';
import { store } from '../store/index.js';

const ACTIVE = new Map(); // callId -> { a, b, kind, conversationId, startedAt, status }
const BUSY = new Map(); // userId -> callId
const ALLOWED_KINDS = new Set(['audio', 'video']);
const SIGNAL_TYPES = new Set(['offer', 'answer', 'candidate']);
const MAX_SIGNAL_BYTES = 64 * 1024;
const RING_TIMEOUT_MS = 45_000;

const room = (userId) => `user:${userId}`;

function release(callId, finalStatus = 'ended') {
  const c = ACTIVE.get(callId);
  if (!c) return null;
  ACTIVE.delete(callId);
  if (BUSY.get(c.a) === callId) BUSY.delete(c.a);
  if (BUSY.get(c.b) === callId) BUSY.delete(c.b);
  c.status = finalStatus;
  c.endedAt = Date.now();
  return c;
}

async function persistCallRecord(io, c, status) {
  if (!c) return null;
  const durationMs =
    c.connectedAt && c.endedAt
      ? Math.max(0, c.endedAt - c.connectedAt)
      : 0;
  try {
    if (typeof store.saveCallRecord === 'function') {
      await store.saveCallRecord({
        id: c.id || c.callId,
        callerId: c.a,
        calleeId: c.b,
        conversationId: c.conversationId || null,
        kind: c.kind,
        status,
        startedAt: c.startedAt ? new Date(c.startedAt).toISOString() : new Date().toISOString(),
        endedAt: c.endedAt ? new Date(c.endedAt).toISOString() : new Date().toISOString(),
        durationMs,
      });
    }
  } catch {
    /* non-fatal */
  }

  // Insert a visible call-log row in the chat timeline
  if (c.conversationId && typeof store.insertCallLogMessage === 'function') {
    try {
      const result = await store.insertCallLogMessage(c.conversationId, {
        callerId: c.a,
        calleeId: c.b,
        kind: c.kind || 'audio',
        status,
        durationMs,
        callId: c.id || c.callId,
      });
      const msg = result?.data;
      if (msg && io) {
        io.to(`conv:${c.conversationId}`).emit('message:new', { message: msg });
        for (const uid of [c.a, c.b]) {
          io.to(`user:${uid}`).emit('message:new', { message: msg });
          io.to(`user:${uid}`).emit('message:notify', {
            conversationId: c.conversationId,
            messageId: msg.id,
            senderId: c.a,
            createdAt: msg.createdAt,
            kind: 'call',
          });
        }
      }
      return msg;
    } catch {
      /* non-fatal */
    }
  }
  return null;
}

export function registerCallHandlers(io, socket) {
  const me = socket.userId;
  if (!me) return;

  socket.join(room(me));

  const involved = (callId, toUserId) => {
    const c = ACTIVE.get(callId);
    if (!c || (c.a !== me && c.b !== me)) return null;
    const other = c.a === me ? c.b : c.a;
    return other === toUserId ? c : null;
  };

  socket.on('call:invite', async (p, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      const { callId, toUserId, conversationId, kind } = p || {};
      if (typeof callId !== 'string' || callId.length > 80 || typeof toUserId !== 'string') {
        return reply({ error: { code: 'BAD_REQUEST', message: 'Invalid call request.' } });
      }
      if (!ALLOWED_KINDS.has(kind) || toUserId === me) {
        return reply({ error: { code: 'BAD_REQUEST', message: 'Invalid call request.' } });
      }

      // Authorization: must be friends and neither blocked
      const canCall = await store.canCall?.(me, toUserId);
      if (canCall === false) {
        return reply({ error: { code: 'FORBIDDEN', message: 'You cannot call this person.' } });
      }
      // Fallback if canCall not implemented: require friendship
      if (canCall === undefined) {
        const friends = await store.listFriends(me);
        const isFriend = friends.some((f) => f.id === toUserId);
        if (!isFriend) {
          return reply({ error: { code: 'FORBIDDEN', message: 'You can only call friends.' } });
        }
        if (typeof store.isBlocked === 'function') {
          const blocked =
            (await store.isBlocked(me, toUserId)) || (await store.isBlocked(toUserId, me));
          if (blocked) {
            return reply({ error: { code: 'FORBIDDEN', message: 'You cannot call this person.' } });
          }
        }
      }

      if (BUSY.has(me)) {
        return reply({ error: { code: 'BUSY', message: 'You are already on a call.' } });
      }
      if (BUSY.has(toUserId)) {
        return reply({ error: { code: 'BUSY', message: 'They are on another call.' } });
      }

      const sockets = await io.in(room(toUserId)).fetchSockets();
      if (sockets.length === 0) {
        // Persist as missed so callee sees it later
        await persistCallRecord(io, 
          {
            id: callId,
            a: me,
            b: toUserId,
            kind,
            conversationId,
            startedAt: Date.now(),
            endedAt: Date.now(),
          },
          'missed'
        );
        return reply({ error: { code: 'USER_OFFLINE', message: 'They are offline right now.' } });
      }

      const record = {
        id: callId,
        a: me,
        b: toUserId,
        kind,
        conversationId: conversationId || null,
        startedAt: Date.now(),
        status: 'ringing',
      };
      ACTIVE.set(callId, record);
      BUSY.set(me, callId);
      BUSY.set(toUserId, callId);

      // Auto-miss after ring timeout
      record.ringTimer = setTimeout(async () => {
        const still = ACTIVE.get(callId);
        if (!still || still.status !== 'ringing') return;
        const released = release(callId, 'missed');
        if (released) {
          await persistCallRecord(io, released, 'missed');
          io.to(room(released.a)).emit('call:missed', {
            callId,
            fromUserId: released.b,
            reason: 'unanswered',
          });
          io.to(room(released.b)).emit('call:missed', {
            callId,
            fromUserId: released.a,
            reason: 'unanswered',
          });
        }
      }, RING_TIMEOUT_MS);

      let peer = null;
      try {
        const profile = await Promise.resolve(store.getProfile(me));
        if (profile) {
          peer = {
            id: me,
            displayName: profile.displayName || profile.username,
            username: profile.username,
            avatarUrl: profile.avatarUrl || null,
          };
        }
      } catch {
        /* ignore */
      }

      io.to(room(toUserId)).emit('call:incoming', {
        callId,
        fromUserId: me,
        conversationId: conversationId || null,
        kind,
        peer,
      });
      reply({ data: { ok: true, callId } });
    } catch (e) {
      reply({ error: { code: 'SERVER_ERROR', message: 'Could not place the call.' } });
    }
  });

  socket.on('call:accept', (p) => {
    const c = involved(p?.callId, p?.toUserId);
    if (!c) return;
    if (c.ringTimer) {
      clearTimeout(c.ringTimer);
      c.ringTimer = null;
    }
    c.status = 'connecting';
    c.connectedAt = Date.now();
    io.to(room(p.toUserId)).emit('call:accepted', { callId: p.callId, fromUserId: me });
  });

  socket.on('call:signal', (p) => {
    if (!involved(p?.callId, p?.toUserId)) return;
    if (!SIGNAL_TYPES.has(p.data?.type)) return;
    try {
      if (JSON.stringify(p.data).length > MAX_SIGNAL_BYTES) return;
    } catch {
      return;
    }
    io.to(room(p.toUserId)).emit('call:signal', {
      callId: p.callId,
      fromUserId: me,
      data: p.data,
    });
  });

  socket.on('call:reject', async (p) => {
    const c = involved(p?.callId, p?.toUserId);
    if (!c) return;
    if (c.ringTimer) clearTimeout(c.ringTimer);
    const reason = p.reason === 'busy' ? 'busy' : 'declined';
    const released = release(p.callId, reason);
    if (released) await persistCallRecord(io, released, reason);
    io.to(room(p.toUserId)).emit('call:rejected', {
      callId: p.callId,
      fromUserId: me,
      reason,
    });
  });

  socket.on('call:end', async (p) => {
    const c = involved(p?.callId, p?.toUserId);
    if (!c) return;
    if (c.ringTimer) clearTimeout(c.ringTimer);
    const status = c.status === 'ringing' ? 'cancelled' : 'ended';
    const released = release(p.callId, status);
    if (released) await persistCallRecord(io, released, status);
    io.to(room(p.toUserId)).emit('call:ended', { callId: p.callId, fromUserId: me });
  });

  socket.on('call:history', async (_p, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      if (typeof store.listCallHistory === 'function') {
        const rows = await store.listCallHistory(me, 50);
        return reply({ data: rows });
      }
      reply({ data: [] });
    } catch {
      reply({ error: { code: 'SERVER_ERROR', message: 'Could not load call history.' } });
    }
  });

  // When this socket disconnects: end call only if user has no other sessions
  socket.on('disconnect', async () => {
    try {
      const remaining = await io.in(room(me)).fetchSockets();
      if (remaining.length > 0) return;
      const callId = BUSY.get(me);
      if (!callId) return;
      const c = ACTIVE.get(callId);
      if (c?.ringTimer) clearTimeout(c.ringTimer);
      const released = release(callId, 'ended');
      if (released) {
        await persistCallRecord(io, released, 'ended');
        const other = released.a === me ? released.b : released.a;
        io.to(room(other)).emit('call:ended', { callId, fromUserId: me });
      }
    } catch {
      /* ignore */
    }
  });
}

export function isUserBusy(userId) {
  return BUSY.has(userId);
}
