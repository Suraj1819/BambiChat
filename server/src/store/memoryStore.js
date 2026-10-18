/**
 * Application data store (in-process).
 * Swap for PostgreSQL repositories when DATABASE_URL / Supabase is configured.
 * Never stores private encryption keys.
 */

import { randomUUID } from 'crypto';
import { createHash, randomBytes } from 'crypto';

const now = () => new Date().toISOString();

/** @type {Map<string, object>} */
const profiles = new Map();
/** @type {Map<string, string>} username -> userId */
const usernameIndex = new Map();
/** @type {Map<string, string>} E.164-ish digits -> userId */
const phoneIndex = new Map();
/** @type {Map<string, object>} token -> { userId, expiresAt } */
const sessions = new Map();
/** @type {Map<string, object>} */
const friendRequests = new Map();
/** @type {Set<string>} */
const friendships = new Set();
/** @type {Map<string, Set<string>>} */
const blocks = new Map();
/** @type {Map<string, object>} */
const conversations = new Map();
/** @type {Map<string, object[]>} */
const conversationMembers = new Map();
/** @type {Map<string, object[]>} */
const messages = new Map();
/** @type {Map<string, object>} userId -> public identity key record */
const identityKeys = new Map();
/** @type {Map<string, object>} userId -> presence */
const presence = new Map();
/** @type {Map<string, object>} attachmentId -> meta */
const attachments = new Map();
/** messageId -> Array<{userId,emoji,createdAt}> */
const reactions = new Map();
/** `${convId}:${userId}` -> { mutedUntil, archivedAt } */
const convUserState = new Map();
/** call history records (newest first) */
const callRecords = [];
/** userId -> privacy preferences */
const privacyPrefs = new Map();

function pairKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function isBlocked(blockerId, blockedId) {
  return blocks.get(blockerId)?.has(blockedId) ?? false;
}

function areFriends(a, b) {
  return friendships.has(pairKey(a, b));
}

function publicProfile(p) {
  if (!p) return null;
  return {
    id: p.userId,
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    about: p.about,
    hasIdentityKey: identityKeys.has(p.userId),
  };
}

