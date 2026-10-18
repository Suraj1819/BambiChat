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

function getDistanceFromBottom(element) {
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
  const contentRef = useRef(null);
  const wasNearBottom = useRef(true);
  const isFirstRender = useRef(true);
  const previousMessageCount = useRef(0);
  const previousLastMessageId = useRef(null);
  const previousFirstMessageId = useRef(null);
  const previousScrollHeight = useRef(0);
  const previousScrollTop = useRef(0);

  const [showLatest, setShowLatest] = useState(false);

  const scrollToBottom = useCallback((behavior = 'auto') => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });

    wasNearBottom.current = true;
    setShowLatest(false);
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container || isLoading) return;

    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];

    const firstMessageId =
      firstMessage?.id ?? firstMessage?.clientMessageId ?? null;

    const lastMessageId =
      lastMessage?.id ?? lastMessage?.clientMessageId ?? null;

    const messageCountChanged =
      messages.length !== previousMessageCount.current;

    const lastMessageChanged =
      lastMessageId !== previousLastMessageId.current;

    const olderMessagesPrepended =
      messages.length > previousMessageCount.current &&
      previousMessageCount.current > 0 &&
      firstMessageId !== previousFirstMessageId.current;

    if (isFirstRender.current) {
      container.scrollTop = container.scrollHeight;
      wasNearBottom.current = true;
      setShowLatest(false);
      isFirstRender.current = false;
    } else if (olderMessagesPrepended && !wasNearBottom.current) {
      const heightDifference =
        container.scrollHeight - previousScrollHeight.current;

      container.scrollTop =
        previousScrollTop.current + heightDifference;

      setShowLatest(true);
    } else if (wasNearBottom.current) {
      container.scrollTop = container.scrollHeight;
      setShowLatest(false);
    } else if (messageCountChanged || lastMessageChanged) {
      setShowLatest(getDistanceFromBottom(container) > 140);
    }

    previousMessageCount.current = messages.length;
    previousFirstMessageId.current = firstMessageId;
    previousLastMessageId.current = lastMessageId;
    previousScrollHeight.current = container.scrollHeight;
    previousScrollTop.current = container.scrollTop;
  }, [messages, isLoading]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;

    if (
      !container ||
      !content ||
      typeof ResizeObserver === 'undefined'
    ) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      if (wasNearBottom.current) {
        container.scrollTop = container.scrollHeight;
        setShowLatest(false);
      } else {
        setShowLatest(getDistanceFromBottom(container) > 140);
      }

      previousScrollHeight.current = container.scrollHeight;
      previousScrollTop.current = container.scrollTop;
    });

    observer.observe(content);

    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const nearBottom = getDistanceFromBottom(container) < 140;

    wasNearBottom.current = nearBottom;
    setShowLatest(!nearBottom);

    previousScrollHeight.current = container.scrollHeight;
    previousScrollTop.current = container.scrollTop;
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
        className="message-wallpaper min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 md:px-8 md:py-6"
        style={{
          overflowAnchor: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div
          ref={contentRef}
          className="flex min-w-0 flex-col gap-2"
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
      </div>

      {showLatest && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
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