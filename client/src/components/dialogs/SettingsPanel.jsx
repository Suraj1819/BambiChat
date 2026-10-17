import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Camera, UserRound, ShieldCheck, Bell, Palette, MessageCircle,
  CircleHelp, LogOut, Check, Moon, Sun, X, Smartphone, Info
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

const sections = [
  { id: 'profile', label: 'Profile', icon: UserRound, description: 'Your name and profile photo' },
  { id: 'account', label: 'Account', icon: Smartphone, description: 'Session and account information' },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck, description: 'Encryption and privacy details' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Browser notification preferences' },
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme and display' },
  { id: 'chats', label: 'Chat preferences', icon: MessageCircle, description: 'Messaging experience' },
  { id: 'help', label: 'Help', icon: CircleHelp, description: 'About Bambi' },
];

export function SettingsPanel({ open, currentUser, onClose, onLogout, onProfileUpdated }) {
  const [section, setSection] = useState('profile');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || '');
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('bambi-theme') || 'dark'; } catch { return 'dark'; }
  });
  const [notifications, setNotifications] = useState(() => {
    try { return localStorage.getItem('bambi-notifications') !== 'off'; } catch { return true; }
  });
  const fileRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    setAvatarUrl(currentUser?.avatarUrl || '');
    setDisplayName(currentUser?.displayName || '');
    setSaved(false);
  }, [open, currentUser?.avatarUrl, currentUser?.displayName]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const saveProfile = () => {
    const profile = {
      avatarUrl,
      displayName: displayName.trim() || currentUser?.username || 'Bambi user',
    };
    try {
      localStorage.setItem(`bambi-profile-${currentUser?.id}`, JSON.stringify(profile));
      onProfileUpdated?.(profile);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      setSaved(false);
    }
  };

  const changeAvatar = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) {
      window.alert('Please choose an image smaller than 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
        setSaved(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const changeTheme = (value) => {
    setTheme(value);
    document.documentElement.classList.toggle('dark', value === 'dark');
    try { localStorage.setItem('bambi-theme', value); } catch { /* storage may be unavailable */ }
  };

  const changeNotifications = async (checked) => {
    if (checked && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* browser may block prompts */ }
    }
    setNotifications(checked);
    try { localStorage.setItem('bambi-notifications', checked ? 'on' : 'off'); } catch { /* storage may be unavailable */ }
  };

  const selected = sections.find((item) => item.id === section) || sections[0];
  const SelectedIcon = selected.icon;

  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/45 p-0 sm:items-center sm:p-5" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close settings" />
      <section
        className="relative z-10 flex h-full w-full max-w-4xl flex-col overflow-hidden bg-bambi-surface shadow-2xl sm:h-[min(760px,90vh)] sm:rounded-2xl sm:border"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
          <Button variant="icon" onClick={onClose} aria-label="Back to chat" title="Back to chat">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Settings</h2>
            <p className="text-xs text-bambi-text-secondary">Manage your Bambi experience</p>
          </div>
          <Button variant="icon" onClick={onClose} aria-label="Close settings" title="Close">
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-[76px] shrink-0 flex-col gap-1 overflow-y-auto border-r p-2 sm:w-60 sm:p-3" aria-label="Settings sections">
            {sections.map((item) => {
              const Icon = item.icon;
              const active = item.id === section;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors sm:px-3 ${active ? 'bg-bambi-primary-light text-bambi-primary' : 'text-bambi-text-secondary hover:bg-bambi-background hover:text-bambi-text'}`}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                >
                  <Icon className="mx-auto h-5 w-5 shrink-0 sm:mx-0" />
                  <span className="hidden min-w-0 sm:block">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] opacity-75">{item.description}</span>
                  </span>
                </button>
              );
            })}
            <div className="mt-auto border-t pt-2">
              <button type="button" onClick={onLogout} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-2 text-sm font-medium text-bambi-error hover:bg-bambi-error/10 sm:justify-start sm:px-3">
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          </nav>

          <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bambi-primary-light text-bambi-primary">
                <SelectedIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">{selected.label}</h3>
                <p className="text-sm text-bambi-text-secondary">{selected.description}</p>
              </div>
            </div>

            {section === 'profile' && (
              <div className="max-w-xl space-y-6">
                <div className="flex flex-col items-center gap-3 rounded-2xl border bg-bambi-background/60 p-6 sm:flex-row sm:items-center">
                  <div className="relative">
                    <Avatar src={avatarUrl} name={displayName || currentUser?.username} size="xl" />
                    <button type="button" onClick={() => fileRef.current?.click()} className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-bambi-surface bg-bambi-primary text-white shadow" aria-label="Change profile avatar" title="Change avatar">
                      <Camera className="h-4 w-4" />
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => { changeAvatar(event.target.files?.[0]); event.target.value = ''; }} />
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="font-semibold">{displayName || currentUser?.username || 'Your profile'}</p>
                    <p className="text-sm text-bambi-text-secondary">@{currentUser?.username || 'username'}</p>
                    <button type="button" className="mt-2 text-sm font-medium text-bambi-primary hover:underline" onClick={() => fileRef.current?.click()}>Change photo</button>
                  </div>
                </div>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Display name</span>
                  <input value={displayName} maxLength={60} onChange={(event) => { setDisplayName(event.target.value); setSaved(false); }} className="bambi-input" placeholder="Your display name" />
                </label>
                <div className="rounded-xl border p-3 text-xs leading-5 text-bambi-text-secondary">
                  Profile photo and display name are currently saved on this device only. A server profile-update endpoint is not present in the supplied API, so other users will not see these changes yet.
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="primary" onClick={saveProfile}>Save changes</Button>
                  {saved && <span className="inline-flex items-center gap-1 text-sm text-bambi-success"><Check className="h-4 w-4" /> Saved on this device</span>}
                </div>
              </div>
            )}

            {section === 'account' && (
              <div className="max-w-xl divide-y rounded-xl border">
                <div className="p-4"><p className="text-sm font-medium">Signed in as</p><p className="mt-1 text-sm text-bambi-text-secondary">@{currentUser?.username || 'Unknown user'}</p></div>
                <div className="p-4"><p className="text-sm font-medium">Account ID</p><p className="mt-1 break-all text-xs text-bambi-text-secondary">{currentUser?.id || 'Not available'}</p></div>
                <div className="p-4"><p className="text-sm font-medium">Session</p><p className="mt-1 text-sm text-bambi-text-secondary">Your current session stays active until you log out or it expires.</p></div>
                <div className="p-4"><Button variant="secondary" onClick={onLogout}><LogOut className="h-4 w-4" /> Log out</Button></div>
              </div>
            )}

            {section === 'privacy' && (
              <div className="max-w-xl space-y-3">
                <div className="flex gap-3 rounded-xl border p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-bambi-success" /><div><p className="font-medium">End-to-end encryption</p><p className="mt-1 text-sm leading-6 text-bambi-text-secondary">The app encrypts message content on the client before sending it. Keep your device and account secure.</p></div></div>
                <div className="rounded-xl border p-4"><p className="font-medium">Privacy controls</p><p className="mt-1 text-sm leading-6 text-bambi-text-secondary">Friend blocking is available from Friends. Advanced last-seen and read-receipt controls are not exposed by the current API.</p></div>
              </div>
            )}

            {section === 'notifications' && (
              <div className="max-w-xl divide-y rounded-xl border">
                <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
                  <span><span className="block text-sm font-medium">Browser notifications</span><span className="mt-1 block text-sm text-bambi-text-secondary">Allow the browser to show notifications when supported by the app.</span></span>
                  <input type="checkbox" checked={notifications} onChange={(event) => changeNotifications(event.target.checked)} className="h-5 w-5 accent-[rgb(var(--bambi-primary))]" />
                </label>
                <p className="p-4 text-xs leading-5 text-bambi-text-secondary">This preference is saved on this device. Browser permission may also need to be enabled in your browser settings.</p>
              </div>
            )}

            {section === 'appearance' && (
              <div className="max-w-xl space-y-3">
                <p className="mb-3 text-sm text-bambi-text-secondary">Choose how Bambi looks on this device.</p>
                <button type="button" onClick={() => changeTheme('light')} className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left ${theme === 'light' ? 'border-bambi-primary bg-bambi-primary-light/50' : 'hover:bg-bambi-background'}`}>
                  <Sun className="h-5 w-5" /><span className="flex-1"><span className="block font-medium">Light theme</span><span className="text-sm text-bambi-text-secondary">Bright surfaces and soft borders</span></span>{theme === 'light' && <Check className="h-5 w-5 text-bambi-primary" />}
                </button>
                <button type="button" onClick={() => changeTheme('dark')} className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left ${theme === 'dark' ? 'border-bambi-primary bg-bambi-primary-light/50' : 'hover:bg-bambi-background'}`}>
                  <Moon className="h-5 w-5" /><span className="flex-1"><span className="block font-medium">Dark theme</span><span className="text-sm text-bambi-text-secondary">A darker, low-glare interface</span></span>{theme === 'dark' && <Check className="h-5 w-5 text-bambi-primary" />}
                </button>
              </div>
            )}

            {section === 'chats' && (
              <div className="max-w-xl space-y-3">
                <div className="rounded-xl border p-4"><p className="font-medium">Message status</p><p className="mt-1 text-sm leading-6 text-bambi-text-secondary">Sent, delivered, and read indicators appear when the server provides those statuses.</p></div>
                <div className="rounded-xl border p-4"><p className="font-medium">Attachments</p><p className="mt-1 text-sm leading-6 text-bambi-text-secondary">Attachments are encrypted in the browser before upload. File limits are enforced by the current application.</p></div>
                <div className="rounded-xl border p-4"><p className="font-medium">Keyboard shortcut</p><p className="mt-1 text-sm text-bambi-text-secondary">Press Enter to send a message. Use Shift + Enter for a new line.</p></div>
              </div>
            )}

            {section === 'help' && (
              <div className="max-w-xl space-y-3">
                <div className="rounded-xl border p-4"><p className="font-medium">Bambi Messenger</p><p className="mt-1 text-sm text-bambi-text-secondary">A real-time messaging app with encrypted messages, group conversations, and encrypted attachments.</p></div>
                <div className="flex gap-3 rounded-xl border p-4"><Info className="mt-0.5 h-5 w-5 shrink-0 text-bambi-primary" /><p className="text-sm leading-6 text-bambi-text-secondary">Some preferences are device-only because the supplied backend does not expose profile update, theme sync, or notification preference endpoints.</p></div>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}
