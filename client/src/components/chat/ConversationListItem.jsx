import { cn, formatMessageTime } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';

/**
 * Single conversation row in the sidebar list.
 */
export function ConversationListItem({
  conversation,
  isActive = false,
  onClick,
  className,
}) {
  const {
    name,
    avatarUrl,
    lastMessage,
    lastMessageAt,
    unreadCount = 0,
    isOnline,
    isGroup = false,
  } = conversation;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'conversation-row flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all duration-150',
        'hover:bg-bambi-background focus-visible:bg-bambi-background',
        isActive && 'conversation-row-active bg-bambi-primary-light hover:bg-bambi-primary-light',
        className
      )}
    >
      <Avatar
        src={avatarUrl}
        name={name}
        size="md"
        online={isGroup ? undefined : isOnline}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              'truncate text-label',
              isActive ? 'text-bambi-primary' : 'text-bambi-text'
            )}
          >
            {name}
          </span>
          {lastMessageAt && (
            <span className="shrink-0 text-caption text-bambi-text-secondary">
              {formatMessageTime(lastMessageAt)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-body-sm text-bambi-text-secondary">
            {lastMessage || 'No messages yet'}
          </p>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-bambi-primary px-1.5 text-[11px] font-semibold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
