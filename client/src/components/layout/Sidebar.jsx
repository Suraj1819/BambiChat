import { useState } from 'react';
import { Search, MessageSquarePlus, Settings, Users, Moon, Sun, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';

export function Sidebar({
  currentUser,
  searchQuery = '',
  onSearchChange,
  onNewChat,
  onNewGroup,
  onOpenSettings,
  onOpenFriends,
  incomingRequestCount = 0,
  children,
  className,
}) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('bambi-theme') || 'dark'; } catch { return 'dark'; }
  });
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try { localStorage.setItem('bambi-theme', next); } catch { /* storage unavailable */ }
  };

  return (
    <div className={cn('bambi-sidebar flex h-full min-h-0 flex-col', className)}>
      <header className="sidebar-brand flex items-center justify-between gap-3 px-4 pb-4 pt-5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="brand-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"><span className="text-lg font-bold">b</span><span className="brand-mark-dot" /></div>
          <div className="min-w-0"><p className="text-lg font-bold tracking-tight text-bambi-text">bambi<span className="text-bambi-primary">.</span></p><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-bambi-text-secondary">Private messenger</p></div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="icon" onClick={onNewChat} aria-label="New conversation" title="New chat" className="sidebar-action"><MessageSquarePlus className="h-[18px] w-[18px]" /></Button>
          {onNewGroup && <Button variant="icon" onClick={onNewGroup} aria-label="New group" title="New group" className="sidebar-action"><Users className="h-[18px] w-[18px]" /></Button>}
          <Button variant="icon" onClick={onOpenSettings} aria-label="Settings" title="Settings" className="sidebar-action"><Settings className="h-[18px] w-[18px]" /></Button>
        </div>
      </header>

      <div className="px-4 pb-4 sm:px-5">
        <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-bambi-text-secondary" /><Input type="search" placeholder="Search conversations" value={searchQuery} onChange={(event) => onSearchChange?.(event.target.value)} className="sidebar-search h-11 rounded-xl pl-10 pr-3 text-sm" aria-label="Search conversations" /></div>
      </div>

      <div className="mx-4 mb-3 flex items-center justify-between rounded-xl border px-3 py-2 sm:mx-5">
        <div className="flex items-center gap-2.5"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span><span className="text-xs font-medium text-bambi-text-secondary">Your chats are private</span></div>
        <Sparkles className="h-3.5 w-3.5 text-bambi-primary" />
      </div>

      <div className="sidebar-list-heading flex items-center justify-between px-5 pb-2 pt-1"><span className="text-[10px] font-bold uppercase tracking-[.18em] text-bambi-text-secondary">Messages</span><span className="text-[10px] text-bambi-text-secondary">Chats & groups</span></div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 sm:px-3">{children}</div>

      {currentUser && <footer className="sidebar-profile-footer mt-auto p-3 sm:p-4">
        <button type="button" onClick={onOpenSettings} className="sidebar-profile flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition" aria-label="Open profile and settings">
          <Avatar src={currentUser.avatarUrl} name={currentUser.displayName || currentUser.username} size="md" online />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-bambi-text">{currentUser.displayName || currentUser.username}</span><span className="mt-0.5 block truncate text-xs text-bambi-text-secondary">@{currentUser.username}</span></span>
          <span className="profile-settings-icon"><Settings className="h-4 w-4" /></span>
        </button>
        <div className="mt-2 flex items-center justify-between px-2">
          <Button variant="ghost" size="sm" onClick={onOpenFriends} className="relative gap-2 px-2 text-xs"><Users className="h-4 w-4" /> Friends{incomingRequestCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-bambi-error px-1 text-[10px] font-bold text-white">{incomingRequestCount > 99 ? '99+' : incomingRequestCount}</span>}</Button>
          <button type="button" onClick={toggleTheme} className="theme-quick-toggle inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-bambi-text-secondary transition hover:text-bambi-text" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}<span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span></button>
        </div>
      </footer>}
    </div>
  );
}
