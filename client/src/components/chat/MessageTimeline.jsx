import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from '@/components/ui/EmptyState';

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
    year:
      date.getFullYear() === today.getFullYear()
        ? undefined
        : 'numeric',
  });
}

function distanceFromBottom(element) {
  return (
    element.scrollHeight -
    element.scrollTop -
    element.clientHeight
  );
}

export function MessageTimeline({
  messages = [],
  currentUserId,
  isLoading = false,
  highlight = '',
  emptyLabel,
  onDownloadAttachment,
  className,
}) {
  const containerRef = useRef(null);
  const wasNearBottom = useRef(true);
  const firstRender = useRef(true);
  const previousLastMessageId = useRef(null);

  const [showLatest, setShowLatest] = useState(false);

  const scrollToBottom = useCallback((smooth = false) => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTop = smooth
      ? container.scrollHeight
      : container.scrollHeight;

    wasNearBottom.current = true;
    setShowLatest(false);
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || isLoading) return;

    const lastMessage = messages[messages.length - 1];
    const lastMessageId =
      lastMessage?.id ?? lastMessage?.clientMessageId ?? null;

    const isNewLastMessage =
      lastMessageId !== previousLastMessageId.current;

    if (firstRender.current) {
      container.scrollTop = container.scrollHeight;
      firstRender.current = false;
      wasNearBottom.current = true;
      setShowLatest(false);
    } else if (isNewLastMessage && wasNearBottom.current) {
      container.scrollTop = container.scrollHeight;
      setShowLatest(false);
    } else if (isNewLastMessage) {
      setShowLatest(true);
    }

    previousLastMessageId.current = lastMessageId;
  }, [messages, isLoading]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const nearBottom = distanceFromBottom(container) < 140;

    wasNearBottom.current = nearBottom;
    setShowLatest(!nearBottom);
  }, []);

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex min-h-0 flex-1 items-center justify-center',
          className
        )}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-bambi-primary border-t-transparent" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div
        className={cn(
          'flex min-h-0 flex-1 items-center justify-center',
          className
        )}
      >
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

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={cn(
          'message-wallpaper min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 md:px-8 md:py-6',
          className
        )}
        style={{
          overflowAnchor: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {messages.map((msg) => {
          const label = dateLabel(msg.createdAt);
          const showDate = label && label !== previousDate;
          previousDate = label;

          return (
            <div
              key={msg.id || msg.clientMessageId}
              className="contents"
            >
              {showDate && (
                <div className="my-2 flex justify-center">
                  <span className="rounded-full border border-bambi-border bg-bambi-surface/90 px-3 py-1 text-[11px] font-medium text-bambi-text-secondary shadow-sm">
                    {label}
                  </span>
                </div>
              )}

              <MessageBubble
                message={msg}
                isOwn={msg.senderId === currentUserId}
                highlight={highlight}
                onDownloadAttachment={onDownloadAttachment}
              />
            </div>
          );
        })}
      </div>

      {showLatest && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-bambi-border bg-bambi-surface text-bambi-text shadow-lg transition hover:-translate-y-0.5 hover:text-bambi-primary"
          aria-label="Scroll to latest messages"
          title="Latest messages"
        >
          <ArrowDown className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}