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
import { MessageSquarePlus, Loader2, Shield, Wifi, WifiOff } from 'lucide-react';
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

  const peerKeyCache = useRef(new Map());
  const activeIdRef = useRef(null);
  const conversationsRef = useRef([]);
  activeIdRef.current = activeId;
  conversationsRef.current = conversations;

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

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const [meRes, convRes, friendsRes, requestsRes] = await Promise.all([
        api.me(),
        api.listConversations(),
        api.listFriends(),
        api.listFriendRequests(),
      ]);
      const localProfile = (() => {
        try {
          return JSON.parse(localStorage.getItem(`bambi-profile-${meRes.data?.id}`) || '{}');
        } catch {
          return {};
        }
      })();
      setMe({ ...meRes.data, ...localProfile });
      setConversations(convRes.data || []);
      setFriends(friendsRes.data || []);
      setFriendRequests(requestsRes.data?.incoming || []);
    } catch (e) {
      if (e.status === 401) {
        clearSession();
        navigate('/auth', { replace: true });
        return;
      }
      setError(e.message || 'Failed to load');
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
        if (active) setFriendRequests(result.data?.incoming || []);
      } catch {
        // Keep the last known request count if a background refresh fails.
      }
    };
    const intervalId = window.setInterval(refreshRequests, 30000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [userId]);

  async function resolvePeerPub(peerForKey) {
    let peerPub = peerKeyCache.current.get(peerForKey);
    if (!peerPub && peerForKey) {
      const res = await api.getIdentityKey(peerForKey);
      peerPub = res.data?.publicKeyB64;
      if (peerPub) peerKeyCache.current.set(peerForKey, peerPub);
    }
    return peerPub;
  }

  async function decryptRawMessage(m, conv) {
    const isGroup = conv?.isGroup || conv?.type === 'group';
    const peerId = conv?.peerUserId;

    // Group messages use group AES key
    if (isGroup || m.protocolVersion === 'bambi-e2ee-v1-group') {
      // First try: may be key distribution wrapped as pairwise ciphertext in older path
      // Primary: group ciphertext
      let plain;
      const gk = await loadGroupKey(m.conversationId || conv?.id);
      if (gk?.key) {
        const aad = `${m.conversationId || conv?.id}|${m.senderId}|${m.clientMessageId}`;
        plain = await decryptGroupMessage(gk.key, m.ciphertext, aad);
      } else {
        // Attempt pairwise decrypt for key-dist bootstrap
        try {
          const peerForKey = m.senderId === userId ? null : m.senderId;
          if (peerForKey) {
            const peerPub = await resolvePeerPub(peerForKey);
            plain = await decryptIncoming({
              localUserId: userId,
              peerUserId: peerForKey,
              peerPublicKeyB64: peerPub,
              conversationId: m.conversationId || conv?.id,
              clientMessageId: m.clientMessageId,
              senderId: m.senderId,
              ciphertext: m.ciphertext,
            });
          } else {
            plain = '[no group key yet]';
          }
        } catch {
          plain = '[no group key yet]';
        }
      }

      const parsed = parseDecryptedBody(plain);
      if (parsed.keyDist && parsed.keyDist.wrapped) {
        // Find our wrap
        const mine = (parsed.keyDist.wrapped || []).find((w) => w.userId === userId);
        if (mine && m.senderId !== userId) {
          try {
            const senderPub = await resolvePeerPub(m.senderId);
            const keyB64 = await unwrapGroupKeyFromMember(
              userId,
              m.senderId,
              senderPub,
              mine
            );
            await saveGroupKey(
              m.conversationId || conv?.id,
              keyB64,
              parsed.keyDist.epoch || 1
            );
          } catch {
            /* ignore */
          }
        }
        return {
          id: m.id,
          clientMessageId: m.clientMessageId,
          senderId: m.senderId,
          body: 'Group key updated',
          createdAt: m.createdAt,
          status: m.status,
          encrypted: true,
          system: true,
        };
      }

      return {
        id: m.id,
        clientMessageId: m.clientMessageId,
        senderId: m.senderId,
        body: parsed.body,
        attachment: parsed.attachment,
        createdAt: m.createdAt,
        status: m.status,
        encrypted: true,
      };
    }

    // Direct message path
    const peerForKey = m.senderId === userId ? peerId : m.senderId;
    const peerPub = await resolvePeerPub(peerForKey);
    const plain = await decryptIncoming({
      localUserId: userId,
      peerUserId: peerForKey,
      peerPublicKeyB64: peerPub,
      conversationId: m.conversationId || activeIdRef.current,
      clientMessageId: m.clientMessageId,
      senderId: m.senderId,
      ciphertext: m.ciphertext,
    });
    const { body, attachment } = parseDecryptedBody(plain);
    return {
      id: m.id,
      clientMessageId: m.clientMessageId,
      senderId: m.senderId,
      body,
      attachment,
      createdAt: m.createdAt,
      status: m.status,
      encrypted: true,
    };
  }

  useEffect(() => {
    if (!userId) {
      navigate('/auth', { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      await initCrypto(userId);
      if (cancelled) return;
      await loadList();
      if (cancelled) return;

      const s = connectSocket();
      if (!s) return;

      const onConnect = () => setConnected(true);
      const onDisconnect = () => setConnected(false);
      s.on('connect', onConnect);
      s.on('disconnect', onDisconnect);
      s.on('connection:ready', () => setConnected(true));
      if (s.connected) setConnected(true);

      s.on('message:new', async ({ message: m }) => {
        if (!m) return;
        if (m.senderId !== userId) emitDelivered(m.conversationId, m.id);
        if (m.conversationId !== activeIdRef.current) {
          loadList();
          return;
        }
        const conv = conversationsRef.current.find((c) => c.id === m.conversationId);
        try {
          const dec = await decryptRawMessage(m, conv);
          setMessages((prev) => {
            if (prev.some((x) => x.id === dec.id || x.clientMessageId === dec.clientMessageId)) {
              return prev.map((x) =>
                x.clientMessageId === dec.clientMessageId || x.id === dec.id ? dec : x
              );
            }
            return [...prev, dec];
          });
        } catch {
          /* ignore */
        }
        loadList();
      });

      s.on('message:notify', () => loadList());
      s.on('message:receipt', ({ messageId, status }) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, status } : m))
        );
      });
      s.on('typing:update', ({ conversationId, userId: uid, username, typing }) => {
        if (conversationId !== activeIdRef.current || uid === userId) return;
        setTypingUsers((prev) => {
          const next = { ...prev };
          if (typing) next[uid] = username;
          else delete next[uid];
          return next;
        });
      });
      s.on('presence:update', ({ userId: uid, status }) => {
        setConversations((prev) =>
          prev.map((c) =>
            c.peerUserId === uid ? { ...c, isOnline: status === 'online' } : c
          )
        );
      });
    })();

    return () => {
      cancelled = true;
      disconnectSocket();
    };
  }, [userId, initCrypto, loadList, navigate]);

  useEffect(() => {
    if (!activeId || !userId) {
      setMessages([]);
      setTypingUsers({});
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingMessages(true);
      await joinConversation(activeId);
      try {
        const res = await api.getMessages(activeId);
        const raw = res.data || [];
        const conv = conversationsRef.current.find((c) => c.id === activeId);
        const decrypted = [];
        const toAck = [];
        for (const m of raw) {
          try {
            decrypted.push(await decryptRawMessage({ ...m, conversationId: activeId }, conv));
          } catch {
            decrypted.push({
              id: m.id,
              senderId: m.senderId,
              body: '[decryption failed]',
              createdAt: m.createdAt,
              status: m.status,
              encrypted: true,
            });
          }
          if (m.senderId !== userId) toAck.push(m.id);
        }
        if (!cancelled) {
          setMessages(decrypted);
          if (toAck.length) {
            toAck.forEach((id) => emitDelivered(activeId, id));
            emitRead(activeId, toAck);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();
    return () => {
      cancelled = true;
      leaveConversation(activeId);
    };
  }, [activeId, userId]);

  const filtered = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    return c.name?.toLowerCase().includes(searchQuery.toLowerCase());
  });
  const activeConversation = conversations.find((c) => c.id === activeId);
  const isGroup = activeConversation?.isGroup || activeConversation?.type === 'group';
  const typingLabel = Object.values(typingUsers).join(', ');

  async function distributeGroupKey(conversationId, memberIds, groupKeyB64, epoch = 1) {
    const wrapped = [];
    for (const mid of memberIds) {
      if (mid === userId) continue;
      try {
        const pub = await resolvePeerPub(mid);
        if (!pub) continue;
        const w = await wrapGroupKeyForMember(userId, mid, pub, groupKeyB64);
        wrapped.push(w);
      } catch {
        /* skip member without keys */
      }
    }
    const payload = {
      type: 'group_key_dist',
      epoch,
      wrapped,
    };
    // Also encrypt for each member as pairwise so they can bootstrap without group key
    // Send one group-encrypted message if we already have key, plus pairwise to each
    for (const mid of memberIds) {
      if (mid === userId) continue;
      try {
        const pub = await resolvePeerPub(mid);
        if (!pub) continue;
        const cmId = clientMsgId();
        const plain = JSON.stringify(payload);
        // Fake a temporary DM-style envelope using pairwise to deliver key
        // Store as message in group conversation with pairwise ciphertext marked for that bootstrap
        const encrypted = await encryptOutgoing({
          localUserId: userId,
          peerUserId: mid,
          peerPublicKeyB64: pub,
          conversationId,
          clientMessageId: cmId,
          plaintext: plain,
        });
        const body = {
          conversationId,
          ciphertext: encrypted.ciphertext,
          protocolVersion: encrypted.protocolVersion,
          clientMessageId: cmId,
          senderDeviceId: 1,
          messageType: 'key_exchange',
        };
        if (getSocket()?.connected) {
          await socketSendMessage(body);
        } else {
          await api.sendEncryptedMessage(conversationId, body);
        }
      } catch {
        /* continue */
      }
    }
  }

  const handleGroupCreated = async (group) => {
    try {
      const { keyB64 } = await generateGroupKey();
      await saveGroupKey(group.id, keyB64, 1);
      const memberIds = (group.members || []).map((m) => m.userId);
      await distributeGroupKey(group.id, memberIds, keyB64, 1);
      await loadList();
      setActiveId(group.id);
    } catch (e) {
      setError(e.message);
      await loadList();
      setActiveId(group.id);
    }
  };

  const sendEncryptedPayload = async (plaintextObj, optimisticBody, optimisticAttachment) => {
    const conv = conversations.find((c) => c.id === activeId);
    const cmId = clientMsgId();
    const optimistic = {
      id: `local-${cmId}`,
      clientMessageId: cmId,
      senderId: userId,
      body: optimisticBody,
      attachment: optimisticAttachment,
      createdAt: new Date().toISOString(),
      status: 'sending',
      encrypted: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    const plain =
      typeof plaintextObj === 'string' ? plaintextObj : JSON.stringify(plaintextObj);

    let payload;
    if (conv?.isGroup || conv?.type === 'group') {
      let gk = await loadGroupKey(activeId);
      if (!gk) {
        // Create key if missing (creator offline case)
        const gen = await generateGroupKey();
        await saveGroupKey(activeId, gen.keyB64, 1);
        gk = await loadGroupKey(activeId);
      }
      const aad = `${activeId}|${userId}|${cmId}`;
      const enc = await encryptGroupMessage(gk.key, plain, aad);
      payload = {
        conversationId: activeId,
        ciphertext: enc.ciphertext,
        protocolVersion: enc.protocolVersion,
        clientMessageId: cmId,
        senderDeviceId: 1,
        messageType: optimisticAttachment ? 'attachment' : 'text',
      };
    } else {
      const peerId = conv?.peerUserId;
      if (!peerId) throw new Error('Cannot determine peer for encryption');
      const peerPub = await resolvePeerPub(peerId);
      if (!peerPub) throw new Error('Peer has not published encryption keys yet');
      const encrypted = await encryptOutgoing({
        localUserId: userId,
        peerUserId: peerId,
        peerPublicKeyB64: peerPub,
        conversationId: activeId,
        clientMessageId: cmId,
        plaintext: plain,
      });
      payload = {
        conversationId: activeId,
        ciphertext: encrypted.ciphertext,
        protocolVersion: encrypted.protocolVersion,
        clientMessageId: encrypted.clientMessageId,
        senderDeviceId: 1,
        messageType: optimisticAttachment ? 'attachment' : 'text',
      };
    }

    let saved;
    if (getSocket()?.connected) {
      saved = await socketSendMessage(payload);
    } else {
      const res = await api.sendEncryptedMessage(activeId, payload);
      saved = res.data;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.clientMessageId === cmId ? { ...m, id: saved.id, status: 'sent' } : m
      )
    );
    loadList();
  };

  const handleSend = async (text) => {
    if (!activeId || !cryptoReady || !userId) return;
    emitTyping(activeId, false);
    try {
      await sendEncryptedPayload(text, text, null);
    } catch (e) {
      setError(e.message);
      setMessages((prev) =>
        prev.map((m) => (m.status === 'sending' ? { ...m, status: 'failed' } : m))
      );
    }
  };

  const handleAttach = async (file) => {
    if (!activeId || !cryptoReady || !userId) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`File too large (max ${MAX_FILE_BYTES / (1024 * 1024)} MB)`);
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
      const { ciphertext, fileKeyB64, fileIvB64, size } = await encryptFile(file);
      setUploadProgress(40);
      const blob = new Blob([ciphertext], { type: 'application/octet-stream' });
      const up = await api.uploadAttachment(activeId, blob, 'application/octet-stream', (p) =>
        setUploadProgress(40 + p * 0.4)
      );
      const attachmentId = up.data?.id;
      if (!attachmentId) throw new Error('Upload failed');
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
        mime: file.type,
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
    const buf = await api.downloadAttachmentCiphertext(attachment.attachmentId);
    const plain = await decryptFile(buf, attachment.fileKeyB64, attachment.fileIvB64);
    return new Blob([plain], { type: attachment.mime || 'application/octet-stream' });
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    disconnectSocket();
    clearSessionCache();
    clearSession();
    navigate('/auth', { replace: true });
  };

  const showSidebar = !activeId;

  return (
    <>
      <AppShell
        showSidebar={showSidebar}
        sidebar={
          <Sidebar
            currentUser={me}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
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
                  cryptoReady ? 'text-bambi-success' : 'text-bambi-text-secondary'
                }`}
              />
              <span>{cryptoReady ? 'E2EE' : 'Keys…'}</span>
            </div>

            {error && <p className="px-3 py-2 text-caption text-bambi-error">{error}</p>}

            {loadingList ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-bambi-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={MessageSquarePlus}
                title={searchQuery ? 'No results' : 'No conversations'}
                description="Find people or create a group to start messaging."
                action={
                  !searchQuery && (
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setSearchOpen(true)}>
                        Find people
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => setGroupOpen(true)}>
                        New group
                      </Button>
                    </div>
                  )
                }
              />
            ) : (
              <div className="flex flex-col gap-0.5 px-1.5 py-1">
                {filtered.map((conv) => (
                  <ConversationListItem
                    key={conv.id}
                    conversation={conv}
                    isActive={conv.id === activeId}
                    onClick={() => setActiveId(conv.id)}
                  />
                ))}
              </div>
            )}
          </Sidebar>
        }
      >
        {activeConversation ? (
          <>
            <ConversationHeader
              conversation={{
                ...activeConversation,
                subtitle: typingLabel
                  ? `${typingLabel} is typing…`
                  : cryptoReady
                    ? isGroup
                      ? 'Group · End-to-end encrypted'
                      : 'End-to-end encrypted'
                    : undefined,
              }}
              onBack={() => setActiveId(null)}
              onMore={isGroup ? () => setGroupInfoOpen(true) : undefined}
            />
            <MessageTimeline
              messages={messages}
              currentUserId={userId}
              isLoading={loadingMessages}
              onDownloadAttachment={handleDownloadAttachment}
            />
            <MessageComposer
              onSend={handleSend}
              onAttach={handleAttach}
              uploading={uploading}
              uploadProgress={uploadProgress}
              disabled={!cryptoReady}
              placeholder={cryptoReady ? 'Type a message' : 'Encryption not ready…'}
              onTypingChange={(typing) => emitTyping(activeId, typing)}
            />
          </>
        ) : (
          <NoConversationSelected />
        )}
      </AppShell>

      <UserSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        friends={friends}
        onStartChat={(id) => {
          setActiveId(id);
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
          setActiveId(id);
          loadList();
        }}
      />
      <SettingsPanel
        open={settingsOpen}
        currentUser={me}
        onClose={() => setSettingsOpen(false)}
        onLogout={handleLogout}
        onProfileUpdated={(profile) => setMe((current) => ({ ...current, ...profile }))}
      />
      <CreateGroupDialog
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        onCreated={handleGroupCreated}
      />
      <GroupInfoPanel
        open={groupInfoOpen}
        conversationId={activeId}
        onClose={() => setGroupInfoOpen(false)}
        onChanged={(info) => {
          if (info?.left) setActiveId(null);
          loadList();
        }}
      />
    </>
  );
}
