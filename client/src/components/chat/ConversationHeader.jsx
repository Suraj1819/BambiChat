import { ArrowLeft, MoreVertical, Phone, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

/**
 * Header shown at the top of an open conversation.
 */
export function ConversationHeader({
  conversation,
  onBack,
  onSearch,
  onMore,
  className,
}) {
  if (!conversation) return null;

  const { name, avatarUrl, isOnline, isGroup, memberCount, subtitle } =
    conversation;

  const statusText = isGroup
    ? `${memberCount || 0} members`
    : isOnline
      ? 'Online'
      : subtitle || 'Offline';

  return (
    <header
      className={cn(
        'conversation-header flex items-center gap-2 border-b border-bambi-border bg-bambi-surface px-3 py-3 md:px-6',
        className
      )}
    >
      {/* Mobile back button */}
      <Button
        variant="icon"
        className="md:hidden"
        onClick={onBack}
        aria-label="Back to conversations"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <Avatar
        src={avatarUrl}
        name={name}
        size="sm"
        online={isGroup ? undefined : isOnline}
      />

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-label text-bambi-text">{name}</h2>
        <p className="truncate text-caption text-bambi-text-secondary">
          {statusText}
        </p>
      </div>

      <div className="flex items-center gap-0.5">
        {isGroup && (
          <Button variant="icon" aria-label="Group info" title="Group info" onClick={onMore}>
            <Users className="h-5 w-5" />
          </Button>
        )}
        <Button
          variant="icon"
          onClick={onSearch}
          aria-label="Search in conversation"
          title="Search"
        >
          <Search className="h-5 w-5" />
        </Button>
        <Button
          variant="icon"
          onClick={onMore}
          aria-label="More options"
          title="More"
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
