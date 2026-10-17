/**
 * Socket.IO client — authenticated real-time channel.
 */

import { io } from 'socket.io-client';
import { getToken } from './session.js';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

let socket = null;

export function getSocket() {
  return socket;
}

export function connectSocket() {
  const token = getToken();
  if (!token) return null;

  if (socket?.connected) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_URL || '/', {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinConversation(conversationId) {
  return new Promise((resolve) => {
    if (!socket?.connected) return resolve({ error: { code: 'OFFLINE' } });
    socket.emit('conversation:join', { conversationId }, (res) => resolve(res || {}));
  });
}

export function leaveConversation(conversationId) {
  socket?.emit('conversation:leave', { conversationId });
}

export function socketSendMessage(payload) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Not connected'));
      return;
    }
    socket.emit('message:send', payload, (res) => {
      if (res?.error) {
        const err = new Error(res.error.message || 'Send failed');
        err.code = res.error.code;
        reject(err);
      } else {
        resolve(res?.data);
      }
    });
  });
}

export function emitTyping(conversationId, typing) {
  if (!socket?.connected) return;
  socket.emit(typing ? 'typing:start' : 'typing:stop', { conversationId });
}

export function emitDelivered(conversationId, messageId) {
  socket?.emit('message:delivered', { conversationId, messageId });
}

export function emitRead(conversationId, messageIds) {
  socket?.emit('message:read', { conversationId, messageIds });
}
