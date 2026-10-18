/**
 * Call signalling relay for Socket.IO — drop into your existing server.
 *
 * Usage (after your auth middleware sets socket.data.userId):
 *
 *   import { registerCallHandlers } from './calls.socket.js';
 *   io.on('connection', (socket) => {
 *     registerCallHandlers(io, socket, {
 *       // Return true only if `callerId` may call `calleeId`
 *       // (e.g. they are friends and neither has blocked the other).
 *       canCall: async (callerId, calleeId) => true,
 *       // Optional: public profile shown on the incoming-call screen.
 *       getProfile: async (userId) => ({ displayName, username, avatarUrl }),
 *     });
 *   });
 *
 * The relay never sees media. It only forwards small JSON signals between two users,
 * and it only forwards signals for calls it has seen being started.
 * ADAPT: `socket.data.userId` is an assumption — change it to however your server
 * stores the authenticated user id.
 */
const ACTIVE = new Map(); // callId -> { a, b, startedAt }
const BUSY = new Map(); // userId -> callId
const ALLOWED_KINDS = new Set(['audio', 'video']);
const SIGNAL_TYPES = new Set(['offer', 'answer', 'candidate']);
const MAX_SIGNAL_BYTES = 64 * 1024;

const room = (userId) => `user:${userId}`;

function release(callId) {
  const c = ACTIVE.get(callId);
  if (!c) return null;
  ACTIVE.delete(callId);
  if (BUSY.get(c.a) === callId) BUSY.delete(c.a);
  if (BUSY.get(c.b) === callId) BUSY.delete(c.b);
  return c;
}

export function registerCallHandlers(io, socket, { canCall, getProfile } = {}) {
  const me = socket.data.userId;
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
      if (canCall && !(await canCall(me, toUserId))) {
        return reply({ error: { code: 'FORBIDDEN', message: 'You cannot call this person.' } });
      }
      if (BUSY.has(me)) {
        return reply({ error: { code: 'BUSY', message: 'You are already on a call.' } });
      }
      if (BUSY.has(toUserId)) {
        return reply({ error: { code: 'BUSY', message: 'They are on another call.' } });
      }
      const sockets = await io.in(room(toUserId)).fetchSockets();
      if (sockets.length === 0) {
        return reply({ error: { code: 'USER_OFFLINE', message: 'They are offline right now.' } });
      }
      ACTIVE.set(callId, { a: me, b: toUserId, startedAt: Date.now() });
      BUSY.set(me, callId);
      BUSY.set(toUserId, callId);
      const peer = getProfile ? await getProfile(me) : undefined;
      io.to(room(toUserId)).emit('call:incoming', { callId, fromUserId: me, conversationId, kind, peer });
      reply({ data: { ok: true } });
    } catch {
      reply({ error: { code: 'SERVER_ERROR', message: 'Could not place the call.' } });
    }
  });

  socket.on('call:accept', (p) => {
    if (!involved(p?.callId, p?.toUserId)) return;
    io.to(room(p.toUserId)).emit('call:accepted', { callId: p.callId, fromUserId: me });
  });

  socket.on('call:signal', (p) => {
    if (!involved(p?.callId, p?.toUserId)) return;
    if (!SIGNAL_TYPES.has(p.data?.type)) return;
    if (JSON.stringify(p.data).length > MAX_SIGNAL_BYTES) return;
    io.to(room(p.toUserId)).emit('call:signal', { callId: p.callId, fromUserId: me, data: p.data });
  });

  socket.on('call:reject', (p) => {
    if (!involved(p?.callId, p?.toUserId)) return;
    release(p.callId);
    io.to(room(p.toUserId)).emit('call:rejected', {
      callId: p.callId,
      fromUserId: me,
      reason: p.reason === 'busy' ? 'busy' : 'declined',
    });
  });

  socket.on('call:end', (p) => {
    if (!involved(p?.callId, p?.toUserId)) return;
    release(p.callId);
    io.to(room(p.toUserId)).emit('call:ended', { callId: p.callId, fromUserId: me });
  });

  socket.on('disconnect', async () => {
    // End the call only when this was the user's last connected tab/device.
    const remaining = await io.in(room(me)).fetchSockets();
    if (remaining.length > 0) return;
    const callId = BUSY.get(me);
    const c = callId && release(callId);
    if (c) {
      const other = c.a === me ? c.b : c.a;
      io.to(room(other)).emit('call:ended', { callId, fromUserId: me });
    }
  });
}
