/**
 * Socket.IO real-time layer — authenticated, Postgres-aware.
 */

import { store } from '../store/index.js';

const userSockets = new Map();

function addUserSocket(userId, socketId) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socketId);
}

function removeUserSocket(userId, socketId) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) userSockets.delete(userId);
}

function isUserOnline(userId) {
  return (userSockets.get(userId)?.size || 0) > 0;
}

export function emitToUser(io, userId, event, payload) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  for (const sid of sockets) io.to(sid).emit(event, payload);
}

async function resolveToken(token) {
  if (!token) return null;
  if (typeof store.resolveSessionAsync === 'function') {
    return store.resolveSessionAsync(token);
  }
  const s = store.resolveSession(token);
  if (!s) return null;
  const profile = await Promise.resolve(store.getProfile(s.userId));
  if (!profile) return null;
  return { userId: s.userId, profile };
}

export function setupSockets(io) {
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token || socket.handshake.query?.token || null;
      const session = await resolveToken(token);
      if (!session) return next(new Error('UNAUTHORIZED'));
      socket.userId = session.userId;
      socket.username = session.profile?.username || session.userId;
      next();
    } catch (e) {
      next(e);
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    addUserSocket(userId, socket.id);
    store.setPresence(userId, 'online');

    (async () => {
      try {
        const friends = await store.listFriends(userId);
        for (const f of friends) {
          emitToUser(io, f.id, 'presence:update', { userId, status: 'online' });
        }
      } catch {
        /* ignore */
      }
    })();

    socket.emit('connection:ready', {
      userId,
      serverTime: new Date().toISOString(),
    });

    socket.on('conversation:join', async (payload, ack) => {
      const conversationId = payload?.conversationId;
      if (!conversationId || !(await store.isMember(conversationId, userId))) {
        if (typeof ack === 'function') ack({ error: { code: 'FORBIDDEN' } });
        return;
      }
      socket.join(`conv:${conversationId}`);
      if (typeof ack === 'function') ack({ data: { ok: true } });
    });

    socket.on('conversation:leave', (payload) => {
      const conversationId = payload?.conversationId;
      if (conversationId) socket.leave(`conv:${conversationId}`);
    });

    socket.on('message:send', async (payload, ack) => {
      try {
        const conversationId = payload?.conversationId;
        if (!conversationId) {
          if (typeof ack === 'function') {
            ack({ error: { code: 'VALIDATION', message: 'conversationId required' } });
          }
          return;
        }
        const result = await store.sendMessage(conversationId, userId, payload);
        if (result.error) {
          if (typeof ack === 'function') ack({ error: result.error });
          return;
        }
        const msg = result.data;
        io.to(`conv:${conversationId}`).emit('message:new', { message: msg });
        const members = await store.getMemberIds(conversationId);
        for (const mid of members) {
          if (mid === userId) continue;
          emitToUser(io, mid, 'message:notify', {
            conversationId,
            messageId: msg.id,
            senderId: userId,
            createdAt: msg.createdAt,
          });
        }
        if (typeof ack === 'function') ack({ data: msg });
      } catch (e) {
        if (typeof ack === 'function') {
          ack({ error: { code: 'SERVER', message: e.message } });
        }
      }
    });

    socket.on('message:delivered', async (payload, ack) => {
      const { conversationId, messageId } = payload || {};
      const result = await store.markDelivered(conversationId, messageId, userId);
      if (result.error) {
        if (typeof ack === 'function') ack({ error: result.error });
        return;
      }
      emitToUser(io, result.data.senderId, 'message:receipt', {
        conversationId,
        messageId: result.data.id,
        userId,
        status: 'delivered',
      });
      if (typeof ack === 'function') ack({ data: { ok: true } });
    });

    socket.on('message:read', async (payload, ack) => {
      const { conversationId, messageIds } = payload || {};
      const result = await store.markRead(conversationId, messageIds, userId);
      if (result.error) {
        if (typeof ack === 'function') ack({ error: result.error });
        return;
      }
      for (const msg of result.data) {
        emitToUser(io, msg.senderId, 'message:receipt', {
          conversationId,
          messageId: msg.id,
          userId,
          status: 'read',
        });
      }
      if (typeof ack === 'function') ack({ data: { ok: true } });
    });

    socket.on('typing:start', async (payload) => {
      const conversationId = payload?.conversationId;
      if (!conversationId || !(await store.isMember(conversationId, userId))) return;
      socket.to(`conv:${conversationId}`).emit('typing:update', {
        conversationId,
        userId,
        username: socket.username,
        typing: true,
      });
    });

    socket.on('typing:stop', async (payload) => {
      const conversationId = payload?.conversationId;
      if (!conversationId || !(await store.isMember(conversationId, userId))) return;
      socket.to(`conv:${conversationId}`).emit('typing:update', {
        conversationId,
        userId,
        username: socket.username,
        typing: false,
      });
    });

    socket.on('disconnect', async () => {
      removeUserSocket(userId, socket.id);
      if (!isUserOnline(userId)) {
        store.setPresence(userId, 'offline');
        try {
          const fl = await store.listFriends(userId);
          for (const f of fl) {
            emitToUser(io, f.id, 'presence:update', { userId, status: 'offline' });
          }
        } catch {
          /* ignore */
        }
      }
    });
  });
}
