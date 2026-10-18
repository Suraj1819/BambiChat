/**
 * One-to-one audio/video calling over WebRTC.
 * Signalling travels through the existing authenticated Socket.IO connection.
 * Media is peer-to-peer (DTLS-SRTP encrypted by WebRTC); the server only relays signals.
 *
 * Client -> server events          Server -> client events
 *   call:invite  (ack)               call:incoming   (from call:invite)
 *   call:accept                      call:accepted
 *   call:reject                      call:rejected
 *   call:end                         call:ended
 *   call:signal                      call:signal
 * See server/calls.socket.js for the relay.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getPreferences } from '@/lib/preferences';
import { startRingtone, stopRingtone } from './ringtone';

const RING_TIMEOUT_MS = 45_000;
const DISCONNECT_GRACE_MS = 8_000;

export const IDLE_CALL = {
  status: 'idle', // idle | outgoing | incoming | connecting | active
  callId: null,
  kind: 'audio', // audio | video
  peer: null, // { id, name, avatarUrl }
  conversationId: null,
  muted: false,
  cameraOff: false,
  localStream: null,
  remoteStream: null,
  startedAt: null,
};

function iceServers() {
  try {
    const raw = import.meta.env.VITE_ICE_SERVERS;
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to default */ }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

function newCallId() {
  return globalThis.crypto?.randomUUID?.() || `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mediaErrorMessage(err, kind) {
  const device = kind === 'video' ? 'camera and microphone' : 'microphone';
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Calls need a secure (HTTPS) connection and a supported browser.';
  }
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `Allow ${device} access in your browser to make calls.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `No ${device} found. Check your device settings.`;
    case 'NotReadableError':
      return `Your ${device} is being used by another app.`;
    default:
      return `Could not access your ${device}.`;
  }
}

async function getMedia(kind) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error('unsupported');
    err.name = 'SecurityError';
    throw err;
  }
  const p = getPreferences();
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: p.micId ? { exact: p.micId } : undefined,
      echoCancellation: p.echoCancellation,
      noiseSuppression: p.noiseSuppression,
      autoGainControl: true,
    },
    video:
      kind === 'video'
        ? {
            deviceId: p.cameraId ? { exact: p.cameraId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          }
        : false,
  });
}

