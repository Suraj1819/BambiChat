
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { Sidebar } from '@/components/layout/Sidebar';
import { ConversationListItem } from '@/components/chat/ConversationListItem';
import { ConversationHeader } from '@/components/chat/ConversationHeader';
import { MessageTimeline } from '@/components/chat/MessageTimeline';
import { MessageComposer } from '@/components/chat/MessageComposer';
import { NoConversationSelected } from '@/components/chat/NoConversationSelected';
import { EmptyState } from '@/components/ui/EmptyState';

import { UserSearchDialog } from '@/components/dialogs/UserSearchDialog';
import { FriendsPanel } from '@/components/dialogs/FriendsPanel';
import { CreateGroupDialog } from '@/components/dialogs/CreateGroupDialog';
import { GroupInfoPanel } from '@/components/dialogs/GroupInfoPanel';
import { SettingsPanel } from '@/components/dialogs/SettingsPanel';
import { ContactInfoPanel } from '@/components/dialogs/ContactInfoPanel';

import { CallOverlay } from '@/features/calls/CallOverlay';
import { useCall } from '@/features/calls/useCall';

import {
  MessageSquarePlus,
  Loader2,
  Shield,
  Wifi,
  WifiOff,
  Search,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { getSessionUser, clearSession } from '@/lib/session';

import {
  connectSocket,
  disconnectSocket,
  joinConversation,
  leaveConversation,
  socketSendMessage,
  emitTyping,
  emitDelivered,
  emitRead,
  getSocket,
} from '@/lib/socket';

import {
  ensureIdentity,
  encryptOutgoing,
  decryptIncoming,
  clearSessionCache,
  PROTOCOL_VERSION,
} from '@/features/encryption';

import {
  encryptFile,
  decryptFile,
  isAllowedMime,
  MAX_FILE_BYTES,
} from '@/features/encryption/fileCrypto.js';

import {
  generateGroupKey,
  saveGroupKey,
  loadGroupKey,
  encryptGroupMessage,
  decryptGroupMessage,
  wrapGroupKeyForMember,
  unwrapGroupKeyFromMember,
} from '@/features/encryption/groupCrypto.js';

import { parseDecryptedBody } from '@/features/encryption/messageCodec.js';

function clientMsgId() {
  return `cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

/*
 * Read avatar URLs from common profile and API response field names.
 */
function getAvatarUrl(user) {
  if (!user || typeof user !== 'object') return null;

  const directUrl =
    user.avatarUrl ??
    user.avatar_url ??
    user.photoURL ??
    user.photoUrl ??
    user.photo_url ??
    user.imageUrl ??
    user.image_url ??
    user.avatar ??
    user.photo ??
    user.profilePicture ??
    user.profile_picture ??
    null;

  if (typeof directUrl === 'string' && directUrl.trim()) {
    return directUrl.trim();
  }

  const nestedProfile =
    user.profile ??
    user.user ??
    user.peer ??
    user.otherUser ??
    user.contact ??
    null;

  if (nestedProfile && nestedProfile !== user) {
    return getAvatarUrl(nestedProfile);
  }

  return null;
}

function getPeerId(conversation) {
  return (
    conversation?.peerUserId ??
    conversation?.peer_user_id ??
    conversation?.otherUserId ??
    conversation?.other_user_id ??
    conversation?.recipientId ??
    conversation?.recipient_id ??
    null
  );
}

function mergeConversationProfiles(conversationList, friendList) {
  const friendsById = new Map();

  for (const friend of friendList) {
    const id = friend?.id ?? friend?.userId ?? friend?.user_id;

    if (id != null) {
      friendsById.set(String(id), friend);
    }
  }

  return conversationList.map((conversation) => {
    const peerId = getPeerId(conversation);
    const friend =
      peerId != null ? friendsById.get(String(peerId)) : null;

    const conversationAvatar = getAvatarUrl(conversation);
    const friendAvatar = getAvatarUrl(friend);

    return {
      ...conversation,
      peerUserId: peerId ?? conversation.peerUserId,
      name:
        conversation.name ||
        friend?.displayName ||
        friend?.display_name ||
        friend?.username ||
        'Unknown',
      avatarUrl: conversationAvatar || friendAvatar || null,
    };
  });
}

export function ChatPage() {
  const navigate = useNavigate();
  const sessionUser = getSessionUser();
  const userId = sessionUser?.id;

  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [me, setMe] = useState(sessionUser);
  const [friends, setFriends] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [cryptoReady, setCryptoReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [error, setError] = useState('');

  const [searchOpen, setSearchOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [friendRequests, setFriendRequests] = useState([]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filter, setFilter] = useState('all');
  const [contactOpen, setContactOpen] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');

  const peerKeyCache = useRef(new Map());
  const activeIdRef = useRef(null);
  const conversationsRef = useRef([]);

  activeIdRef.current = activeId;
  conversationsRef.current = conversations;

  const activeConversation = conversations.find((conversation) =>
    sameId(conversation.id, activeId)
  );

  const isGroup =
    activeConversation?.isGroup ||
    activeConversation?.type === 'group';

  const resolveCallPeer = useCallback((peerId) => {
    const conversation = conversationsRef.current.find((item) =>
      sameId(getPeerId(item), peerId)
    );

    if (!conversation) return null;

    return {
      name: conversation.name,
      avatarUrl: getAvatarUrl(conversation),
    };
  }, []);

  const calls = useCall({ resolvePeer: resolveCallPeer });
  const attachCalls = calls.attach;

  const openConversation = useCallback((conversationId) => {
    if (conversationId == null) return;

    setMessages([]);
    setTypingUsers({});
    setError('');
    setContactOpen(false);
    setGroupInfoOpen(false);
    setChatSearchOpen(false);
    setChatSearch('');
    setActiveId(String(conversationId));
  }, []);

  const goBackToChats = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setTypingUsers({});
    setContactOpen(false);
    setGroupInfoOpen(false);
    setChatSearchOpen(false);
    setChatSearch('');
  }, []);

  const initCrypto = useCallback(async (uid) => {
    setCryptoReady(false);

    try {
      const identity = await ensureIdentity(uid);

      await api.publishIdentityKey({
        publicKeyB64: identity.publicKeyB64,
        deviceId: identity.deviceId,
        registrationId: identity.registrationId,
        protocolVersion: PROTOCOL_VERSION,
      });

      setCryptoReady(true);
    } catch (e) {
      setError(`Encryption init failed: ${e.message}`);
      setCryptoReady(false);
    }
  }, []);

  /*
   * Load conversations, friends and profiles together so that each
   * direct conversation can use the friend's saved avatar URL.
   */
  const loadList = useCallback(async () => {
    setLoadingList(true);

    try {
      const [meRes, convRes, friendsRes, requestsRes] =
        await Promise.all([
          api.me(),
          api.listConversations(),
          api.listFriends(),
          api.listFriendRequests(),
        ]);

      const profileId = meRes.data?.id;

      let localProfile = {};

      try {
        localProfile = JSON.parse(
          localStorage.getItem(`bambi-profile-${profileId}`) || '{}'
        );
      } catch {
        localProfile = {};
      }

      const nextFriends = Array.isArray(friendsRes.data)
        ? friendsRes.data
        : [];

      const rawConversations = Array.isArray(convRes.data)
        ? convRes.data
        : [];

      const nextConversations = mergeConversationProfiles(
        rawConversations,
        nextFriends
      );

      setMe({
        ...meRes.data,
        ...localProfile,
      });

      setFriends(nextFriends);
      setConversations(nextConversations);
      setFriendRequests(requestsRes.data?.incoming || []);
    } catch (e) {
      if (e.status === 401) {
        clearSession();
        navigate('/auth', { replace: true });
        return;
      }

      setError(e.message || 'Failed to load conversations');
    } finally {
      setLoadingList(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!userId) return undefined;

    let active = true;

    const refreshRequests = async () => {
      try {
        const result = await api.listFriendRequests();

        if (active) {
          setFriendRequests(result.data?.incoming || []);
        }
      } catch {
        // Keep the last successfully loaded requests.
      }
    };

    const intervalId = window.setInterval(refreshRequests, 30000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [userId]);

  async function resolvePeerPub(peerForKey, { force = false } = {}) {
    if (!peerForKey) return null;

    const cacheKey = String(peerForKey);

    if (!force) {
      const cached = peerKeyCache.current.get(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await api.getIdentityKey(peerForKey);
      const publicKey = response.data?.publicKeyB64 || null;

      if (publicKey) {
        peerKeyCache.current.set(cacheKey, publicKey);
      } else {
        peerKeyCache.current.delete(cacheKey);
      }

      return publicKey;
    } catch {
      peerKeyCache.current.delete(cacheKey);
      return null;
    }
  }

  async function decryptRawMessage(message, conversation) {
    const groupMessage =
      conversation?.isGroup ||
      conversation?.type === 'group' ||
      message.protocolVersion === 'bambi-e2ee-v1-group';

    const conversationId =
      message.conversationId || conversation?.id || activeIdRef.current;

    if (groupMessage) {
      let plaintext;
      const groupKey = await loadGroupKey(conversationId);

      if (groupKey?.key) {
        const aad = `${conversationId}|${message.senderId}|${message.clientMessageId}`;

        plaintext = await decryptGroupMessage(
          groupKey.key,
          message.ciphertext,
          aad
        );
      } else {
        try {
          const senderId = sameId(message.senderId, userId)
            ? null
            : message.senderId;

          if (senderId) {
            const senderPublicKey = await resolvePeerPub(senderId);

            plaintext = await decryptIncoming({
              localUserId: userId,
              peerUserId: senderId,
              peerPublicKeyB64: senderPublicKey,
              conversationId,
              clientMessageId: message.clientMessageId,
              senderId: message.senderId,
              ciphertext: message.ciphertext,
            });
          } else {
            plaintext = '[no group key yet]';
          }
        } catch {
          plaintext = '[no group key yet]';
        }
      }

      const parsed = parseDecryptedBody(plaintext);

      if (parsed.keyDist && parsed.keyDist.wrapped) {
        const myWrappedKey = parsed.keyDist.wrapped.find((item) =>
          sameId(item.userId, userId)
        );

        if (myWrappedKey && !sameId(message.senderId, userId)) {
          try {
            const senderPublicKey = await resolvePeerPub(message.senderId);

            const keyB64 = await unwrapGroupKeyFromMember(
              userId,
              message.senderId,
              senderPublicKey,
              myWrappedKey
            );

            await saveGroupKey(
              conversationId,
              keyB64,
              parsed.keyDist.epoch || 1
            );
          } catch {
            // Keep rendering messages if key bootstrap fails.
          }
        }

        return {
          id: message.id,
          clientMessageId: message.clientMessageId,
          senderId: message.senderId,
          body: 'Group key updated',
          createdAt: message.createdAt,
          status: message.status,
          encrypted: true,
          system: true,
        };
      }

      return {
        id: message.id,
        clientMessageId: message.clientMessageId,
        senderId: message.senderId,
        body: parsed.body,
        attachment: parsed.attachment,
        createdAt: message.createdAt,
        status: message.status,
        encrypted: true,
      };
    }

    const peerForKey = sameId(message.senderId, userId)
      ? getPeerId(conversation)
      : message.senderId;

    if (!peerForKey) {
      return {
        id: message.id,
        clientMessageId: message.clientMessageId,
        senderId: message.senderId,
        body: '[missing peer]',
        createdAt: message.createdAt,
        status: message.status,
        encrypted: true,
      };
    }

    let peerPublicKey = await resolvePeerPub(peerForKey);

    let plaintext = await decryptIncoming({
      localUserId: userId,
      peerUserId: peerForKey,
      peerPublicKeyB64: peerPublicKey,
      conversationId,
      clientMessageId: message.clientMessageId,
      senderId: message.senderId,
      ciphertext: message.ciphertext,
    });

    if (
      plaintext === '[decryption failed]' ||
      plaintext === '[no peer key — ask them to open the app once]' ||
      plaintext === '[no peer key]'
    ) {
      peerPublicKey = await resolvePeerPub(peerForKey, { force: true });

      plaintext = await decryptIncoming({
        localUserId: userId,
        peerUserId: peerForKey,
        peerPublicKeyB64: peerPublicKey,
        conversationId,
        clientMessageId: message.clientMessageId,
        senderId: message.senderId,
        ciphertext: message.ciphertext,
      });
    }

    const parsed = parseDecryptedBody(plaintext);

    return {
      id: message.id,
      clientMessageId: message.clientMessageId,
      senderId: message.senderId,
      body: parsed.body,
      attachment: parsed.attachment,
      createdAt: message.createdAt,
      status: message.status,
      encrypted: true,
    };
  }

  useEffect(() => {
    if (!userId) {
      navigate('/auth', { replace: true });
      return undefined;
    }

    let cancelled = false;
    let detachCalls = null;
    let socket = null;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onNewMessage = async ({ message }) => {
      if (!message) return;

      if (!sameId(message.senderId, userId)) {
        emitDelivered(message.conversationId, message.id);
      }

      if (!sameId(message.conversationId, activeIdRef.current)) {
        loadList();
        return;
      }

      const conversation = conversationsRef.current.find((item) =>
        sameId(item.id, message.conversationId)
      );

      try {
        const decrypted = await decryptRawMessage(message, conversation);

        setMessages((previous) => {
          const exists = previous.some(
            (item) =>
              sameId(item.id, decrypted.id) ||
              (
                item.clientMessageId &&
                item.clientMessageId === decrypted.clientMessageId
              )
          );

          if (exists) {
            return previous.map((item) =>
              sameId(item.id, decrypted.id) ||
              (
                item.clientMessageId &&
                item.clientMessageId === decrypted.clientMessageId
              )
                ? { ...item, ...decrypted }
                : item
            );
          }

          return [...previous, decrypted];
        });
      } catch {
        // Ignore malformed messages without breaking the socket.
      }

      loadList();
    };

    const onMessageNotify = () => loadList();

    const onMessageReceipt = ({ messageId, status }) => {
      setMessages((previous) =>
        previous.map((message) =>
          sameId(message.id, messageId)
            ? { ...message, status }
            : message
        )
      );
    };

    const onTypingUpdate = ({
      conversationId,
      userId: typingUserId,
      username,
      typing,
    }) => {
      if (
        !sameId(conversationId, activeIdRef.current) ||
        sameId(typingUserId, userId)
      ) {
        return;
      }

      setTypingUsers((previous) => {
        const next = { ...previous };

        if (typing) {
          next[typingUserId] = username;
        } else {
          delete next[typingUserId];
        }

        return next;
      });
    };

    const applyPresence = (peerId, status, lastSeen) => {
      setConversations((previous) =>
        previous.map((conversation) =>
          sameId(getPeerId(conversation), peerId)
            ? {
                ...conversation,
                isOnline: status === 'online',
                lastSeen:
                  status === 'online'
                    ? null
                    : lastSeen || conversation.lastSeen || null,
              }
            : conversation
        )
      );
    };

    const onPresenceUpdate = ({ userId: peerId, status, lastSeen }) => {
      applyPresence(peerId, status, lastSeen);
    };

    const onPresenceSnapshot = ({ presence }) => {
      if (!presence || typeof presence !== 'object') return;

      setConversations((previous) =>
        previous.map((conversation) => {
          const peerId = getPeerId(conversation);
          if (!peerId || !presence[peerId]) return conversation;

          const currentPresence = presence[peerId];

          return {
            ...conversation,
            isOnline: currentPresence.status === 'online',
            lastSeen:
              currentPresence.status === 'online'
                ? null
                : currentPresence.lastSeen || null,
          };
        })
      );
    };

    const requestPresence = () => {
      const ids = conversationsRef.current
        .map(getPeerId)
        .filter(Boolean);

      if (!ids.length || !socket?.connected) return;

      socket.emit('presence:subscribe', { userIds: ids }, (response) => {
        const data = response?.data;
        if (!data) return;

        setConversations((previous) =>
          previous.map((conversation) => {
            const peerId = getPeerId(conversation);
            if (!peerId || !data[peerId]) return conversation;

            const presence = data[peerId];

            return {
              ...conversation,
              isOnline: presence.status === 'online',
              lastSeen:
                presence.status === 'online'
                  ? null
                  : presence.lastSeen || null,
            };
          })
        );
      });
    };

    const onConnectionReady = () => setConnected(true);

    (async () => {
      await initCrypto(userId);
      if (cancelled) return;

      await loadList();
      if (cancelled) return;

      socket = connectSocket();
      if (!socket) return;

      detachCalls = attachCalls(socket);

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('connection:ready', onConnectionReady);
      socket.on('message:new', onNewMessage);
      socket.on('message:notify', onMessageNotify);
      socket.on('message:receipt', onMessageReceipt);
      socket.on('typing:update', onTypingUpdate);
      socket.on('presence:update', onPresenceUpdate);
      socket.on('presence:snapshot', onPresenceSnapshot);
      socket.on('connect', requestPresence);

      if (socket.connected) {
        setConnected(true);
        requestPresence();
      }
    })();

    return () => {
      cancelled = true;

      if (socket) {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('connection:ready', onConnectionReady);
        socket.off('message:new', onNewMessage);
        socket.off('message:notify', onMessageNotify);
        socket.off('message:receipt', onMessageReceipt);
        socket.off('typing:update', onTypingUpdate);
        socket.off('presence:update', onPresenceUpdate);
        socket.off('presence:snapshot', onPresenceSnapshot);
        socket.off('connect', requestPresence);
      }

      detachCalls?.();
      disconnectSocket();
    };
  }, [userId, initCrypto, loadList, navigate, attachCalls]);

  useEffect(() => {
    if (!activeId || !userId) {
      setMessages([]);
      setTypingUsers({});
      setLoadingMessages(false);
      return undefined;
    }

    let cancelled = false;
    const conversationId = activeId;

    setMessages([]);
    setTypingUsers({});
    setLoadingMessages(true);

    (async () => {
      try {
        await joinConversation(conversationId);

        const response = await api.getMessages(conversationId);
        const rawMessages = response.data || [];

        const conversation = conversationsRef.current.find((item) =>
          sameId(item.id, conversationId)
        );

        const decryptedMessages = [];
        const unreadMessageIds = [];

        for (const message of rawMessages) {
          try {
            const decrypted = await decryptRawMessage(
              { ...message, conversationId },
              conversation
            );

            decryptedMessages.push(decrypted);
          } catch {
            decryptedMessages.push({
              id: message.id,
              clientMessageId: message.clientMessageId,
              senderId: message.senderId,
              body: '[decryption failed]',
              createdAt: message.createdAt,
              status: message.status,
              encrypted: true,
            });
          }

          if (!sameId(message.senderId, userId)) {
            unreadMessageIds.push(message.id);
          }
        }

        if (cancelled) return;
        if (!sameId(activeIdRef.current, conversationId)) return;

        setMessages(decryptedMessages);

        if (unreadMessageIds.length) {
          unreadMessageIds.forEach((messageId) =>
            emitDelivered(conversationId, messageId)
          );

          emitRead(conversationId, unreadMessageIds);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Failed to load messages');
        }
      } finally {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      leaveConversation(conversationId);
    };
  }, [activeId, userId]);

  const filtered = conversations.filter((conversation) => {
    if (filter === 'unread' && !(conversation.unreadCount > 0)) {
      return false;
    }

    if (
      filter === 'groups' &&
      !(conversation.isGroup || conversation.type === 'group')
    ) {
      return false;
    }

    if (!searchQuery.trim()) return true;

    return (conversation.name || '')
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase());
  });

  const unreadTotal = conversations.reduce(
    (total, conversation) => total + (conversation.unreadCount || 0),
    0
  );

  const typingLabel = Object.values(typingUsers).join(', ');
  const trimmedSearch = chatSearch.trim().toLowerCase();

  const visibleMessages = trimmedSearch
    ? messages.filter((message) => {
        const body = (message.body || '').toLowerCase();
        const filename = (
          message.attachment?.filename || ''
        ).toLowerCase();

        return (
          body.includes(trimmedSearch) ||
          filename.includes(trimmedSearch)
        );
      })
    : messages;

  const callsDisabledReason =
    calls.call.status !== 'idle'
      ? 'You are already on a call'
      : !connected
        ? 'You are offline'
        : !getPeerId(activeConversation)
          ? 'Calls are not available for this chat'
          : '';

  const startCallWithActive = (kind) => {
    if (!getPeerId(activeConversation) || callsDisabledReason) return;

    calls.startCall({
      peer: {
        id: getPeerId(activeConversation),
        name: activeConversation.name,
        avatarUrl: getAvatarUrl(activeConversation),
      },
      conversationId: activeConversation.id,
      kind,
    });
  };

  async function distributeGroupKey(
    conversationId,
    memberIds,
    groupKeyB64,
    epoch = 1
  ) {
    const wrapped = [];

    for (const memberId of memberIds) {
      if (sameId(memberId, userId)) continue;

      try {
        const publicKey = await resolvePeerPub(memberId);
        if (!publicKey) continue;

        const wrappedKey = await wrapGroupKeyForMember(
          userId,
          memberId,
          publicKey,
          groupKeyB64
        );

        wrapped.push(wrappedKey);
      } catch {
        // Continue with remaining members.
      }
    }

    const payload = {
      type: 'group_key_dist',
      epoch,
      wrapped,
    };

    for (const memberId of memberIds) {
      if (sameId(memberId, userId)) continue;

      try {
        const publicKey = await resolvePeerPub(memberId);
        if (!publicKey) continue;

        const messageClientId = clientMsgId();

        const encrypted = await encryptOutgoing({
          localUserId: userId,
          peerUserId: memberId,
          peerPublicKeyB64: publicKey,
          conversationId,
          clientMessageId: messageClientId,
          plaintext: JSON.stringify(payload),
        });

        const body = {
          conversationId,
          ciphertext: encrypted.ciphertext,
          protocolVersion: encrypted.protocolVersion,
          clientMessageId: messageClientId,
          senderDeviceId: 1,
          messageType: 'key_exchange',
        };

        if (getSocket()?.connected) {
          await socketSendMessage(body);
        } else {
          await api.sendEncryptedMessage(conversationId, body);
        }
      } catch {
        // Continue with other members.
      }
    }
  }

  const handleGroupCreated = async (group) => {
    try {
      const { keyB64 } = await generateGroupKey();

      await saveGroupKey(group.id, keyB64, 1);

      const memberIds = (group.members || []).map(
        (member) => member.userId
      );

      await distributeGroupKey(group.id, memberIds, keyB64, 1);
      await loadList();
      openConversation(group.id);
    } catch (e) {
      setError(e.message || 'Failed to initialise group encryption');
      await loadList();
      openConversation(group.id);
    }
  };

  const sendEncryptedPayload = async (
    plaintextObject,
    optimisticBody,
    optimisticAttachment
  ) => {
    const conversation = conversationsRef.current.find((item) =>
      sameId(item.id, activeIdRef.current)
    );

    const conversationId = activeIdRef.current;

    if (!conversationId) {
      throw new Error('Select a conversation first');
    }

    const messageClientId = clientMsgId();

    const optimisticMessage = {
      id: `local-${messageClientId}`,
      clientMessageId: messageClientId,
      senderId: userId,
      body: optimisticBody,
      attachment: optimisticAttachment,
      createdAt: new Date().toISOString(),
      status: 'sending',
      encrypted: true,
    };

    setMessages((previous) => [...previous, optimisticMessage]);

    const plaintext =
      typeof plaintextObject === 'string'
        ? plaintextObject
        : JSON.stringify(plaintextObject);

    let payload;

    if (
      conversation?.isGroup ||
      conversation?.type === 'group'
    ) {
      let groupKey = await loadGroupKey(conversationId);

      if (!groupKey) {
        const generated = await generateGroupKey();

        await saveGroupKey(conversationId, generated.keyB64, 1);
        groupKey = await loadGroupKey(conversationId);
      }

      if (!groupKey?.key) {
        throw new Error('Group encryption key is not available');
      }

      const aad = `${conversationId}|${userId}|${messageClientId}`;

      const encrypted = await encryptGroupMessage(
        groupKey.key,
        plaintext,
        aad
      );

      payload = {
        conversationId,
        ciphertext: encrypted.ciphertext,
        protocolVersion: encrypted.protocolVersion,
        clientMessageId: messageClientId,
        senderDeviceId: 1,
        messageType: optimisticAttachment ? 'attachment' : 'text',
      };
    } else {
      const peerId = getPeerId(conversation);

      if (!peerId) {
        throw new Error('Cannot determine peer for encryption');
      }

      const peerPublicKey = await resolvePeerPub(peerId, {
        force: true,
      });

      if (!peerPublicKey) {
        throw new Error(
          'The other person has not opened Bambi yet. Ask them to open the app once.'
        );
      }

      const encrypted = await encryptOutgoing({
        localUserId: userId,
        peerUserId: peerId,
        peerPublicKeyB64: peerPublicKey,
        conversationId,
        clientMessageId: messageClientId,
        plaintext,
      });

      payload = {
        conversationId,
        ciphertext: encrypted.ciphertext,
        protocolVersion: encrypted.protocolVersion,
        clientMessageId: encrypted.clientMessageId,
        senderDeviceId: 1,
        messageType: optimisticAttachment ? 'attachment' : 'text',
      };
    }

    let savedMessage;

    try {
      if (getSocket()?.connected) {
        savedMessage = await socketSendMessage(payload);
      } else {
        const response = await api.sendEncryptedMessage(
          conversationId,
          payload
        );

        savedMessage = response.data;
      }
    } catch (e) {
      setMessages((previous) =>
        previous.map((message) =>
          message.clientMessageId === messageClientId
            ? { ...message, status: 'failed' }
            : message
        )
      );

      throw e;
    }

    setMessages((previous) =>
      previous.map((message) =>
        message.clientMessageId === messageClientId
          ? {
              ...message,
              id: savedMessage.id,
              status: 'sent',
            }
          : message
      )
    );

    loadList();
  };

  const handleSend = async (text) => {
    if (!activeId || !cryptoReady || !userId) return false;

    emitTyping(activeId, false);

    try {
      await sendEncryptedPayload(text, text, null);
      return true;
    } catch (e) {
      setError(e.message || 'Message could not be sent');
      return false;
    }
  };

  const handleAttach = async (file) => {
    if (!activeId || !cryptoReady || !userId) return;

    if (file.size > MAX_FILE_BYTES) {
      setError(
        `File too large (max ${MAX_FILE_BYTES / (1024 * 1024)} MB)`
      );
      return;
    }

    if (file.type && !isAllowedMime(file.type)) {
      setError('File type not allowed');
      return;
    }

    setUploading(true);
    setUploadProgress(5);
    setError('');

    try {
      const { ciphertext, fileKeyB64, fileIvB64, size } =
        await encryptFile(file);

      setUploadProgress(40);

      const blob = new Blob([ciphertext], {
        type: 'application/octet-stream',
      });

      const upload = await api.uploadAttachment(
        activeId,
        blob,
        'application/octet-stream',
        (progress) => setUploadProgress(40 + progress * 0.4)
      );

      const attachmentId = upload.data?.id;

      if (!attachmentId) {
        throw new Error('Attachment upload failed');
      }

      const payload = {
        type: 'attachment',
        attachmentId,
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        size,
        fileKeyB64,
        fileIvB64,
      };

      setUploadProgress(90);

      await sendEncryptedPayload(payload, '', {
        attachmentId,
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        size,
        fileKeyB64,
        fileIvB64,
      });

      setUploadProgress(100);
    } catch (e) {
      setError(e.message || 'Attachment failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDownloadAttachment = async (attachment) => {
    const ciphertext = await api.downloadAttachmentCiphertext(
      attachment.attachmentId
    );

    const plaintext = await decryptFile(
      ciphertext,
      attachment.fileKeyB64,
      attachment.fileIvB64
    );

    return new Blob([plaintext], {
      type: attachment.mime || 'application/octet-stream',
    });
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Local logout must still complete.
    }

    disconnectSocket();
    clearSessionCache();
    clearSession();
    navigate('/auth', { replace: true });
  };

  const showSidebar = !activeConversation;

  return (
    <>
      <AppShell
        showSidebar={showSidebar}
        sidebar={
          <Sidebar
            currentUser={me}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filter={filter}
            onFilterChange={setFilter}
            unreadTotal={unreadTotal}
            onNewChat={() => setSearchOpen(true)}
            onNewGroup={() => setGroupOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenFriends={() => setFriendsOpen(true)}
            incomingRequestCount={friendRequests.length}
          >
            <div className="flex items-center gap-2 border-b border-bambi-border px-3 py-2 text-caption text-bambi-text-secondary">
              {connected ? (
                <Wifi className="h-3.5 w-3.5 text-bambi-success" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-bambi-error" />
              )}

              <span>{connected ? 'Connected' : 'Reconnecting…'}</span>

              <Shield
                className={`ml-auto h-3.5 w-3.5 ${
                  cryptoReady
                    ? 'text-bambi-success'
                    : 'text-bambi-text-secondary'
                }`}
              />

              <span>{cryptoReady ? 'E2EE' : 'Keys…'}</span>
            </div>

            {error && (
              <div className="px-3 py-2 text-caption text-bambi-error">
                {error}
              </div>
            )}

            {loadingList ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-bambi-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={MessageSquarePlus}
                title={
                  searchQuery || filter !== 'all'
                    ? 'No results'
                    : 'No conversations'
                }
                description={
                  filter === 'unread'
                    ? 'You have no unread chats.'
                    : filter === 'groups'
                      ? 'You are not in any groups yet.'
                      : 'Find people or create a group to start messaging.'
                }
                action={
                  !searchQuery &&
                  filter === 'all' && (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSearchOpen(true)}
                      >
                        Find people
                      </Button>

                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setGroupOpen(true)}
                      >
                        New group
                      </Button>
                    </div>
                  )
                }
              />
            ) : (
              <div className="flex flex-col gap-0.5 px-1.5 py-1">
                {filtered.map((conversation) => (
                  <ConversationListItem
                    key={conversation.id}
                    conversation={conversation}
                    isActive={sameId(conversation.id, activeId)}
                    onClick={() => openConversation(conversation.id)}
                  />
                ))}
              </div>
            )}
          </Sidebar>
        }
      >
        {activeConversation ? (
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <ConversationHeader
              conversation={{
                ...activeConversation,
                avatarUrl: getAvatarUrl(activeConversation),
                subtitle: typingLabel
                  ? `${typingLabel} is typing…`
                  : undefined,
              }}
              onBack={goBackToChats}
              onOpenInfo={
                isGroup
                  ? () => setGroupInfoOpen(true)
                  : () => setContactOpen(true)
              }
              onSearch={() => setChatSearchOpen(true)}
              onAudioCall={() => startCallWithActive('audio')}
              onVideoCall={() => startCallWithActive('video')}
              callsDisabled={Boolean(callsDisabledReason)}
              callsDisabledReason={callsDisabledReason}
            />

            {chatSearchOpen && (
              <div className="flex shrink-0 items-center gap-2 border-b border-bambi-border bg-bambi-surface px-3 py-2 md:px-5">
                <Search className="h-4 w-4 shrink-0 text-bambi-text-secondary" />

                <input
                  autoFocus
                  type="search"
                  value={chatSearch}
                  onChange={(event) => setChatSearch(event.target.value)}
                  placeholder="Search in this chat"
                  aria-label="Search in this chat"
                  className="min-w-0 flex-1 bg-transparent text-sm text-bambi-text placeholder:text-bambi-text-secondary focus:outline-none"
                />

                {trimmedSearch && (
                  <span className="shrink-0 text-xs text-bambi-text-secondary">
                    {visibleMessages.length} found
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setChatSearchOpen(false);
                    setChatSearch('');
                  }}
                  aria-label="Close search"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-bambi-text-secondary hover:bg-bambi-background"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-hidden">
              <MessageTimeline
                messages={visibleMessages}
                currentUserId={userId}
                isLoading={loadingMessages}
                highlight={trimmedSearch ? chatSearch.trim() : ''}
                emptyLabel={
                  trimmedSearch ? 'No matching messages' : undefined
                }
                onDownloadAttachment={handleDownloadAttachment}
              />
            </div>

            <div className="shrink-0">
              <MessageComposer
                onSend={handleSend}
                onAttach={handleAttach}
                uploading={uploading}
                uploadProgress={uploadProgress}
                disabled={!cryptoReady}
                placeholder={
                  cryptoReady
                    ? 'Type a message'
                    : 'Encryption not ready…'
                }
                onTypingChange={(typing) => {
                  if (activeIdRef.current) {
                    emitTyping(activeIdRef.current, typing);
                  }
                }}
              />
            </div>
          </div>
        ) : (
          <NoConversationSelected />
        )}
      </AppShell>

      <UserSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        friends={friends}
        onStartChat={(id) => {
          openConversation(id);
          loadList();
        }}
      />

      <FriendsPanel
        open={friendsOpen}
        initialTab={friendRequests.length ? 'requests' : 'friends'}
        onRequestsChanged={loadList}
        onClose={() => setFriendsOpen(false)}
        onOpenSearch={() => {
          setFriendsOpen(false);
          setSearchOpen(true);
        }}
        onStartChat={(id) => {
          openConversation(id);
          loadList();
        }}
      />

      <SettingsPanel
        open={settingsOpen}
        currentUser={me}
        onClose={() => setSettingsOpen(false)}
        onLogout={handleLogout}
        onProfileUpdated={(profile) => {
          setMe((current) => ({ ...current, ...profile }));
        }}
      />

      <CreateGroupDialog
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        onCreated={handleGroupCreated}
      />

      <ContactInfoPanel
        open={contactOpen && !isGroup}
        conversation={activeConversation}
        messages={messages}
        onClose={() => setContactOpen(false)}
        onAudioCall={() => startCallWithActive('audio')}
        onVideoCall={() => startCallWithActive('video')}
        onSearch={() => setChatSearchOpen(true)}
        onDownloadAttachment={handleDownloadAttachment}
        onBlocked={() => {
          goBackToChats();
          loadList();
        }}
        callsDisabled={Boolean(callsDisabledReason)}
        callsDisabledReason={callsDisabledReason}
      />

      <CallOverlay
        call={calls.call}
        notice={calls.notice}
        onDismissNotice={calls.dismissNotice}
        onAccept={calls.acceptCall}
        onReject={calls.rejectCall}
        onHangUp={calls.hangUp}
        onToggleMute={calls.toggleMute}
        onToggleCamera={calls.toggleCamera}
      />

      <GroupInfoPanel
        open={groupInfoOpen}
        conversationId={activeId}
        onClose={() => setGroupInfoOpen(false)}
        onChanged={(info) => {
          if (info?.left) {
            goBackToChats();
          }

          loadList();
        }}
      />
    </>
  );
}
