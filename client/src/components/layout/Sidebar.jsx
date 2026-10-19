import { useEffect, useState } from 'react';
import {
  MessageCircle,
  Search,
  Plus,
  Users,
  Settings,
  Moon,
  Sun,
  ChevronDown,
  LogOut,
  UserRound,
  UsersRound,
  X,
  SlidersHorizontal,
  Command,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const THEME_KEY = 'bambi-theme';

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark';

  try {
    return (
      localStorage.getItem(THEME_KEY) ||
      document.documentElement.dataset.theme ||
      'dark'
    );
  } catch {
    return 'dark';
  }
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;

  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme still applies for the current session.
  }
}

function getDisplayName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    user?.email?.split('@')[0] ||
    'Your account'
  );
}

function getAvatar(user) {
  return (
    user?.avatarUrl ||
    user?.avatar ||
    user?.photoURL ||
    user?.photoUrl ||
    user?.image ||
    ''
  );
}

function IconButton({ label, onClick, children, className, disabled = false }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
        'text-bambi-text-secondary transition-colors',
        'hover:bg-bambi-hover hover:text-bambi-text',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bambi-primary',
        'disabled:pointer-events-none disabled:opacity-40',
        className
      )}
    >
      {children}
    </button>
  );
}

export function Sidebar({
  currentUser,
  searchQuery = '',
  onSearchChange,
  onNewChat,
  onNewGroup,
  onOpenSettings,
  onOpenFriends,
  onLogout,
  incomingRequestCount = 0,
  children,
  className,
}) {
  const [theme, setTheme] = useState(getInitialTheme);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const displayName = getDisplayName(currentUser);
  const avatar = getAvatar(currentUser);
  const email = currentUser?.email || '';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const closeMenu = (event) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
        setSearchFocused(false);
      }
    };

    window.addEventListener('keydown', closeMenu);

    return () => {
      window.removeEventListener('keydown', closeMenu);
    };
  }, []);

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const clearSearch = () => {
    onSearchChange?.('');
  };

  return (
    <section
      className={cn(
        'flex h-full min-h-0 w-full flex-col overflow-hidden',
        'bg-bambi-surface text-bambi-text',
        className
      )}
    >
      <header className="shrink-0 border-b border-bambi-border px-4 pb-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-bambi-primary text-white shadow-sm">
            <MessageCircle className="h-5 w-5" strokeWidth={2.3} />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold tracking-tight text-bambi-text">
              Bambi
              <span className="ml-1 text-bambi-primary">Chat</span>
            </h1>
            <p className="truncate text-xs text-bambi-text-secondary">
              Your conversations, together
            </p>
          </div>

          <IconButton label="Start a new chat" onClick={onNewChat}>
            <Plus className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <label
            className={cn(
              'flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3',
              'bg-bambi-background transition-colors',
              searchFocused
                ? 'border-bambi-primary ring-2 ring-bambi-primary/15'
                : 'border-bambi-border'
            )}
          >
            <Search className="h-4 w-4 shrink-0 text-bambi-text-secondary" />

            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchChange?.(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              className="min-w-0 flex-1 bg-transparent text-sm text-bambi-text outline-none placeholder:text-bambi-text-secondary"
            />

            {searchQuery && (
              <IconButton
                label="Clear search"
                onClick={clearSearch}
                className="h-7 w-7"
              >
                <X className="h-3.5 w-3.5" />
              </IconButton>
            )}

            {!searchQuery && (
              <span className="hidden items-center gap-1 rounded-md border border-bambi-border px-1.5 py-1 text-[10px] text-bambi-text-secondary sm:inline-flex">
                <Command className="h-3 w-3" /> K
              </span>
            )}
          </label>

          <div className="relative">
            <IconButton
              label={
                incomingRequestCount
                  ? `Friends (${incomingRequestCount} requests)`
                  : 'Friends & requests'
              }
              onClick={onOpenFriends}
              className="h-11 w-11 border border-bambi-border"
            >
              <Users className="h-[18px] w-[18px]" />
            </IconButton>
            {incomingRequestCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-bambi-primary px-1 text-[10px] font-bold text-white shadow">
                {incomingRequestCount > 9 ? '9+' : incomingRequestCount}
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onNewChat}
            className={cn(
              'flex h-10 items-center justify-center gap-2 rounded-xl px-3',
              'bg-bambi-primary text-sm font-semibold text-white',
              'transition hover:opacity-90 active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bambi-primary focus-visible:ring-offset-2'
            )}
          >
            <MessageCircle className="h-4 w-4" />
            New chat
          </button>

          <button
            type="button"
            onClick={onNewGroup}
            className={cn(
              'flex h-10 items-center justify-center gap-2 rounded-xl border',
              'border-bambi-border bg-bambi-background px-3',
              'text-sm font-semibold text-bambi-text transition',
              'hover:bg-bambi-hover active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bambi-primary'
            )}
          >
            <UsersRound className="h-4 w-4" />
            New group
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-bambi-text-secondary">
            Messages
          </h2>

          <span className="rounded-lg bg-bambi-background px-2 py-1 text-[10px] font-medium text-bambi-text-secondary">
            Private chat
          </span>
        </div>

        <div
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
          aria-label="Conversation list"
        >
          {children}
        </div>
      </div>

      <footer className="relative shrink-0 border-t border-bambi-border p-3">
        {profileMenuOpen && (
          <>
            <button
              type="button"
              aria-label="Close profile menu"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setProfileMenuOpen(false)}
            />

            <div
              role="menu"
              aria-label="Account menu"
              className={cn(
                'absolute bottom-[calc(100%+8px)] left-3 right-3 z-50',
                'overflow-hidden rounded-2xl border border-bambi-border',
                'bg-bambi-surface p-2 shadow-xl'
              )}
            >
              <div className="flex items-center gap-3 border-b border-bambi-border px-2 py-3">
                {avatar ? (
                  <img
                    src={avatar}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bambi-primary/15 text-sm font-bold text-bambi-primary">
                    {initials || 'U'}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className="truncate text-xs text-bambi-text-secondary">
                    {email || 'Account'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileMenuOpen(false);
                  onOpenSettings?.();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-bambi-hover"
              >
                <Settings className="h-4 w-4 text-bambi-text-secondary" />
                Settings / Account
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileMenuOpen(false);
                  onOpenFriends?.();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-bambi-hover"
              >
                <Users className="h-4 w-4 text-bambi-text-secondary" />
                Friends
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  toggleTheme();
                  setProfileMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-bambi-hover"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 text-bambi-text-secondary" />
                ) : (
                  <Moon className="h-4 w-4 text-bambi-text-secondary" />
                )}
                Switch to {theme === 'dark' ? 'light' : 'dark'} theme
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileMenuOpen(false);
                  onLogout?.();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-bambi-error transition hover:bg-bambi-hover"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setProfileMenuOpen((value) => !value)}
            aria-expanded={profileMenuOpen}
            aria-label="Open account menu"
            className={cn(
              'flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left',
              'transition hover:bg-bambi-hover focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-bambi-primary'
            )}
          >
            <div className="relative shrink-0">
              {avatar ? (
                <img
                  src={avatar}
                  alt=""
                  className="h-10 w-10 rounded-full border border-bambi-border object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bambi-primary/15 text-sm font-bold text-bambi-primary">
                  {initials || <UserRound className="h-5 w-5" />}
                </div>
              )}

              <span
                className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-bambi-surface bg-emerald-500"
                title="Signed in"
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-bambi-text">
                {displayName}
              </p>
              <p className="truncate text-xs text-bambi-text-secondary">
                {email || 'View account options'}
              </p>
            </div>

            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-bambi-text-secondary transition-transform',
                profileMenuOpen && 'rotate-180'
              )}
            />
          </button>

          <IconButton
            label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
            className="border border-bambi-border"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </IconButton>
        </div>
      </footer>
    </section>
  );
}