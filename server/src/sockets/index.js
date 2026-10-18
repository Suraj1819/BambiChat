/**
 * Socket.IO real-time layer — authenticated, Postgres-aware.
 */

import { store } from '../store/index.js';
import { registerCallHandlers } from './calls.js';

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
    socket.join(`user:${userId}`);
    store.setPresence(userId, 'online');

    // Register WebRTC call signalling handlers (1:1 audio/video)
    registerCallHandlers(io, socket);

    (async () => {
      try {
        const friends = await store.listFriends(userId);
        // Tell friends that I am online
        for (const f of friends) {
          const presence = store.getPresenceForViewer
            ? await store.getPresenceForViewer(userId, f.id)
            : { status: 'online', lastSeen: null };
          emitToUser(io, f.id, 'presence:update', {
            userId,
            status: presence.status || 'online',
            lastSeen: presence.lastSeen || null,
          });
        }
        // Tell ME the current online/offline state of each friend
        const snapshot = {};
        for (const f of friends) {
          if (store.getPresenceForViewer) {
            snapshot[f.id] = await store.getPresenceForViewer(f.id, userId);
          } else {
            snapshot[f.id] = store.getPresence(f.id);
          }
        }
        socket.emit('presence:snapshot', { presence: snapshot });
      } catch {
        /* ignore */
      }
    })();

    socket.emit('connection:ready', {
      userId,
      serverTime: new Date().toISOString(),
    });

    // Client can request presence for specific users (authorized: friends only)
    socket.on('presence:subscribe', async (payload, ack) => {
      const ids = Array.isArray(payload?.userIds) ? payload.userIds.slice(0, 100) : [];
      const result = {};
      try {
        const friends = await store.listFriends(userId);
        const friendSet = new Set(friends.map((f) => f.id));
        for (const id of ids) {
          if (!friendSet.has(id) && id !== userId) continue;
          if (store.getPresenceForViewer) {
            result[id] = await store.getPresenceForViewer(id, userId);
          } else {
            result[id] = store.getPresence(id);
          }
        }
      } catch {
        /* ignore */
      }
      if (typeof ack === 'function') ack({ data: result });
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
        // Ensure conversationId is always present for AAD / decrypt on the client
        if (!msg.conversationId) msg.conversationId = conversationId;
        io.to(`conv:${conversationId}`).emit('message:new', { message: msg });
        const members = await store.getMemberIds(conversationId);
        for (const mid of members) {
          if (mid === userId) continue;
          // Deliver full message even if they have not joined the room yet
          emitToUser(io, mid, 'message:new', { message: msg });
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
        const p = store.setPresence(userId, 'offline');
        try {
          const fl = await store.listFriends(userId);
          for (const f of fl) {
            const visible = store.getPresenceForViewer
              ? await store.getPresenceForViewer(userId, f.id)
              : { status: 'offline', lastSeen: p?.lastSeen || p?.at };
            emitToUser(io, f.id, 'presence:update', {
              userId,
              status: visible.status || 'offline',
              lastSeen: visible.lastSeen || null,
            });
          }
        } catch {
          /* ignore */
        }
      }
    });
  });
}
