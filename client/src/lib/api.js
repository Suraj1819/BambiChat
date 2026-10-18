/**
 * REST API client — Bearer session token.
 */

import { getToken, clearSession } from './session.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    ...options.headers,
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
  }

  // Binary download
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/octet-stream') || options.raw) {
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = await res.json();
        msg = j?.error?.message || msg;
      } catch { /* ignore */ }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return res.arrayBuffer();
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || res.statusText);
    err.code = json?.error?.code || 'REQUEST_FAILED';
    err.status = res.status;
    throw err;
  }
  return json;
}

export const api = {
  register: (username, displayName, phone) =>
    request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, displayName, phone }),
    }),

  login: (username, phone) =>
    request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, phone }),
    }),

  logout: () => request('/api/v1/auth/logout', { method: 'POST' }),

  me: () => request('/api/v1/me'),

  searchUsers: (q) =>
    request(`/api/v1/search/users?q=${encodeURIComponent(q)}`),

  listFriends: () => request('/api/v1/friends'),
  listFriendRequests: () => request('/api/v1/friends/requests'),
  sendFriendRequest: (toUserId) =>
    request('/api/v1/friends/requests', {
      method: 'POST',
      body: JSON.stringify({ toUserId }),
    }),
  acceptFriendRequest: (id) =>
    request(`/api/v1/friends/requests/${id}/accept`, { method: 'POST' }),
  rejectFriendRequest: (id) =>
    request(`/api/v1/friends/requests/${id}/reject`, { method: 'POST' }),
  cancelFriendRequest: (id) =>
    request(`/api/v1/friends/requests/${id}/cancel`, { method: 'POST' }),
  removeFriend: (userId) =>
    request(`/api/v1/friends/${userId}`, { method: 'DELETE' }),

  listBlocked: () => request('/api/v1/blocks'),
  blockUser: (userId) =>
    request('/api/v1/blocks', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  unblockUser: (userId) =>
    request(`/api/v1/blocks/${userId}`, { method: 'DELETE' }),

  listConversations: () => request('/api/v1/conversations'),
  getOrCreateDirect: (userId) =>
    request('/api/v1/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  getMessages: (conversationId) =>
    request(`/api/v1/conversations/${conversationId}/messages`),
  sendEncryptedMessage: (conversationId, payload) =>
    request(`/api/v1/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  publishIdentityKey: (payload) =>
    request('/api/v1/keys/identity', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getIdentityKey: (userId) => request(`/api/v1/keys/identity/${userId}`),

  /**
   * Upload encrypted file blob. Returns { id, sizeBytes }.
   */
  uploadAttachment: async (conversationId, ciphertextBlob, contentType, onProgress) => {
    const token = getToken();
    const form = new FormData();
    form.append('conversationId', conversationId);
    form.append('contentType', contentType || 'application/octet-stream');
    form.append('file', ciphertextBlob, 'blob.bin');

    // XHR for progress
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/v1/attachments`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress((e.loaded / e.total) * 100);
        }
      };
      xhr.onload = () => {
        let json = {};
        try {
          json = JSON.parse(xhr.responseText);
        } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(json);
        } else {
          if (xhr.status === 401) clearSession();
          reject(new Error(json?.error?.message || 'Upload failed'));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(form);
    });
  },


  createGroup: (title, memberIds = []) =>
    request('/api/v1/groups', {
      method: 'POST',
      body: JSON.stringify({ title, memberIds }),
    }),

  getGroup: (id) => request(`/api/v1/groups/${id}`),

  updateGroup: (id, payload) =>
    request(`/api/v1/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  addGroupMembers: (id, memberIds) =>
    request(`/api/v1/groups/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ memberIds }),
    }),

  removeGroupMember: (id, userId) =>
    request(`/api/v1/groups/${id}/members/${userId}`, { method: 'DELETE' }),

  setGroupMemberRole: (id, userId, role) =>
    request(`/api/v1/groups/${id}/members/${userId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  downloadAttachmentCiphertext: (attachmentId) =>
    request(`/api/v1/attachments/${attachmentId}`, { raw: true }),
};
