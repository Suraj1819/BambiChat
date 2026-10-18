import { cn, formatMessageTime } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';

/**
 * Single conversation row in the sidebar list.
 */
export function ConversationListItem({ conversation, isActive = false, onClick, className }) {
  const { name, avatarUrl, lastMessage, lastMessageAt, unreadCount = 0, isOnline, isGroup = false } = conversation;
  const unread = unreadCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'conversation-row flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors duration-150',
        'hover:bg-bambi-background focus-visible:bg-bambi-background',
        isActive && 'conversation-row-active bg-bambi-primary-light hover:bg-bambi-primary-light',
        className
      )}
    >
      <Avatar src={avatarUrl} name={name} size="lg" online={isGroup ? undefined : isOnline} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-[15px] text-bambi-text', unread ? 'font-semibold' : 'font-medium')}>{name}</span>
          {lastMessageAt && (
            <span className={cn('shrink-0 text-xs', unread ? 'font-semibold text-bambi-primary' : 'text-bambi-text-secondary')}>
              {formatMessageTime(lastMessageAt)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={cn('truncate text-sm', unread ? 'font-medium text-bambi-text' : 'text-bambi-text-secondary')}>
            {lastMessage || 'No messages yet'}
          </p>
          {unread && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-bambi-primary px-1.5 text-[11px] font-semibold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
