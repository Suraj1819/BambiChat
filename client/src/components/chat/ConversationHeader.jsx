
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  MoreVertical,
  Phone,
  Search,
  UserRound,
  Users,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';

function CircleButton({ className, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bambi-background text-bambi-text-secondary transition',
        'hover:bg-bambi-primary-light hover:text-bambi-primary',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-bambi-background disabled:hover:text-bambi-text-secondary',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function getConversationAvatar(conversation) {
  if (!conversation) return undefined;

  const candidates = [
    conversation.avatarUrl,
    conversation.avatar_url,
    conversation.photoURL,
    conversation.photoUrl,
    conversation.photo_url,
    conversation.imageUrl,
    conversation.image_url,
    conversation.peer?.avatarUrl,
    conversation.peer?.avatar_url,
    conversation.peer?.photoURL,
    conversation.peer?.photo_url,
    conversation.peer?.profile?.avatar_url,
    conversation.peer?.profile?.avatarUrl,
    conversation.user?.avatarUrl,
    conversation.user?.avatar_url,
    conversation.user?.profile?.avatar_url,
    conversation.profile?.avatarUrl,
    conversation.profile?.avatar_url,
    conversation.otherUser?.avatarUrl,
    conversation.otherUser?.avatar_url,
    conversation.otherUser?.profile?.avatar_url,
    conversation.contact?.avatarUrl,
    conversation.contact?.avatar_url,
  ];

  return candidates.find(
    (value) => typeof value === 'string' && value.trim().length > 0
  );
}

function formatLastSeen(iso) {
  if (!iso) return 'Offline';

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return 'Offline';

  const diff = Math.max(0, Date.now() - date.getTime());

  if (diff < 60_000) return 'Last seen just now';
  if (diff < 3_600_000) {
    return `Last seen ${Math.floor(diff / 60_000)}m ago`;
  }
  if (diff < 86_400_000) {
    return `Last seen ${Math.floor(diff / 3_600_000)}h ago`;
  }

  return `Last seen ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}

/**
 * Header shown at the top of an open conversation.
 * Supports avatar URLs from common conversation, peer, user and profile fields.
 */
export function ConversationHeader({
  conversation,
  onBack,
  onOpenInfo,
  onSearch,
  onAudioCall,
  onVideoCall,
  callsDisabled = false,
  callsDisabledReason,
  className,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  if (!conversation) return null;

  const {
    name,
    isOnline,
    isGroup,
    memberCount,
    subtitle,
    lastSeen,
  } = conversation;

  const avatarUrl = getConversationAvatar(conversation);
  const displayName = name || (isGroup ? 'Group' : 'Unknown user');
  const typing = Boolean(subtitle && subtitle.endsWith('is typing…'));

  const statusText = typing
    ? subtitle
    : isGroup
      ? `${memberCount || 0} members`
      : isOnline
        ? 'Online'
        : formatLastSeen(lastSeen);

  const disabledTitle = callsDisabledReason || 'Unavailable';

  return (
    <header
      className={cn(
        'conversation-header flex items-center gap-2 border-b border-bambi-border bg-bambi-surface px-3 py-2.5 md:px-5',
        className
      )}
    >
      <CircleButton
        className="md:hidden"
        onClick={onBack}
        aria-label="Back to conversations"
      >
        <ArrowLeft className="h-5 w-5" />
      </CircleButton>

      <button
        type="button"
        onClick={onOpenInfo}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bambi-primary"
        aria-label={`${isGroup ? 'Group' : 'Contact'} info for ${displayName}`}
      >
        <Avatar
          src={avatarUrl}
          name={displayName}
          size="md"
          online={isGroup ? undefined : isOnline}
        />

        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-bambi-text">
            {displayName}
          </span>

          <span
            className={cn(
              'flex items-center gap-1.5 truncate text-caption',
              typing || (!isGroup && isOnline)
                ? 'text-bambi-success'
                : 'text-bambi-text-secondary'
            )}
          >
            {!isGroup && isOnline && !typing && (
              <span className="h-1.5 w-1.5 rounded-full bg-bambi-success" />
            )}
            {statusText}
          </span>
        </span>
      </button>

      <div className="flex items-center gap-1.5">
        {!isGroup && (
          <>
            <CircleButton
              onClick={onAudioCall}
              disabled={callsDisabled}
              aria-label="Start audio call"
              title={callsDisabled ? disabledTitle : 'Audio call'}
            >
              <Phone className="h-[18px] w-[18px]" />
            </CircleButton>

            <CircleButton
              onClick={onVideoCall}
              disabled={callsDisabled}
              aria-label="Start video call"
              title={callsDisabled ? disabledTitle : 'Video call'}
            >
              <Video className="h-[18px] w-[18px]" />
            </CircleButton>
          </>
        )}

        <div className="relative" ref={menuRef}>
          <CircleButton
            onClick={() => setMenuOpen((current) => !current)}
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="h-5 w-5" />
          </CircleButton>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-2xl border border-bambi-border bg-bambi-surface p-1.5 shadow-xl"
            >
              <MenuItem
                icon={isGroup ? Users : UserRound}
                onClick={() => {
                  setMenuOpen(false);
                  onOpenInfo?.();
                }}
              >
                {isGroup ? 'Group info' : 'Contact info'}
              </MenuItem>

              <MenuItem
                icon={Search}
                onClick={() => {
                  setMenuOpen(false);
                  onSearch?.();
                }}
              >
                Search in chat
              </MenuItem>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({ icon: Icon, children, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-bambi-text hover:bg-bambi-background"
    >
      <Icon className="h-4 w-4 text-bambi-text-secondary" />
      {children}
    </button>
  );
}
