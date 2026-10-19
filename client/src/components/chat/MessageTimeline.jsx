import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowDown, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from '@/components/ui/EmptyState';
import { resolveWallpaper, wallpaperStyle } from '@/lib/wallpaper';

function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

export function MessageTimeline({
  messages = [],
  currentUserId,
  isLoading = false,
  isLoadingOlder = false,
  hasMoreOlder = false,
  onLoadOlder,
  highlight = '',
  emptyLabel,
  onDownloadAttachment,
  conversationId,
  isGroup = false,
  memberMap = {},
  className,
}) {
  const containerRef = useRef(null);
  const bottomRef = useRef(null);
  const [showLatest, setShowLatest] = useState(false);
  const wasNearBottom = useRef(true);
  const prevScrollHeight = useRef(0);
  const prevFirstId = useRef(null);
  const loadingLock = useRef(false);
  const [wallStyle, setWallStyle] = useState(() =>
    wallpaperStyle(resolveWallpaper(conversationId))
  );

  useEffect(() => {
    const apply = () => setWallStyle(wallpaperStyle(resolveWallpaper(conversationId)));
    apply();
    const onChange = () => apply();
    window.addEventListener('bambi-wallpaper-change', onChange);
    return () => window.removeEventListener('bambi-wallpaper-change', onChange);
  }, [conversationId]);

  useEffect(() => {
    wasNearBottom.current = true;
    prevFirstId.current = null;
    prevScrollHeight.current = 0;
    loadingLock.current = false;
    setShowLatest(false);
  }, [conversationId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const firstId = messages[0]?.id || messages[0]?.clientMessageId || null;
    const prepended =
      firstId &&
      prevFirstId.current &&
      firstId !== prevFirstId.current &&
      messages.length > 0;

    if (prepended && prevScrollHeight.current > 0) {
      const delta = container.scrollHeight - prevScrollHeight.current;
      container.scrollTop += delta;
    } else if (wasNearBottom.current) {
      container.scrollTop = container.scrollHeight;
      setShowLatest(false);
    } else {
      setShowLatest(true);
    }

    prevFirstId.current = firstId;
    prevScrollHeight.current = container.scrollHeight;
    loadingLock.current = false;
  }, [messages]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const distance =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    wasNearBottom.current = distance < 120;
    if (wasNearBottom.current) setShowLatest(false);

    const canScroll = container.scrollHeight > container.clientHeight + 40;
    if (
      canScroll &&
      container.scrollTop < 60 &&
      hasMoreOlder &&
      !isLoadingOlder &&
      !loadingLock.current &&
      typeof onLoadOlder === 'function'
    ) {
      loadingLock.current = true;
      prevScrollHeight.current = container.scrollHeight;
      onLoadOlder();
    }
  }, [hasMoreOlder, isLoadingOlder, onLoadOlder]);

  const shell = (children) => (
    <div className={cn('relative h-full min-h-0 flex-1', className)}>
      {/* Fixed wallpaper — does not scroll with messages */}
      <div
        className="message-wallpaper pointer-events-none absolute inset-0"
        style={{
          ...wallStyle,
          backgroundAttachment: 'fixed',
          backgroundPosition: 'center',
          backgroundSize: wallStyle.backgroundImage ? 'cover' : undefined,
        }}
        aria-hidden
      />
      {children}
    </div>
  );

  if (isLoading) {
    return shell(
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-bambi-primary border-t-transparent" />
      </div>
    );
  }

  if (messages.length === 0) {
    return shell(
      <div className="absolute inset-0 flex items-center justify-center">
        <EmptyState
          icon={MessageSquare}
          title={emptyLabel || 'No messages yet'}
          description={
            emptyLabel
              ? 'Try a different search.'
              : 'Send a message or attach an encrypted file.'
          }
        />
      </div>
    );
  }

  let previousDate = '';
  return shell(
    <>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto overscroll-contain px-3 py-3 md:px-8 md:py-5"
      >
        {isLoadingOlder && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-5 w-5 animate-spin text-bambi-text-secondary" />
          </div>
        )}
        {hasMoreOlder && !isLoadingOlder && (
          <div className="flex justify-center py-1">
            <button
              type="button"
              onClick={() => {
                const container = containerRef.current;
                if (container) prevScrollHeight.current = container.scrollHeight;
                loadingLock.current = true;
                onLoadOlder?.();
              }}
              className="rounded-full border border-bambi-border bg-bambi-surface/90 px-3 py-1 text-[11px] font-medium text-bambi-text-secondary shadow-sm hover:text-bambi-text"
            >
              Load older messages
            </button>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {messages.map((msg) => {
            const label = dateLabel(msg.createdAt);
            const showDate = label && label !== previousDate;
            previousDate = label;
            const member = memberMap[String(msg.senderId)] || {};
            return (
              <div key={msg.id || msg.clientMessageId} className="contents">
                {showDate && (
                  <div className="my-2 flex justify-center">
                    <span className="rounded-full border border-bambi-border bg-bambi-surface/90 px-3 py-1 text-[11px] font-medium text-bambi-text-secondary shadow-sm backdrop-blur-sm">
                      {label}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={msg}
                  isOwn={msg.senderId === currentUserId}
                  highlight={highlight}
                  onDownloadAttachment={onDownloadAttachment}
                  showSender={isGroup && msg.senderId !== currentUserId && msg.messageType !== 'call'}
                  senderName={
                    member.displayName ||
                    member.username ||
                    msg.senderName ||
                    ''
                  }
                  senderAvatar={member.avatarUrl || msg.senderAvatar}
                />
              </div>
            );
          })}
        </div>
        <div ref={bottomRef} className="h-1" />
      </div>
      {showLatest && (
        <button
          type="button"
          onClick={() => {
            const container = containerRef.current;
            if (container) container.scrollTop = container.scrollHeight;
            wasNearBottom.current = true;
            setShowLatest(false);
          }}
          className="jump-to-latest absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-bambi-text transition hover:-translate-y-0.5 hover:text-bambi-primary"
          aria-label="Scroll to latest messages"
          title="Latest messages"
        >
          <ArrowDown className="h-5 w-5" />
        </button>
      )}
    </>
  );
}
