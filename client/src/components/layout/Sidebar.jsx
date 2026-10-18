import { useEffect, useState } from 'react';
import { Search, MessageSquarePlus, Settings, Users, Moon, Sun, Monitor, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { cycleTheme, getThemePreference } from '@/lib/theme';

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABEL = { light: 'Light', dark: 'Dark', system: 'System' };

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'groups', label: 'Groups' },
];

function IconButton({ className, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full bg-bambi-background text-bambi-text-secondary transition hover:bg-bambi-primary-light hover:text-bambi-primary',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Sidebar({
  currentUser,
  searchQuery = '',
  onSearchChange,
  filter = 'all',
  onFilterChange,
  unreadTotal = 0,
  onNewChat,
  onNewGroup,
  onOpenSettings,
  onOpenFriends,
  incomingRequestCount = 0,
  children,
  className,
}) {
  const [theme, setTheme] = useState(getThemePreference);
  useEffect(() => {
    const sync = () => setTheme(getThemePreference());
    window.addEventListener('bambi-theme-change', sync);
    return () => window.removeEventListener('bambi-theme-change', sync);
  }, []);
  const ThemeIcon = THEME_ICON[theme];

  return (
    <div className={cn('bambi-sidebar flex h-full min-h-0 flex-col', className)}>
      <header className="sidebar-brand flex items-center justify-between gap-3 px-4 pb-3 pt-5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white">
            <span className="text-base font-bold">b</span>
            <span className="brand-mark-dot" />
          </div>
          <h1 className="truncate text-2xl font-bold tracking-tight text-bambi-text">Chats</h1>
        </div>
        <div className="flex items-center gap-2">
          <IconButton onClick={onNewChat} aria-label="New chat" title="New chat"><MessageSquarePlus className="h-[18px] w-[18px]" /></IconButton>
          {onNewGroup && <IconButton onClick={onNewGroup} aria-label="New group" title="New group"><UsersRound className="h-[18px] w-[18px]" /></IconButton>}
        </div>
      </header>

      <div className="px-4 pb-3 sm:px-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bambi-text-secondary" />
          <input
            type="search"
            placeholder="Search chats"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="sidebar-search h-11 w-full rounded-full border pl-11 pr-4 text-sm text-bambi-text placeholder:text-bambi-text-secondary focus:outline-none focus:ring-2 focus:ring-bambi-primary/25"
            aria-label="Search chats"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-5" role="tablist" aria-label="Chat filters">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onFilterChange?.(f.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition',
                active ? 'bg-bambi-primary text-white' : 'bg-bambi-background text-bambi-text-secondary hover:text-bambi-text'
              )}
            >
              {f.label}
              {f.id === 'unread' && unreadTotal > 0 && (
                <span className={cn('rounded-full px-1.5 text-[11px] font-semibold', active ? 'bg-white/25' : 'bg-bambi-primary text-white')}>
                  {unreadTotal > 99 ? '99+' : unreadTotal}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 sm:px-3">{children}</div>

      {currentUser && (
        <footer className="sidebar-profile-footer mt-auto p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              className="sidebar-profile flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 text-left transition"
              aria-label="Open profile and settings"
            >
              <Avatar src={currentUser.avatarUrl} name={currentUser.displayName || currentUser.username} size="md" online />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-bambi-text">{currentUser.displayName || currentUser.username}</span>
                <span className="block truncate text-xs text-bambi-text-secondary">@{currentUser.username}</span>
              </span>
            </button>
            <IconButton onClick={onOpenFriends} aria-label="Friends" title="Friends" className="relative">
              <Users className="h-[18px] w-[18px]" />
              {incomingRequestCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bambi-error px-1 text-[10px] font-bold text-white">
                  {incomingRequestCount > 99 ? '99+' : incomingRequestCount}
                </span>
              )}
            </IconButton>
            <IconButton onClick={() => setTheme(cycleTheme())} aria-label={`Theme: ${THEME_LABEL[theme]}. Click to change`} title={`Theme: ${THEME_LABEL[theme]}`}>
              <ThemeIcon className="h-[18px] w-[18px]" />
            </IconButton>
            <IconButton onClick={onOpenSettings} aria-label="Settings" title="Settings"><Settings className="h-[18px] w-[18px]" /></IconButton>
          </div>
        </footer>
      )}
    </div>
  );
}