export function useCall({ resolvePeer } = {}) {
  const [call, setCall] = useState(IDLE_CALL);
  const [notice, setNotice] = useState('');

  const callRef = useRef(IDLE_CALL);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localRef = useRef(null);
  const pendingCandidates = useRef([]);
  const ringTimer = useRef(null);
  const graceTimer = useRef(null);
  const noticeTimer = useRef(null);
  const resolvePeerRef = useRef(resolvePeer);
  resolvePeerRef.current = resolvePeer;

  const update = useCallback((patch) => {
    callRef.current = { ...callRef.current, ...patch };
    setCall(callRef.current);
  }, []);

  const showNotice = useCallback((text) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    if (text) noticeTimer.current = window.setTimeout(() => setNotice(''), 4500);
  }, []);

  const emit = useCallback((event, payload, ack) => {
    socketRef.current?.emit(event, payload, ack);
  }, []);

  const teardown = useCallback((message) => {
    window.clearTimeout(ringTimer.current);
    window.clearTimeout(graceTimer.current);
    stopRingtone();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingCandidates.current = [];
    callRef.current = IDLE_CALL;
    setCall(IDLE_CALL);
    if (message) showNotice(message);
  }, [showNotice]);

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const c = callRef.current;
      emit('call:signal', {
        callId: c.callId,
        toUserId: c.peer?.id,
        data: { type: 'candidate', candidate: e.candidate.toJSON() },
      });
    };

    pc.ontrack = (e) => {
      const stream = e.streams?.[0];
      if (stream && callRef.current.remoteStream !== stream) update({ remoteStream: stream });
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        window.clearTimeout(graceTimer.current);
        if (callRef.current.status !== 'active') update({ status: 'active', startedAt: Date.now() });
      } else if (state === 'disconnected') {
        window.clearTimeout(graceTimer.current);
        graceTimer.current = window.setTimeout(() => {
          if (pcRef.current?.connectionState !== 'connected') {
            const c = callRef.current;
            emit('call:end', { callId: c.callId, toUserId: c.peer?.id });
            teardown('Connection lost');
          }
        }, DISCONNECT_GRACE_MS);
      } else if (state === 'failed') {
        const c = callRef.current;
        emit('call:end', { callId: c.callId, toUserId: c.peer?.id });
        teardown('Could not connect the call. Both people may need a TURN server on restrictive networks.');
      }
    };

    localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current));
    return pc;
  }, [emit, teardown, update]);

  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;
    const queued = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); } catch { /* stale candidate */ }
    }
  }, []);

  /* ---------- Public actions ---------- */

  const startCall = useCallback(async ({ peer, conversationId, kind }) => {
    if (callRef.current.status !== 'idle') return;
    if (!socketRef.current?.connected) {
      showNotice('You are offline. Reconnect to place a call.');
      return;
    }
    let stream;
    try {
      stream = await getMedia(kind);
    } catch (err) {
      showNotice(mediaErrorMessage(err, kind));
      return;
    }
    // Another call may have arrived while the permission prompt was open.
    if (callRef.current.status !== 'idle') {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    localRef.current = stream;
    const callId = newCallId();
    update({ ...IDLE_CALL, status: 'outgoing', callId, kind, peer, conversationId, localStream: stream });

    emit('call:invite', { callId, toUserId: peer.id, conversationId, kind }, (res) => {
      if (res?.error && callRef.current.callId === callId) {
        teardown(res.error.message || 'Could not place the call.');
      }
    });
    ringTimer.current = window.setTimeout(() => {
      if (callRef.current.callId === callId && callRef.current.status === 'outgoing') {
        emit('call:end', { callId, toUserId: peer.id });
        teardown('No answer');
      }
    }, RING_TIMEOUT_MS);
  }, [emit, showNotice, teardown, update]);

  const acceptCall = useCallback(async () => {
    const c = callRef.current;
    if (c.status !== 'incoming') return;
    stopRingtone();
    window.clearTimeout(ringTimer.current);
    let stream;
    try {
      stream = await getMedia(c.kind);
    } catch (err) {
      emit('call:reject', { callId: c.callId, toUserId: c.peer.id, reason: 'media' });
      teardown(mediaErrorMessage(err, c.kind));
      return;
    }
    if (callRef.current.callId !== c.callId) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    localRef.current = stream;
    update({ status: 'connecting', localStream: stream });
    createPeer();
    emit('call:accept', { callId: c.callId, toUserId: c.peer.id });
  }, [createPeer, emit, teardown, update]);

  const rejectCall = useCallback((reason = 'declined') => {
    const c = callRef.current;
    if (c.status !== 'incoming') return;
    emit('call:reject', { callId: c.callId, toUserId: c.peer?.id, reason });
    teardown();
  }, [emit, teardown]);

  const hangUp = useCallback(() => {
    const c = callRef.current;
    if (c.status === 'idle') return;
    emit('call:end', { callId: c.callId, toUserId: c.peer?.id });
    teardown();
  }, [emit, teardown]);

  const toggleMute = useCallback(() => {
    const next = !callRef.current.muted;
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    update({ muted: next });
  }, [update]);

  const toggleCamera = useCallback(() => {
    if (callRef.current.kind !== 'video') return;
    const next = !callRef.current.cameraOff;
    localRef.current?.getVideoTracks().forEach((t) => { t.enabled = !next; });
    update({ cameraOff: next });
  }, [update]);

  /* ---------- Socket wiring ---------- */

  const attach = useCallback((socket) => {
    socketRef.current = socket;

    const onIncoming = (p) => {
      if (!p?.callId || !p.fromUserId) return;
      if (callRef.current.status !== 'idle') {
        socket.emit('call:reject', { callId: p.callId, toUserId: p.fromUserId, reason: 'busy' });
        return;
      }
      const resolved = resolvePeerRef.current?.(p.fromUserId, p) || {};
      const peer = {
        id: p.fromUserId,
        name: resolved.name || p.peer?.displayName || p.peer?.username || 'Unknown caller',
        avatarUrl: resolved.avatarUrl || p.peer?.avatarUrl,
      };
      const kind = p.kind === 'video' ? 'video' : 'audio';
      update({ ...IDLE_CALL, status: 'incoming', callId: p.callId, kind, peer, conversationId: p.conversationId });
      if (getPreferences().ringtone) startRingtone();
      if (
        document.hidden &&
        getPreferences().browserNotifications &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try { new Notification(peer.name, { body: `Incoming ${kind} call`, tag: p.callId }); } catch { /* ignore */ }
      }
      ringTimer.current = window.setTimeout(() => {
        if (callRef.current.callId === p.callId && callRef.current.status === 'incoming') {
          teardown(`Missed ${kind} call from ${peer.name}`);
        }
      }, RING_TIMEOUT_MS);
    };

    const onAccepted = async (p) => {
      const c = callRef.current;
      if (c.callId !== p?.callId || c.status !== 'outgoing') return;
      window.clearTimeout(ringTimer.current);
      update({ status: 'connecting' });
      try {
        const pc = createPeer();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        emit('call:signal', {
          callId: c.callId,
          toUserId: c.peer.id,
          data: { type: 'offer', sdp: { type: offer.type, sdp: offer.sdp } },
        });
      } catch {
        emit('call:end', { callId: c.callId, toUserId: c.peer.id });
        teardown('Could not start the call.');
      }
    };

    const onSignal = async (p) => {
      const c = callRef.current;
      if (!p || c.callId !== p.callId || p.fromUserId !== c.peer?.id) return;
      const pc = pcRef.current;
      const data = p.data || {};
      try {
        if (data.type === 'offer' && pc) {
          await pc.setRemoteDescription(data.sdp);
          await flushCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          emit('call:signal', {
            callId: c.callId,
            toUserId: c.peer.id,
            data: { type: 'answer', sdp: { type: answer.type, sdp: answer.sdp } },
          });
        } else if (data.type === 'answer' && pc) {
          await pc.setRemoteDescription(data.sdp);
          await flushCandidates();
        } else if (data.type === 'candidate' && data.candidate) {
          if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
          else pendingCandidates.current.push(data.candidate);
        }
      } catch {
        emit('call:end', { callId: c.callId, toUserId: c.peer.id });
        teardown('Call setup failed.');
      }
    };

    const onRejected = (p) => {
      if (callRef.current.callId !== p?.callId) return;
      const name = callRef.current.peer?.name || 'They';
      teardown(p.reason === 'busy' ? `${name} is on another call` : `${name} declined the call`);
    };

    const onEnded = (p) => {
      const c = callRef.current;
      if (c.callId !== p?.callId) return;
      teardown(c.status === 'incoming' ? `Missed ${c.kind} call from ${c.peer?.name || 'caller'}` : 'Call ended');
    };

    const onDisconnect = () => {
      const s = callRef.current.status;
      if (s === 'outgoing' || s === 'incoming') teardown('Connection lost');
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:signal', onSignal);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:signal', onSignal);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
      socket.off('disconnect', onDisconnect);
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [createPeer, emit, flushCandidates, teardown, update]);

  // Leave cleanly if the tab closes mid-call.
  useEffect(() => {
    const onUnload = () => {
      const c = callRef.current;
      if (c.status !== 'idle') emit('call:end', { callId: c.callId, toUserId: c.peer?.id });
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.clearTimeout(noticeTimer.current);
      teardown();
    };
  }, [emit, teardown]);

  return {
    call,
    notice,
    dismissNotice: () => showNotice(''),
    attach,
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleMute,
    toggleCamera,
  };
}
