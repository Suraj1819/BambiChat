import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { getPreferences } from '@/lib/preferences';

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function useElapsed(startedAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
}

function MediaElement({ as: Tag, stream, muted, className, mirrored }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream || null;
    const sink = getPreferences().speakerId;
    if (!muted && sink && typeof el.setSinkId === 'function') el.setSinkId(sink).catch(() => {});
  }, [stream, muted]);
  return (
    <Tag
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={cn(className, mirrored && '-scale-x-100')}
    />
  );
}

function RoundButton({ label, onClick, active, danger, success, children, size = 'md' }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={typeof active === 'boolean' ? active : undefined}
        className={cn(
          'flex items-center justify-center rounded-full text-white transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
          size === 'lg' ? 'h-16 w-16' : 'h-14 w-14',
          danger && 'bg-[#e5484d] hover:bg-[#d13a3f]',
          success && 'bg-[#22a06b] hover:bg-[#1c8b5c]',
          !danger && !success && (active ? 'bg-white text-[#17181f]' : 'bg-white/15 hover:bg-white/25')
        )}
      >
        {children}
      </button>
      <span className="text-xs text-white/75">{label}</span>
    </div>
  );
}

export function CallOverlay({ call, notice, onDismissNotice, onAccept, onReject, onHangUp, onToggleMute, onToggleCamera }) {
  const elapsed = useElapsed(call.startedAt);
  const acceptRef = useRef(null);

  useEffect(() => {
    if (call.status === 'incoming') acceptRef.current?.focus();
  }, [call.status]);

  const toast = notice ? (
    <div
      role="status"
      className="fixed left-1/2 top-4 z-[100] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full bg-[#20212a] px-4 py-2.5 text-sm text-white shadow-xl"
      style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <Info className="h-4 w-4 shrink-0 text-[#b6aaff]" />
      <span className="min-w-0">{notice}</span>
      <button type="button" onClick={onDismissNotice} className="shrink-0 text-xs font-medium text-[#b6aaff]">Dismiss</button>
    </div>
  ) : null;

  if (call.status === 'idle') return toast;

  const { peer, kind, status } = call;
  const isVideo = kind === 'video';
  const hasRemoteVideo = isVideo && call.remoteStream?.getVideoTracks().length > 0;
  const incoming = status === 'incoming';

  const statusText = incoming
    ? `Incoming ${kind} call`
    : status === 'outgoing'
      ? 'Calling…'
      : status === 'connecting'
        ? 'Connecting…'
        : formatDuration(elapsed);

  return (
    <>
      {toast}
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${incoming ? 'Incoming' : 'Ongoing'} ${kind} call with ${peer?.name}`}
        className="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-[#14121f] text-white"
      >
        {/* Remote video fills the screen once flowing */}
        {hasRemoteVideo && status === 'active' && (
          <MediaElement as="video" stream={call.remoteStream} className="absolute inset-0 h-full w-full object-cover" />
        )}
        {/* Audio-only (or before video arrives): play remote audio */}
        {!hasRemoteVideo && call.remoteStream && (
          <MediaElement as="audio" stream={call.remoteStream} className="sr-only" />
        )}
        {hasRemoteVideo && status !== 'active' && (
          <MediaElement as="audio" stream={call.remoteStream} className="sr-only" />
        )}

        <div
          className={cn(
            'pointer-events-none absolute inset-0',
            hasRemoteVideo && status === 'active'
              ? 'bg-gradient-to-b from-black/55 via-transparent to-black/70'
              : 'bg-[radial-gradient(ellipse_at_50%_20%,rgba(105,71,245,0.35),transparent_60%)]'
          )}
        />

        <div className="relative flex flex-1 flex-col items-center px-6 pt-[max(3rem,env(safe-area-inset-top))]">
          {(!hasRemoteVideo || status !== 'active') && (
            <div className="mt-[10vh] flex flex-col items-center text-center">
              <div className="relative">
                {(status === 'outgoing' || incoming) && (
                  <span className="absolute inset-0 -m-3 animate-ping rounded-full bg-[#6947f5]/30 motion-reduce:hidden" />
                )}
                <div className="relative scale-[2.2] py-10"><Avatar src={peer?.avatarUrl} name={peer?.name} size="xl" /></div>
              </div>
              <h2 className="mt-6 max-w-[80vw] truncate text-2xl font-semibold">{peer?.name}</h2>
              <p className="mt-1 text-sm text-white/70" aria-live="polite">{statusText}</p>
            </div>
          )}
          {hasRemoteVideo && status === 'active' && (
            <div className="text-center">
              <h2 className="max-w-[80vw] truncate text-lg font-semibold drop-shadow">{peer?.name}</h2>
              <p className="text-sm text-white/80 drop-shadow" aria-live="off">{statusText}</p>
            </div>
          )}

          {/* Local preview */}
          {isVideo && !incoming && call.localStream && (
            <div className="absolute bottom-4 right-4 h-36 w-24 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-xl sm:h-44 sm:w-32">
              {call.cameraOff ? (
                <div className="flex h-full w-full items-center justify-center text-white/60"><VideoOff className="h-6 w-6" /></div>
              ) : (
                <MediaElement as="video" stream={call.localStream} muted mirrored className="h-full w-full object-cover" />
              )}
            </div>
          )}
        </div>

        <div className="relative flex items-end justify-center gap-6 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
          {incoming ? (
            <>
              <RoundButton label="Decline" danger size="lg" onClick={() => onReject('declined')}><PhoneOff className="h-6 w-6" /></RoundButton>
              <div className="flex flex-col items-center gap-2">
                <button
                  ref={acceptRef}
                  type="button"
                  onClick={onAccept}
                  aria-label="Accept"
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-[#22a06b] text-white transition hover:bg-[#1c8b5c] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  {isVideo ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
                </button>
                <span className="text-xs text-white/75">Accept</span>
              </div>
            </>
          ) : (
            <>
              <RoundButton label={call.muted ? 'Unmute' : 'Mute'} active={call.muted} onClick={onToggleMute}>
                {call.muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </RoundButton>
              {isVideo && (
                <RoundButton label={call.cameraOff ? 'Camera on' : 'Camera off'} active={call.cameraOff} onClick={onToggleCamera}>
                  {call.cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                </RoundButton>
              )}
              <RoundButton label={status === 'outgoing' ? 'Cancel' : 'End'} danger onClick={onHangUp}>
                <PhoneOff className="h-6 w-6" />
              </RoundButton>
            </>
          )}
        </div>
      </section>
    </>
  );
}