function normalizeUsername(u) {
  return String(u || '').trim().toLowerCase();
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export const store = {
  // --- Auth / profiles ---
  register({ username, displayName, phone }) {
    const digits = String(phone || '').replace(/\D/g, '');
    let uname = normalizeUsername(username || '');
    if (digits && !uname) {
      // Derive a stable username from phone so existing username index still works
      uname = `p${digits}`.slice(0, 30);
    }
    if (!/^[a-z][a-z0-9_]{2,29}$/.test(uname)) {
      return {
        error: {
          code: 'INVALID_USERNAME',
          message: 'Username must be 3–30 chars, start with a letter, only a-z 0-9 _',
        },
      };
    }
    if (digits && (digits.length < 8 || digits.length > 15)) {
      return {
        error: {
          code: 'INVALID_PHONE',
          message: 'Enter a valid phone number (8–15 digits)',
        },
      };
    }
    if (usernameIndex.has(uname)) {
      return { error: { code: 'USERNAME_TAKEN', message: 'Username is already taken' } };
    }
    if (digits && phoneIndex.has(digits)) {
      return { error: { code: 'PHONE_TAKEN', message: 'This phone number is already registered' } };
    }
    const userId = randomUUID();
    const profile = {
      id: userId,
      userId,
      username: uname,
      displayName: (displayName || (digits ? digits : uname)).trim().slice(0, 80),
      avatarUrl: null,
      about: '',
      phone: digits || null,
      phoneDiscoverable: false,
      createdAt: now(),
    };
    profiles.set(userId, profile);
    usernameIndex.set(uname, userId);
    if (digits) phoneIndex.set(digits, userId);
    return { data: publicProfile(profile) };
  },

  login(username, phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits) {
      const userId = phoneIndex.get(digits);
      if (!userId) {
        return { error: { code: 'USER_NOT_FOUND', message: 'No account with that phone number' } };
      }
      return { data: publicProfile(profiles.get(userId)) };
    }
    const uname = normalizeUsername(username);
    const userId = usernameIndex.get(uname);
    if (!userId) {
      return { error: { code: 'USER_NOT_FOUND', message: 'No account with that username' } };
    }
    return { data: publicProfile(profiles.get(userId)) };
  },

  createSession(userId) {
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    sessions.set(tokenHash, {
      userId,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
    });
    return token;
  },

  resolveSession(token) {
    if (!token) return null;
    const rec = sessions.get(hashToken(token));
    if (!rec) return null;
    if (rec.expiresAt < Date.now()) {
      sessions.delete(hashToken(token));
      return null;
    }
    const profile = profiles.get(rec.userId);
    if (!profile) return null;
    return { userId: rec.userId, profile };
  },

  revokeSession(token) {
    if (token) sessions.delete(hashToken(token));
  },

  getProfile(userId) {
    return profiles.get(userId) || null;
  },

  updateProfile(userId, { displayName, about, avatarUrl }) {
    const p = profiles.get(userId);
    if (!p) return { error: { code: 'NOT_FOUND', message: 'Profile not found' } };
    if (displayName !== undefined) p.displayName = String(displayName).trim().slice(0, 80);
    if (about !== undefined) p.about = String(about).trim().slice(0, 500);
    if (avatarUrl !== undefined) p.avatarUrl = avatarUrl;
    p.updatedAt = now();
    return { data: publicProfile(p) };
  },

  searchByUsername(query, currentUserId, limit = 20) {
    const q = normalizeUsername(query);
    if (!q) return [];
    const results = [];
    for (const p of profiles.values()) {
      if (p.userId === currentUserId) continue;
      if (isBlocked(p.userId, currentUserId) || isBlocked(currentUserId, p.userId)) continue;
      if (p.username.includes(q) || (p.displayName || '').toLowerCase().includes(q)) {
        results.push(publicProfile(p));
      }
      if (results.length >= limit) break;
    }
    return results;
  },

  // --- Identity keys ---
  publishIdentityKey(userId, { publicKeyB64, deviceId = 1, registrationId = 1, protocolVersion = 'bambi-e2ee-v1' }) {
    if (!publicKeyB64 || typeof publicKeyB64 !== 'string') {
      return { error: { code: 'VALIDATION', message: 'publicKeyB64 is required' } };
    }
    identityKeys.set(userId, {
      userId,
      publicKeyB64,
      deviceId,
      registrationId,
      protocolVersion,
      updatedAt: now(),
    });
    return {
      data: {
        userId,
        deviceId,
        protocolVersion,
        updatedAt: identityKeys.get(userId).updatedAt,
      },
    };
  },

  getIdentityKey(userId) {
    const k = identityKeys.get(userId);
    if (!k) return null;
    return {
      userId: k.userId,
      publicKeyB64: k.publicKeyB64,
      deviceId: k.deviceId,
      registrationId: k.registrationId,
      protocolVersion: k.protocolVersion,
      updatedAt: k.updatedAt,
    };
  },

  // --- Friends ---
  listPendingIncoming(userId) {
    const list = [];
    for (const r of friendRequests.values()) {
      if (r.toUserId === userId && r.status === 'pending') {
        list.push({ ...r, from: publicProfile(profiles.get(r.fromUserId)) });
      }
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  listPendingOutgoing(userId) {
    const list = [];
    for (const r of friendRequests.values()) {
      if (r.fromUserId === userId && r.status === 'pending') {
        list.push({ ...r, to: publicProfile(profiles.get(r.toUserId)) });
      }
    }
    return list;
  },

  sendFriendRequest(fromUserId, toUserId) {
    if (fromUserId === toUserId) {
      return { error: { code: 'SELF_REQUEST', message: 'Cannot send request to yourself' } };
    }
    if (!profiles.has(toUserId)) {
      return { error: { code: 'USER_NOT_FOUND', message: 'User not found' } };
    }
    if (areFriends(fromUserId, toUserId)) {
      return { error: { code: 'ALREADY_FRIENDS', message: 'Already friends' } };
    }
    if (isBlocked(toUserId, fromUserId) || isBlocked(fromUserId, toUserId)) {
      return { error: { code: 'BLOCKED', message: 'Cannot send request' } };
    }
    for (const r of friendRequests.values()) {
      if (
        r.status === 'pending' &&
        ((r.fromUserId === fromUserId && r.toUserId === toUserId) ||
          (r.fromUserId === toUserId && r.toUserId === fromUserId))
      ) {
        return { error: { code: 'REQUEST_EXISTS', message: 'A request already exists' } };
      }
    }
    const id = randomUUID();
    const req = {
      id,
      fromUserId,
      toUserId,
      status: 'pending',
      createdAt: now(),
      updatedAt: now(),
    };
    friendRequests.set(id, req);
    return { data: { ...req, to: publicProfile(profiles.get(toUserId)) } };
  },

  acceptFriendRequest(requestId, userId) {
    const r = friendRequests.get(requestId);
    if (!r || r.toUserId !== userId || r.status !== 'pending') {
      return { error: { code: 'NOT_FOUND', message: 'Request not found' } };
    }
    r.status = 'accepted';
    r.updatedAt = now();
    friendships.add(pairKey(r.fromUserId, r.toUserId));
    return { data: r };
  },

  rejectFriendRequest(requestId, userId) {
    const r = friendRequests.get(requestId);
    if (!r || r.toUserId !== userId || r.status !== 'pending') {
      return { error: { code: 'NOT_FOUND', message: 'Request not found' } };
    }
    r.status = 'rejected';
    r.updatedAt = now();
    return { data: r };
  },

  cancelFriendRequest(requestId, userId) {
    const r = friendRequests.get(requestId);
    if (!r || r.fromUserId !== userId || r.status !== 'pending') {
      return { error: { code: 'NOT_FOUND', message: 'Request not found' } };
    }
    r.status = 'cancelled';
    r.updatedAt = now();
    return { data: r };
  },

  listFriends(userId) {
    const list = [];
    for (const key of friendships) {
      const [a, b] = key.split(':');
      if (a === userId || b === userId) {
        const otherId = a === userId ? b : a;
        if (isBlocked(userId, otherId)) continue;
        list.push(publicProfile(profiles.get(otherId)));
      }
    }
    return list.filter(Boolean);
  },

  removeFriend(userId, otherId) {
    const key = pairKey(userId, otherId);
    if (!friendships.has(key)) {
      return { error: { code: 'NOT_FRIENDS', message: 'Not friends' } };
    }
    friendships.delete(key);
    return { data: { ok: true } };
  },

  blockUser(blockerId, blockedId) {
    if (blockerId === blockedId) {
      return { error: { code: 'SELF_BLOCK', message: 'Cannot block yourself' } };
    }
    if (!profiles.has(blockedId)) {
      return { error: { code: 'USER_NOT_FOUND', message: 'User not found' } };
    }
    if (!blocks.has(blockerId)) blocks.set(blockerId, new Set());
    blocks.get(blockerId).add(blockedId);
    friendships.delete(pairKey(blockerId, blockedId));
    for (const r of friendRequests.values()) {
      if (
        r.status === 'pending' &&
        ((r.fromUserId === blockerId && r.toUserId === blockedId) ||
          (r.fromUserId === blockedId && r.toUserId === blockerId))
      ) {
        r.status = 'cancelled';
        r.updatedAt = now();
      }
    }
    return { data: { ok: true } };
  },

  unblockUser(blockerId, blockedId) {
    blocks.get(blockerId)?.delete(blockedId);
    return { data: { ok: true } };
  },

  listBlocked(userId) {
    const set = blocks.get(userId);
    if (!set) return [];
    return [...set].map((id) => publicProfile(profiles.get(id))).filter(Boolean);
  },

  // --- Conversations ---
  listConversations(userId) {
    const result = [];
    for (const [convId, members] of conversationMembers) {
      const me = members.find((m) => m.userId === userId && !m.leftAt);
      if (!me) continue;
      const conv = conversations.get(convId);
      if (!conv) continue;

      const otherMembers = members.filter((m) => m.userId !== userId && !m.leftAt);
      let name = conv.title;
      let avatarUrl = conv.avatarUrl;
      let peerUserId = null;
      if (conv.type === 'direct' && otherMembers[0]) {
        const other = profiles.get(otherMembers[0].userId);
        peerUserId = otherMembers[0].userId;
        name = other?.displayName || other?.username || 'Unknown';
        avatarUrl = other?.avatarUrl ?? null;
      }

      const msgs = messages.get(convId) || [];
      const last = msgs[msgs.length - 1];
      const lastPreview = last
        ? last.protocolVersion?.startsWith('bambi-e2ee')
          ? 'Encrypted message'
          : 'Message'
        : null;

      const online = peerUserId ? presence.get(peerUserId)?.status === 'online' : false;

      result.push({
        id: convId,
        type: conv.type,
        name,
        avatarUrl,
        peerUserId,
        lastMessage: lastPreview,
        lastMessageAt: last?.createdAt || conv.updatedAt,
        unreadCount: 0,
        isOnline: online,
        isGroup: conv.type === 'group',
        memberCount: members.filter((m) => !m.leftAt).length,
      });
    }
    return result.sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));
  },

  getConversationPeer(conversationId, userId) {
    const members = conversationMembers.get(conversationId);
    if (!members) return null;
    const other = members.find((m) => m.userId !== userId && !m.leftAt);
    return other?.userId || null;
  },

  getMemberIds(conversationId) {
    const members = conversationMembers.get(conversationId) || [];
    return members.filter((m) => !m.leftAt).map((m) => m.userId);
  },

  getOrCreateDirectConversation(userId, otherUserId) {
    if (userId === otherUserId) {
      return { error: { code: 'SELF_CHAT', message: 'Cannot chat with yourself' } };
    }
    if (!profiles.has(otherUserId)) {
      return { error: { code: 'USER_NOT_FOUND', message: 'User not found' } };
    }
    if (isBlocked(userId, otherUserId) || isBlocked(otherUserId, userId)) {
      return { error: { code: 'BLOCKED', message: 'Cannot start conversation' } };
    }
    if (!areFriends(userId, otherUserId)) {
      return { error: { code: 'NOT_FRIENDS', message: 'You must be friends to start a chat' } };
    }

    for (const [convId, members] of conversationMembers) {
      const conv = conversations.get(convId);
      if (!conv || conv.type !== 'direct') continue;
      const ids = new Set(members.filter((m) => !m.leftAt).map((m) => m.userId));
      if (ids.has(userId) && ids.has(otherUserId) && ids.size === 2) {
        return { data: { id: convId, existing: true, peerUserId: otherUserId } };
      }
    }

    const id = randomUUID();
    conversations.set(id, {
      id,
      type: 'direct',
      title: null,
      createdBy: userId,
      createdAt: now(),
      updatedAt: now(),
    });
    conversationMembers.set(id, [
      { conversationId: id, userId, role: 'member', joinedAt: now() },
      { conversationId: id, userId: otherUserId, role: 'member', joinedAt: now() },
    ]);
    messages.set(id, []);
    return { data: { id, existing: false, peerUserId: otherUserId } };
  },

  getMessages(conversationId, userId, limit = 50) {
    const members = conversationMembers.get(conversationId);
    if (!members?.some((m) => m.userId === userId && !m.leftAt)) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } };
    }
    const msgs = messages.get(conversationId) || [];
    const data = msgs.slice(-limit).map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      senderDeviceId: m.senderDeviceId,
      clientMessageId: m.clientMessageId,
      ciphertext: m.ciphertext,
      protocolVersion: m.protocolVersion,
      messageType: m.messageType,
      createdAt: m.createdAt,
      status: m.status,
      deliveredTo: m.deliveredTo || [],
      readBy: m.readBy || [],
    }));
    return { data };
  },

  sendMessage(conversationId, userId, payload) {
    const members = conversationMembers.get(conversationId);
    if (!members?.some((m) => m.userId === userId && !m.leftAt)) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } };
    }
    const conv = conversations.get(conversationId);
    if (conv?.type === 'direct') {
      const other = members.find((m) => m.userId !== userId);
      if (other && (isBlocked(userId, other.userId) || isBlocked(other.userId, userId))) {
        return { error: { code: 'BLOCKED', message: 'Cannot send message' } };
      }
    }

    const {
      ciphertext,
      protocolVersion = 'bambi-e2ee-v1',
      clientMessageId,
      senderDeviceId = 1,
      messageType = 'text',
    } = payload || {};

    if (!clientMessageId || typeof clientMessageId !== 'string') {
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

    const existing = (messages.get(conversationId) || []).find(
      (m) => m.senderId === userId && m.clientMessageId === clientMessageId
    );
    if (existing) return { data: existing };

    const msg = {
      id: randomUUID(),
      conversationId,
      senderId: userId,
      senderDeviceId,
      clientMessageId,
      ciphertext,
      protocolVersion,
      messageType,
      createdAt: now(),
      status: 'sent',
      deliveredTo: [],
      readBy: [],
    };
    if (!messages.has(conversationId)) messages.set(conversationId, []);
    messages.get(conversationId).push(msg);
    if (conv) conv.updatedAt = now();
    return { data: msg };
  },

  markDelivered(conversationId, messageId, userId) {
    const msgs = messages.get(conversationId);
    if (!msgs) return { error: { code: 'NOT_FOUND', message: 'Conversation not found' } };
    if (!this.isMember(conversationId, userId)) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member' } };
    }
    const msg = msgs.find((m) => m.id === messageId);
    if (!msg) return { error: { code: 'NOT_FOUND', message: 'Message not found' } };
    if (msg.senderId === userId) return { data: msg };
    if (!msg.deliveredTo.includes(userId)) {
      msg.deliveredTo.push(userId);
      msg.status = 'delivered';
    }
    return { data: msg };
  },

  markRead(conversationId, messageIds, userId) {
    const msgs = messages.get(conversationId);
    if (!msgs) return { error: { code: 'NOT_FOUND', message: 'Conversation not found' } };
    if (!this.isMember(conversationId, userId)) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member' } };
    }
    const updated = [];
    for (const id of messageIds || []) {
      const msg = msgs.find((m) => m.id === id);
      if (!msg || msg.senderId === userId) continue;
      if (!msg.deliveredTo.includes(userId)) msg.deliveredTo.push(userId);
      if (!msg.readBy.includes(userId)) {
        msg.readBy.push(userId);
        msg.status = 'read';
        updated.push(msg);
      }
    }
    return { data: updated };
  },

  isMember(conversationId, userId) {
    return (
      conversationMembers.get(conversationId)?.some(
        (m) => m.userId === userId && !m.leftAt
      ) ?? false
    );
  },


  // --- Attachments (ciphertext blobs only) ---
  createAttachment({ conversationId, uploaderUserId, storageKey, sizeBytes, contentType }) {
    if (!this.isMember(conversationId, uploaderUserId)) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } };
    }
    const id = randomUUID();
    const rec = {
      id,
      conversationId,
      uploaderUserId,
      storageKey,
      sizeBytes,
      contentType: contentType || 'application/octet-stream',
      protocolVersion: 'bambi-e2ee-v1',
      createdAt: now(),
    };
    attachments.set(id, rec);
    return { data: rec };
  },

  getAttachment(attachmentId, userId) {
    const a = attachments.get(attachmentId);
    if (!a) return { error: { code: 'NOT_FOUND', message: 'Attachment not found' } };
    if (!this.isMember(a.conversationId, userId)) {
      return { error: { code: 'FORBIDDEN', message: 'Not authorized to access this attachment' } };
    }
    return { data: a };
  },


  // --- Groups ---
  createGroup(creatorId, { title, memberIds = [] }) {
    const name = String(title || '').trim().slice(0, 80);
    if (!name) {
      return { error: { code: 'VALIDATION', message: 'Group name is required' } };
    }
    const unique = [...new Set(memberIds.filter((id) => id && id !== creatorId))];
    for (const mid of unique) {
      if (!profiles.has(mid)) {
        return { error: { code: 'USER_NOT_FOUND', message: `User not found: ${mid}` } };
      }
      if (isBlocked(creatorId, mid) || isBlocked(mid, creatorId)) {
        return { error: { code: 'BLOCKED', message: 'Cannot add a blocked user' } };
      }
    }
    const id = randomUUID();
    conversations.set(id, {
      id,
      type: 'group',
      title: name,
      avatarUrl: null,
      createdBy: creatorId,
      createdAt: now(),
      updatedAt: now(),
    });
    const members = [
      { conversationId: id, userId: creatorId, role: 'owner', joinedAt: now() },
      ...unique.map((uid) => ({
        conversationId: id,
        userId: uid,
        role: 'member',
        joinedAt: now(),
      })),
    ];
    conversationMembers.set(id, members);
    messages.set(id, []);
    return {
      data: {
        id,
        type: 'group',
        title: name,
        memberCount: members.length,
        members: members.map((m) => ({
          userId: m.userId,
          role: m.role,
          profile: publicProfile(profiles.get(m.userId)),
        })),
      },
    };
  },

  getGroupDetails(conversationId, userId) {
    const conv = conversations.get(conversationId);
    if (!conv || conv.type !== 'group') {
      return { error: { code: 'NOT_FOUND', message: 'Group not found' } };
    }
    if (!this.isMember(conversationId, userId)) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member' } };
    }
    const members = (conversationMembers.get(conversationId) || []).filter((m) => !m.leftAt);
    return {
      data: {
        id: conv.id,
        title: conv.title,
        avatarUrl: conv.avatarUrl,
        createdBy: conv.createdBy,
        createdAt: conv.createdAt,
        members: members.map((m) => ({
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          profile: publicProfile(profiles.get(m.userId)),
        })),
      },
    };
  },

  getMemberRole(conversationId, userId) {
    const m = (conversationMembers.get(conversationId) || []).find(
      (x) => x.userId === userId && !x.leftAt
    );
    return m?.role || null;
  },

  updateGroup(conversationId, userId, { title, avatarUrl }) {
    const conv = conversations.get(conversationId);
    if (!conv || conv.type !== 'group') {
      return { error: { code: 'NOT_FOUND', message: 'Group not found' } };
    }
    const role = this.getMemberRole(conversationId, userId);
    if (role !== 'owner' && role !== 'admin') {
      return { error: { code: 'FORBIDDEN', message: 'Only admins can update group info' } };
    }
    if (title !== undefined) {
      const name = String(title).trim().slice(0, 80);
      if (!name) return { error: { code: 'VALIDATION', message: 'Invalid name' } };
      conv.title = name;
    }
    if (avatarUrl !== undefined) conv.avatarUrl = avatarUrl;
    conv.updatedAt = now();
    return { data: { id: conv.id, title: conv.title, avatarUrl: conv.avatarUrl } };
  },

  addGroupMembers(conversationId, actorId, memberIds = []) {
    const conv = conversations.get(conversationId);
    if (!conv || conv.type !== 'group') {
      return { error: { code: 'NOT_FOUND', message: 'Group not found' } };
    }
    const role = this.getMemberRole(conversationId, actorId);
    if (role !== 'owner' && role !== 'admin') {
      return { error: { code: 'FORBIDDEN', message: 'Only admins can add members' } };
    }
    const list = conversationMembers.get(conversationId) || [];
    const added = [];
    for (const mid of memberIds) {
      if (!profiles.has(mid)) continue;
      if (isBlocked(actorId, mid) || isBlocked(mid, actorId)) continue;
      const existing = list.find((m) => m.userId === mid);
      if (existing && !existing.leftAt) continue;
      if (existing && existing.leftAt) {
        existing.leftAt = null;
        existing.joinedAt = now();
        existing.role = 'member';
        added.push(mid);
      } else {
        list.push({
          conversationId,
          userId: mid,
          role: 'member',
          joinedAt: now(),
        });
        added.push(mid);
      }
    }
    conversationMembers.set(conversationId, list);
    conv.updatedAt = now();
    return {
      data: {
        added,
        members: list
          .filter((m) => !m.leftAt)
          .map((m) => ({
            userId: m.userId,
            role: m.role,
            profile: publicProfile(profiles.get(m.userId)),
          })),
      },
    };
  },

  removeGroupMember(conversationId, actorId, targetId) {
    const conv = conversations.get(conversationId);
    if (!conv || conv.type !== 'group') {
      return { error: { code: 'NOT_FOUND', message: 'Group not found' } };
    }
    const list = conversationMembers.get(conversationId) || [];
    const target = list.find((m) => m.userId === targetId && !m.leftAt);
    if (!target) {
      return { error: { code: 'NOT_FOUND', message: 'Member not found' } };
    }
    const actorRole = this.getMemberRole(conversationId, actorId);
    const isSelf = actorId === targetId;
    if (!isSelf) {
      if (actorRole !== 'owner' && actorRole !== 'admin') {
        return { error: { code: 'FORBIDDEN', message: 'Only admins can remove members' } };
      }
      if (target.role === 'owner') {
        return { error: { code: 'FORBIDDEN', message: 'Cannot remove the owner' } };
      }
      if (target.role === 'admin' && actorRole !== 'owner') {
        return { error: { code: 'FORBIDDEN', message: 'Only owner can remove admins' } };
      }
    }
    target.leftAt = now();
    conv.updatedAt = now();
    return { data: { removed: targetId, left: isSelf } };
  },

  setMemberRole(conversationId, actorId, targetId, newRole) {
    if (!['admin', 'member'].includes(newRole)) {
      return { error: { code: 'VALIDATION', message: 'Invalid role' } };
    }
    if (this.getMemberRole(conversationId, actorId) !== 'owner') {
      return { error: { code: 'FORBIDDEN', message: 'Only owner can change roles' } };
    }
    const list = conversationMembers.get(conversationId) || [];
    const target = list.find((m) => m.userId === targetId && !m.leftAt);
    if (!target || target.role === 'owner') {
      return { error: { code: 'FORBIDDEN', message: 'Cannot change this member' } };
    }
    target.role = newRole;
    return { data: { userId: targetId, role: newRole } };
  },


  addReaction(messageId, conversationId, userId, emoji) {
    if (!this.isMember(conversationId, userId)) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member' } };
    }
    const e = String(emoji || '').slice(0, 16);
    if (!e) return { error: { code: 'VALIDATION', message: 'emoji required' } };
    const list = reactions.get(messageId) || [];
    if (!list.some((r) => r.userId === userId && r.emoji === e)) {
      list.push({ userId, emoji: e, createdAt: now() });
      reactions.set(messageId, list);
    }
    return { data: list };
  },

  removeReaction(messageId, userId, emoji) {
    const list = (reactions.get(messageId) || []).filter(
      (r) => !(r.userId === userId && r.emoji === emoji)
    );
    reactions.set(messageId, list);
    return { data: list };
  },

  listReactions(messageId) {
    return reactions.get(messageId) || [];
  },

  setConversationUserState(conversationId, userId, patch) {
    if (!this.isMember(conversationId, userId)) {
      return { error: { code: 'FORBIDDEN', message: 'Not a member' } };
    }
    const key = `${conversationId}:${userId}`;
    const cur = convUserState.get(key) || {};
    const next = { ...cur, ...patch };
    convUserState.set(key, next);
    return { data: next };
  },

  getConversationUserState(conversationId, userId) {
    return convUserState.get(`${conversationId}:${userId}`) || {};
  },

  // --- Presence ---
  setPresence(userId, status) {
    const prev = presence.get(userId);
    const at = now();
    // When going offline, keep lastSeen; when online, clear "last seen" display time
    const lastSeen =
      status === 'offline' ? at : prev?.lastSeen || prev?.at || null;
    presence.set(userId, { status, at, lastSeen: status === 'offline' ? at : lastSeen });
    return presence.get(userId);
  },

  getPresence(userId) {
    return presence.get(userId) || { status: 'offline', at: null, lastSeen: null };
  },

  /**
   * Presence visible to viewer according to privacy settings.
   * privacy.lastSeen: 'everyone' | 'contacts' | 'nobody'
   */
  getPresenceForViewer(targetUserId, viewerUserId) {
    const p = this.getPresence(targetUserId);
    const prefs = privacyPrefs.get(targetUserId) || { lastSeen: 'everyone', onlineStatus: 'everyone' };
    const friends = areFriends(targetUserId, viewerUserId);

    const allowOnline = (() => {
      if (prefs.onlineStatus === 'nobody') return false;
      if (prefs.onlineStatus === 'contacts') return friends;
      return true;
    })();
    const allowLastSeen = (() => {
      if (prefs.lastSeen === 'nobody') return false;
      if (prefs.lastSeen === 'contacts') return friends;
      return true;
    })();

    return {
      status: allowOnline ? p.status : 'offline',
      lastSeen: allowLastSeen && p.status !== 'online' ? p.lastSeen || p.at : null,
      onlineVisible: allowOnline,
    };
  },

  getPrivacy(userId) {
    return privacyPrefs.get(userId) || {
      lastSeen: 'everyone',
      onlineStatus: 'everyone',
      profilePhoto: 'everyone',
      readReceipts: true,
    };
  },

  setPrivacy(userId, patch) {
    const cur = this.getPrivacy(userId);
    const next = { ...cur, ...patch };
    privacyPrefs.set(userId, next);
    return { data: next };
  },

  // --- Blocks (expose for call authorization) ---
  isBlocked(blockerId, blockedId) {
    return isBlocked(blockerId, blockedId);
  },

  async canCall(callerId, calleeId) {
    if (callerId === calleeId) return false;
    if (!areFriends(callerId, calleeId)) return false;
    if (isBlocked(callerId, calleeId) || isBlocked(calleeId, callerId)) return false;
    return true;
  },

  // --- Call history ---
  async saveCallRecord(record) {
    callRecords.unshift({
      id: record.id || randomUUID(),
      callerId: record.callerId,
      calleeId: record.calleeId,
      conversationId: record.conversationId || null,
      kind: record.kind || 'audio',
      status: record.status || 'ended',
      startedAt: record.startedAt || now(),
      endedAt: record.endedAt || now(),
      durationMs: record.durationMs || 0,
    });
    if (callRecords.length > 500) callRecords.length = 500;
    return { data: callRecords[0] };
  },

  async listCallHistory(userId, limit = 50) {
    return callRecords
      .filter((r) => r.callerId === userId || r.calleeId === userId)
      .slice(0, limit)
      .map((r) => {
        const peerId = r.callerId === userId ? r.calleeId : r.callerId;
        const peer = profiles.get(peerId);
        return {
          ...r,
          direction: r.callerId === userId ? 'outgoing' : 'incoming',
          peer: peer
            ? {
                id: peer.userId,
                username: peer.username,
                displayName: peer.displayName,
                avatarUrl: peer.avatarUrl,
              }
            : { id: peerId },
        };
      });
  },
};
